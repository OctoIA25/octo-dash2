/**
 * Sincroniza leads da Santa Ângela para a tabela `leads`, por tenant.
 * Lógica de dedup/insert/update portada do client santaAngelaSyncService.ts,
 * agora server-side (supabase service role). Atualiza last_sync_at/leads_count.
 *
 * IDEMPOTÊNCIA — rodar o mesmo lead N vezes não duplica nem corrompe:
 *   - chave natural = source_lead_id. Existe → UPDATE; não existe → INSERT;
 *     telefone já usado sob OUTRO source_id → pula (não viola unique_phone_per_tenant).
 *   Isso vale igualmente para o disparo automático (cron) e o manual (botão):
 *   ambos chamam o MESMO syncTenant, e o mesmo runner (guarda de reentrância)
 *   impede dois ciclos concorrentes no processo — ver syncRunner.js.
 *
 * FALHAS TRANSITÓRIAS (rede/timeout/5xx) — estratégia "próximo cron":
 *   o tenant falha NAQUELE ciclo, loga o erro e é re-tentado no próximo tick
 *   (sem retry imediato em loop, que amplificaria uma API instável). O timeout
 *   por requisição vive no apiClient; o timeout por tenant, no syncAllTenants.
 */
import { mapSantaAngelaToLead } from './leadMapper.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const CONFIG_TABLE = 'tenant_santa_angela_config';
const DEFAULT_CONCURRENCY = 5;       // tenants sincronizados em paralelo por ciclo
const DEFAULT_TENANT_TIMEOUT_MS = 60000; // teto por tenant; estourou → erro no ciclo, não bloqueia os demais

