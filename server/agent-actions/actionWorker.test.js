import { describe, it, expect, vi } from 'vitest';
import { runDueActions } from './actionWorker.js';

const NOW = 1_750_000_000_000;

/**
 * Fake do Supabase para o worker. Modela agent_action_queue (claim + finalize +
 * leitura por run) e agent_action_runs (update de fechamento).
 *
 * `queue` é mutável: o claim altera status in-place, então uma 2ª chamada de
 * runDueActions NÃO re-pega o mesmo item (prova de idempotência do worker).
 */
function makeFake({ queue = [] } = {}) {
  const runUpdates = [];

  const queueNode = () => {
    let mode = null;
    let runFilter = null;
    const node = {
      _eqStatus: null,
      select() {
        mode = 'select';
        return node;
      },
      update(patch) {
        mode = 'update';
        node._patch = patch;
        return node;
      },
      eq(col, val) {
        if (col === 'status') node._eqStatus = val;
        if (col === 'id') node._id = val;
        if (col === 'run_id') runFilter = val;
        return node;
      },
      order: () => node,
      limit: () => node,
      async maybeSingle() {
        if (mode === 'select') {
          // próximo pendente
          const found = queue.find((q) => q.status === 'pending');
          return { data: found ? { ...found } : null, error: null };
        }
        if (mode === 'update') {
          // claim: pending → processing (só vence se ainda pending)
          const target = queue.find((q) => q.id === node._id);
          if (!target) return { data: null, error: null };
          if (node._eqStatus === 'pending' && target.status !== 'pending') {
            return { data: null, error: null };
          }
          Object.assign(target, node._patch);
          return { data: { ...target }, error: null };
        }
        return { data: null, error: null };
      },
      // leitura por run (closeFinishedRuns): retorna status de todos do run
      then(resolve) {
        if (mode === 'update' && node._id) {
          // finalize: aplica patch ao item por id (sem maybeSingle)
          const target = queue.find((q) => q.id === node._id);
          if (target) Object.assign(target, node._patch);
          return resolve({ data: null, error: null });
        }
        if (mode === 'select' && runFilter) {
          const rows = queue.filter((q) => q.run_id === runFilter).map((q) => ({ status: q.status }));
          return resolve({ data: rows, error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return node;
  };

  const runsNode = () => {
    const node = {
      update(patch) {
        node._patch = patch;
        return node;
      },
      eq(_c, v) {
        runUpdates.push({ id: v, patch: node._patch });
        return node;
      },
    };
    return node;
  };

  const from = (table) => {
    if (table === 'agent_action_queue') return queueNode();
    if (table === 'agent_action_runs') return runsNode();
    throw new Error(`tabela inesperada: ${table}`);
  };

  return { supabase: { from }, queue, runUpdates };
}

const baseItem = (over) => ({
  id: 'i1',
  run_id: 'run-1',
  tenant_id: 't1',
  action_type: 'send_whatsapp',
  lead_id: 'l1',
  lead_name: 'João',
  lead_source: 'crm',
  lead_phone: '5511999990000',
  payload: { templateParams: ['oi'] },
  status: 'pending',
  attempts: 0,
  created_at: '2025-01-01T00:00:00Z',
  ...over,
});

describe('actionWorker.runDueActions', () => {
  it('drena itens pendentes e marca done; fecha o run com contadores', async () => {
    const { supabase, queue, runUpdates } = makeFake({
      queue: [baseItem({ id: 'i1' }), baseItem({ id: 'i2', lead_id: 'l2' })],
    });
    const deliver = vi.fn(async () => ({ ok: true, messageId: 'wamid' }));

    const summary = await runDueActions(supabase, {
      nowMs: NOW,
      deliver,
      schedulerDeps: {},
      getEnvironment: () => 'production',
    });

    expect(summary.processed).toBe(2);
    expect(summary.done).toBe(2);
    expect(queue.every((q) => q.status === 'done')).toBe(true);
    // run fechado como done com sent_count=2
    const close = runUpdates.find((u) => u.id === 'run-1');
    expect(close.patch.status).toBe('done');
    expect(close.patch.sent_count).toBe(2);
    expect(close.patch.failed_count).toBe(0);
  });

  it('não reprocessa itens já drenados (idempotência: 2ª execução não reenvia)', async () => {
    const { supabase, queue } = makeFake({ queue: [baseItem({ id: 'i1' })] });
    const deliver = vi.fn(async () => ({ ok: true, messageId: 'wamid' }));

    await runDueActions(supabase, { nowMs: NOW, deliver, schedulerDeps: {}, getEnvironment: () => 'production' });
    expect(deliver).toHaveBeenCalledTimes(1);

    // segunda passada: nada pendente
    const s2 = await runDueActions(supabase, { nowMs: NOW, deliver, schedulerDeps: {}, getEnvironment: () => 'production' });
    expect(s2.processed).toBe(0);
    expect(deliver).toHaveBeenCalledTimes(1); // não reenviou
    expect(queue[0].status).toBe('done');
  });

  it('lead sem telefone → skipped, sem enviar', async () => {
    const { supabase, queue } = makeFake({ queue: [baseItem({ lead_phone: '' })] });
    const deliver = vi.fn();
    const summary = await runDueActions(supabase, { nowMs: NOW, deliver, schedulerDeps: {}, getEnvironment: () => 'production' });
    expect(summary.skipped).toBe(1);
    expect(deliver).not.toHaveBeenCalled();
    expect(queue[0].status).toBe('skipped');
  });

  it('falha de envio → failed; run fechado como failed quando nada foi enviado', async () => {
    const { supabase, runUpdates } = makeFake({ queue: [baseItem()] });
    const deliver = vi.fn(async () => ({ ok: false, errorMessage: 'meta down' }));
    const summary = await runDueActions(supabase, { nowMs: NOW, deliver, schedulerDeps: {}, getEnvironment: () => 'production' });
    expect(summary.failed).toBe(1);
    const close = runUpdates.find((u) => u.id === 'run-1');
    expect(close.patch.status).toBe('failed');
  });

  it('ação desconhecida → failed sem quebrar o worker', async () => {
    const { supabase } = makeFake({ queue: [baseItem({ action_type: 'inexistente' })] });
    const deliver = vi.fn();
    const summary = await runDueActions(supabase, { nowMs: NOW, deliver, schedulerDeps: {}, getEnvironment: () => 'production' });
    expect(summary.failed).toBe(1);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('respeita o limit por execução', async () => {
    const { supabase } = makeFake({
      queue: [baseItem({ id: 'a' }), baseItem({ id: 'b' }), baseItem({ id: 'c' })],
    });
    const deliver = vi.fn(async () => ({ ok: true }));
    const summary = await runDueActions(supabase, {
      nowMs: NOW,
      limit: 2,
      deliver,
      schedulerDeps: {},
      getEnvironment: () => 'production',
    });
    expect(summary.processed).toBe(2);
  });
});
