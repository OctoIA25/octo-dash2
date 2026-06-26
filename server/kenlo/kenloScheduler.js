/**
 * Agenda a sincronização Kenlo via node-cron (lazy-import). Flag-gated pelo
 * chamador (KENLO_SYNC_SCHEDULER=1) para rodar em UM processo. Guarda de
 * reentrância evita sobreposição de ciclos.
 */
import { loadKenloEnv } from './kenloConfig.js';
import { createKenloAuthService } from './KenloAuthService.js';
import { createKenloApiClient } from './KenloApiClient.js';
import { createKenloLeadService } from './KenloLeadService.js';
import { createBrokerAssigner } from './brokerAssigner.js';
import { makeBrokerLookups } from './brokerLookups.js';
import { createKenloSyncService } from './KenloSyncService.js';
import puppeteerLoginDriver from './puppeteerLoginDriver.js';

export function makeSyncService(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const authService = createKenloAuthService({
    supabase, loginDriver: options.loginDriver || puppeteerLoginDriver, processEnv,
  });
  const apiClient = createKenloApiClient({ authService, processEnv });
  const leadService = createKenloLeadService({ apiClient, processEnv });
  // Lookups reais (imoveis_corretores + tenant_brokers/memberships); override em testes.
  const lookups = options.brokerLookups || makeBrokerLookups(supabase);
  const brokerAssigner = createBrokerAssigner(lookups);
  return createKenloSyncService({ supabase, leadService, brokerAssigner, processEnv });
}

export async function startKenloScheduler(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const cfg = loadKenloEnv(processEnv);
  let cron = options.cronImpl;
  if (!cron) {
    try { ({ default: cron } = await import(/* @vite-ignore */ 'node-cron')); }
    catch { console.warn('[kenlo] node-cron não instalado — agendamento desabilitado.'); return null; }
  }
  const syncService = options.syncService || makeSyncService(supabase, options);
  let running = false;
  const task = cron.schedule(cfg.cron, () => {
    if (running) return;
    running = true;
    Promise.resolve(syncService.syncAllTenants())
      .catch((e) => console.error('[kenlo] erro no ciclo:', e?.message))
      .finally(() => { running = false; });
  });
  return task;
}
