// server/anthropic/scheduler.js
/**
 * Agenda o recálculo do uso semanal Anthropic via node-cron (lazy-import).
 * Flag-gated pelo chamador (ANTHROPIC_SCHEDULER=1) p/ rodar em UM processo.
 * Sem sync/upsert: só lê o cost_report e atualiza o snapshot por tenant.
 */
import { loadAnthropicEnv } from './config.js';
import { createAnthropicService } from './service.js';
import { recordHeartbeat } from '../observability/heartbeat.js';
import { checkAndSendOwnerAlert } from './alerts.js';

const CONFIG_TABLE = 'tenant_anthropic_config';

/**
 * Tenants com admin_api_key_encrypted não nula E mode='api' (o budget agora é
 * global de env). Tenants MAX são push via ingest — o tick os pularia de
 * qualquer forma sem key, mas filtrar aqui evita o upsert not_configured que
 * re-armaria o dedup.
 */
async function defaultListConfiguredTenants(supabase) {
  const { data, error } = await supabase
    .from(CONFIG_TABLE)
    .select('tenant_id')
    .not('admin_api_key_encrypted', 'is', null)
    .eq('mode', 'api');
  if (error) { console.warn(`[anthropic] listConfiguredTenants falhou: ${error.message}`); return []; }
  return (data || []).map((r) => r.tenant_id);
}

/** last_state ANTES do recálculo — é a memória do dedup por transição. */
async function defaultReadPrevState(supabase, tenantId) {
  try {
    const { data, error } = await supabase
      .from(CONFIG_TABLE).select('last_state').eq('tenant_id', tenantId).maybeSingle();
    if (error) { console.warn(`[anthropic] readPrevState falhou tenant=${tenantId}: ${error.message}`); return null; }
    return data?.last_state ?? null;
  } catch (err) {
    console.warn(`[anthropic] readPrevState falhou tenant=${tenantId}: ${err?.message}`);
    return null;
  }
}

export function makeAnthropicRunner(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const service = options.service || createAnthropicService({ supabase, processEnv });
  const listConfiguredTenants = options.listConfiguredTenants || (() => defaultListConfiguredTenants(supabase));
  const readPrevState = options.readPrevState || ((tenantId) => defaultReadPrevState(supabase, tenantId));
  const recordHeartbeatImpl = options.recordHeartbeatImpl || ((name, opts) => recordHeartbeat(supabase, name, opts));
  const alerts = options.alertsImpl || { checkAndSendOwnerAlert };

  async function runAll() {
    const start = Date.now();
    const tenants = await listConfiguredTenants();
    let errors = 0;
    let alertsSent = 0;

    for (const tenantId of tenants) {
      try {
        const prevState = await readPrevState(tenantId);
        const dto = await service.getWeeklyUsage(tenantId);
        const r = await alerts.checkAndSendOwnerAlert(supabase, { dto, prevState, tenantId, processEnv });
        if (r.alerted) alertsSent += 1;
      } catch (err) {
        errors += 1;
        console.error(`[anthropic] runAll tenant=${tenantId} falhou: ${err?.message}`);
      }
    }

    const result = { processed: tenants.length, errors, alerts: alertsSent };
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
      .then((r) => { if (r && (r.processed || r.errors || r.alerts)) console.log(`[anthropic] {"event":"anthropic.tick","processed":${r.processed},"errors":${r.errors},"alerts":${r.alerts || 0}}`); })
      .catch((e) => console.error(`[anthropic] tick falhou: ${e?.message}`));
  });
}
