import { describe, it, expect } from 'vitest';
import { resolveSegment } from './segmentResolver.js';

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
    expect(r.rows[0]).toMatchObject({ name: 'João Silva', phone: '5511999990000', source: 'crm' });
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

  it('segmento desconhecido é rejeitado', async () => {
    const { supabase } = makeSupabase();
    const r = await resolveSegment(supabase, { type: 'banana' }, { tenantId: TENANT, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('unsupported_segment');
  });
});
