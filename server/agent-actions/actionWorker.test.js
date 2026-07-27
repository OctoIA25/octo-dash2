import { describe, it, expect, vi } from 'vitest';
import { runDueActions, __test__ } from './actionWorker.js';
import { createTenantRateLimiter } from '../communication/rateLimiter.js';

const NOW = 1_750_000_000_000;

/**
 * Fake do Supabase para o worker. Modela agent_action_queue (batch select +
 * claim + finalize + leitura por run), agent_action_runs (select p/ throttle e
 * update de fechamento), communication_campaigns (n_per_min) e
 * agent_telemetry_events (captura dos eventos emitidos no fechamento).
 *
 * `queue` é mutável: o claim altera status in-place, então uma 2ª chamada de
 * runDueActions NÃO re-pega o mesmo item (prova de idempotência do worker).
 *
 * `.or()` filtra next_attempt_at: itens com valor futuro são ignorados no
 * batch select E no claim, tornando os testes de backoff verídicos (o mesmo
 * item não é reclamado de novo).
 */
function makeFake({ queue = [], runs = [], campaigns = [] } = {}) {
  const runUpdates = [];
  const telemetryInserts = [];

  const queueNode = () => {
    let mode = null;
    let runFilter = null;
    // O or-filter do batch select/claim: "next_attempt_at.is.null,next_attempt_at.lte.<iso>"
    let orThresholdIso = null;

    const isEligible = (q) => {
      if (q.status !== 'pending') return false;
      if (!orThresholdIso) return true; // sem filtro or: aceita tudo
      const nat = q.next_attempt_at;
      if (!nat) return true; // IS NULL → elegível
      return nat <= orThresholdIso; // lte threshold → elegível
    };

    const node = {
      _eqStatus: null,
      select() {
        mode = mode === 'update' ? mode : 'select';
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
      or(expr) {
        const m = /next_attempt_at\.lte\.(.+)$/.exec(expr);
        if (m) orThresholdIso = m[1];
        return node;
      },
      order: () => node,
      limit(n) {
        node._limit = n;
        return node;
      },
      async maybeSingle() {
        // UPDATE + SELECT (claim atômico: update().eq(id).eq(status).or().select().maybeSingle()):
        // aplica o patch e retorna o item atualizado, respeitando a elegibilidade.
        if (node._patch && node._id) {
          const target = queue.find((q) => q.id === node._id);
          if (!target) return { data: null, error: null };
          if (node._eqStatus === 'pending' && target.status !== 'pending') {
            return { data: null, error: null };
          }
          if (!isEligible(target)) return { data: null, error: null };
          Object.assign(target, node._patch);
          return { data: { ...target }, error: null };
        }
        return { data: null, error: null };
      },
      then(resolve) {
        // finalize / releaseToPending: update por id (sem maybeSingle)
        if (mode === 'update' && node._id) {
          const target = queue.find((q) => q.id === node._id);
          if (target) Object.assign(target, node._patch);
          return resolve({ data: null, error: null });
        }
        // closeFinishedRuns: select por run_id (status + tenant p/ telemetria)
        if (mode === 'select' && runFilter) {
          const rows = queue
            .filter((q) => q.run_id === runFilter)
            .map((q) => ({ status: q.status, tenant_id: q.tenant_id }));
          return resolve({ data: rows, error: null });
        }
        // batch select do tick: pendentes elegíveis, em ordem de created_at
        if (mode === 'select') {
          const rows = queue
            .filter(isEligible)
            .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
            .slice(0, node._limit || Infinity)
            .map((q) => ({ ...q }));
          return resolve({ data: rows, error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return node;
  };

  const runsNode = () => {
    const node = {
      _mode: null,
      _inIds: null,
      select() {
        node._mode = node._mode === 'update' ? node._mode : 'select';
        return node;
      },
      update(patch) {
        node._mode = 'update';
        node._patch = patch;
        return node;
      },
      eq(_c, v) {
        if (node._mode === 'update') runUpdates.push({ id: v, patch: node._patch });
        return node;
      },
      in(_c, ids) {
        node._inIds = ids;
        return node;
      },
      then(resolve) {
        // loadCampaignThrottles: select id/campaign_id por lista de runs
        if (node._mode === 'select') {
          const rows = runs
            .filter((r) => !node._inIds || node._inIds.includes(r.id))
            .map((r) => ({ id: r.id, campaign_id: r.campaign_id ?? null }));
          return resolve({ data: rows, error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return node;
  };

  const campaignsNode = () => {
    const node = {
      _inIds: null,
      select: () => node,
      in(_c, ids) {
        node._inIds = ids;
        return node;
      },
      then(resolve) {
        const rows = campaigns
          .filter((c) => !node._inIds || node._inIds.includes(c.id))
          .map((c) => ({ id: c.id, n_per_min: c.n_per_min ?? null }));
        return resolve({ data: rows, error: null });
      },
    };
    return node;
  };

  const from = (table) => {
    if (table === 'agent_action_queue') return queueNode();
    if (table === 'agent_action_runs') return runsNode();
    if (table === 'communication_campaigns') return campaignsNode();
    // Telemetria (execution do fechamento de run): grava e segue.
    if (table === 'agent_telemetry_events') {
      return {
        insert(row) {
          telemetryInserts.push(row);
          return { error: null };
        },
      };
    }
    throw new Error(`tabela inesperada: ${table}`);
  };

  return { supabase: { from }, queue, runUpdates, telemetryInserts };
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

/** Deps mínimas de um tick (sem limiters — ilimitado, como o legado). */
const baseDeps = (over = {}) => ({
  nowMs: NOW,
  schedulerDeps: {},
  getEnvironment: () => 'production',
  logger: { log: () => {}, warn: () => {} },
  ...over,
});

describe('actionWorker.runDueActions', () => {
  it('drena itens pendentes e marca done; fecha o run com contadores', async () => {
    const { supabase, queue, runUpdates } = makeFake({
      queue: [baseItem({ id: 'i1' }), baseItem({ id: 'i2', lead_id: 'l2' })],
    });
    const deliver = vi.fn(async () => ({ ok: true, messageId: 'wamid' }));

    const summary = await runDueActions(supabase, baseDeps({ deliver }));

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

    await runDueActions(supabase, baseDeps({ deliver }));
    expect(deliver).toHaveBeenCalledTimes(1);

    // segunda passada: nada pendente
    const s2 = await runDueActions(supabase, baseDeps({ deliver }));
    expect(s2.processed).toBe(0);
    expect(deliver).toHaveBeenCalledTimes(1); // não reenviou
    expect(queue[0].status).toBe('done');
  });

  it('lead sem telefone → skipped, sem enviar', async () => {
    const { supabase, queue } = makeFake({ queue: [baseItem({ lead_phone: '' })] });
    const deliver = vi.fn();
    const summary = await runDueActions(supabase, baseDeps({ deliver }));
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
    const summary = await runDueActions(supabase, baseDeps({ deliver }));
    expect(summary.failed).toBe(1);
    // item ficou failed (dead-letter na última tentativa)
    expect(queue[0].status).toBe('failed');
    const close = runUpdates.find((u) => u.id === 'run-1');
    expect(close.patch.status).toBe('failed');
  });

  it('ação desconhecida → failed sem quebrar o worker', async () => {
    const { supabase } = makeFake({ queue: [baseItem({ action_type: 'inexistente' })] });
    const deliver = vi.fn();
    const summary = await runDueActions(supabase, baseDeps({ deliver }));
    expect(summary.failed).toBe(1);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('respeita o limit por execução', async () => {
    const { supabase } = makeFake({
      queue: [baseItem({ id: 'a' }), baseItem({ id: 'b' }), baseItem({ id: 'c' })],
    });
    const deliver = vi.fn(async () => ({ ok: true }));
    const summary = await runDueActions(supabase, baseDeps({ deliver, limit: 2 }));
    expect(summary.processed).toBe(2);
  });

  // ─── Backoff + max_attempts ─────────────────────────────────────────────────

  it('falha transitória agenda retry: status volta a pending, next_attempt_at futuro, attempts incrementado', async () => {
    const { supabase, queue } = makeFake({
      queue: [baseItem({ id: 'i1', attempts: 0, max_attempts: 5 })],
    });
    // deliver retorna failed (ainda há tentativas restantes → retry com backoff)
    const deliver = vi.fn(async () => ({ ok: false, status: 'failed', error: 'timeout' }));

    const summary = await runDueActions(supabase, baseDeps({
      deliver,
      backoffBaseMs: 60_000,
      backoffMaxMs: 3_600_000,
    }));

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

  it('item em backoff (next_attempt_at futuro) não entra no lote do tick', async () => {
    const future = new Date(NOW + 60_000).toISOString();
    const { supabase } = makeFake({
      queue: [baseItem({ id: 'i1', next_attempt_at: future })],
    });
    const deliver = vi.fn(async () => ({ ok: true }));
    const summary = await runDueActions(supabase, baseDeps({ deliver }));
    expect(summary.processed).toBe(0);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('ao atingir max_attempts vira failed (dead-letter)', async () => {
    // attempts inicial = max_attempts - 1 = 4; após o claim = 5 = max_attempts → dead-letter
    const { supabase, queue } = makeFake({
      queue: [baseItem({ id: 'i1', attempts: 4, max_attempts: 5 })],
    });
    const deliver = vi.fn(async () => ({ ok: false, status: 'failed', error: 'api error' }));

    const summary = await runDueActions(supabase, baseDeps({ deliver }));

    expect(summary.failed).toBe(1);
    expect(summary.retried).toBe(0);
    expect(queue[0].status).toBe('failed');
  });

  // ─── Rate limit por tenant ──────────────────────────────────────────────────

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

    const summary = await runDueActions(supabase, baseDeps({ deliver, rateLimiter }));

    // Com burst=2, no máximo 2 deliveries devem ocorrer
    expect(deliver.mock.calls.length).toBeLessThanOrEqual(2);
    expect(summary.throttled).toBeGreaterThanOrEqual(1);
    // Itens throttled ficam pending (não failed, não done)
    const throttledItems = queue.filter((q) => q.status === 'pending');
    expect(throttledItems.length).toBeGreaterThanOrEqual(1);
  });

  it('rate limiter herdado de schedulerDeps quando não passado direto', async () => {
    const { supabase } = makeFake({
      queue: [baseItem({ id: 'a' }), baseItem({ id: 'b' })],
    });
    const deliver = vi.fn(async () => ({ ok: true }));
    const rateLimiter = createTenantRateLimiter({ ratePerSec: 1, burst: 1, now: () => NOW });

    const summary = await runDueActions(supabase, baseDeps({
      deliver,
      schedulerDeps: { rateLimiter },
    }));

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(summary.throttled).toBe(1);
  });

  // ─── Ordem + pool de lanes por tenant ───────────────────────────────────────

  it('preserva a ordem de created_at dentro de cada tenant, com lanes em paralelo', async () => {
    const t = (n) => `2025-01-01T00:00:0${n}Z`;
    const { supabase, queue } = makeFake({
      queue: [
        baseItem({ id: 'a1', tenant_id: 't1', lead_id: 'a1', created_at: t(1) }),
        baseItem({ id: 'b1', tenant_id: 't2', run_id: 'run-2', lead_id: 'b1', created_at: t(2) }),
        baseItem({ id: 'a2', tenant_id: 't1', lead_id: 'a2', created_at: t(3) }),
        baseItem({ id: 'b2', tenant_id: 't2', run_id: 'run-2', lead_id: 'b2', created_at: t(4) }),
        baseItem({ id: 'a3', tenant_id: 't1', lead_id: 'a3', created_at: t(5) }),
      ],
    });

    let inFlight = 0;
    let maxInFlight = 0;
    const order = [];
    const deliver = vi.fn(async (_sb, params) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push({ tenant: params.tenantId, lead: params.lead.id });
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
      return { ok: true, messageId: 'x' };
    });

    const summary = await runDueActions(supabase, baseDeps({ deliver, tenantConcurrency: 2 }));

    expect(summary.done).toBe(5);
    expect(queue.every((q) => q.status === 'done')).toBe(true);
    // Ordem por tenant preservada (lane serial)
    expect(order.filter((o) => o.tenant === 't1').map((o) => o.lead)).toEqual(['a1', 'a2', 'a3']);
    expect(order.filter((o) => o.tenant === 't2').map((o) => o.lead)).toEqual(['b1', 'b2']);
    // O pool realmente rodou 2 lanes ao mesmo tempo
    expect(maxInFlight).toBe(2);
  });

  it('tenantConcurrency=1 mantém o processamento totalmente serial', async () => {
    const { supabase } = makeFake({
      queue: [
        baseItem({ id: 'a1', tenant_id: 't1' }),
        baseItem({ id: 'b1', tenant_id: 't2', run_id: 'run-2' }),
      ],
    });
    let inFlight = 0;
    let maxInFlight = 0;
    const deliver = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
      return { ok: true };
    });

    const summary = await runDueActions(supabase, baseDeps({ deliver, tenantConcurrency: 1 }));
    expect(summary.done).toBe(2);
    expect(maxInFlight).toBe(1);
  });

  // ─── Throttle por campanha (n_per_min do banco) ─────────────────────────────

  it('honra n_per_min da campanha: burst inicial limitado e refill com o tempo', async () => {
    const mk = () =>
      makeFake({
        queue: [
          baseItem({ id: 'c1', lead_id: 'c1', created_at: '2025-01-01T00:00:01Z' }),
          baseItem({ id: 'c2', lead_id: 'c2', created_at: '2025-01-01T00:00:02Z' }),
          baseItem({ id: 'c3', lead_id: 'c3', created_at: '2025-01-01T00:00:03Z' }),
        ],
        runs: [{ id: 'run-1', campaign_id: 'camp-1' }],
        campaigns: [{ id: 'camp-1', n_per_min: 60 }], // 1/s, burst 1
      });

    const { supabase, queue } = mk();
    const order = [];
    const deliver = vi.fn(async (_sb, params) => {
      order.push(params.lead.id);
      return { ok: true };
    });
    const campaignLimiters = new Map(); // persistente entre os dois ticks

    // Tick 1 (relógio parado): só o burst inicial (1 token) passa.
    let clock = NOW;
    const s1 = await runDueActions(supabase, baseDeps({
      deliver,
      campaignLimiters,
      rateNow: () => clock,
    }));
    expect(s1.done).toBe(1);
    expect(s1.throttled).toBe(2);
    expect(order).toEqual(['c1']); // o primeiro da fila, não outro
    expect(queue.filter((q) => q.status === 'pending').length).toBe(2);

    // Tick 2, 1s depois: refill de 1 token → sai exatamente o próximo (FIFO).
    clock = NOW + 1_000;
    const s2 = await runDueActions(supabase, baseDeps({
      deliver,
      campaignLimiters,
      rateNow: () => clock,
    }));
    expect(s2.done).toBe(1);
    expect(order).toEqual(['c1', 'c2']);
  });

  it('campanha sem token não bloqueia itens de outros runs do mesmo tenant', async () => {
    const { supabase, queue } = makeFake({
      queue: [
        baseItem({ id: 'c1', lead_id: 'c1', created_at: '2025-01-01T00:00:01Z' }),
        baseItem({ id: 'c2', lead_id: 'c2', created_at: '2025-01-01T00:00:02Z' }),
        baseItem({ id: 'x1', lead_id: 'x1', run_id: 'run-livre', created_at: '2025-01-01T00:00:03Z' }),
      ],
      runs: [
        { id: 'run-1', campaign_id: 'camp-1' },
        { id: 'run-livre', campaign_id: null }, // disparo manual, sem throttle
      ],
      campaigns: [{ id: 'camp-1', n_per_min: 60 }], // burst 1
    });
    const order = [];
    const deliver = vi.fn(async (_sb, params) => {
      order.push(params.lead.id);
      return { ok: true };
    });

    const summary = await runDueActions(supabase, baseDeps({
      deliver,
      campaignLimiters: new Map(),
      rateNow: () => NOW, // relógio parado: sem refill no tick
    }));

    expect(order).toEqual(['c1', 'x1']); // c2 barrado; item livre segue
    expect(summary.throttled).toBe(1);
    expect(queue.find((q) => q.id === 'c2').status).toBe('pending');
  });

  it('sucesso continua finalizando done (regressão: caminho feliz não mudou)', async () => {
    const { supabase, queue, runUpdates } = makeFake({
      queue: [baseItem({ id: 'i1', attempts: 0, max_attempts: 5 })],
    });
    const deliver = vi.fn(async () => ({ ok: true, messageId: 'msg-ok' }));

    const summary = await runDueActions(supabase, baseDeps({ deliver }));

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

describe('closeFinishedRuns — telemetria de fechamento (1 evento execution por run)', () => {
  const { closeFinishedRuns } = __test__;
  const NOW_ISO = '2026-07-25T00:00:00.000Z';
  // Deixa o insert fire-and-forget do emitAgentEvent assentar (1 tick basta).
  const flush = () => new Promise((res) => setTimeout(res, 0));

  it('run concluído emite execution ok com contagens e tenant dos itens', async () => {
    const queue = [
      { id: 'i1', run_id: 'r1', status: 'done', tenant_id: 't1' },
      { id: 'i2', run_id: 'r1', status: 'failed', tenant_id: 't1' },
    ];
    const { supabase, runUpdates, telemetryInserts } = makeFake({ queue });

    await closeFinishedRuns(supabase, ['r1'], NOW_ISO, console);

    // fechamento do run preservado (comportamento pré-existente)
    expect(runUpdates).toContainEqual({
      id: 'r1',
      patch: expect.objectContaining({ status: 'done', sent_count: 1, failed_count: 1 }),
    });
    await flush();
    expect(telemetryInserts).toHaveLength(1);
    expect(telemetryInserts[0]).toMatchObject({
      tenant_id: 't1',
      agent_slug: 'disparador',
      event_type: 'execution',
      status: 'ok',
      execution_id: 'r1',
      occurred_at: NOW_ISO,
    });
    // contadores/funil NÃO são duplicados no evento — vivem no run
    expect(telemetryInserts[0].metadata).toEqual({});
  });

  it('run 100% falho emite execution error', async () => {
    const queue = [{ id: 'i1', run_id: 'r1', status: 'failed', tenant_id: 't1' }];
    const { supabase, telemetryInserts } = makeFake({ queue });

    await closeFinishedRuns(supabase, ['r1'], NOW_ISO, console);
    await flush();

    expect(telemetryInserts[0]).toMatchObject({ status: 'error', execution_id: 'r1' });
  });

  it('run sem itens fecha (comportamento pré-existente) mas não emite evento', async () => {
    const { supabase, runUpdates, telemetryInserts } = makeFake({ queue: [] });

    await closeFinishedRuns(supabase, ['r-vazio'], NOW_ISO, console);
    await flush();

    expect(runUpdates.find((u) => u.id === 'r-vazio')).toBeTruthy();
    expect(telemetryInserts).toHaveLength(0);
  });

  it('run com item pendente não fecha nem emite', async () => {
    const queue = [
      { id: 'i1', run_id: 'r1', status: 'done', tenant_id: 't1' },
      { id: 'i2', run_id: 'r1', status: 'pending', tenant_id: 't1' },
    ];
    const { supabase, runUpdates, telemetryInserts } = makeFake({ queue });

    await closeFinishedRuns(supabase, ['r1'], NOW_ISO, console);
    await flush();

    expect(runUpdates).toHaveLength(0);
    expect(telemetryInserts).toHaveLength(0);
  });
});
