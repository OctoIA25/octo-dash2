/**
 * ⚙️ Worker do Agente Disparador.
 *
 * Drena a fila `agent_action_queue` (preenchida na CONFIRMAÇÃO de um run) e, para
 * cada item, executa a ação via o registry — que, no caso de send_whatsapp,
 * reutiliza `deliverRecommendation` (idempotência + envio + histórico em
 * lead_recommendations). Não duplica nenhuma lógica de envio.
 *
 * Espelha o worker de recuperação:
 *  - claim atômico (pending → processing) impede que ticks sobrepostos do cron
 *    peguem o mesmo item (proteção contra envio duplicado / race condition);
 *  - finalize marca o desfecho (done | skipped | failed);
 *  - ao terminar, atualiza os contadores agregados do run (observabilidade).
 *
 * Determinístico e testável: `nowMs` e todas as dependências são injetáveis.
 *
 * NOTA SOBRE CONCORRÊNCIA: usamos o caminho OPTIMISTIC-CLAIM (claim por
 * `update ... where status='pending'`). Só um updater vence por linha — o banco
 * garante corretude sem necessidade de RPC/SKIP LOCKED. O ganho de SKIP LOCKED
 * seria throughput em alta concorrência, não corretude; fica fora de escopo.
 */

import { getAction } from './actionRegistry.js';

const QUEUE_TABLE = 'agent_action_queue';
const RUNS_TABLE = 'agent_action_runs';

const DEFAULT_BACKOFF_BASE_MS = 60_000;     // 1 minuto
const DEFAULT_BACKOFF_MAX_MS = 3_600_000;   // 1 hora
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Claim atômico de UM item pendente (pending → processing).
 * Respeita next_attempt_at: só pega itens elegíveis agora (IS NULL ou <= nowIso).
 */
