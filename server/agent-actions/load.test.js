/**
 * Teste de carga: prova que o enqueue é bulk (O(1) upserts) e que o worker
 * não faz N+1 em agent_action_runs durante o drain.
 *
 * NÃO testa lógica de envio real — usa deliver mockado. O foco é
 * CONTAGEM DE QUERIES contra o fake Supabase.
 *
 * Decisão de mock: getAction é usado com o real 'send_whatsapp' para
 * checkEligibility e buildPayload. Para deliverItem, passamos `deliver`
 * mockado no deps do worker — assim não precisamos mockar getAction,
 * e o teste continua exercendo o action real na fase de enqueue.
 * Garante que leads com phone='5511999990000' passam na elegibilidade
 * (normalizePhone → '5511999990000', não-vazio → recipient existe).
 */

import { describe, it, expect } from 'vitest';
import { confirmOperation } from './service.js';
import { runDueActions } from './actionWorker.js';

const TENANT = 'tenant-load';
const RUN_ID = 'run-load-001';
const NOW = 1_750_000_000_000;
const NOW_ISO = new Date(NOW).toISOString();

// ---------------------------------------------------------------------------
// Helpers de dados
// ---------------------------------------------------------------------------

/** Cria N leads com phone válido para passar no checkEligibility do send_whatsapp. */
function makeLeads(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `lead-${i}`,
    name: `Lead ${i}`,
    phone: '5511999990000',
    source: 'kenlo',
    sourceLeadId: null,
  }));
}

/** Cria o run base. eligible_count=N garante recipientCap >= N no confirm. */
function makeRun(n) {
  return {
    id: RUN_ID,
    tenant_id: TENANT,
    action_type: 'send_whatsapp',
    segment: { filter: 'all' },
    status: 'pending',
    eligible_count: n,
    excluded_count: 0,
    primary_source: null,
    requested_by_user_id: null,
    requested_by_email: null,
    requested_by_role: null,
  };
}

// ---------------------------------------------------------------------------
// Fake Supabase com contadores
// ---------------------------------------------------------------------------

/**
 * Cria um fake Supabase instrumentado com contadores de queries.
 *
 * Modela:
 *  - agent_action_runs: select (load + claim), update (claim/close)
 *  - agent_action_queue: upsert (enqueue bulk), select (drain), update (claim/finalize)
 *
 * Contadores:
 *  - insertOrUpsert: chamadas a .insert() ou .upsert() em qualquer tabela
 *  - runsSelect: chamadas a .select() resolvidas sobre agent_action_runs
 *  - queueSelectByRun: chamadas de select em agent_action_queue filtradas por run_id
 *    (usadas pelo closeFinishedRuns — devem ser O(runs), não O(itens))
 */
