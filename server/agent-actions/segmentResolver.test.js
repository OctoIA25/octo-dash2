import { describe, it, expect } from 'vitest';
import { resolveSegment, resolveSegmentForSource, resolveSegmentDual, LEADS_SOURCE } from './segmentResolver.js';

const NOW = 1_750_000_000_000; // timestamp fixo (determinístico).
const TENANT = 'tenant-1';

/**
 * Fake encadeável do Supabase que GRAVA toda a cadeia de filtros aplicada à
 * query, para podermos asseverar o contrato exato de cada segmento (tenant-scope,
 * colunas, operadores temporais). A query é "thenable": resolve para { data }.
 *
 * `rows` é o resultado simulado da tabela; cada teste injeta o que precisa.
 */
function makeSupabase(rows = []) {
  const calls = [];
  const node = {
    select: (cols) => (calls.push(['select', cols]), node),
    eq: (c, v) => (calls.push(['eq', c, v]), node),
    not: (c, op, v) => (calls.push(['not', c, op, v]), node),
    is: (c, v) => (calls.push(['is', c, v]), node),
    lte: (c, v) => (calls.push(['lte', c, v]), node),
    gte: (c, v) => (calls.push(['gte', c, v]), node),
    ilike: (c, v) => (calls.push(['ilike', c, v]), node),
    or: (expr) => (calls.push(['or', expr]), node),
    limit: (n) => (calls.push(['limit', n]), node),
    // torna o node "awaitable" como uma query PostgREST resolvida
    then: (resolve) => resolve({ data: rows, error: null }),
  };
  const supabase = { from: (t) => (calls.push(['from', t]), node) };
  return { supabase, calls };
}

/** Helper: encontra a primeira chamada de um tipo. */
const find = (calls, name) => calls.find((c) => c[0] === name);
const findAll = (calls, name) => calls.filter((c) => c[0] === name);

