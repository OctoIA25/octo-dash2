import { describe, it, expect } from 'vitest';
import { getDeletedTenantIds } from './tenantSoftDelete.js';

const supabaseReturning = (result) => ({
  from: () => ({
    select: () => ({
      in: () => ({
        not: () => Promise.resolve(result),
      }),
    }),
  }),
});

describe('getDeletedTenantIds', () => {
  it('retorna só os tenants marcados como deletados', async () => {
    const supabase = supabaseReturning({ data: [{ id: 't1' }], error: null });
    const out = await getDeletedTenantIds(supabase, ['t1', 't2', 't1', null]);
    expect(out.has('t1')).toBe(true);
    expect(out.has('t2')).toBe(false);
  });

  it('lista vazia não consulta o banco e volta Set vazio', async () => {
    const out = await getDeletedTenantIds(null, []);
    expect(out.size).toBe(0);
  });

  it('erro na consulta → fail-open (ninguém tratado como deletado)', async () => {
    const supabase = supabaseReturning({ data: null, error: new Error('boom') });
    const out = await getDeletedTenantIds(supabase, ['t1']);
    expect(out.size).toBe(0);
  });

  it('mock/cliente sem a cadeia esperada → fail-open, não explode', async () => {
    const out = await getDeletedTenantIds({ from: () => undefined }, ['t1']);
    expect(out.size).toBe(0);
  });
});
