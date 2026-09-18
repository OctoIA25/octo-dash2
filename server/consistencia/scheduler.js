/**
 * Agenda o teste diário de consistência dos números (P0.6) via node-cron.
 *
 * Mesmo formato do eNPS: import preguiçoso do node-cron, expressão em env, e
 * flag do chamador para rodar em UM processo só — dois processos gravariam
 * dois relatórios por dia e a tela mostraria o que chegasse por último.
 *
 * Default 0 6 * * * — seis da manhã, antes de alguém abrir a Dash. O relatório
 * tem que estar pronto quando o gestor olhar o número, não depois.
 */
import { recordHeartbeat } from '../observability/heartbeat.js';
import { rodaParaTodosOsTenants } from './index.js';

export async function startConsistenciaScheduler(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const cronExpr = processEnv.CONSISTENCIA_CRON || '0 6 * * *';

  let cron = options.cronImpl;
  if (!cron) {
    try { ({ default: cron } = await import(/* @vite-ignore */ 'node-cron')); }
    catch { console.warn('[consistencia] node-cron não instalado — agendamento desabilitado.'); return null; }
  }

  const rodar = options.runner || (() => rodaParaTodosOsTenants(supabase));

  return cron.schedule(cronExpr, () => {
    const inicio = Date.now();
    Promise.resolve(rodar())
      .then((r) => {
        console.log(`[consistencia] {"event":"consistencia.tick","tenants":${r.total},"ok":${r.ok},"comProblema":${r.comProblema},"falharam":${r.falharam}}`);
        // O heartbeat é o que diz à tela de Status que o job ESTÁ VIVO. Sem
        // ele, um job morto e um job que não achou problema ficam iguais.
        return recordHeartbeat(supabase, 'consistencia_scheduler', {
          result: r, ok: r.falharam === 0, durationMs: Date.now() - inicio,
        });
      })
      .catch((e) => console.error(`[consistencia] tick falhou: ${e?.message}`));
  });
}
