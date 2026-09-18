import { describe, it, expect } from 'vitest';
import { countCaptacao, countCorretoresAtivos, countImoveisAtivos, fetchCommercialTotals } from './kpisData.js';

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
        range(from, to) { filters.__range = [from, to]; return builder; },
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


describe('fetchCommercialTotals — VGV e VGC', () => {
  // Lia até 17/09 a tabela `commercial_sales`, que congelou em 01/09 quando o
  // sync da planilha foi desligado: a aba KPIs mostrava um retrato velho
  // enquanto o resto da dash já lia a venda do funil no mesmo dia. A fonte
  // única passou a ser a view `vendas_assinadas`, que também resolve a comissão
  // (gravada, ou 3,5% / 6%) e entrega a data já no fuso de São Paulo.
  it('lê da view vendas_assinadas, não da planilha congelada', async () => {
    let tabelaConsultada = null;
    const supabase = makeSupabase((table, f) => {
      tabelaConsultada = table;
      expect(f.tenant_id).toBe('t1');
      expect(f['data_assinatura__gte']).toBe('2026-06-01');
      expect(f['data_assinatura__lte']).toBe('2026-06-30');
      return { data: [{ vgv: 100000, vgc: 6000 }, { vgv: 50000, vgc: 1750 }], error: null };
    });

    const res = await fetchCommercialTotals(supabase, {
      tenantId: 't1',
      period: { startDate: '2026-06-01', endDate: '2026-06-30' },
    });

    expect(tabelaConsultada).toBe('vendas_assinadas');
    expect(res).toEqual({ vgv: 150000, vgc: 7750 });
  });

  it('erro de consulta devolve zeros em vez de derrubar o painel', async () => {
    const supabase = makeSupabase(() => ({ data: null, error: { message: 'boom' } }));
    const res = await fetchCommercialTotals(supabase, {
      tenantId: 't1',
      period: { startDate: '2026-06-01', endDate: '2026-06-30' },
    });
    expect(res).toEqual({ vgv: 0, vgc: 0 });
  });
});
