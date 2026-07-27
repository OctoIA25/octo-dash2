/**
 * ⚙️ Worker do Agente Disparador.
 *
 * Drena a fila `agent_action_queue` (preenchida na CONFIRMAÇÃO de um run) e, para
 * cada item, executa a ação via o registry — que, no caso de send_whatsapp,
 * reutiliza `deliverRecommendation` (idempotência + envio + histórico em
 * lead_recommendations). Não duplica nenhuma lógica de envio.
 *
 * Forma do tick (otimizada para milhares de itens e múltiplos tenants):
 *  1. UM select busca o lote elegível (até `limit`), ordenado por created_at.
 *  2. O lote é fatiado em LANES por tenant, preservando a ordem de criação.
 *  3. Um pequeno pool processa até `tenantConcurrency` lanes em paralelo —
 *     tenants não competem entre si; DENTRO de um tenant o envio segue serial,
 *     o que preserva a ordem das mensagens por tenant/campanha.
 *  4. Cada item é claimado individualmente (pending → processing, optimistic):
 *     só um updater vence por linha — corretude entre instâncias garantida
 *     pelo banco, sem RPC/SKIP LOCKED.
 *
 * Limites de ritmo (verificados ANTES do claim — item throttled fica pending
 * sem custo de claim/release):
 *  - `rateLimiter` (token bucket por tenant): suaviza o ritmo global do tenant.
 *  - throttle por campanha: honra `communication_campaigns.n_per_min` via um
 *    token bucket por campanha (persistente entre ticks em `campaignLimiters`).
 *    Campanha sem token bloqueia SÓ os itens dela no tick (FIFO por campanha
 *    preservado); tenant sem token para a lane inteira.
 *
 * Espelha o worker de recuperação:
 *  - claim atômico impede que ticks/instâncias sobrepostos dupliquem envio;
 *  - finalize marca o desfecho (done | skipped | failed);
 *  - ao terminar, atualiza os contadores agregados do run (observabilidade).
 *
 * Determinístico e testável: `nowMs`, `rateNow` e todas as dependências são
 * injetáveis.
 */

import { getAction } from './actionRegistry.js';
import { createTenantRateLimiter } from '../communication/rateLimiter.js';
import { emitAgentEvent } from '../agent-telemetry/emit.js';

const QUEUE_TABLE = 'agent_action_queue';
const RUNS_TABLE = 'agent_action_runs';
const CAMPAIGNS_TABLE = 'communication_campaigns';

const DEFAULT_BACKOFF_BASE_MS = 60_000;     // 1 minuto
const DEFAULT_BACKOFF_MAX_MS = 3_600_000;   // 1 hora
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_TENANT_CONCURRENCY = 4;       // lanes de tenant em paralelo por tick

// Fallback quando o chamador não fornece um registry de limiters de campanha
// (deps.campaignLimiters). Por processo, como os buckets devem ser: recriar a
// cada tick zeraria o pacing. Cresce com o nº de campanhas com n_per_min —
// pequeno na prática.
const fallbackCampaignLimiters = new Map();

