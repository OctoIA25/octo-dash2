/**
 * Cron do processor, via node-cron com import lazy (mesmo padrão do C2S).
 * Flag-gated pelo chamador (META_LEADGEN_PROCESSOR=1) para rodar em UM processo
 * só — dois processos varrendo a mesma fila processariam o mesmo evento duas
 * vezes e criariam lead duplicado (o UNIQUE protege o INSERT do webhook, não a
 * leitura do pending).
 *
 * A guarda `emVoo` impede que um tick novo entre enquanto o anterior ainda
 * roda: lote de 25 leads com Graph lento pode passar de um minuto.
 */
import { loadMetaEnv } from './metaConfig.js';
import { createMetaLeadgenProcessor } from './processor.js';
import { recordHeartbeat } from '../observability/heartbeat.js';

export async function startMetaLeadgenScheduler(supabase, options = {}) {
  const processEnv = options.processEnv || process.env;
  const cfg = loadMetaEnv(processEnv);
  let cron = options.cronImpl;
  if (!cron) {
    try { ({ default: cron } = await import(/* @vite-ignore */ 'node-cron')); }
    catch { console.warn('[meta-leadgen] node-cron não instalado — processor desabilitado.'); return null; }
  }
  const processor = options.processor || createMetaLeadgenProcessor({ supabase, processEnv, logger: console });

  let emVoo = false;
  return cron.schedule(cfg.cron, async () => {
    if (emVoo) return;
    emVoo = true;
    // Heartbeat passivo (P1 observabilidade), como C2S/Kenlo/eNPS/Anthropic:
    // sem ele, META_LEADGEN_PROCESSOR esquecido no deploy é silêncio total — a
    // fila enche e nada acusa. recordHeartbeat nunca lança.
    const t0 = Date.now();
    try {
      const result = await processor.processPending();
      await recordHeartbeat(supabase, 'meta_leadgen', { result, ok: true, durationMs: Date.now() - t0 });
    } catch (e) {
      console.error(`[meta-leadgen] tick do processor falhou: ${e?.message}`);
      await recordHeartbeat(supabase, 'meta_leadgen', { ok: false, durationMs: Date.now() - t0 });
    } finally {
      emVoo = false;
    }
  });
}