async function claimNextPending(supabase, nowIso) {
  const { data: candidate, error: selErr } = await supabase
    .from(QUEUE_TABLE)
    .select('*')
    .eq('status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selErr || !candidate) return null;

  const { data: claimed, error: updErr } = await supabase
    .from(QUEUE_TABLE)
    .update({ status: 'processing', attempts: (candidate.attempts || 0) + 1 })
    .eq('id', candidate.id)
    .eq('status', 'pending') // só vence quem ainda vê pending
    .select('*')
    .maybeSingle();
  if (updErr || !claimed) return null; // outro tick reivindicou primeiro
  return claimed;
}

/** Marca o desfecho final de um item. */
async function finalize(supabase, id, status, nowIso, error = null) {
  await supabase.from(QUEUE_TABLE).update({ status, error, processed_at: nowIso }).eq('id', id);
}

/**
 * Devolve um item para 'pending', revertendo o claim.
 * Usado em dois cenários distintos:
 *  - Rate-limit: decrementa attempts (não foi uma tentativa real) e mantém
 *    next_attempt_at inalterado (item fica elegível assim que houver token).
 *  - Backoff: mantém attempts (foi uma tentativa real) e seta next_attempt_at
 *    calculado (item só é elegível após o delay).
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
        .select('status')
        .eq('run_id', runId);
      const rows = items || [];
      const pending = rows.filter((r) => r.status === 'pending' || r.status === 'processing').length;
      if (pending > 0) continue; // ainda há itens em andamento

      const sent = rows.filter((r) => r.status === 'done').length;
      const failed = rows.filter((r) => r.status === 'failed').length;
      await supabase
        .from(RUNS_TABLE)
        .update({
          status: failed > 0 && sent === 0 ? 'failed' : 'done',
          sent_count: sent,
          failed_count: failed,
          completed_at: nowIso,
        })
        .eq('id', runId);
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
 * Processa a fila de ações.
 *
 * deps: {
 *   nowMs?, limit?, logger?,
 *   deliver,          // = deliverRecommendation
 *   schedulerDeps,    // deps internas que deliver usa (makeSchedulerDeps)
 *   getEnvironment, processEnv?,
 *   rateLimiter?,     // { tryRemove(tenantId) => boolean } — opcional
 *   backoffBaseMs?,   // base do backoff exponencial (default: 60000)
 *   backoffMaxMs?,    // cap do backoff (default: 3600000)
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
    rateLimiter,
    backoffBaseMs = DEFAULT_BACKOFF_BASE_MS,
    backoffMaxMs = DEFAULT_BACKOFF_MAX_MS,
  } = deps;

  const nowIso = new Date(nowMs).toISOString();
  const summary = { processed: 0, done: 0, skipped: 0, failed: 0, retried: 0, throttled: 0, runIds: [] };
  const touchedRuns = new Set();

  // Set de ids que foram throttled neste tick: evita loop infinito onde o mesmo
  // item devolvido a 'pending' seria reclamado imediatamente na próxima iteração
  // do loop (o fake/DB ainda o veria como pending sem next_attempt_at).
  const throttledIds = new Set();

  for (let i = 0; i < limit; i += 1) {
    const item = await claimNextPending(supabase, nowIso);
    if (!item) break;

    // Pula itens throttled neste tick para evitar re-claim imediato.
    if (throttledIds.has(item.id)) {
      // Devolve sem contar como processado e encerra o loop (não haverá mais
      // itens elegíveis para este tenant; continuar consumiria outros tenants).
      // Abordagem mais simples: parar o tick quando reencontrarmos um throttled.
      await releaseToPending(supabase, item.id, {
        attempts: Math.max(0, (item.attempts || 1) - 1),
      });
      break;
    }

    summary.processed += 1;
    touchedRuns.add(item.run_id);

    // Rate-limit por tenant ANTES de entregar.
    if (rateLimiter && rateLimiter.tryRemove(item.tenant_id) === false) {
      // Não foi uma tentativa real: reverte attempts e devolve a 'pending'.
      // next_attempt_at NÃO é alterado (item continua elegível assim que houver token).
      await releaseToPending(supabase, item.id, {
        attempts: Math.max(0, (item.attempts || 1) - 1),
      });
      summary.throttled += 1;
      throttledIds.add(item.id);
      continue;
    }

    const action = getAction(item.action_type);
    if (!action) {
      await finalize(supabase, item.id, 'failed', nowIso, `ação desconhecida: ${item.action_type}`);
      summary.failed += 1;
      continue;
    }

    try {
      const result = await action.deliverItem(supabase, item, {
        deliverRecommendation: deliver,
        schedulerDeps,
        getEnvironment,
        processEnv,
      });

      if (result.status === 'failed') {
        // Determina se deve fazer dead-letter ou agendar retry com backoff.
        const maxAttempts = item.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
        if (item.attempts >= maxAttempts) {
          // Esgotou tentativas → dead-letter.
          await finalize(supabase, item.id, 'failed', nowIso, result.error || null);
          summary.failed += 1;
        } else {
          // Ainda há tentativas restantes → backoff exponencial.
          const nextAttemptAt = calcNextAttemptAt(nowMs, item.attempts, backoffBaseMs, backoffMaxMs);
          await releaseToPending(supabase, item.id, {
            next_attempt_at: nextAttemptAt,
            error: result.error || null,
          });
          summary.retried += 1;
        }
      } else {
        await finalize(supabase, item.id, result.status, nowIso, result.error || null);
        if (result.status === 'done') summary.done += 1;
        else if (result.status === 'skipped') summary.skipped += 1;
        else summary.failed += 1;
      }
    } catch (err) {
      // Exceção inesperada: mesma lógica de backoff/dead-letter.
      const maxAttempts = item.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
      if (item.attempts >= maxAttempts) {
        await finalize(supabase, item.id, 'failed', nowIso, err?.message || 'erro desconhecido');
        summary.failed += 1;
      } else {
        const nextAttemptAt = calcNextAttemptAt(nowMs, item.attempts, backoffBaseMs, backoffMaxMs);
        await releaseToPending(supabase, item.id, {
          next_attempt_at: nextAttemptAt,
          error: err?.message || 'erro desconhecido',
        });
        summary.retried += 1;
      }
    }
  }

  summary.runIds = [...touchedRuns];
  await closeFinishedRuns(supabase, summary.runIds, nowIso, logger);

  if (summary.processed > 0) {
    logger.log?.(
      `[agent-actions] processados=${summary.processed} enviados=${summary.done} ` +
        `pulados=${summary.skipped} falhas=${summary.failed} retries=${summary.retried} ` +
        `throttled=${summary.throttled}`,
    );
  }
  return summary;
}

export const __test__ = { claimNextPending, finalize, closeFinishedRuns, QUEUE_TABLE, RUNS_TABLE };