function makeFakeSupabase(run) {
  const counters = {
    insertOrUpsert: 0,
    runsSelect: 0,
    queueSelectByRun: 0,
  };

  // Estado mutável
  const runs = new Map([[run.id, { ...run }]]);
  const queue = [];

  // ---- Builder do nó de agent_action_runs ----
  function runsNode() {
    const node = {
      _op: null,
      _id: null,
      _tenant: null,
      _eqStatus: null,
      _patch: null,

      insert(row) {
        counters.insertOrUpsert += 1;
        runs.set(row.id, { ...row });
        return { error: null };
      },
      select() {
        if (node._op !== 'update') node._op = 'select';
        return node;
      },
      update(patch) {
        node._op = 'update';
        node._patch = patch;
        return node;
      },
      eq(col, val) {
        if (col === 'id') node._id = val;
        if (col === 'tenant_id') node._tenant = val;
        if (col === 'status') node._eqStatus = val;
        return node;
      },
      async maybeSingle() {
        const row = runs.get(node._id);

        if (node._op === 'update') {
          if (!row) return { data: null, error: null };
          if (node._eqStatus && row.status !== node._eqStatus) {
            return { data: null, error: null };
          }
          Object.assign(row, node._patch);
          return { data: { id: row.id }, error: null };
        }

        // select
        counters.runsSelect += 1;
        if (!row) return { data: null, error: null };
        if (node._tenant && row.tenant_id !== node._tenant) {
          return { data: null, error: null };
        }
        return { data: { ...row }, error: null };
      },

      // update sem .select() (ex.: closeFinishedRuns faz update().eq(id))
      then(resolve) {
        if (node._op === 'update' && node._id) {
          const row = runs.get(node._id);
          if (row) Object.assign(row, node._patch);
        }
        return resolve({ error: null });
      },
    };
    return node;
  }

  // ---- Builder do nó de agent_action_queue ----
  function queueNode() {
    let mode = null;
    let runFilter = null;
    let orThresholdIso = null;

    const node = {
      _eqStatus: null,
      _id: null,
      _patch: null,

      upsert(items) {
        counters.insertOrUpsert += 1;
        for (const item of items) {
          queue.push({
            ...item,
            id: item.idempotency_key, // usa idempotency_key como id único no fake
            attempts: 0,
            next_attempt_at: null,
          });
        }
        return { error: null };
      },
      insert(items) {
        counters.insertOrUpsert += 1;
        const rows = Array.isArray(items) ? items : [items];
        for (const item of rows) {
          queue.push({ ...item, attempts: 0, next_attempt_at: null });
        }
        return { error: null };
      },
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
      or(expr) {
        const m = /next_attempt_at\.lte\.(.+)$/.exec(expr);
        if (m) orThresholdIso = m[1];
        return node;
      },
      order: () => node,
      limit: () => node,

      async maybeSingle() {
        // SELECT sem patch → claimNextPending (busca próximo pendente)
        if (mode === 'select' && !node._patch) {
          const found = queue.find((q) => {
            if (q.status !== 'pending') return false;
            if (!orThresholdIso) return true;
            const nat = q.next_attempt_at;
            if (!nat) return true;
            return nat <= orThresholdIso;
          });
          return { data: found ? { ...found } : null, error: null };
        }

        // UPDATE + SELECT (claim atômico: update().eq(id).eq(status).select().maybeSingle())
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

      // then: usado por finalize/releaseToPending (update sem maybeSingle)
      //       e por closeFinishedRuns (select por run_id)
      then(resolve) {
        if (mode === 'update' && node._id) {
          const target = queue.find((q) => q.id === node._id);
          if (target) Object.assign(target, node._patch);
          return resolve({ data: null, error: null });
        }
        if (mode === 'select' && runFilter) {
          counters.queueSelectByRun += 1;
          const rows = queue
            .filter((q) => q.run_id === runFilter)
            .map((q) => ({ status: q.status }));
          return resolve({ data: rows, error: null });
        }
        return resolve({ data: null, error: null });
      },
    };
    return node;
  }

  const supabase = {
    from(table) {
      if (table === 'agent_action_runs') return runsNode();
      if (table === 'agent_action_queue') return queueNode();
      throw new Error(`tabela inesperada: ${table}`);
    },
  };

  return { supabase, counters, queue };
}

// ---------------------------------------------------------------------------
// Helper: drena tudo num único tick (limit alto)
// ---------------------------------------------------------------------------

async function drainAll(supabase, n) {
  return runDueActions(supabase, {
    nowMs: NOW,
    limit: n + 100, // garante que tudo seja drenado num tick
    logger: { log: () => {}, warn: () => {} },
    // deliver mockado: sempre retorna sucesso (não queremos testar envio real)
    deliver: async () => ({ ok: true, messageId: 'mock-msg-id' }),
    schedulerDeps: {},
    getEnvironment: () => 'production',
    processEnv: { NODE_ENV: 'production' },
  });
}

// ---------------------------------------------------------------------------
// Helper: roda confirm + drain e devolve contadores finais
//
// Capturamos snapshots dos contadores em três momentos:
//   beforeEnqueue → afterEnqueue → afterDrain
// Isso permite isolar o delta de cada fase e provar que:
//   (a) enqueue é bulk: delta_enqueue.insertOrUpsert == 1
//   (b) drain não faz select em runs: delta_drain.runsSelect == 0
// ---------------------------------------------------------------------------

async function runScenario(n) {
  const run = makeRun(n);
  const { supabase, counters, queue } = makeFakeSupabase(run);

  // Snapshot antes de qualquer operação
  const beforeEnqueue = { ...counters };

  // ---- Fase 1: confirm (enqueue bulk) ----
  const confirmResult = await confirmOperation(
    supabase,
    {
      previewToken: RUN_ID,
      tenantId: TENANT,
      message: 'Olá! Temos novidades para você.',
      user: { id: 'u1', email: 'admin@test.com', role: 'admin' },
    },
    {
      nowMs: NOW,
      resolve: async (_sb, _seg, _opts) => ({
        ok: true,
        rows: makeLeads(n),
      }),
    },
  );

  // Snapshot logo após o enqueue
  const afterEnqueue = { ...counters };

  // ---- Fase 2: drain (worker) ----
  const summary = await drainAll(supabase, n);

  // Snapshot após o drain
  const afterDrain = { ...counters };

  // Deltas isolados por fase
  const deltaEnqueue = {
    insertOrUpsert: afterEnqueue.insertOrUpsert - beforeEnqueue.insertOrUpsert,
    runsSelect: afterEnqueue.runsSelect - beforeEnqueue.runsSelect,
    queueSelectByRun: afterEnqueue.queueSelectByRun - beforeEnqueue.queueSelectByRun,
  };
  const deltaDrain = {
    insertOrUpsert: afterDrain.insertOrUpsert - afterEnqueue.insertOrUpsert,
    runsSelect: afterDrain.runsSelect - afterEnqueue.runsSelect,
    queueSelectByRun: afterDrain.queueSelectByRun - afterEnqueue.queueSelectByRun,
  };

  return { confirmResult, summary, afterEnqueue, afterDrain, deltaEnqueue, deltaDrain, queue };
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('Carga: enqueue bulk e drain sem N+1', () => {
  it('N=1: enqueue usa 1 upsert (bulk), drain não faz select em runs por item', async () => {
    const { confirmResult, summary, deltaEnqueue, deltaDrain } = await runScenario(1);

    expect(confirmResult.ok).toBe(true);
    expect(confirmResult.enqueued).toBe(1);
    expect(summary.done).toBe(1);

    // Fase enqueue: exatamente 1 upsert na fila (não 1 por lead)
    expect(deltaEnqueue.insertOrUpsert).toBe(1);

    // Fase drain: nenhum select em agent_action_runs (sem N+1)
    expect(deltaDrain.runsSelect).toBe(0);

    // closeFinishedRuns: 1 select em queue por run (O(runs), não O(itens))
    expect(deltaDrain.queueSelectByRun).toBe(1);
  });

  it('N=100: deltaEnqueue.insertOrUpsert = 1 (bulk), deltaDrain.runsSelect = 0', async () => {
    const { confirmResult, summary, deltaEnqueue, deltaDrain } = await runScenario(100);

    expect(confirmResult.ok).toBe(true);
    expect(confirmResult.enqueued).toBe(100);
    expect(summary.done).toBe(100);

    expect(deltaEnqueue.insertOrUpsert).toBe(1);
    expect(deltaDrain.runsSelect).toBe(0);
    expect(deltaDrain.queueSelectByRun).toBe(1);
  });

  it('N=1000: deltaEnqueue.insertOrUpsert = 1 (bulk), deltaDrain.runsSelect = 0', async () => {
    const { confirmResult, summary, deltaEnqueue, deltaDrain } = await runScenario(1000);

    expect(confirmResult.ok).toBe(true);
    expect(confirmResult.enqueued).toBe(1000);
    expect(summary.done).toBe(1000);

    expect(deltaEnqueue.insertOrUpsert).toBe(1);
    expect(deltaDrain.runsSelect).toBe(0);
    expect(deltaDrain.queueSelectByRun).toBe(1);
  });

  it('N=10000: deltaEnqueue.insertOrUpsert < 50 (bulk provado), deltaDrain.runsSelect = 0', async () => {
    const { confirmResult, summary, deltaEnqueue, deltaDrain } = await runScenario(10000);

    expect(confirmResult.ok).toBe(true);
    expect(confirmResult.enqueued).toBe(10000);
    expect(summary.done).toBe(10000);

    // Prova principal: não é 1 insert/upsert por lead (bulk real)
    expect(deltaEnqueue.insertOrUpsert).toBeLessThan(50);
    // Prova secundária: worker não faz select em runs durante o drain por item
    expect(deltaDrain.runsSelect).toBe(0);
    // closeFinishedRuns: O(runs), não O(itens) — com 1 run, deve ser ~1
    expect(deltaDrain.queueSelectByRun).toBeLessThanOrEqual(5);
  }, 30_000); // timeout estendido: processa 10k itens; sob a suíte inteira em
  //            paralelo o default de 5s estoura por contenção de CPU (não por bug).

  it('insertOrUpsert é praticamente constante: |delta(10000) - delta(1)| < 5', async () => {
    const r1 = await runScenario(1);
    const r10k = await runScenario(10000);

    const diff = Math.abs(
      r10k.deltaEnqueue.insertOrUpsert - r1.deltaEnqueue.insertOrUpsert,
    );

    // O enqueue não escala com N (prova de bulk)
    expect(diff).toBeLessThan(5);
  }, 30_000); // idem: roda 2 cenários (1 e 10k); timeout estendido sob carga.

  it('deltaDrain.runsSelect = 0 para todos os N (sem N+1 no worker)', async () => {
    for (const n of [1, 100, 1000, 10000]) {
      const { deltaDrain } = await runScenario(n);
      expect(
        deltaDrain.runsSelect,
        `N=${n}: runsSelect durante drain deve ser 0`,
      ).toBe(0);
    }
  });

  it('queueSelectByRun é O(runs), não O(itens): deltaDrain.queueSelectByRun ~1 para N=10000', async () => {
    // Com 1 run e 10000 itens, o closeFinishedRuns deve fazer 1 select em queue
    // (por run_id), não 10000 selects (por item). Isso prova que é O(runs).
    const { deltaDrain } = await runScenario(10000);
    expect(deltaDrain.queueSelectByRun).toBeLessThanOrEqual(5);
  });
});
