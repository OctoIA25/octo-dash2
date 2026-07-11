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
import { createSyncRunner } from './syncRunner.js';
import puppeteerLoginDriver from './puppeteerLoginDriver.js';
import { recordHeartbeat } from '../observability/heartbeat.js';

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

export function makeSyncRunner(supabase, options = {}) {
  const syncService = options.syncService || makeSyncService(supabase, options);
  // Heartbeat passivo do ciclo agregado (P1 observabilidade). onCycleEnd é o
  // callback opcional do runner — o wiring supabase→helper vive aqui, o runner
  // não conhece observabilidade. Nunca lança (recordHeartbeat absorve tudo).
  return createSyncRunner(syncService, {
    onCycleEnd: ({ result, ok, durationMs }) =>
      recordHeartbeat(supabase, 'kenlo_sync', { result, ok, durationMs }),
  });
}

export async function startKenloScheduler(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const cfg = loadKenloEnv(processEnv);
  let cron = options.cronImpl;
  if (!cron) {
    try { ({ default: cron } = await import(/* @vite-ignore */ 'node-cron')); }
    catch { console.warn('[kenlo] node-cron não instalado — agendamento desabilitado.'); return null; }
  }
  const runner = options.runner || makeSyncRunner(supabase, options);
  return cron.schedule(cfg.cron, () => { runner.trigger(); });
}