/** UM select por tick: lote de itens pendentes elegíveis, em ordem de criação. */
async function fetchEligibleBatch(supabase, nowIso, limit) {
  const { data, error } = await supabase
    .from(QUEUE_TABLE)
    .select('*')
    .eq('status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error || !Array.isArray(data)) return [];
  return data;
}

/**
 * Claim atômico de um item do lote (pending → processing). O filtro de
 * elegibilidade se repete no UPDATE porque o lote pode ter envelhecido durante
 * o tick: se outra instância processou e devolveu o item com backoff, o claim
 * não pode vencê-lo antes da hora.
 */
async function claimItem(supabase, item, nowIso) {
  const { data: claimed, error } = await supabase
    .from(QUEUE_TABLE)
    .update({ status: 'processing', attempts: (item.attempts || 0) + 1 })
    .eq('id', item.id)
    .eq('status', 'pending') // só vence quem ainda vê pending
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .select('*')
    .maybeSingle();
  if (error || !claimed) return null; // outra instância venceu (ou backoff futuro)
  return claimed;
}

/** Marca o desfecho final de um item. */
async function finalize(supabase, id, status, nowIso, error = null) {
  await supabase.from(QUEUE_TABLE).update({ status, error, processed_at: nowIso }).eq('id', id);
}

/**
 * Devolve um item para 'pending' com backoff: mantém attempts (foi uma
 * tentativa real) e seta next_attempt_at (item só é elegível após o delay).
 */
async function releaseToPending(supabase, id, patch = {}) {
  await supabase
    .from(QUEUE_TABLE)
    .update({ status: 'pending', ...patch })
    .eq('id', id);
}

/**
 * Fecha os runs cujos itens já foram todos processados: atualiza contadores e
 * marca status done/failed. Best-effort — uma falha aqui não interrompe o worker.
 */
async function closeFinishedRuns(supabase, runIds, nowIso, logger) {
  for (const runId of runIds) {
    try {
      const { data: items } = await supabase
        .from(QUEUE_TABLE)
        .select('status, tenant_id')
        .eq('run_id', runId);
      const rows = items || [];
      const pending = rows.filter((r) => r.status === 'pending' || r.status === 'processing').length;
      if (pending > 0) continue; // ainda há itens em andamento

      const sent = rows.filter((r) => r.status === 'done').length;
      const failed = rows.filter((r) => r.status === 'failed').length;
      const runStatus = failed > 0 && sent === 0 ? 'failed' : 'done';
      await supabase
        .from(RUNS_TABLE)
        .update({
          status: runStatus,
          sent_count: sent,
          failed_count: failed,
          completed_at: nowIso,
        })
        .eq('id', runId);

      // Telemetria: 1 evento 'execution' por run fechado (nunca por item — os
      // itens já vivem em agent_action_queue; contadores/funil/campaign_id
      // ficam no run, não duplicamos aqui; correlação via execution_id=run.id).
      // Fire-and-forget, nunca lança. Run sem itens não emite (sem tenant).
      if (rows.length > 0) {
        emitAgentEvent(supabase, {
          tenant_id: rows[0].tenant_id,
          agent_slug: 'disparador',
          event_type: 'execution',
          status: runStatus === 'failed' ? 'error' : 'ok',
          execution_id: runId,
          occurred_at: nowIso,
        });
      }
    } catch (err) {
      logger?.warn?.(`[agent-actions] falha ao fechar run ${runId}: ${err?.message}`);
    }
  }
}

/**
 * Calcula o próximo next_attempt_at com backoff exponencial, limitado ao cap.
 *
 * @param {number} nowMs - timestamp atual em ms
 * @param {number} attempts - número de tentativas já feitas (pós-claim)
 * @param {number} baseMs - base do backoff (default: 60s)
 * @param {number} maxMs - cap máximo (default: 1h)
 * @returns {string} ISO string do próximo instante elegível
 */
function calcNextAttemptAt(nowMs, attempts, baseMs, maxMs) {
  const delay = Math.min(baseMs * Math.pow(2, attempts - 1), maxMs);
  return new Date(nowMs + delay).toISOString();
}

/**
 * Resolve o throttle de campanha (n_per_min) para os runs do lote:
 * runId → { campaignId, nPerMin }. Duas queries pequenas POR TICK (não por
 * item): runs → campaign_id; campanhas → n_per_min. Fail-open: qualquer erro
 * devolve mapa vazio e o tick segue sem throttle (comportamento anterior).
 */
async function loadCampaignThrottles(supabase, items, logger) {
  const runIds = [...new Set(items.map((i) => i.run_id).filter(Boolean))];
  if (runIds.length === 0) return new Map();
  try {
    const { data: runs, error: runErr } = await supabase
      .from(RUNS_TABLE)
      .select('id, campaign_id')
      .in('id', runIds);
    if (runErr) throw runErr;
    const campaignByRun = new Map(
      (runs || []).filter((r) => r.campaign_id).map((r) => [r.id, r.campaign_id]),
    );
    if (campaignByRun.size === 0) return new Map();

    const campaignIds = [...new Set(campaignByRun.values())];
    const { data: campaigns, error: campErr } = await supabase
      .from(CAMPAIGNS_TABLE)
      .select('id, n_per_min')
      .in('id', campaignIds);
    if (campErr) throw campErr;
    const nPerMinByCampaign = new Map(
      (campaigns || [])
        .filter((c) => Number(c.n_per_min) > 0)
        .map((c) => [c.id, Number(c.n_per_min)]),
    );

    const throttles = new Map();
    for (const [runId, campaignId] of campaignByRun) {
      const nPerMin = nPerMinByCampaign.get(campaignId);
      if (nPerMin) throttles.set(runId, { campaignId, nPerMin });
    }
    return throttles;
  } catch (err) {
    logger?.warn?.(`[agent-actions] throttle de campanha indisponível (fail-open): ${err?.message}`);
    return new Map();
  }
}

/**
 * Obtém (ou cria) o token bucket da campanha no registry persistente.
 * Se n_per_min mudou no banco, o bucket é recriado com o novo ritmo.
 */
function getCampaignLimiter(registry, campaignId, nPerMin, now) {
  const entry = registry.get(campaignId);
  if (entry && entry.nPerMin === nPerMin) return entry.limiter;
  const ratePerSec = nPerMin / 60;
  const limiter = createTenantRateLimiter({
    ratePerSec,
    burst: Math.max(1, Math.floor(ratePerSec)),
    now,
  });
  registry.set(campaignId, { nPerMin, limiter });
  return limiter;
}

/**
 * Processa a fila de ações.
 *
 * deps: {
 *   nowMs?, limit?, logger?,
 *   deliver,             // = deliverRecommendation
 *   schedulerDeps,       // deps internas que deliver usa (makeSchedulerDeps);
 *                        // rateLimiter/campaignLimiters/tenantConcurrency são
 *                        // herdados daqui quando não passados diretamente.
 *   getEnvironment, processEnv?,
 *   rateLimiter?,        // { tryRemove(tenantId) => boolean } — token bucket por tenant
 *   campaignLimiters?,   // Map campanhaId → { nPerMin, limiter } (persistente entre ticks)
 *   tenantConcurrency?,  // lanes de tenant em paralelo (default: 4)
 *   rateNow?,            // relógio dos buckets de campanha (default: Date.now)
 *   backoffBaseMs?,      // base do backoff exponencial (default: 60000)
 *   backoffMaxMs?,       // cap do backoff (default: 3600000)
 * }
 * @returns {{ processed, done, skipped, failed, retried, throttled, runIds }}
 */
export async function runDueActions(supabase, deps = {}) {
  const {
    nowMs = Date.now(),
    limit = 200,
    logger = console,
    deliver,
    schedulerDeps,
    getEnvironment,
    processEnv = process.env,
    rateLimiter = schedulerDeps?.rateLimiter,
    campaignLimiters = schedulerDeps?.campaignLimiters || fallbackCampaignLimiters,
    tenantConcurrency = schedulerDeps?.tenantConcurrency || DEFAULT_TENANT_CONCURRENCY,
    rateNow = Date.now,
    backoffBaseMs = DEFAULT_BACKOFF_BASE_MS,
    backoffMaxMs = DEFAULT_BACKOFF_MAX_MS,
  } = deps;

  const nowIso = new Date(nowMs).toISOString();
  const summary = { processed: 0, done: 0, skipped: 0, failed: 0, retried: 0, throttled: 0, runIds: [] };
  const touchedRuns = new Set();

  const batch = await fetchEligibleBatch(supabase, nowIso, limit);
  if (batch.length === 0) return summary;

  const campaignThrottles = await loadCampaignThrottles(supabase, batch, logger);

  // Lanes por tenant, preservando a ordem de created_at dentro de cada uma.
  const laneByTenant = new Map();
  for (const item of batch) {
    if (!laneByTenant.has(item.tenant_id)) laneByTenant.set(item.tenant_id, []);
    laneByTenant.get(item.tenant_id).push(item);
  }

  /** Claim + entrega + desfecho de UM item (mesmas regras de retry/backoff). */
  async function handleItem(item) {
    const claimed = await claimItem(supabase, item, nowIso);
    if (!claimed) return; // outra instância venceu — segue a lane

    summary.processed += 1;
    touchedRuns.add(claimed.run_id);

    const action = getAction(claimed.action_type);
    if (!action) {
      await finalize(supabase, claimed.id, 'failed', nowIso, `ação desconhecida: ${claimed.action_type}`);
      summary.failed += 1;
      return;
    }

    try {
      const result = await action.deliverItem(supabase, claimed, {
        deliverRecommendation: deliver,
        schedulerDeps,
        getEnvironment,
        processEnv,
      });

      if (result.status === 'failed') {
        // Determina se deve fazer dead-letter ou agendar retry com backoff.
        const maxAttempts = claimed.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
        if (claimed.attempts >= maxAttempts) {
          // Esgotou tentativas → dead-letter.
          await finalize(supabase, claimed.id, 'failed', nowIso, result.error || null);
          summary.failed += 1;
        } else {
          // Ainda há tentativas restantes → backoff exponencial.
          const nextAttemptAt = calcNextAttemptAt(nowMs, claimed.attempts, backoffBaseMs, backoffMaxMs);
          await releaseToPending(supabase, claimed.id, {
            next_attempt_at: nextAttemptAt,
            error: result.error || null,
          });
          summary.retried += 1;
        }
      } else {
        await finalize(supabase, claimed.id, result.status, nowIso, result.error || null);
        if (result.status === 'done') summary.done += 1;
        else if (result.status === 'skipped') summary.skipped += 1;
        else summary.failed += 1;
      }
    } catch (err) {
      // Exceção inesperada: mesma lógica de backoff/dead-letter.
      const maxAttempts = claimed.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
      if (claimed.attempts >= maxAttempts) {
        await finalize(supabase, claimed.id, 'failed', nowIso, err?.message || 'erro desconhecido');
        summary.failed += 1;
      } else {
        const nextAttemptAt = calcNextAttemptAt(nowMs, claimed.attempts, backoffBaseMs, backoffMaxMs);
        await releaseToPending(supabase, claimed.id, {
          next_attempt_at: nextAttemptAt,
          error: err?.message || 'erro desconhecido',
        });
        summary.retried += 1;
      }
    }
  }

  /**
   * Uma lane = itens de um tenant, em ordem. Serial por design: preserva a
   * ordem das mensagens do tenant. Throttles são checados ANTES do claim —
   * item barrado fica pending intocado (zero queries) e volta no próximo tick,
   * ainda à frente dos mais novos (ordem por created_at).
   */
  async function processLane(items) {
    const blockedCampaigns = new Set();
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];

      // Throttle por campanha (n_per_min): bloqueia só os itens da campanha.
      // Uma vez sem token, a campanha fica bloqueada até o fim do tick — enviar
      // um item posterior dela após o refill quebraria o FIFO da campanha.
      const throttle = campaignThrottles.get(item.run_id);
      if (throttle) {
        if (blockedCampaigns.has(throttle.campaignId)) {
          summary.throttled += 1;
          continue;
        }
        const limiter = getCampaignLimiter(campaignLimiters, throttle.campaignId, throttle.nPerMin, rateNow);
        if (!limiter.tryRemove(throttle.campaignId)) {
          blockedCampaigns.add(throttle.campaignId);
          summary.throttled += 1;
          continue; // itens de outras campanhas do tenant seguem
        }
      }

      // Rate-limit do tenant: sem token, o resto da lane espera o próximo tick.
      if (rateLimiter && rateLimiter.tryRemove(item.tenant_id) === false) {
        summary.throttled += items.length - i;
        return;
      }

      await handleItem(item);
    }
  }

  // Pool: até `tenantConcurrency` lanes em paralelo. Dentro da lane o envio é
  // serial; o paralelismo é só ENTRE tenants (Meta trata cada número/token de
  // tenant de forma independente).
  const lanes = [...laneByTenant.values()];
  const width = Math.max(1, Math.min(tenantConcurrency, lanes.length));
  let cursor = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (cursor < lanes.length) {
        const lane = lanes[cursor];
        cursor += 1;
        await processLane(lane);
      }
    }),
  );

  summary.runIds = [...touchedRuns];
  await closeFinishedRuns(supabase, summary.runIds, nowIso, logger);

  if (summary.processed > 0 || summary.throttled > 0) {
    logger.log?.(
      `[agent-actions] processados=${summary.processed} enviados=${summary.done} ` +
        `pulados=${summary.skipped} falhas=${summary.failed} retries=${summary.retried} ` +
        `throttled=${summary.throttled} tenants=${laneByTenant.size}`,
    );
  }
  return summary;
}

export const __test__ = {
  fetchEligibleBatch,
  claimItem,
  finalize,
  closeFinishedRuns,
  loadCampaignThrottles,
  getCampaignLimiter,
  QUEUE_TABLE,
  RUNS_TABLE,
  CAMPAIGNS_TABLE,
};
