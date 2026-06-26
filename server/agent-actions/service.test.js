import { describe, it, expect, vi } from 'vitest';
import { previewOperation, confirmOperation } from './service.js';

const NOW = 1_750_000_000_000;
const TENANT = 't1';

/**
 * Fake do Supabase para o service. Modela:
 *  - agent_action_runs: insert, lookup por id+tenant, update (claim/finalize)
 *  - agent_action_queue: upsert (captura os itens enfileirados)
 *  - audiences: select por id+tenant_id → maybeSingle
 * `runs` é um Map mutável (id → row) para simular o claim atômico.
 */
function makeFakeSupabaseForAudience(segment) {
  const runs = new Map();
  const queueUpserts = [];

  const from = (table) => {
    if (table === 'audiences') {
      const node = {
        _id: null,
        _tenant: null,
        select() { return node; },
        eq(col, val) {
          if (col === 'id') node._id = val;
          if (col === 'tenant_id') node._tenant = val;
          return node;
        },
        async maybeSingle() {
          return { data: { segment }, error: null };
        },
      };
      return node;
    }
    if (table === 'agent_action_runs') {
      const node = {
        _op: null,
        _id: null,
        _tenant: null,
        _eqStatus: null,
        _patch: null,
        insert(row) {
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
            if (node._eqStatus && row.status !== node._eqStatus) return { data: null, error: null };
            Object.assign(row, node._patch);
            return { data: { id: row.id }, error: null };
          }
          if (!row) return { data: null, error: null };
          if (node._tenant && row.tenant_id !== node._tenant) return { data: null, error: null };
          return { data: row, error: null };
        },
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
    if (table === 'agent_action_queue') {
      return {
        upsert(items) {
          queueUpserts.push(...items);
          return { error: null };
        },
      };
    }
    throw new Error(`tabela inesperada: ${table}`);
  };

  return { from };
}

function makeFake({ runs = new Map() } = {}) {
  const queueUpserts = [];

  const from = (table) => {
    if (table === 'agent_action_runs') {
      // _op vira 'update' assim que update() é chamado e NÃO é sobrescrito por
      // select() (a claim faz update().eq().eq().select().maybeSingle()).
      const node = {
        _op: null,
        _id: null,
        _tenant: null,
        _eqStatus: null,
        _patch: null,
        insert(row) {
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
            if (node._eqStatus && row.status !== node._eqStatus) return { data: null, error: null };
            Object.assign(row, node._patch);
            return { data: { id: row.id }, error: null };
          }
          // select: respeita o tenant-scope (.eq('tenant_id', ...))
          if (!row) return { data: null, error: null };
          if (node._tenant && row.tenant_id !== node._tenant) return { data: null, error: null };
          return { data: row, error: null };
        },
        // update().eq().eq() sem select (finalize) — torna o node thenable
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
    if (table === 'agent_action_queue') {
      return {
        upsert(items) {
          queueUpserts.push(...items);
          return { error: null };
        },
      };
    }
    throw new Error(`tabela inesperada: ${table}`);
  };

  return { supabase: { from }, runs, queueUpserts };
}

/** interpret fake: devolve a operação pronta. */
const fakeInterpret = (operation, ok = true) =>
  vi.fn(async () => (ok ? { ok: true, operation } : { ok: false, error: 'unsupported_intent', clarification: '?' }));

/** resolve fake: devolve rows fixas. */
const fakeResolve = (rows) => vi.fn(async () => ({ ok: true, rows }));

const adminUser = { id: 'u-admin', email: 'a@x.com', role: 'admin' };

describe('previewOperation', () => {
  it('cliente único: 1 encontrado, 1 elegível', async () => {
    const { supabase, runs } = makeFake();
    const r = await previewOperation(
      supabase,
      { command: 'mensagem para João Silva', tenantId: TENANT, user: adminUser },
      {
        nowMs: NOW,
        interpret: fakeInterpret({
          action: 'send_whatsapp',
          segment: { type: 'explicit_list', names: ['João Silva'] },
          params: { message: 'Oi!' },
          needsMessage: false,
        }),
        resolve: fakeResolve([{ id: '1', name: 'João Silva', phone: '5511999990000' }]),
      },
    );
    expect(r.ok).toBe(true);
    expect(r.preview.foundCount).toBe(1);
    expect(r.preview.eligibleCount).toBe(1);
    expect(r.preview.noWhatsappCount).toBe(0);
    expect(r.preview.sampleNames).toEqual(['João Silva']);
    // persistiu o run pending
    const run = runs.get(r.previewToken);
    expect(run.status).toBe('pending');
    expect(run.tenant_id).toBe(TENANT);
  });

  it('múltiplos clientes + 1 sem WhatsApp é contado e excluído', async () => {
    const { supabase } = makeFake();
    const r = await previewOperation(
      supabase,
      { command: 'arquivados', tenantId: TENANT, user: adminUser },
      {
        nowMs: NOW,
        interpret: fakeInterpret({
          action: 'send_whatsapp',
          segment: { type: 'archived' },
          params: { message: 'Oi' },
          needsMessage: false,
        }),
        resolve: fakeResolve([
          { id: '1', name: 'A', phone: '5511000000001' },
          { id: '2', name: 'B', phone: '' }, // sem WhatsApp
          { id: '3', name: 'C', phone: '5511000000003' },
        ]),
      },
    );
    expect(r.preview.foundCount).toBe(3);
    expect(r.preview.eligibleCount).toBe(2);
    expect(r.preview.noWhatsappCount).toBe(1);
  });

  it('dedup interno: mesmo lead repetido conta uma vez', async () => {
    const { supabase } = makeFake();
    const r = await previewOperation(
      supabase,
      { command: 'x', tenantId: TENANT, user: adminUser },
      {
        nowMs: NOW,
        interpret: fakeInterpret({
          action: 'send_whatsapp',
          segment: { type: 'archived' },
          params: { message: 'Oi' },
          needsMessage: false,
        }),
        resolve: fakeResolve([
          { id: '1', name: 'A', phone: '5511000000001' },
          { id: '1', name: 'A', phone: '5511000000001' },
        ]),
      },
    );
    expect(r.preview.eligibleCount).toBe(1);
  });

  it('limite de envio: excedente é excluído', async () => {
    const { supabase } = makeFake();
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: String(i), name: `L${i}`, phone: '5511000000000' }));
    const r = await previewOperation(
      supabase,
      { command: 'x', tenantId: TENANT, user: adminUser },
      {
        nowMs: NOW,
        maxRecipients: 3,
        interpret: fakeInterpret({
          action: 'send_whatsapp',
          segment: { type: 'archived' },
          params: { message: 'Oi' },
          needsMessage: false,
        }),
        resolve: fakeResolve(rows),
      },
    );
    expect(r.preview.eligibleCount).toBe(3);
    expect(r.preview.excludedCount).toBe(2);
  });

  it('corretor SEM identidade de corretor é bloqueado', async () => {
    const { supabase } = makeFake();
    const r = await previewOperation(
      supabase,
      { command: 'arquivados', tenantId: TENANT, user: { id: 'u', role: 'corretor' } },
      {
        nowMs: NOW,
        interpret: fakeInterpret({
          action: 'send_whatsapp',
          segment: { type: 'archived' },
          params: { message: 'Oi' },
          needsMessage: false,
        }),
        resolve: fakeResolve([]),
      },
    );
    expect(r).toMatchObject({ ok: false, error: 'forbidden_no_broker_identity' });
  });

  it('corretor COM identidade força brokerScope no resolver', async () => {
    const { supabase } = makeFake();
    const resolve = fakeResolve([{ id: '1', name: 'A', phone: '5511000000001' }]);
    await previewOperation(
      supabase,
      { command: 'arquivados', tenantId: TENANT, user: { id: 'u', role: 'corretor', brokerName: 'Corretor A' } },
      {
        nowMs: NOW,
        interpret: fakeInterpret({
          action: 'send_whatsapp',
          segment: { type: 'archived' },
          params: { message: 'Oi' },
          needsMessage: false,
        }),
        resolve,
      },
    );
    const ctx = resolve.mock.calls[0][2];
    expect(ctx.brokerScope).toBe('Corretor A');
    expect(ctx.tenantId).toBe(TENANT);
  });

  it('comando não interpretável retorna clarification', async () => {
    const { supabase } = makeFake();
    const r = await previewOperation(
      supabase,
      { command: 'asdf', tenantId: TENANT, user: adminUser },
      { nowMs: NOW, interpret: fakeInterpret(null, false), resolve: fakeResolve([]) },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe('unsupported_intent');
    expect(r.clarification).toBe('?');
  });

  it('preview por audienceId carrega o segment do público e NÃO chama interpret', async () => {
    const interpret = vi.fn();
    const supabase = makeFakeSupabaseForAudience({ type: 'archived' });
    // fake resolve no shape do resolveSegmentDual: { ok, rows, primarySource }
    const resolve = async () => ({ ok: true, rows: [{ id: '1', name: 'A', phone: '5511999990000', source: 'kenlo' }], primarySource: 'kenlo' });
    const r = await previewOperation(
      supabase,
      { audienceId: 'a1', tenantId: 't1', user: { id: 'u', email: 'a@x.com', role: 'admin' } },
      { interpret, resolve, nowMs: NOW },
    );
    expect(interpret).not.toHaveBeenCalled();
    expect(r.ok).toBe(true);
    expect(r.preview.foundCount).toBe(1);
  });

  it('preview por audienceId com segment inválido no banco → invalid_segment', async () => {
    const supabase = makeFakeSupabaseForAudience({ type: 'nope' });
    const r = await previewOperation(
      supabase,
      { audienceId: 'a1', tenantId: 't1', user: { id: 'u', role: 'admin' } },
      { interpret: () => {}, resolve: async () => ({ ok: true, rows: [] }), nowMs: NOW },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_segment');
  });
});

/** resolve fake dual-aware: devolve rows + primarySource + diagnostic opcional. */
const fakeResolveDual = (rows, { primarySource = 'kenlo', diagnostic } = {}) =>
  vi.fn(async () => ({ ok: true, rows, primarySource, diagnostic }));

describe('previewOperation — dual-source / sourceComparison', () => {
  it('preview em shadow grava public_source_diagnostic e primary_source no run', async () => {
    const { supabase, runs } = makeFake();
    const diagnostic = { primaryCount: 1, secondaryCount: 1, inBoth: 1, onlyInPrimary: 0, onlyInSecondary: 0 };
    const r = await previewOperation(
      supabase,
      { command: 'arquivados', tenantId: TENANT, user: adminUser },
      {
        nowMs: NOW,
        interpret: fakeInterpret({
          action: 'send_whatsapp',
          segment: { type: 'archived' },
          params: { message: 'Oi' },
          needsMessage: false,
        }),
        resolve: fakeResolveDual([{ id: '1', name: 'A', phone: '5511999990000' }], {
          primarySource: 'kenlo',
          diagnostic,
        }),
      },
    );
    expect(r.ok).toBe(true);
    const inserted = runs.get(r.previewToken);
    expect(inserted.primary_source).toBe('kenlo');
    expect(inserted.public_source_diagnostic).toEqual(diagnostic);
    expect(r.sourceComparison).toMatchObject({ inBoth: 1, divergent: false });
  });

  it('preview kenlo_only (sem diagnostic) NÃO inclui sourceComparison nem grava diagnostic', async () => {
    const { supabase, runs } = makeFake();
    const r = await previewOperation(
      supabase,
      { command: 'arquivados', tenantId: TENANT, user: adminUser },
      {
        nowMs: NOW,
        interpret: fakeInterpret({
          action: 'send_whatsapp',
          segment: { type: 'archived' },
          params: { message: 'Oi' },
          needsMessage: false,
        }),
        resolve: fakeResolveDual([{ id: '1', name: 'A', phone: '5511999990000' }], {
          primarySource: 'kenlo',
          diagnostic: undefined,
        }),
      },
    );
    expect(r.ok).toBe(true);
    const inserted = runs.get(r.previewToken);
    expect(inserted.public_source_diagnostic).toBeNull();
    expect(inserted.primary_source).toBe('kenlo');
    expect(r.sourceComparison).toBeUndefined();
  });

  it('preview com diagnostic truncated inclui sourceComparison: { truncated: true }', async () => {
    const { supabase } = makeFake();
    const r = await previewOperation(
      supabase,
      { command: 'arquivados', tenantId: TENANT, user: adminUser },
      {
        nowMs: NOW,
        interpret: fakeInterpret({
          action: 'send_whatsapp',
          segment: { type: 'archived' },
          params: { message: 'Oi' },
          needsMessage: false,
        }),
        resolve: fakeResolveDual([{ id: '1', name: 'A', phone: '5511999990000' }], {
          primarySource: 'kenlo',
          diagnostic: { truncated: true },
        }),
      },
    );
    expect(r.ok).toBe(true);
    expect(r.sourceComparison).toEqual({ truncated: true });
  });

  it('fakeResolve antigo (sem primarySource) mantém back-compat: grava null, sem sourceComparison', async () => {
    const { supabase, runs } = makeFake();
    const r = await previewOperation(
      supabase,
      { command: 'arquivados', tenantId: TENANT, user: adminUser },
      {
        nowMs: NOW,
        interpret: fakeInterpret({
          action: 'send_whatsapp',
          segment: { type: 'archived' },
          params: { message: 'Oi' },
          needsMessage: false,
        }),
        resolve: fakeResolve([{ id: '1', name: 'A', phone: '5511999990000' }]),
      },
    );
    expect(r.ok).toBe(true);
    const inserted = runs.get(r.previewToken);
    expect(inserted.primary_source).toBeNull();
    expect(inserted.public_source_diagnostic).toBeNull();
    expect(r.sourceComparison).toBeUndefined();
  });
});

describe('confirmOperation — deriva modo primary-only do run.primary_source', () => {
  function seedPendingRunWithSource(primarySource) {
    const id = 'run-psrc';
    const runs = new Map([
      [
        id,
        {
          id,
          tenant_id: TENANT,
          action_type: 'send_whatsapp',
          segment: { type: 'archived' },
          status: 'pending',
          eligible_count: 1,
          excluded_count: 0,
          requested_by_user_id: 'u-admin',
          primary_source: primarySource,
        },
      ],
    ]);
    return { id, runs };
  }

  it('primary_source crm → confirm chama resolve com mode=leads_only', async () => {
    const { id, runs } = seedPendingRunWithSource('crm');
    const { supabase } = makeFake({ runs });
    const spyResolve = vi.fn(async () => ({ ok: true, rows: [], primarySource: 'crm' }));
    await confirmOperation(
      supabase,
      { previewToken: id, tenantId: TENANT, message: 'Oi', user: adminUser },
      { nowMs: NOW, resolve: spyResolve },
    );
    const ctx = spyResolve.mock.calls[0][2];
    expect(ctx.mode).toBe('leads_only');
  });

  it('primary_source kenlo → confirm chama resolve com mode=kenlo_only', async () => {
    const { id, runs } = seedPendingRunWithSource('kenlo');
    const { supabase } = makeFake({ runs });
    const spyResolve = vi.fn(async () => ({ ok: true, rows: [], primarySource: 'kenlo' }));
    await confirmOperation(
      supabase,
      { previewToken: id, tenantId: TENANT, message: 'Oi', user: adminUser },
      { nowMs: NOW, resolve: spyResolve },
    );
    const ctx = spyResolve.mock.calls[0][2];
    expect(ctx.mode).toBe('kenlo_only');
  });

  it('primary_source null (legado) → confirm chama resolve com mode=kenlo_only', async () => {
    const { id, runs } = seedPendingRunWithSource(null);
    const { supabase } = makeFake({ runs });
    const spyResolve = vi.fn(async () => ({ ok: true, rows: [], primarySource: 'kenlo' }));
    await confirmOperation(
      supabase,
      { previewToken: id, tenantId: TENANT, message: 'Oi', user: adminUser },
      { nowMs: NOW, resolve: spyResolve },
    );
    const ctx = spyResolve.mock.calls[0][2];
    expect(ctx.mode).toBe('kenlo_only');
  });
});

describe('previewOperation campaignId', () => {
  /**
   * Fake supabase que combina audiences (maybeSingle fixa) + runs (captura o insert).
   * Reutiliza o mesmo shape de makeFakeSupabaseForAudience + captura da row inserida.
   */
  function makeFakeForCampaignTest() {
    let capturedRow = null;

    const from = (table) => {
      if (table === 'audiences') {
        const node = {
          select() { return node; },
          eq() { return node; },
          async maybeSingle() {
            return { data: { segment: { type: 'archived' } }, error: null };
          },
        };
        return node;
      }
      if (table === 'agent_action_runs') {
        const node = {
          insert(row) {
            capturedRow = row;
            return { error: null };
          },
        };
        return node;
      }
      throw new Error(`tabela inesperada: ${table}`);
    };

    return { supabase: { from }, getCaptured: () => capturedRow };
  }

  const resolveWithLead = vi.fn(async () => ({
    ok: true,
    rows: [{ id: 'l1', name: 'João', phone: '5511999990000' }],
    primarySource: 'kenlo',
  }));

  it('grava campaign_id quando campaignId é passado', async () => {
    const { supabase, getCaptured } = makeFakeForCampaignTest();

    const r = await previewOperation(
      supabase,
      {
        tenantId: 't1',
        audienceId: 'aud1',
        mode: 'kenlo_only',
        campaignId: 'camp1',
        user: { id: 'u1', email: 'a@x.com', role: 'admin' },
      },
      { resolve: resolveWithLead, nowMs: NOW },
    );

    expect(r.ok).toBe(true);
    expect(getCaptured().campaign_id).toBe('camp1');
  });

  it('campaign_id é null quando campaignId ausente (retrocompat)', async () => {
    const { supabase, getCaptured } = makeFakeForCampaignTest();

    const r = await previewOperation(
      supabase,
      {
        tenantId: 't1',
        audienceId: 'aud1',
        mode: 'kenlo_only',
        user: { id: 'u1', email: 'a@x.com', role: 'admin' },
      },
      { resolve: resolveWithLead, nowMs: NOW },
    );

    expect(r.ok).toBe(true);
    expect(getCaptured().campaign_id).toBe(null);
  });
});

describe('confirmOperation — confirmação obrigatória e idempotência', () => {
  function seedPendingRun(over = {}) {
    const id = 'run-123';
    const runs = new Map([
      [
        id,
        {
          id,
          tenant_id: TENANT,
          action_type: 'send_whatsapp',
          segment: { type: 'archived' },
          status: 'pending',
          eligible_count: 2,
          excluded_count: 0,
          requested_by_user_id: 'u-admin',
          ...over,
        },
      ],
    ]);
    return { id, runs };
  }

  it('enfileira itens elegíveis e marca run running', async () => {
    const { id, runs } = seedPendingRun();
    const { supabase, queueUpserts } = makeFake({ runs });
    const r = await confirmOperation(
      supabase,
      { previewToken: id, tenantId: TENANT, message: 'Olá!', user: adminUser },
      {
        nowMs: NOW,
        resolve: fakeResolve([
          { id: '1', name: 'A', phone: '5511000000001' },
          { id: '2', name: 'B', phone: '5511000000002' },
        ]),
      },
    );
    expect(r).toMatchObject({ ok: true, enqueued: 2, runId: id });
    expect(runs.get(id).status).toBe('running');
    expect(queueUpserts).toHaveLength(2);
    expect(queueUpserts[0].idempotency_key).toBe(`${TENANT}|${id}|1`);
    expect(queueUpserts[0].payload.templateParams).toEqual(['Olá!']);
  });

  it('mensagem obrigatória para send_whatsapp', async () => {
    const { id, runs } = seedPendingRun();
    const { supabase } = makeFake({ runs });
    const r = await confirmOperation(
      supabase,
      { previewToken: id, tenantId: TENANT, message: '   ', user: adminUser },
      { nowMs: NOW, resolve: fakeResolve([]) },
    );
    expect(r).toMatchObject({ ok: false, error: 'message_required' });
    expect(runs.get(id).status).toBe('pending'); // não consumiu o run
  });

  it('confirmar 2x não reenfileira (idempotência do run)', async () => {
    const { id, runs } = seedPendingRun();
    const { supabase, queueUpserts } = makeFake({ runs });
    const args = [
      supabase,
      { previewToken: id, tenantId: TENANT, message: 'Olá!', user: adminUser },
      { nowMs: NOW, resolve: fakeResolve([{ id: '1', name: 'A', phone: '5511000000001' }]) },
    ];
    const r1 = await confirmOperation(...args);
    const r2 = await confirmOperation(...args);
    expect(r1.ok).toBe(true);
    expect(r2).toMatchObject({ ok: false, error: 'already_confirmed' });
    expect(queueUpserts).toHaveLength(1); // só a 1ª enfileirou
  });

  it('token inexistente → run_not_found', async () => {
    const { supabase } = makeFake();
    const r = await confirmOperation(
      supabase,
      { previewToken: 'nope', tenantId: TENANT, message: 'oi', user: adminUser },
      { nowMs: NOW, resolve: fakeResolve([]) },
    );
    expect(r).toMatchObject({ ok: false, error: 'run_not_found' });
  });

  it('run de outro tenant não é confirmável', async () => {
    const { id, runs } = seedPendingRun();
    const { supabase } = makeFake({ runs });
    const r = await confirmOperation(
      supabase,
      { previewToken: id, tenantId: 'OUTRO', message: 'oi', user: adminUser },
      { nowMs: NOW, resolve: fakeResolve([]) },
    );
    expect(r).toMatchObject({ ok: false, error: 'run_not_found' });
  });

  it('não-solicitante (não-owner) é bloqueado', async () => {
    const { id, runs } = seedPendingRun();
    const { supabase } = makeFake({ runs });
    const r = await confirmOperation(
      supabase,
      { previewToken: id, tenantId: TENANT, message: 'oi', user: { id: 'outro', role: 'admin' } },
      { nowMs: NOW, resolve: fakeResolve([]) },
    );
    expect(r).toMatchObject({ ok: false, error: 'forbidden_not_requester' });
  });

  it('zero elegíveis: fecha run done com enqueued 0', async () => {
    const { id, runs } = seedPendingRun();
    const { supabase, queueUpserts } = makeFake({ runs });
    const r = await confirmOperation(
      supabase,
      { previewToken: id, tenantId: TENANT, message: 'oi', user: adminUser },
      { nowMs: NOW, resolve: fakeResolve([{ id: '1', name: 'A', phone: '' }]) },
    );
    expect(r).toMatchObject({ ok: true, enqueued: 0 });
    expect(runs.get(id).status).toBe('done');
    expect(queueUpserts).toHaveLength(0);
  });
});

describe('confirmOperation templateName', () => {
  function seedPendingRun(over = {}) {
    const id = 'run-tpl';
    const runs = new Map([
      [
        id,
        {
          id,
          tenant_id: TENANT,
          action_type: 'send_whatsapp',
          segment: { type: 'archived' },
          status: 'pending',
          eligible_count: 2,
          excluded_count: 0,
          requested_by_user_id: 'u-admin',
          ...over,
        },
      ],
    ]);
    return { id, runs };
  }

  it('grava template_name no run e nos itens quando passado', async () => {
    const { id, runs } = seedPendingRun();
    const { supabase, queueUpserts } = makeFake({ runs });
    const r = await confirmOperation(
      supabase,
      { previewToken: id, tenantId: TENANT, message: 'Olá!', templateName: 'promo', user: adminUser },
      {
        nowMs: NOW,
        resolve: fakeResolve([
          { id: '1', name: 'A', phone: '5511000000001' },
          { id: '2', name: 'B', phone: '5511000000002' },
        ]),
      },
    );
    expect(r.ok).toBe(true);
    // (b) gravou no update do run (claim pending→running)
    expect(runs.get(id).template_name).toBe('promo');
    // (c) gravou em cada item enfileirado
    expect(queueUpserts).toHaveLength(2);
    expect(queueUpserts.every((i) => i.template_name === 'promo')).toBe(true);
  });

  it('template_name null quando ausente (retrocompat)', async () => {
    const { id, runs } = seedPendingRun();
    const { supabase, queueUpserts } = makeFake({ runs });
    const r = await confirmOperation(
      supabase,
      { previewToken: id, tenantId: TENANT, message: 'Olá!', user: adminUser },
      {
        nowMs: NOW,
        resolve: fakeResolve([
          { id: '1', name: 'A', phone: '5511000000001' },
          { id: '2', name: 'B', phone: '5511000000002' },
        ]),
      },
    );
    expect(r.ok).toBe(true);
    expect(runs.get(id).template_name).toBe(null);
    expect(queueUpserts).toHaveLength(2);
    expect(queueUpserts.every((i) => i.template_name === null)).toBe(true);
  });
});