describe('segmentResolver — reutiliza a camada de leads (kenlo_leads)', () => {
  it('rejeita sem tenant', async () => {
    const { supabase } = makeSupabase();
    const r = await resolveSegment(supabase, { type: 'archived' }, { nowMs: NOW });
    expect(r).toEqual({ ok: false, error: 'tenant_required' });
  });

  it('rejeita segmento inválido', async () => {
    const { supabase } = makeSupabase();
    const r = await resolveSegment(supabase, null, { tenantId: TENANT });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid_segment');
  });

  it('SEMPRE escopa por tenant_id e consulta kenlo_leads', async () => {
    const { supabase, calls } = makeSupabase();
    await resolveSegment(supabase, { type: 'archived' }, { tenantId: TENANT, nowMs: NOW });
    expect(find(calls, 'from')).toEqual(['from', 'kenlo_leads']);
    expect(find(calls, 'eq')).toEqual(['eq', 'tenant_id', TENANT]);
  });

  it('explicit_list: OR de ilike por nome (cliente único ou lista)', async () => {
    const { supabase, calls } = makeSupabase([
      { id: '1', client_name: 'João Silva', client_phone: '5511999990000' },
    ]);
    const r = await resolveSegment(
      supabase,
      { type: 'explicit_list', names: ['João Silva', 'Maria'] },
      { tenantId: TENANT, nowMs: NOW },
    );
    expect(r.ok).toBe(true);
    expect(r.rows[0]).toMatchObject({ name: 'João Silva', phone: '5511999990000', source: 'kenlo' });
    const or = find(calls, 'or');
    expect(or[1]).toContain('client_name.ilike.%João Silva%');
    expect(or[1]).toContain('client_name.ilike.%Maria%');
  });

  it('explicit_list vazia é rejeitada', async () => {
    const { supabase } = makeSupabase();
    const r = await resolveSegment(supabase, { type: 'explicit_list', names: [] }, { tenantId: TENANT });
    expect(r).toMatchObject({ ok: false, error: 'empty_explicit_list' });
  });

  it('archived: filtra archived_at NOT NULL', async () => {
    const { supabase, calls } = makeSupabase();
    await resolveSegment(supabase, { type: 'archived' }, { tenantId: TENANT, nowMs: NOW });
    expect(find(calls, 'not')).toEqual(['not', 'archived_at', 'is', null]);
  });

  it('archived_period: archived_at <= now - N dias', async () => {
    const { supabase, calls } = makeSupabase();
    await resolveSegment(supabase, { type: 'archived_period', days: 30 }, { tenantId: TENANT, nowMs: NOW });
    expect(find(calls, 'not')).toEqual(['not', 'archived_at', 'is', null]);
    const lte = find(calls, 'lte');
    expect(lte[1]).toBe('archived_at');
    const expectedIso = new Date(NOW - 30 * 86400000).toISOString();
    expect(lte[2]).toBe(expectedIso);
  });

  it('archived_period rejeita days inválido', async () => {
    const { supabase } = makeSupabase();
    const r = await resolveSegment(supabase, { type: 'archived_period', days: -1 }, { tenantId: TENANT, nowMs: NOW });
    expect(r).toMatchObject({ ok: false, error: 'invalid_days' });
  });

  it('by_broker: ilike em attended_by_name', async () => {
    const { supabase, calls } = makeSupabase();
    await resolveSegment(supabase, { type: 'by_broker', broker: 'Imobiliária X' }, { tenantId: TENANT, nowMs: NOW });
    expect(find(calls, 'ilike')).toEqual(['ilike', 'attended_by_name', '%Imobiliária X%']);
  });

  it('no_contact: ativos com updated_at <= now - N dias', async () => {
    const { supabase, calls } = makeSupabase();
    await resolveSegment(supabase, { type: 'no_contact', days: 15 }, { tenantId: TENANT, nowMs: NOW });
    expect(find(calls, 'is')).toEqual(['is', 'archived_at', null]);
    const lte = find(calls, 'lte');
    expect(lte[1]).toBe('updated_at');
    expect(lte[2]).toBe(new Date(NOW - 15 * 86400000).toISOString());
  });

  it('interest: ilike em interest_type', async () => {
    const { supabase, calls } = makeSupabase();
    await resolveSegment(supabase, { type: 'interest', interest: 'apartamento' }, { tenantId: TENANT, nowMs: NOW });
    expect(find(calls, 'ilike')).toEqual(['ilike', 'interest_type', '%apartamento%']);
  });

  it('brokerScope força attended_by_name (corretor só atinge seus leads)', async () => {
    const { supabase, calls } = makeSupabase();
    await resolveSegment(
      supabase,
      { type: 'archived' },
      { tenantId: TENANT, brokerScope: 'Corretor A', nowMs: NOW },
    );
    // dois eq: tenant_id e attended_by_name = brokerScope
    const eqs = findAll(calls, 'eq');
    expect(eqs).toContainEqual(['eq', 'tenant_id', TENANT]);
    expect(eqs).toContainEqual(['eq', 'attended_by_name', 'Corretor A']);
  });

  it('aplica limite de segurança (maxRows)', async () => {
    const { supabase, calls } = makeSupabase();
    await resolveSegment(supabase, { type: 'archived' }, { tenantId: TENANT, nowMs: NOW, maxRows: 100 });
    expect(find(calls, 'limit')).toEqual(['limit', 100]);
  });

  it('teto default é 50000 (públicos grandes não são truncados em 5000)', async () => {
    const { supabase, calls } = makeSupabase();
    await resolveSegment(supabase, { type: 'archived' }, { tenantId: TENANT, nowMs: NOW });
    expect(find(calls, 'limit')).toEqual(['limit', 50000]);
  });

  it('segmento desconhecido é rejeitado', async () => {
    const { supabase } = makeSupabase();
    const r = await resolveSegment(supabase, { type: 'banana' }, { tenantId: TENANT, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('unsupported_segment');
  });
});

describe('resolveSegmentForSource — fonte LEADS (CRM)', () => {
  it('archived consulta a tabela leads e NÃO filtra por lead_type (público inclui Interessados + Proprietários + NULL)', async () => {
    const { supabase, calls } = makeSupabase([
      { id: '1', name: 'Ana', phone: '11999990000', assigned_agent_name: 'Bia', archived_at: '2026-01-01', updated_at: '2026-01-02', source_lead_id: 'ext-1' },
    ]);
    const r = await resolveSegmentForSource(supabase, { type: 'archived' }, { tenantId: TENANT, nowMs: NOW }, LEADS_SOURCE);
    expect(r.ok).toBe(true);
    expect(find(calls, 'from')).toEqual(['from', 'leads']);          // não kenlo_leads
    // Contato elegível p/ campanha independe do tipo: Proprietário (lead_type=2)
    // e leads sem tipo (NULL) não podem ser silenciosamente cortados.
    expect(findAll(calls, 'eq')).not.toContainEqual(['eq', 'lead_type', 1]);
    expect(r.rows[0]).toMatchObject({ name: 'Ana', source: 'crm', sourceLeadId: 'ext-1' });
  });

  it('Proprietário (lead_type=2) entra no público de leads (não é cortado pelo filtro de tipo)', async () => {
    const { supabase, calls } = makeSupabase([
      { id: '9', name: 'Dono', phone: '11888880000', assigned_agent_name: 'Bia', archived_at: '2026-01-01', updated_at: '2026-01-02', source_lead_id: 'ext-9', lead_type: 2 },
    ]);
    const r = await resolveSegmentForSource(supabase, { type: 'archived' }, { tenantId: TENANT, nowMs: NOW }, LEADS_SOURCE);
    expect(r.ok).toBe(true);
    expect(findAll(calls, 'eq')).not.toContainEqual(['eq', 'lead_type', expect.anything()]);
    expect(r.rows.map((x) => x.name)).toContain('Dono');
  });

  it('explicit_list também não aplica lead_type (lista explícita ignora o filtro de tipo)', async () => {
    const { supabase, calls } = makeSupabase([]);
    await resolveSegmentForSource(supabase, { type: 'explicit_list', names: ['Ana'] }, { tenantId: TENANT, nowMs: NOW }, LEADS_SOURCE);
    expect(findAll(calls, 'eq')).not.toContainEqual(['eq', 'lead_type', 1]);
    // usa a coluna 'name' (não client_name)
    expect(find(calls, 'or')[1]).toContain('name.ilike');
  });
});

describe('resolveSegment back-compat — kenlo continua igual', () => {
  it('archived ainda usa kenlo_leads e NÃO adiciona lead_type', async () => {
    const { supabase, calls } = makeSupabase([]);
    await resolveSegment(supabase, { type: 'archived' }, { tenantId: TENANT, nowMs: NOW });
    expect(find(calls, 'from')).toEqual(['from', 'kenlo_leads']);
    expect(findAll(calls, 'eq')).not.toContainEqual(
      expect.arrayContaining(['eq', 'lead_type', expect.anything()]),
    );
  });
});

// ---------------------------------------------------------------------------
// Fake por tabela: rowsByTable = { kenlo_leads: [...], leads: [...] }
// errorTables = Set de tabelas que devem retornar erro de query.
// ---------------------------------------------------------------------------
function makeSupabaseByTable(rowsByTable = {}, errorTables = new Set()) {
  const calls = [];
  const makeNode = (table) => {
    const node = {
      select: (cols) => (calls.push(['select', cols]), node),
      eq: (c, v) => (calls.push(['eq', c, v]), node),
      not: (c, op, v) => (calls.push(['not', c, op, v]), node),
      is: (c, v) => (calls.push(['is', c, v]), node),
      lte: (c, v) => (calls.push(['lte', c, v]), node),
      gte: (c, v) => (calls.push(['gte', c, v]), node),
      ilike: (c, v) => (calls.push(['ilike', c, v]), node),
      or: (expr) => (calls.push(['or', expr]), node),
      limit: (n) => (calls.push(['limit', n]), node),
      then: (resolve) => {
        if (errorTables.has(table)) {
          return resolve({ data: null, error: { message: `boom ${table}` } });
        }
        return resolve({ data: rowsByTable[table] || [], error: null });
      },
    };
    return node;
  };
  const supabase = { from: (t) => (calls.push(['from', t]), makeNode(t)) };
  return { supabase, calls };
}

describe('resolveSegmentDual', () => {
  const seg = { type: 'archived' };
  const ctxBase = { tenantId: TENANT, nowMs: NOW };

  it('kenlo_only: rows da primária kenlo, sem diagnostic', async () => {
    const { supabase, calls } = makeSupabaseByTable({
      kenlo_leads: [{ id: 'K1', client_name: 'A', client_phone: '11999990000', archived_at: 'x' }],
    });
    const r = await resolveSegmentDual(supabase, seg, { ...ctxBase, mode: 'kenlo_only' });
    expect(r.ok).toBe(true);
    expect(r.primarySource).toBe('kenlo');
    expect(r.diagnostic).toBeUndefined();
    expect(r.rows).toHaveLength(1);
    // somente 1 query (kenlo_leads); secundária não deve ser consultada
    expect(calls.filter((c) => c[0] === 'from').map((c) => c[1])).toEqual(['kenlo_leads']);
  });

  it('shadow_leads: rows da PRIMÁRIA (kenlo) + diagnostic com contagens', async () => {
    const { supabase } = makeSupabaseByTable({
      kenlo_leads: [{ id: 'K1', client_name: 'A', client_phone: '11999990000', archived_at: 'x' }],
      leads: [{ id: 'C1', name: 'A', phone: '11999990000', archived_at: 'x', source_lead_id: 'K1' }],
    });
    const r = await resolveSegmentDual(supabase, seg, { ...ctxBase, mode: 'shadow_leads' });
    expect(r.ok).toBe(true);
    expect(r.primarySource).toBe('kenlo');
    expect(r.rows).toHaveLength(1); // rows da primária
    expect(r.diagnostic).toBeDefined();
    expect(r.diagnostic.primaryCount).toBe(1);
    expect(r.diagnostic.secondaryCount).toBe(1);
    expect(r.diagnostic.inBoth).toBe(1); // casou por sourceLeadId
  });

  it('leads_primary: primária é leads; diagnostic presente', async () => {
    const { supabase } = makeSupabaseByTable({
      leads: [{ id: 'C1', name: 'A', phone: '11999990000', archived_at: 'x', source_lead_id: null }],
      kenlo_leads: [{ id: 'K1', client_name: 'A', client_phone: '11999990000', archived_at: 'x' }],
    });
    const r = await resolveSegmentDual(supabase, seg, { ...ctxBase, mode: 'leads_primary' });
    expect(r.ok).toBe(true);
    expect(r.primarySource).toBe('crm');
    expect(r.diagnostic).toBeDefined();
    expect(r.diagnostic.inBoth).toBe(1); // casou por telefone
  });

  it('leads_only: rows da primária leads, sem diagnostic', async () => {
    const { supabase, calls } = makeSupabaseByTable({
      leads: [{ id: 'C1', name: 'B', phone: '11888880000', archived_at: 'x', source_lead_id: null }],
    });
    const r = await resolveSegmentDual(supabase, seg, { ...ctxBase, mode: 'leads_only' });
    expect(r.ok).toBe(true);
    expect(r.primarySource).toBe('crm');
    expect(r.diagnostic).toBeUndefined();
    expect(r.rows).toHaveLength(1);
    expect(calls.filter((c) => c[0] === 'from').map((c) => c[1])).toEqual(['leads']);
  });

  it('secundária com erro NÃO derruba a primária', async () => {
    const { supabase } = makeSupabaseByTable(
      { kenlo_leads: [{ id: 'K1', client_name: 'A', client_phone: '11999990000', archived_at: 'x' }] },
      new Set(['leads']), // leads erra
    );
    const r = await resolveSegmentDual(supabase, seg, { ...ctxBase, mode: 'shadow_leads' });
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(1);
    expect(r.diagnostic.secondaryError).toBeTruthy();
  });

  it('modo ausente cai em kenlo_only (default seguro)', async () => {
    const { supabase } = makeSupabaseByTable({ kenlo_leads: [] });
    const r = await resolveSegmentDual(supabase, seg, { ...ctxBase });
    expect(r.ok).toBe(true);
    expect(r.primarySource).toBe('kenlo');
    expect(r.diagnostic).toBeUndefined();
  });

  it('modo inválido cai em kenlo_only (default seguro)', async () => {
    const { supabase } = makeSupabaseByTable({ kenlo_leads: [] });
    const r = await resolveSegmentDual(supabase, seg, { ...ctxBase, mode: 'invalid_mode' });
    expect(r.ok).toBe(true);
    expect(r.primarySource).toBe('kenlo');
    expect(r.diagnostic).toBeUndefined();
  });

  it('primária com erro propaga e para (sem secundária)', async () => {
    const { supabase } = makeSupabaseByTable({}, new Set(['kenlo_leads']));
    const r = await resolveSegmentDual(supabase, seg, { ...ctxBase, mode: 'shadow_leads' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('query_failed');
    expect(r.primarySource).toBe('kenlo');
  });

  it('guard de truncamento: skipa secundária se primária atingiu maxRows', async () => {
    // Cria 3 rows para kenlo_leads e define maxRows=3 — simula truncamento
    const kenloRows = [
      { id: 'K1', client_name: 'A', client_phone: '11111110001', archived_at: 'x' },
      { id: 'K2', client_name: 'B', client_phone: '11111110002', archived_at: 'x' },
      { id: 'K3', client_name: 'C', client_phone: '11111110003', archived_at: 'x' },
    ];
    const { supabase, calls } = makeSupabaseByTable({
      kenlo_leads: kenloRows,
      leads: [{ id: 'C1', name: 'A', phone: '11111110001', archived_at: 'x', source_lead_id: 'K1' }],
    });
    const r = await resolveSegmentDual(supabase, seg, { ...ctxBase, mode: 'shadow_leads', maxRows: 3 });
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(3);
    expect(r.diagnostic).toEqual({ truncated: true });
    // somente kenlo_leads foi consultada
    expect(calls.filter((c) => c[0] === 'from').map((c) => c[1])).toEqual(['kenlo_leads']);
  });
});

describe('resolveSegmentDual — modo union (leads + kenlo deduplicado)', () => {
  const NOW_U = 1_750_000_000_000;
  const T = 'tenant-1';

  it('une as duas fontes e deduplica por telefone (CRM vence)', async () => {
    const { supabase } = makeSupabaseByTable({
      leads: [
        { id: 'l1', name: 'CRM João', phone: '5511999990000', assigned_agent_name: null,
          archived_at: '2020-01-01T00:00:00Z', updated_at: null, source_lead_id: 'k1', lead_type: 1 },
      ],
      kenlo_leads: [
        // mesmo contato do l1 (telefone normaliza igual) → descartado
        { id: 'k1', client_name: 'Kenlo João', client_phone: '1199990000',
          attended_by_name: null, archived_at: '2020-01-01T00:00:00Z', updated_at: null },
        // contato novo (telefone diferente) → entra
        { id: 'k2', client_name: 'Kenlo Maria', client_phone: '11888880000',
          attended_by_name: null, archived_at: '2020-01-01T00:00:00Z', updated_at: null },
      ],
    });
    const r = await resolveSegmentDual(supabase, { type: 'archived' },
      { tenantId: T, nowMs: NOW_U, mode: 'union' });
    expect(r.ok).toBe(true);
    expect(r.primarySource).toBe('union');
    expect(r.rows).toHaveLength(2);
    // l1 (CRM) presente; k1 ausente (deduplicado); k2 presente.
    const ids = r.rows.map((x) => x.id);
    expect(ids).toContain('l1');
    expect(ids).not.toContain('k1');
    expect(ids).toContain('k2');
  });

  it('falha de UMA fonte é fatal (ok:false)', async () => {
    const { supabase } = makeSupabaseByTable(
      { leads: [], kenlo_leads: [] },
      new Set(['kenlo_leads']), // kenlo_leads erra
    );
    const r = await resolveSegmentDual(supabase, { type: 'archived' },
      { tenantId: T, nowMs: NOW_U, mode: 'union' });
    expect(r.ok).toBe(false);
    expect(r.primarySource).toBe('union');
  });

  it('marca diagnostic.truncated quando uma fonte atinge maxRows', async () => {
    // maxRows=2: kenlo retorna 2 linhas (>= maxRows) → união possivelmente incompleta.
    const { supabase } = makeSupabaseByTable({
      leads: [],
      kenlo_leads: [
        { id: 'k1', client_name: 'A', client_phone: '11999990001', attended_by_name: null, archived_at: '2020-01-01T00:00:00Z', updated_at: null },
        { id: 'k2', client_name: 'B', client_phone: '11999990002', attended_by_name: null, archived_at: '2020-01-01T00:00:00Z', updated_at: null },
      ],
    });
    const r = await resolveSegmentDual(supabase, { type: 'archived' },
      { tenantId: T, nowMs: NOW_U, mode: 'union', maxRows: 2 });
    expect(r.ok).toBe(true);
    expect(r.primarySource).toBe('union');
    expect(r.diagnostic).toEqual({ truncated: true });
  });

  it('brokerScope filtra AMBAS as tabelas (leads + kenlo_leads)', async () => {
    const { supabase, calls } = makeSupabaseByTable({ leads: [], kenlo_leads: [] });
    await resolveSegmentDual(supabase, { type: 'archived' },
      { tenantId: T, nowMs: NOW_U, mode: 'union', brokerScope: 'Corretor X' });
    const eqs = calls.filter((c) => c[0] === 'eq');
    expect(eqs).toEqual(expect.arrayContaining([
      ['eq', 'assigned_agent_name', 'Corretor X'],
      ['eq', 'attended_by_name', 'Corretor X'],
    ]));
  });
});
