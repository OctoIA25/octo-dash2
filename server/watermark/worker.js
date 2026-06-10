/**
 * ⚙️ Worker — consome a fila watermark_jobs e gera os derivados.
 *
 * Desenho:
 *   - claim atômico via RPC claim_watermark_jobs (FOR UPDATE SKIP LOCKED):
 *     várias instâncias do worker coexistem sem processar o mesmo job.
 *   - idempotente: se o derivado já existe no Storage, marca done sem reprocessar.
 *   - concorrência limitada (CPU-bound): processa N imagens em paralelo por tick.
 *   - retry com backoff exponencial; após max_attempts vai para 'error' (DLQ lógica).
 *
 * Pode rodar embarcado no api-server (WATERMARK_WORKER=1) ou como processo/
 * container separado importando runWorkerLoop — o caminho para escalar.
 */
import { WORKER, DEFAULT_SIZES } from './config.js';
import { createWatermarkService } from './service.js';

export function createWorker(supabase, workerId = `w-${process.pid}`) {
  const service = createWatermarkService(supabase);

  /**
   * Processa um único job delegando a TODA a lógica de variante/idempotência ao
   * service.ensureDerivative (fonte única). Isso evita a divergência que fazia o
   * worker gravar bytes LIMPOS sob a chave wm_v{ver} quando a marca está desligada
   * (envenenando o acervo ao religar). ensureDerivative escolhe clean_ vs wm_v{ver}
   * corretamente e nunca marca processed_logo_version no caminho desligado.
   */
  async function processJob(job) {
    for (const sizeName of DEFAULT_SIZES) {
      await service.ensureDerivative(job.photo_id, sizeName);
    }
  }

  async function finishJob(job, ok, err) {
    if (ok) {
      await supabase
        .from('watermark_jobs')
        .update({ status: 'done', error: null, updated_at: new Date().toISOString() })
        .eq('id', job.id);
      return;
    }

    const exhausted = job.attempts >= job.max_attempts;
    const backoff = WORKER.backoffBaseMs * Math.pow(2, job.attempts - 1);
    await supabase
      .from('watermark_jobs')
      .update({
        status: exhausted ? 'error' : 'queued',
        error: String(err?.message || err).slice(0, 1000),
        run_after: new Date(Date.now() + backoff).toISOString(),
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    if (exhausted) {
      await supabase
        .from('property_photos')
        .update({ status: 'error', error: String(err?.message || err).slice(0, 1000) })
        .eq('id', job.photo_id);
    }
  }

  /** Reserva e processa um lote. Retorna quantos jobs rodaram. */
  async function tick() {
    const { data: jobs, error } = await supabase.rpc('claim_watermark_jobs', {
      p_worker: workerId,
      p_limit: WORKER.batchSize,
    });
    if (error) throw new Error(`claim: ${error.message}`);
    if (!jobs || jobs.length === 0) return 0;

    // Concorrência limitada: processa em fatias de WORKER.concurrency.
    for (let i = 0; i < jobs.length; i += WORKER.concurrency) {
      const slice = jobs.slice(i, i + WORKER.concurrency);
      await Promise.all(
        slice.map(async (job) => {
          try {
            await processJob(job);
            await finishJob(job, true);
          } catch (e) {
            console.error(`[watermark] job ${job.id} falhou:`, e.message);
            await finishJob(job, false, e);
          }
        }),
      );
    }
    return jobs.length;
  }

  /** Loop de polling contínuo (para worker embarcado ou dedicado). */
  function runLoop() {
    let stopped = false;
    const loop = async () => {
      while (!stopped) {
        try {
          const n = await tick();
          // Sem trabalho → espera o intervalo; com trabalho → drena agressivo.
          if (n === 0) await sleep(WORKER.pollIntervalMs);
        } catch (e) {
          console.error('[watermark] tick error:', e.message);
          await sleep(WORKER.pollIntervalMs);
        }
      }
    };
    loop();
    console.log(`⚙️  [watermark] worker ${workerId} iniciado (concurrency=${WORKER.concurrency})`);
    return () => {
      stopped = true;
    };
  }

  return { tick, runLoop, processJob };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
