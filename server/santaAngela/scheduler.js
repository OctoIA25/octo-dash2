/**
 * Agenda a sincronização Santa Ângela via node-cron (lazy-import). Flag-gated
 * pelo chamador para rodar em UM processo. Guarda de reentrância (syncRunner)
 * evita sobreposição de ciclos.
 */
import { createSantaAngelaSyncService } from './santaAngelaSyncService.js';
import { createSantaAngelaApiClient } from './santaAngelaApiClient.js';
import { createSantaAngelaConfigResolver } from './configResolver.js';
import { createSantaAngelaRunner } from './syncRunner.js';

// A cada 60s: leads alimentam um time de IA de atendimento, que exige frescor
// quase em tempo real. Viável porque cada ciclo puxa só a 1ª página (mais
// recentes, DESC) e o sync é idempotente — não varre a base inteira.
const DEFAULT_CRON = '* * * * *'; // a cada 1 minuto

export function makeSantaAngelaRunner(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  let syncService = options.syncService;
  if (!syncService) {
    const resolver = createSantaAngelaConfigResolver({ supabase, processEnv });
    const apiClient = createSantaAngelaApiClient({ resolver });
    syncService = createSantaAngelaSyncService({ supabase, apiClient, processEnv });
  }
  return createSantaAngelaRunner(syncService);
}

export async function startSantaAngelaScheduler(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const cronExpr = processEnv.SANTA_ANGELA_SYNC_CRON || DEFAULT_CRON;
  let cron = options.cronImpl;
  if (!cron) {
    try { ({ default: cron } = await import(/* @vite-ignore */ 'node-cron')); }
    catch { console.warn('[santa-angela] node-cron não instalado — agendamento desabilitado.'); return null; }
  }
  const runner = options.runner || makeSantaAngelaRunner(supabase, options);
  return cron.schedule(cronExpr, () => { runner.trigger(); });
}
