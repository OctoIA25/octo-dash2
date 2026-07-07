/**
 * Agenda a sincronização Contact2Sale via node-cron (lazy-import). Flag-gated
 * pelo chamador (CONTACT2SALE_SYNC_SCHEDULER=1) para rodar em UM processo —
 * mesmo padrão do Kenlo/Santa Ângela. A guarda de reentrância é POR TENANT
 * (syncRunner): tick novo nunca sobrepõe ciclo em andamento do mesmo tenant.
 */
import { loadC2sEnv } from './c2sConfig.js';
import { createC2sConfigResolver } from './configResolver.js';
import { createC2sApiClient } from './c2sApiClient.js';
import { createC2sProvider } from './provider.js';
import { createCrmSyncEngine } from '../crmSync/engine.js';
import { createC2sSyncRunner } from './syncRunner.js';

export function makeC2sEngine(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const resolver = options.resolver || createC2sConfigResolver({ supabase, processEnv });
  const apiClient = options.apiClient || createC2sApiClient({ resolver, processEnv });
  const provider = createC2sProvider({ supabase, apiClient, processEnv });
  return createCrmSyncEngine({ supabase, provider });
}

export function makeC2sRunner(supabase, options = {}) {
  const engine = options.engine || makeC2sEngine(supabase, options);
  return createC2sSyncRunner(engine, options);
}

export async function startC2sScheduler(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const cfg = loadC2sEnv(processEnv);
  let cron = options.cronImpl;
  if (!cron) {
    try { ({ default: cron } = await import(/* @vite-ignore */ 'node-cron')); }
    catch { console.warn('[contact2sale] node-cron não instalado — agendamento desabilitado.'); return null; }
  }
  const runner = options.runner || makeC2sRunner(supabase, options);
  return cron.schedule(cfg.cron, () => {
    Promise.resolve(runner.trigger())
      .catch((e) => console.error(`[contact2sale] trigger do scheduler falhou: ${e?.message}`));
  });
}
