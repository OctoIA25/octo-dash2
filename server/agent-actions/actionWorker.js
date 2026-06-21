/**
 * ⚙️ Worker do Agente Disparador.
 *
 * Drena a fila `agent_action_queue` (preenchida na CONFIRMAÇÃO de um run) e, para
 * cada item, executa a ação via o registry — que, no caso de send_whatsapp,
 * reutiliza `deliverRecommendation` (idempotência + envio + histórico em
 * lead_recommendations). Não duplica nenhuma lógica de envio.
 *
 * Espelha o worker de recuperação:
 *  - claim atômico (pending → processing) impede que ticks sobrepostos do cron
 *    peguem o mesmo item (proteção contra envio duplicado / race condition);
 *  - finalize marca o desfecho (done | skipped | failed);
 *  - ao terminar, atualiza os contadores agregados do run (observabilidade).
 *
 * Determinístico e testável: `nowMs` e todas as dependências são injetáveis.
 */

import { getAction } from './actionRegistry.js';

const QUEUE_TABLE = 'agent_action_queue';
const RUNS_TABLE = 'agent_action_runs';

/** Claim atômico de UM item pendente (pending → processing). */
async function claimNextPending(supabase) {
  const { data: candidate, error: selErr } = await supabase
    .from(QUEUE_TABLE)
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selErr || !candidate) return null;

  const { data: claimed, error: updErr } = await supabase
    .from(QUEUE_TABLE)
    .update({ status: 'processing', attempts: (candidate.attempts || 0) + 1 })
    .eq('id', candidate.id)
    .eq('status', 'pending') // só vence quem ainda vê pending
    .select('*')
    .maybeSingle();
  if (updErr || !claimed) return null; // outro tick reivindicou primeiro
  return claimed;
}

/** Marca o desfecho final de um item. */
async function finalize(supabase, id, status, nowIso, error = null) {
  await supabase.from(QUEUE_TABLE).update({ status, error, processed_at: nowIso }).eq('id', id);
}

/**
 * Fecha os runs cujos itens já foram todos processados: atualiza contadores e
 * marca status done/failed. Best-effort — uma falha aqui não interrompe o worker.
 */
async function closeFinishedRuns(supabase, runIds, nowIso, logger) {
  for (const runId of runIds) {
    try {
      const { data: items } = await supabase
        .from(QUEUE_TABLE)
        .select('status')
        .eq('run_id', runId);
      const rows = items || [];
      const pending = rows.filter((r) => r.status === 'pending' || r.status === 'processing').length;
      if (pending > 0) continue; // ainda há itens em andamento

      const sent = rows.filter((r) => r.status === 'done').length;
      const failed = rows.filter((r) => r.status === 'failed').length;
      await supabase
        .from(RUNS_TABLE)
        .update({
          status: failed > 0 && sent === 0 ? 'failed' : 'done',
          sent_count: sent,
          failed_count: failed,
          completed_at: nowIso,
        })
        .eq('id', runId);
    } catch (err) {
      logger?.warn?.(`[agent-actions] falha ao fechar run ${runId}: ${err?.message}`);
    }
  }
}

/**
 * Processa a fila de ações.
 *
 * deps: {
 *   nowMs?, limit?, logger?,
 *   deliver,          // = deliverRecommendation
 *   schedulerDeps,    // deps internas que deliver usa (makeSchedulerDeps)
 *   getEnvironment, processEnv?
 * }
 * @returns {{ processed, done, skipped, failed, runIds }}
 */
export async function runDueActions(supabase, deps = {}) {
  const {
    nowMs = Date.now(),
    limit = 200,
    logger = console,
    deliver,
    schedulerDeps,
    getEnvironment,
    processEnv = process.env,
  } = deps;

  const nowIso = new Date(nowMs).toISOString();
  const summary = { processed: 0, done: 0, skipped: 0, failed: 0, runIds: [] };
  const touchedRuns = new Set();

  for (let i = 0; i < limit; i += 1) {
    const item = await claimNextPending(supabase);
    if (!item) break;
    summary.processed += 1;
    touchedRuns.add(item.run_id);

    const action = getAction(item.action_type);
    if (!action) {
      await finalize(supabase, item.id, 'failed', nowIso, `ação desconhecida: ${item.action_type}`);
      summary.failed += 1;
      continue;
    }

    try {
      const result = await action.deliverItem(supabase, item, {
        deliverRecommendation: deliver,
        schedulerDeps,
        getEnvironment,
        processEnv,
      });
      await finalize(supabase, item.id, result.status, nowIso, result.error || null);
      if (result.status === 'done') summary.done += 1;
      else if (result.status === 'skipped') summary.skipped += 1;
      else summary.failed += 1;
    } catch (err) {
      await finalize(supabase, item.id, 'failed', nowIso, err?.message || 'erro desconhecido');
      summary.failed += 1;
    }
  }

  summary.runIds = [...touchedRuns];
  await closeFinishedRuns(supabase, summary.runIds, nowIso, logger);

  if (summary.processed > 0) {
    logger.log?.(
      `[agent-actions] processados=${summary.processed} enviados=${summary.done} ` +
        `pulados=${summary.skipped} falhas=${summary.failed}`,
    );
  }
  return summary;
}

export const __test__ = { claimNextPending, finalize, closeFinishedRuns, QUEUE_TABLE, RUNS_TABLE };
