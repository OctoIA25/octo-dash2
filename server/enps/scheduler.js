/**
 * Agenda o envio/lembrete/fechamento do eNPS via node-cron (lazy-import).
 * Flag-gated pelo chamador (ENPS_SCHEDULER=1) para rodar em UM processo — mesmo
 * padrão de Kenlo/C2S/Santa Ângela. A reentrância é POR TENANT (no runner).
 *
 * Cron default: 0 9 1-28 * * — checa toda manhã (dias 1–28); a decisão de "é o
 * dia de abrir?", "venceu o intervalo de lembrete?" e "passou o dia de fechar?"
 * é do runner, não do cron.
 */
import { makeEnpsRunner } from './runner.js';
import { recordHeartbeat } from '../observability/heartbeat.js';

export async function startEnpsScheduler(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const cronExpr = processEnv.ENPS_SCHEDULER_CRON || '0 9 1-28 * *';
  let cron = options.cronImpl;
  if (!cron) {
    try { ({ default: cron } = await import(/* @vite-ignore */ 'node-cron')); }
    catch { console.warn('[enps] node-cron não instalado — agendamento desabilitado.'); return null; }
  }
  const runner = options.runner || makeEnpsRunner(supabase, options);
  return cron.schedule(cronExpr, () => {
    const startedAt = Date.now();
    Promise.resolve(runner.trigger())
      .then((r) => {
        if (r && (r.started || r.skipped)) console.log(`[enps] {"event":"enps.tick","started":${r.started || 0},"skipped":${r.skipped || 0}}`);
        return recordHeartbeat(supabase, 'enps_scheduler', { result: r, ok: true, durationMs: Date.now() - startedAt });
      })
      .catch((e) => console.error(`[enps] trigger do scheduler falhou: ${e?.message}`));
  });
}
