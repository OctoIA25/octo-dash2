/**
 * Lê o ranking da planilha de hora em hora. Mesmo molde do espelho do REPORT:
 * flag-gated pelo chamador (RANKING_PLANILHA_SCHEDULER=1), só cron, sem rota
 * HTTP. Falhou? Grava o heartbeat e espera o próximo tick — a tela continua
 * com a última leitura boa.
 *
 * O horário padrão (:37) é deslocado do espelho (:17) para as duas chamadas ao
 * Google não caírem no mesmo minuto.
 */
import { makeRankingPlanilhaRunner } from './index.js';
import { recordHeartbeat } from '../observability/heartbeat.js';

export async function startRankingPlanilhaScheduler(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const cronExpr = processEnv.RANKING_PLANILHA_CRON || '37 * * * *';
  let cron = options.cronImpl;
  if (!cron) {
    try { ({ default: cron } = await import(/* @vite-ignore */ 'node-cron')); }
    catch { console.warn('[rankingPlanilha] node-cron não instalado — agendamento desabilitado.'); return null; }
  }
  const runner = options.runner || makeRankingPlanilhaRunner(supabase, processEnv);
  return cron.schedule(cronExpr, async () => {
    const startedAt = Date.now();
    try {
      const r = await runner();
      console.log(`[rankingPlanilha] {"event":"ranking_planilha.tick","linhas":${r?.linhas ?? 0},"nao_reconhecidos":${r?.naoReconhecidos?.length ?? 0}}`);
      await recordHeartbeat(supabase, 'ranking_planilha', {
        ok: true,
        durationMs: Date.now() - startedAt,
        result: {
          corretores: r?.corretores ?? 0,
          linhas: r?.linhas ?? 0,
          // Nome que não casou fica registrado: é o que alguém precisa arrumar.
          nao_reconhecidos: r?.naoReconhecidos ?? [],
          avisos: r?.avisos ?? [],
        },
      });
    } catch (e) {
      console.error(`[rankingPlanilha] tick falhou: ${e?.message}`);
      await recordHeartbeat(supabase, 'ranking_planilha', {
        ok: false, error: e?.message, durationMs: Date.now() - startedAt,
      }).catch(() => {});
    }
  });
}
