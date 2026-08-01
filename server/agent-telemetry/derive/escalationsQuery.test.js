import { describe, it, expect, vi } from 'vitest';
import { fetchClosedLeadIds } from './escalationsQuery.js';

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';

// Mock do PostgREST para leads: select().eq().gt() encadeáveis, resolve com as
// linhas dadas. NÃO deve haver .in() — mandar centenas de ids no URL estoura o
// limite de tamanho ("fetch failed"); buscamos os fechados do tenant e cruzamos
// em memória (o Set é pequeno: fechados << total de leads).
function makeSupabase(returnRows) {
  const calls = { table: null, filters: {}, usedIn: false };
  const chain = {
    select() { return chain; },
    eq(col, val) { calls.filters[col] = val; return chain; },
    gt(col, val) { calls.filters[`${col}>`] = val; return chain; },
    in() { calls.usedIn = true; return chain; },
    then(resolve) { return resolve({ data: returnRows, error: null }); },
  };
  return { _calls: calls, from: vi.fn((table) => { calls.table = table; return chain; }) };
}

describe('fetchClosedLeadIds — leads fechados (final_sale_value > 0) do tenant', () => {
  it('busca os fechados do tenant e devolve um Set, SEM cláusula IN gigante', async () => {
    const supabase = makeSupabase([{ id: 'L1' }, { id: 'L3' }]);
    const result = await fetchClosedLeadIds(supabase, TENANT);

    expect(result).toBeInstanceOf(Set);
    expect([...result].sort()).toEqual(['L1', 'L3']);
    expect(supabase._calls.table).toBe('leads');
    expect(supabase._calls.filters.tenant_id).toBe(TENANT);
    expect(supabase._calls.filters['final_sale_value>']).toBe(0);
    expect(supabase._calls.usedIn).toBe(false); // nunca manda lista de ids no URL
  });

  it('tenant sem vendas fechadas → Set vazio', async () => {
    const supabase = makeSupabase([]);
    const result = await fetchClosedLeadIds(supabase, TENANT);
    expect(result.size).toBe(0);
  });

  it('erro do banco propaga (o endpoint decide como responder)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ gt: () => ({
          then: (resolve) => resolve({ data: null, error: { message: 'db down' } }),
        }) }) }),
      }),
    };
    await expect(fetchClosedLeadIds(supabase, TENANT)).rejects.toThrow('db down');
  });
});
