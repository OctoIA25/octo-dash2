import { describe, it, expect } from 'vitest';
import { countCaptacao, countCorretoresAtivos, countImoveisAtivos } from './kpisData.js';

// Mock encadeável (vitest): cada from() tem seus próprios filters; `then`
// resolve com o que o resolver devolver para (table, filters). Suporta in().
function makeSupabase(resolver) {
  return {
    from(table) {
      const filters = {};
      const builder = {
        select() { return builder; },
        eq(col, val) { filters[col] = val; return builder; },
        neq(col, val) { filters[`${col}__neq`] = val; return builder; },
        not(col, op, val) { filters[`${col}__not_${op}`] = val; return builder; },
        in(col, vals) { filters[col] = vals; return builder; },
        gte(col, val) { filters[`${col}__gte`] = val; return builder; },
        lte(col, val) { filters[`${col}__lte`] = val; return builder; },
        then(resolve) { resolve(resolver(table, filters)); },
      };
      return builder;
    },
  };
}

describe('countCaptacao', () => {
  it('separa exclusiva de sem exclusividade por created_at no período', async () => {
    const supabase = makeSupabase((table, f) => {
      expect(table).toBe('imoveis_locais');
      expect(f.tenant_id).toBe('t1');
      expect(f['created_at__gte']).toBeTruthy(); // dayStartUtc('2026-06-01')
      expect(f['status_aprovacao__neq']).toBe('rascunho');
      if (f.exclusivo === true) return { count: 7, error: null };
      // "Indiferente" (NULL) conta como sem exclusividade: IS NOT TRUE, não = false.
      expect(f['exclusivo__not_is']).toBe(true);
      return { count: 12, error: null };
    });
    const res = await countCaptacao(supabase, { tenantId: 't1', period: { startDate: '2026-06-01', endDate: '2026-06-30' } });
    expect(res).toEqual({ exclusiva: 7, semExclusividade: 12 });
  });

  it('erro retorna zeros (não derruba o painel)', async () => {
    const supabase = makeSupabase(() => ({ count: null, error: { message: 'boom' } }));
    const res = await countCaptacao(supabase, { tenantId: 't1', period: { startDate: '2026-06-01', endDate: '2026-06-30' } });
    expect(res).toEqual({ exclusiva: 0, semExclusividade: 0 });
  });
});

describe('countImoveisAtivos', () => {
  it('conta os imóveis do tenant sem os rascunhos', async () => {
    const supabase = makeSupabase((table, f) => {
      expect(table).toBe('imoveis_locais');
      expect(f.tenant_id).toBe('t1');
      expect(f['status_aprovacao__neq']).toBe('rascunho');
      return { count: 42, error: null };
    });
    expect(await countImoveisAtivos(supabase, { tenantId: 't1' })).toBe(42);
  });
});

describe('countCorretoresAtivos', () => {
  it('conta memberships com role comercial (sem coluna status, que não existe na tabela)', async () => {
    const supabase = makeSupabase((table, f) => {
      expect(table).toBe('tenant_memberships');
      expect(f.tenant_id).toBe('t1');
      // tenant_memberships não tem coluna `status`; filtrar por ela quebra a query.
      expect(f.status).toBeUndefined();
      expect(f.role).toEqual(['corretor', 'admin', 'team_leader']);
      return { count: 9, error: null };
    });
    expect(await countCorretoresAtivos(supabase, { tenantId: 't1' })).toBe(9);
  });

  it('erro retorna 0', async () => {
    const supabase = makeSupabase(() => ({ count: null, error: { message: 'boom' } }));
    expect(await countCorretoresAtivos(supabase, { tenantId: 't1' })).toBe(0);
  });
});
