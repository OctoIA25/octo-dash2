/**
 * Orquestra a sincronização por tenant: busca incremental por portal, filtra
 * teste/duplicados, enriquece, atribui corretor, faz upsert idempotente e dispara
 * o webhook da Lia para cada lead novo. Isola falha por tenant.
 */
import { MEDIA_ORIGINS, loadKenloEnv } from './kenloConfig.js';
import { normalizeLead, isTestLead } from './leadNormalizer.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const idOf = (l) => l._id || l.id;

export function createKenloSyncService({
  supabase, leadService, brokerAssigner, processEnv = process.env,
  fetchImpl = fetch, logger = noopLogger, runId = 'kenlo',
}) {
  const cfg = loadKenloEnv(processEnv);

  async function existingIds(tenantId, ids) {
    if (!ids.length) return new Set();
    const { data, error } = await supabase
      .from('kenlo_leads').select('external_id').eq('tenant_id', tenantId).in('external_id', ids);
    if (error) { logger.warn(`[kenlo] select existentes falhou: ${error.message}`); return new Set(); }
    return new Set((data || []).map((r) => r.external_id).filter(Boolean));
  }

  async function fireLia(row) {
    if (!cfg.liaWebhookUrl) return;
    try {
      await fetchImpl(cfg.liaWebhookUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: row.client_name, numero: row.client_phone, portal: row.portal, codigo: row.interest_reference }),
      });
    } catch (e) { logger.warn(`[kenlo] webhook Lia falhou: ${e.message}`); }
  }

  async function syncTenant(integration) {
    const tenantId = integration.tenant_id;
    const stats = { fetched: 0, new: 0, saved: 0, skippedTest: 0, errors: 0 };
    logger.info(`[kenlo] {"event":"kenlo.sync.start","runId":"${runId}","tenantId":"${tenantId}"}`);

    for (const mediaOrigin of MEDIA_ORIGINS) {
      const { leads } = await leadService.fetchAllPages(integration, { mediaOrigin });
      stats.fetched += leads.length;

      const nonTest = leads.filter((l) => { if (isTestLead(l)) { stats.skippedTest++; return false; } return true; });
      const ids = nonTest.map(idOf).filter(Boolean);
      const known = await existingIds(tenantId, ids);
      const fresh = nonTest.filter((l) => idOf(l) && !known.has(idOf(l)));
      if (!fresh.length) continue;

      const detailed = await leadService.fetchDetails(integration, fresh);
      let rows = detailed.map((l) => normalizeLead(l, tenantId));
      rows = await brokerAssigner.assign(tenantId, rows);

      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { data, error } = await supabase
          .from('kenlo_leads')
          .upsert(batch, { onConflict: 'tenant_id,external_id', ignoreDuplicates: false })
          .select('external_id');
        if (error) { stats.errors++; logger.warn(`[kenlo] upsert falhou: ${error.message}`); continue; }
        stats.saved += data?.length || batch.length;
      }

      for (const row of rows) await fireLia(row);
      stats.new += rows.length;
    }

    logger.info(`[kenlo] {"event":"kenlo.sync.done","runId":"${runId}","tenantId":"${tenantId}","new":${stats.new},"saved":${stats.saved}}`);
    return stats;
  }

  async function syncAllTenants() {
    const { data, error } = await supabase
      .from('kenlo_integrations').select('*').eq('status', 'active');
    if (error) { logger.error(`[kenlo] listar tenants falhou: ${error.message}`); return []; }
    const results = await Promise.allSettled((data || []).map((i) => syncTenant(i)));
    return results.map((r, idx) => ({
      tenantId: data[idx]?.tenant_id,
      ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message }),
    }));
  }

  return { syncTenant, syncAllTenants };
}
