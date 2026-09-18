/**
 * Os três números de venda do painel da Central.
 *
 * Até 18/09/2026 eles vinham de uma consulta com três defeitos encadeados:
 * ela selecionava só `status` de `leads` e filtrava `status = 'Proposta
 * Enviada'`; depois filtrava ESSE resultado por `status === 'concluida'`,
 * que nenhuma linha podia satisfazer; e somava `valor_imovel` sobre o array
 * vazio — de uma coluna que nem estava no select.
 *
 * Resultado na Lotus, mês corrente: "Vendas Criadas" mostrava 3 (o certo era
 * 35) e "Vendas Assinadas" mostrava 0 (o certo era 4). "Valor Total Vendas"
 * era R$ 0 por construção.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chamadas: Array<{ tabela: string; filtros: Array<[string, unknown]>; head: boolean }> = [];

/** Linhas por tabela. O fake NÃO inventa dado: devolve o que foi semeado. */
let dados: Record<string, unknown[]> = {};

function builder(tabela: string) {
  const reg = { tabela, filtros: [] as Array<[string, unknown]>, head: false };
  chamadas.push(reg);
  const chain: Record<string, unknown> = {};
  for (const m of ['order', 'range', 'limit', 'is', 'in', 'not', 'neq', 'or', 'ilike']) chain[m] = () => chain;
  chain.select = (_c: string, opts?: { head?: boolean }) => { reg.head = Boolean(opts?.head); return chain; };
  chain.eq = (c: string, v: unknown) => { reg.filtros.push([c, v]); return chain; };
  chain.gte = (c: string, v: unknown) => { reg.filtros.push([`${c}>=`, v]); return chain; };
  chain.lte = (c: string, v: unknown) => { reg.filtros.push([`${c}<=`, v]); return chain; };
  chain.lt = (c: string, v: unknown) => { reg.filtros.push([`${c}<`, v]); return chain; };
  chain.maybeSingle = () => Promise.resolve({ data: (dados[tabela] || [])[0] ?? null, error: null });
  chain.then = (resolve: (r: unknown) => unknown) => {
    const linhas = dados[tabela] || [];
    return Promise.resolve({ data: reg.head ? null : linhas, count: linhas.length, error: null }).then(resolve);
  };
  return chain;
}

vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock('./primeiraInteracaoService', () => ({
  buscarMinutosPorLead: async () => new Map(),
  medianaMinutos: () => null,
}));

const { buscarKPIsEquipeCentral } = await import('./teamMetricsService');

beforeEach(() => {
  chamadas.length = 0;
  dados = {
    tenants: [{ id: 'tenant-1' }],
    tenant_memberships: [{ tenant_id: 'tenant-1' }],
    proposals: Array.from({ length: 35 }, (_, i) => ({ id: `p${i}` })),
    vendas_assinadas: [{ vgv: 500000 }, { vgv: 300000 }, { vgv: 0 }, { vgv: 200000 }],
    leads: [],
    imoveis_locais: [],
  };
});

describe('KPIs de venda da Central', () => {
  it('"Vendas Assinadas" conta a view, nao um filtro impossivel', async () => {
    const kpis = await buscarKPIsEquipeCentral('tenant-1');
    expect(kpis.vendasAssinadas, 'o defeito devolvia 0 sempre').toBe(4);
  });

  it('"Valor Total Vendas" soma o VGV da view', async () => {
    const kpis = await buscarKPIsEquipeCentral('tenant-1');
    expect(kpis.valorTotalVendasMes, 'o defeito devolvia R$ 0 sempre').toBe(1_000_000);
  });

  it('"Vendas Criadas" conta propostas, nao leads em uma etapa', async () => {
    const kpis = await buscarKPIsEquipeCentral('tenant-1');
    expect(kpis.vendasCriadas).toBe(35);
  });

  it('venda sai de proposals e da view, nunca mais de leads', async () => {
    await buscarKPIsEquipeCentral('tenant-1');
    const tabelas = chamadas.map((c) => c.tabela);
    expect(tabelas).toContain('proposals');
    expect(tabelas).toContain('vendas_assinadas');
    // A consulta que media venda por `status = 'Proposta Enviada'` sumiu.
    const porStatus = chamadas.find((c) => c.filtros.some(([col, v]) => col === 'status' && v === 'Proposta Enviada'));
    expect(porStatus, 'venda não se mede pela etapa do lead').toBeUndefined();
  });

  /**
   * `getCurrentMonthRange` devolve `dataFim` = dia 1º do mês SEGUINTE, com
   * `exclusiveEnd`. Um `lte` ali contaria as vendas daquele dia dentro do mês
   * corrente — off-by-one de um mês inteiro na virada.
   */
  it('o fim do periodo e exclusivo: usa lt, nao lte', async () => {
    await buscarKPIsEquipeCentral('tenant-1');
    const view = chamadas.find((c) => c.tabela === 'vendas_assinadas');
    const cols = (view?.filtros || []).map(([c]) => c);
    expect(cols).toContain('data_assinatura<');
    expect(cols, 'lte incluiria o dia 1º do mês seguinte').not.toContain('data_assinatura<=');
  });

  it('periodo sem venda devolve 0, e um 0 medido', async () => {
    dados.vendas_assinadas = [];
    dados.proposals = [];
    const kpis = await buscarKPIsEquipeCentral('tenant-1');
    expect(kpis.vendasAssinadas).toBe(0);
    expect(kpis.valorTotalVendasMes).toBe(0);
  });
});
