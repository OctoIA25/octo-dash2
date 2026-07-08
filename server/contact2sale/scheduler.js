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
  const logger = options.logger || console;
  const provider = createC2sProvider({ supabase, apiClient, processEnv, logger });
  // logger: console liga os logs sync.start/sync.done (mode, new, updated, saved)
  // e os warnings de upsert/select que o engine já emite — sem ele caíam no
  // noopLogger e o sync ficava mudo (só dava p/ ver estado via query no banco).
  return createCrmSyncEngine({ supabase, provider, logger });
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
      // Log por tick: quantos ciclos começaram e quantos foram pulados (tenant já
      // em voo). started=0/skipped=0 = nenhuma integração ativa; skipped>0 = ciclo
      // anterior ainda rodando (backfill longo). Só loga quando há algo a dizer.
      .then((r) => { if (r && (r.started || r.skipped)) console.log(`[contact2sale] {"event":"c2s.tick","started":${r.started || 0},"skipped":${r.skipped || 0}}`); })
      .catch((e) => console.error(`[contact2sale] trigger do scheduler falhou: ${e?.message}`));
  });
}