export function createSantaAngelaSyncService({
  supabase, apiClient, logger = noopLogger, processEnv = process.env, pLimitImpl,
}) {
  const concurrency = Number(processEnv.SANTA_ANGELA_SYNC_CONCURRENCY) || DEFAULT_CONCURRENCY;
  const tenantTimeoutMs = Number(processEnv.SANTA_ANGELA_TENANT_TIMEOUT_MS) || DEFAULT_TENANT_TIMEOUT_MS;
  async function getExisting(tenantId) {
    const { data, error } = await supabase
      .from('leads').select('phone, source_lead_id')
      .eq('tenant_id', tenantId).eq('source', 'Santa Angela');
    if (error) { logger.warn(`[santa-angela] erro lendo existentes: ${error.message}`); return { phoneSet: new Set(), sourceIdSet: new Set() }; }
    const phoneSet = new Set((data || []).map((l) => l.phone).filter(Boolean));
    // filter(Boolean): um source_lead_id nulo no banco não pode virar match
    // contra uma saLead.id ausente (causaria falso "update" / .eq sem alvo).
    const sourceIdSet = new Set((data || []).map((l) => l.source_lead_id).filter(Boolean));
    return { phoneSet, sourceIdSet };
  }

  async function insertNew(lead) {
    const { error } = await supabase.from('leads').insert(lead);
    if (!error) return true;
    if (String(error.message || '').includes('unique_phone_per_tenant')) {
      const { error: e2 } = await supabase.from('leads').insert({ ...lead, phone: null });
      return !e2;
    }
    logger.warn(`[santa-angela] insert falhou: ${error.message}`);
    return false;
  }

  async function updateExisting(lead, tenantId) {
    // NÃO reescrever assigned_at: ele é a base do countdown do bolsão
    // (expire_bolsao_leads usa COALESCE(assigned_at, ...)). Como o polling roda a
    // cada 60s e leads recentes reaparecem na 1ª página, regravar assigned_at aqui
    // reiniciaria o cronômetro eternamente — o lead nunca expiraria/redistribuiria.
    // assigned_at é setado só no INSERT; re-atribuição fica a cargo do trigger
    // tg_update_leads_assigned_at (quando assigned_agent_* muda).
    const { error } = await supabase.from('leads')
      .update({ updated_at: new Date().toISOString(), custom_fields: lead.custom_fields })
      .eq('source_lead_id', lead.source_lead_id).eq('tenant_id', tenantId);
    return !error;
  }

  async function syncTenant(tenantId, runId = '-') {
    const startedAt = Date.now();
    logger.info(`[santa-angela] {"event":"santa-angela.sync.tenant.start","runId":"${runId}","tenantId":"${tenantId}"}`);
    const result = { tenantId, success: false, totalFetched: 0, newLeads: 0, updatedLeads: 0, errors: 0, message: '' };

    const finish = () => {
      const durationMs = Date.now() - startedAt;
      if (result.success) {
        logger.info(`[santa-angela] {"event":"santa-angela.sync.tenant.done","runId":"${runId}","tenantId":"${tenantId}","durationMs":${durationMs},"totalFetched":${result.totalFetched},"new":${result.newLeads},"updated":${result.updatedLeads}}`);
      } else {
        logger.warn(`[santa-angela] {"event":"santa-angela.sync.tenant.error","runId":"${runId}","tenantId":"${tenantId}","durationMs":${durationMs},"error":${JSON.stringify(result.message)}}`);
      }
      return result;
    };

    const fetched = await apiClient.fetchLeads(tenantId);
    if (!fetched.ok) {
      result.errors = 1;
      result.message = `Falha ao buscar leads: ${fetched.error || fetched.status}`;
      return finish();
    }
    result.totalFetched = fetched.leads.length;
    if (fetched.leads.length === 0) {
      result.success = true; result.message = 'Nenhum lead encontrado na API';
      await touchSync(tenantId, 0);
      return finish();
    }

    const { phoneSet, sourceIdSet } = await getExisting(tenantId);
    for (const saLead of fetched.leads) {
      const mapped = mapSantaAngelaToLead(saLead, tenantId);
      if (saLead.id && sourceIdSet.has(saLead.id)) {
        if (await updateExisting(mapped, tenantId)) result.updatedLeads++;
      } else if (mapped.phone && phoneSet.has(mapped.phone)) {
        // pula: telefone já existe sob outro source_id (evita violar unique_phone_per_tenant)
      } else if (await insertNew(mapped)) {
        result.newLeads++;
      }
    }

    result.success = true;
    result.message = `Sincronização concluída: ${result.newLeads} novos, ${result.updatedLeads} atualizados`;
    await touchSync(tenantId, result.newLeads + result.updatedLeads);
    return finish();
  }

  // Teto de tempo por tenant: um tenant pendurado não pode segurar o ciclo. Se
  // estourar, retorna erro (não lança) — o allSettled segue com os demais e o
  // tenant é re-tentado no próximo cron.
  // NOTA: o syncTenant que perdeu o race NÃO é cancelado — segue em background
  // até concluir. A escrita tardia é inofensiva: o sync é idempotente (chave
  // source_lead_id) e a guarda de reentrância impede ciclos sobrepostos; no pior
  // caso um touchSync atrasado regrava last_sync_at com valor levemente anterior.
  function withTenantTimeout(tenantId, runId) {
    return Promise.race([
      syncTenant(tenantId, runId),
      new Promise((resolve) => setTimeout(
        () => resolve({ tenantId, success: false, totalFetched: 0, newLeads: 0, updatedLeads: 0, errors: 1,
          message: `timeout do tenant após ${tenantTimeoutMs}ms` }),
        tenantTimeoutMs,
      )),
    ]);
  }

  async function syncAllTenants(runId = String(Date.now())) {
    const cycleStart = Date.now();
    const { data, error } = await supabase
      .from(CONFIG_TABLE).select('tenant_id').eq('status', 'active');
    if (error) {
      logger.error(`[santa-angela] {"event":"santa-angela.sync.cycle.error","runId":"${runId}","error":${JSON.stringify(error.message)}}`);
      return [];
    }
    const rows = data || [];
    logger.info(`[santa-angela] {"event":"santa-angela.sync.cycle.start","runId":"${runId}","tenantsAtivos":${rows.length},"concurrency":${concurrency}}`);

    // p-limit: no máximo `concurrency` tenants em paralelo — evita abrir centenas
    // de sincronizações de uma vez conforme a base cresce. Injetável p/ testes.
    const limit = pLimitImpl ? pLimitImpl(concurrency) : (await import('p-limit')).default(concurrency);
    const settled = await Promise.allSettled(
      rows.map((r) => limit(() => withTenantTimeout(r.tenant_id, runId))),
    );
    const results = settled.map((s, i) => (s.status === 'fulfilled'
      ? s.value
      : { tenantId: rows[i]?.tenant_id, success: false, errors: 1, message: s.reason?.message }));

    const ok = results.filter((r) => r.success).length;
    logger.info(`[santa-angela] {"event":"santa-angela.sync.cycle.done","runId":"${runId}","durationMs":${Date.now() - cycleStart},"ok":${ok},"failed":${results.length - ok}}`);
    return results;
  }

  async function touchSync(tenantId, count) {
    const { error } = await supabase.from(CONFIG_TABLE)
      .update({ last_sync_at: new Date().toISOString(), leads_count: count })
      .eq('tenant_id', tenantId);
    if (error) logger.warn(`[santa-angela] touchSync falhou: ${error.message}`);
  }

  return { syncTenant, syncAllTenants };
}
