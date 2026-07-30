// server/anthropic/scheduler.js
/**
 * Agenda o recálculo do uso semanal Anthropic via node-cron (lazy-import).
 * Flag-gated pelo chamador (ANTHROPIC_SCHEDULER=1) p/ rodar em UM processo.
 * Sem sync/upsert: só lê o cost_report e atualiza o snapshot por tenant.
 */
import { loadAnthropicEnv } from './config.js';
import { createAnthropicService } from './service.js';
import { recordHeartbeat } from '../observability/heartbeat.js';

const CONFIG_TABLE = 'tenant_anthropic_config';

/** Tenants com admin_api_key_encrypted E weekly_limit_usd não nulos. */
async function defaultListConfiguredTenants(supabase) {
  const { data, error } = await supabase
    .from(CONFIG_TABLE)
    .select('tenant_id')
    .not('admin_api_key_encrypted', 'is', null)
    .not('weekly_limit_usd', 'is', null);
  if (error) { console.warn(`[anthropic] listConfiguredTenants falhou: ${error.message}`); return []; }
  return (data || []).map((r) => r.tenant_id);
}

export function makeAnthropicRunner(supabase, options = {}) {
  const service = options.service || createAnthropicService({ supabase });
  const listConfiguredTenants = options.listConfiguredTenants || (() => defaultListConfiguredTenants(supabase));
  const recordHeartbeatImpl = options.recordHeartbeatImpl || ((name, opts) => recordHeartbeat(supabase, name, opts));

  async function runAll() {
    const start = Date.now();
    const tenants = await listConfiguredTenants();
    let errors = 0;
    for (const tenantId of tenants) {
      try { await service.getWeeklyUsage(tenantId); }
      catch (err) { errors += 1; console.error(`[anthropic] runAll tenant=${tenantId} falhou: ${err?.message}`); }
    }
    const result = { processed: tenants.length, errors };
    await recordHeartbeatImpl('anthropic_usage', { result, ok: errors === 0, durationMs: Date.now() - start });
    return result;
  }

  return { runAll };
}

export async function startAnthropicScheduler(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const cfg = loadAnthropicEnv(processEnv);
  let cron = options.cronImpl;
  if (!cron) {
    try { ({ default: cron } = await import(/* @vite-ignore */ 'node-cron')); }
    catch { console.warn('[anthropic] node-cron não instalado — agendamento desabilitado.'); return null; }
  }
  const runner = options.runner || makeAnthropicRunner(supabase, options);
  return cron.schedule(cfg.cron, () => {
    Promise.resolve(runner.runAll())
      .then((r) => { if (r && (r.processed || r.errors)) console.log(`[anthropic] {"event":"anthropic.tick","processed":${r.processed},"errors":${r.errors}}`); })
      .catch((e) => console.error(`[anthropic] tick falhou: ${e?.message}`));
  });
}
