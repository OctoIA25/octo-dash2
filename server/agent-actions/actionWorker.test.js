import { describe, it, expect, vi } from 'vitest';
import { runDueActions } from './actionWorker.js';
import { createTenantRateLimiter } from '../communication/rateLimiter.js';

const NOW = 1_750_000_000_000;

/**
 * Fake do Supabase para o worker. Modela agent_action_queue (claim + finalize +
 * leitura por run) e agent_action_runs (update de fechamento).
 *
 * `queue` é mutável: o claim altera status in-place, então uma 2ª chamada de
 * runDueActions NÃO re-pega o mesmo item (prova de idempotência do worker).
 *
 * `.or()` filtra next_attempt_at: itens com valor futuro são ignorados no select,
 * tornando os testes de backoff verídicos (o mesmo item não é reclamado de novo).
 */
function makeFake({ queue = [] } = {}) {
  const runUpdates = [];

  const queueNode = () => {
    let mode = null;
    let runFilter = null;
    // O or-filter passado pelo claim: "next_attempt_at.is.null,next_attempt_at.lte.<iso>"
    // Extraímos o threshold do lte para filtrar no maybeSingle.
    let orThresholdIso = null;

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
      // Implementa o filtro de next_attempt_at do claim.
      // Formato recebido: "next_attempt_at.is.null,next_attempt_at.lte.<isoString>"
      or(expr) {
        const m = /next_attempt_at\.lte\.(.+)$/.exec(expr);
        if (m) orThresholdIso = m[1];
        return node;
      },
      order: () => node,
      limit: () => node,
      async maybeSingle() {
        // SELECT puro (sem patch): busca próximo pendente elegível.
        if (mode === 'select' && !node._patch) {
          const found = queue.find((q) => {
            if (q.status !== 'pending') return false;
            if (!orThresholdIso) return true; // sem filtro or: aceita tudo
            const nat = q.next_attempt_at;
            if (!nat) return true; // IS NULL → elegível
            return nat <= orThresholdIso; // lte threshold → elegível
          });
          return { data: found ? { ...found } : null, error: null };
        }
        // UPDATE + SELECT (chain com .update().eq().select().maybeSingle()):
        // aplica o patch e retorna o item atualizado (claim atômico simulado).
        if (node._patch && node._id) {
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
          // finalize / releaseToPending: aplica patch ao item por id (sem maybeSingle)
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
  max_attempts: 5,
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
    const { supabase, queue, runUpdates } = makeFake({
      // attempts=4, max_attempts=5: após o claim attempts=5 → dead-letter
      queue: [baseItem({ attempts: 4, max_attempts: 5 })],
    });
    const deliver = vi.fn(async () => ({ ok: false, errorMessage: 'meta down' }));
    const summary = await runDueActions(supabase, { nowMs: NOW, deliver, schedulerDeps: {}, getEnvironment: () => 'production' });
    expect(summary.failed).toBe(1);
    // item ficou failed (dead-letter na última tentativa)
    expect(queue[0].status).toBe('failed');
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

  // ─── Novos testes: backoff + max_attempts ───────────────────────────────────

  it('falha transitória agenda retry: status volta a pending, next_attempt_at futuro, attempts incrementado', async () => {
    const { supabase, queue } = makeFake({
      queue: [baseItem({ id: 'i1', attempts: 0, max_attempts: 5 })],
    });
    // deliver retorna failed (ainda há tentativas restantes → retry com backoff)
    const deliver = vi.fn(async () => ({ ok: false, status: 'failed', error: 'timeout' }));

    const summary = await runDueActions(supabase, {
      nowMs: NOW,
      deliver,
      schedulerDeps: {},
      getEnvironment: () => 'production',
      backoffBaseMs: 60_000,
      backoffMaxMs: 3_600_000,
    });

    expect(summary.retried).toBe(1);
    expect(summary.failed).toBe(0);
    // item voltou a pending
    expect(queue[0].status).toBe('pending');
    // attempts foi incrementado pelo claim (0→1) e mantido no retry
    expect(queue[0].attempts).toBe(1);
    // next_attempt_at = NOW + base * 2^(1-1) = NOW + 60_000 * 1 = NOW + 60_000
    const expectedNextAt = new Date(NOW + 60_000).toISOString();
    expect(queue[0].next_attempt_at).toBe(expectedNextAt);
  });

  it('ao atingir max_attempts vira failed (dead-letter)', async () => {
    // attempts inicial = max_attempts - 1 = 4; após o claim = 5 = max_attempts → dead-letter
    const { supabase, queue } = makeFake({
      queue: [baseItem({ id: 'i1', attempts: 4, max_attempts: 5 })],
    });
    const deliver = vi.fn(async () => ({ ok: false, status: 'failed', error: 'api error' }));

    const summary = await runDueActions(supabase, {
      nowMs: NOW,
      deliver,
      schedulerDeps: {},
      getEnvironment: () => 'production',
    });

    expect(summary.failed).toBe(1);
    expect(summary.retried).toBe(0);
    expect(queue[0].status).toBe('failed');
  });

  it('rate-limit: não excede o burst no mesmo tick', async () => {
    // 3 itens do mesmo tenant, burst=2 → no máximo 2 deliveries por tick
    const { supabase, queue } = makeFake({
      queue: [
        baseItem({ id: 'a', tenant_id: 't1' }),
        baseItem({ id: 'b', tenant_id: 't1' }),
        baseItem({ id: 'c', tenant_id: 't1' }),
      ],
    });
    const deliver = vi.fn(async () => ({ ok: true }));

    // Relógio fixo (sem avanço): nenhum refill ocorre durante o tick
    const rateLimiter = createTenantRateLimiter({ ratePerSec: 1, burst: 2, now: () => NOW });

    const summary = await runDueActions(supabase, {
      nowMs: NOW,
      deliver,
      schedulerDeps: {},
      getEnvironment: () => 'production',
      rateLimiter,
    });

    // Com burst=2, no máximo 2 deliveries devem ocorrer
    expect(deliver.mock.calls.length).toBeLessThanOrEqual(2);
    expect(summary.throttled).toBeGreaterThanOrEqual(1);
    // Itens throttled voltam a pending (não failed, não done)
    const throttledItems = queue.filter((q) => q.status === 'pending');
    expect(throttledItems.length).toBeGreaterThanOrEqual(1);
  });

  it('sucesso continua finalizando done (regressão: caminho feliz não mudou)', async () => {
    const { supabase, queue, runUpdates } = makeFake({
      queue: [baseItem({ id: 'i1', attempts: 0, max_attempts: 5 })],
    });
    const deliver = vi.fn(async () => ({ ok: true, messageId: 'msg-ok' }));

    const summary = await runDueActions(supabase, {
      nowMs: NOW,
      deliver,
      schedulerDeps: {},
      getEnvironment: () => 'production',
    });

    expect(summary.done).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.retried).toBe(0);
    expect(summary.throttled).toBe(0);
    expect(queue[0].status).toBe('done');
    const close = runUpdates.find((u) => u.id === 'run-1');
    expect(close.patch.status).toBe('done');
    expect(close.patch.sent_count).toBe(1);
  });
});
