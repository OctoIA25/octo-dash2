import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regressão das métricas individuais ("dados pessoais" do corretor).
 *
 * O que estava errado, e por que passava despercebido:
 * - `visitas` e `vendasRealizadas` filtravam `l.etapa_atual`, coluna que não
 *   existe em `leads`. Com optional chaining o campo vem `undefined`, o filtro
 *   nunca casa e os dois cards eram zero fixo para todo corretor.
 * - `porBairro` agrupava por `bairro`/`district`/`neighborhood` — nenhuma existe:
 *   o gráfico era 100% "Não informado".
 * - `exclusividade`/`exclusivity` idem; a coluna real é `is_exclusive`.
 * - `comissaoTotal` era a soma de `final_sale_value`, ou seja, comissão = valor
 *   do imóvel.
 * - `select('*')` sem paginação: o PostgREST corta em 1000 linhas SEM erro.
 */

type Query = {
  table: string;
  columns: string | null;
  filters: Array<{ op: string; col?: string; val?: unknown }>;
  range: [number, number] | null;
};

const queries: Query[] = [];
let respostaPorTabela: Record<string, unknown[][]> = {};

vi.mock('@/lib/supabaseClient', () => {
  const from = (table: string) => {
    const q: Query = { table, columns: null, filters: [], range: null };
    queries.push(q);
    const chain: Record<string, unknown> = {
      select(columns: string) { q.columns = columns; return chain; },
      eq(col: string, val: unknown) { q.filters.push({ op: 'eq', col, val }); return chain; },
      gte(col: string, val: unknown) { q.filters.push({ op: 'gte', col, val }); return chain; },
      lte(col: string, val: unknown) { q.filters.push({ op: 'lte', col, val }); return chain; },
      in(col: string, val: unknown) { q.filters.push({ op: 'in', col, val }); return chain; },
      range(de: number, ate: number) { q.range = [de, ate]; return chain; },
      then(resolve: (v: unknown) => void) {
        const paginas = respostaPorTabela[q.table] ?? [];
        const indice = queries.filter((outra) => outra.table === q.table).indexOf(q);
        return Promise.resolve({ data: paginas[indice] ?? [], error: null }).then(resolve);
      },
    };
    return chain;
  };
  return { supabase: { from } };
});

vi.mock('@/data/realLeadsProcessor', () => ({
  canonicalizeFonteCounts: (fontes: string[]) => {
    const mapa = new Map<string, number>();
    for (const f of fontes) mapa.set(f, (mapa.get(f) || 0) + 1);
    return mapa;
  },
}));

let vendasFake: Array<Record<string, unknown>> = [];
vi.mock('@/features/metricas/services/vendasAssinadasService', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/metricas/services/vendasAssinadasService')>();
  return { ...real, buscarVendasAssinadas: async () => vendasFake };
});

let rateioFake: { corretor: number; imobiliaria: number } | null = null;
vi.mock('@/features/metricas/services/commercialSalesService', () => ({
  ratearComissaoDoCorretor: async () => rateioFake,
}));

import {
  buscarMetricasIndividuaisLeads,
  buscarMetricasIndividuaisVendas,
} from './relatoriosService';

const TENANT = '65c69875-dc83-4062-90f6-6f6adc30df26';
const CORRETOR = 'Fernanda Souza';
const DE = '2026-08-01';
const ATE = '2026-08-31';

beforeEach(() => {
  queries.length = 0;
  respostaPorTabela = {};
  vendasFake = [];
  rateioFake = null;
});

/** Lead do fixture — só os campos que o serviço lê. */
const lead = (over: Partial<Record<string, unknown>> = {}) => ({
  assigned_agent_name: CORRETOR,
  source: 'Site',
  property_code: 'A1',
  visit_date: null,
  created_at: null,
  first_response_at: null,
  ...over,
});

describe('buscarMetricasIndividuaisLeads', () => {
  it('não consulta coluna inexistente (etapa_atual, bairro, exclusividade)', async () => {
    await buscarMetricasIndividuaisLeads(TENANT, CORRETOR, DE, ATE);

    const tudo = JSON.stringify(queries);
    for (const coluna of ['etapa_atual', 'bairro', 'district', 'neighborhood', 'exclusividade', 'origem_lead']) {
      expect(tudo, `consulta coluna inexistente: ${coluna}`).not.toContain(coluna);
    }
  });

  it('conta visita pelo fato (visit_date), não pela etapa', async () => {
    respostaPorTabela = {
      leads: [[
        lead({ property_code: 'A1', visit_date: '2026-08-10' }),
        lead({ property_code: 'A2' }),
      ]],
    };

    const m = await buscarMetricasIndividuaisLeads(TENANT, CORRETOR, DE, ATE);

    expect(m.totalLeads).toBe(2);
    expect(m.visitas).toBe(1);
  });

  it('pagina: 1000 linhas na primeira página não param a leitura', async () => {
    const pagina = (n: number, prefixo: string) =>
      Array.from({ length: n }, (_, i) => lead({ property_code: `${prefixo}${i}` }));
    respostaPorTabela = { leads: [pagina(1000, 'p1-'), pagina(7, 'p2-')] };

    const m = await buscarMetricasIndividuaisLeads(TENANT, CORRETOR, DE, ATE);

    expect(m.totalLeads).toBe(1007);
    expect(queries[0].range).toEqual([0, 999]);
    expect(queries[1].range).toEqual([1000, 1999]);
  });

  /**
   * O que quebrava a conferência com a planilha: `leads.assigned_agent_name`
   * guarda a grafia da origem ("FABIO GONCALVES") e a tela manda o nome do
   * cadastro ("Fábio Gonçalves"). O `eq` exato zerava o painel de 5 dos 11
   * corretores do ranking da Lotus enquanto as vendas deles apareciam.
   */
  it('casa o corretor por nome normalizado (maiúscula, acento, espaço duplo)', async () => {
    respostaPorTabela = {
      leads: [[
        lead({ assigned_agent_name: 'FERNANDA SOUZA' }),
        lead({ assigned_agent_name: 'Fernanda  Souza' }),
        lead({ assigned_agent_name: 'Fernanda Souza' }),
        lead({ assigned_agent_name: 'Outro Corretor' }),
        lead({ assigned_agent_name: null }),
      ]],
    };

    const m = await buscarMetricasIndividuaisLeads(TENANT, CORRETOR, DE, ATE);

    expect(m.totalLeads).toBe(3);
  });

  it('não filtra por nome no servidor — a comparação exata perdia lead', async () => {
    await buscarMetricasIndividuaisLeads(TENANT, CORRETOR, DE, ATE);

    const filtroPorNome = queries[0].filters.find((f) => f.col === 'assigned_agent_name');
    expect(filtroPorNome).toBeUndefined();
  });

  it('chave UUID continua filtrando no servidor por assigned_agent_id', async () => {
    const uuid = '3f7a1c2e-9b4d-4a6f-8c1e-2d5b7a9f0c34';
    respostaPorTabela = { leads: [[lead({ assigned_agent_name: 'QUALQUER GRAFIA' })]] };

    const m = await buscarMetricasIndividuaisLeads(TENANT, uuid, DE, ATE);

    expect(queries[0].filters).toContainEqual({ op: 'eq', col: 'assigned_agent_id', val: uuid });
    expect(m.totalLeads).toBe(1);
  });

  it('tempo médio de resposta é do corretor consultado', async () => {
    respostaPorTabela = {
      leads: [[
        lead({ property_code: 'A', created_at: '2026-08-01T10:00:00Z', first_response_at: '2026-08-01T10:10:00Z' }),
        lead({ property_code: 'B', created_at: '2026-08-01T10:00:00Z', first_response_at: '2026-08-01T10:30:00Z' }),
        lead({ property_code: 'C', created_at: '2026-08-01T10:00:00Z', first_response_at: null }),
      ]],
    };

    const m = await buscarMetricasIndividuaisLeads(TENANT, CORRETOR, DE, ATE);

    expect(m.tempoMedioRespostaMin).toBe(20);
  });
});

describe('buscarMetricasIndividuaisVendas', () => {
  it('comissão é o VGC da proposta, nunca o valor do imóvel', async () => {
    vendasFake = [
      { id: 'p1', leadId: 'l1', agentUserId: null, agentNome: 'Fernanda Souza', vgv: 500000, vgc: 30000, dataAssinatura: '2026-08-10' },
      { id: 'p2', leadId: 'l2', agentUserId: null, agentNome: 'Outro Corretor', vgv: 900000, vgc: 54000, dataAssinatura: '2026-08-11' },
    ];
    respostaPorTabela = {
      leads: [[{ id: 'l1', is_exclusive: true, property_code: 'IMV-1', source: 'Indicação' }]],
    };

    const v = await buscarMetricasIndividuaisVendas(TENANT, CORRETOR, DE, ATE);

    expect(v.vendasTotal).toBe(1); // só as do corretor
    expect(v.vgvTotal).toBe(500000);
    expect(v.comissaoTotal).toBe(30000);
    expect(v.comissaoTotal).not.toBe(v.vgvTotal);
    expect(v.rows[0]).toMatchObject({ comissao: 30000, valor_imovel: 500000, codigo_imovel: 'IMV-1' });
  });

  it('exclusividade sai de is_exclusive', async () => {
    vendasFake = [
      { id: 'p1', leadId: 'l1', agentUserId: null, agentNome: CORRETOR, vgv: 100, vgc: 6, dataAssinatura: '2026-08-10' },
      { id: 'p2', leadId: 'l2', agentUserId: null, agentNome: CORRETOR, vgv: 200, vgc: 12, dataAssinatura: '2026-08-12' },
    ];
    respostaPorTabela = {
      leads: [[
        { id: 'l1', is_exclusive: true, property_code: 'A', source: 'Site' },
        { id: 'l2', is_exclusive: false, property_code: 'B', source: 'Site' },
      ]],
    };

    const v = await buscarMetricasIndividuaisVendas(TENANT, CORRETOR, DE, ATE);

    expect(v.vendasExclusivas).toBe(1);
    expect(v.vendasNaoExclusivas).toBe(1);
    expect(JSON.stringify(queries)).toContain('is_exclusive');
  });

  it('expõe a parte do corretor pelo mesmo rateio do ranking', async () => {
    rateioFake = { corretor: 12000, imobiliaria: 18000 };
    vendasFake = [
      { id: 'p1', leadId: 'l1', agentUserId: null, agentNome: CORRETOR, vgv: 500000, vgc: 30000, dataAssinatura: '2026-08-10' },
    ];

    const v = await buscarMetricasIndividuaisVendas(TENANT, CORRETOR, DE, ATE);

    expect(v.comissaoTotal).toBe(30000); // VGC, o bolo
    expect(v.comissaoCorretor).toBe(12000); // o que a planilha chama de comissão do corretor
    expect(v.comissaoImobiliaria).toBe(18000);
  });

  it('sem nível/líder cadastrado a parte do corretor é null, nunca zero', async () => {
    rateioFake = null;
    vendasFake = [
      { id: 'p1', leadId: 'l1', agentUserId: null, agentNome: CORRETOR, vgv: 500000, vgc: 30000, dataAssinatura: '2026-08-10' },
    ];

    const v = await buscarMetricasIndividuaisVendas(TENANT, CORRETOR, DE, ATE);

    expect(v.comissaoCorretor).toBeNull();
    expect(v.comissaoTotal).toBe(30000);
  });

  it('sem venda no período devolve zeros, não NaN', async () => {
    const v = await buscarMetricasIndividuaisVendas(TENANT, CORRETOR, DE, ATE);

    expect(v).toMatchObject({ vendasTotal: 0, vgvTotal: 0, comissaoTotal: 0, ticketMedio: 0 });
    expect(v.rows).toEqual([]);
  });
});

/**
 * A conferência que o gestor faz: somar os painéis individuais e bater com o
 * total da tela (KPIs e ranking leem as MESMAS duas fontes — `leads` no período
 * e `proposals` assinadas). Enquanto o painel filtrava por nome exato, a soma
 * ficava abaixo do total sem nenhum erro na tela.
 */
describe('reconciliação: soma dos individuais x total', () => {
  const CORRETORES = ['Fernanda Souza', 'Fábio Gonçalves', 'Flavia Ceolin'];

  const LEADS_DO_TENANT = [
    lead({ assigned_agent_name: 'FERNANDA SOUZA', visit_date: '2026-08-02' }),
    lead({ assigned_agent_name: 'Fernanda Souza' }),
    lead({ assigned_agent_name: 'FABIO GONCALVES' }),
    lead({ assigned_agent_name: 'FLAVIA CEOLIN', visit_date: '2026-08-05' }),
    lead({ assigned_agent_name: 'Flavia Ceolin' }),
  ];

  const VENDAS_DO_TENANT = [
    { id: 'p1', leadId: null, agentUserId: null, agentNome: 'FERNANDA SOUZA', vgv: 500000, vgc: 30000, dataAssinatura: '2026-08-10' },
    { id: 'p2', leadId: null, agentUserId: null, agentNome: 'Fábio Gonçalves', vgv: 300000, vgc: 18000, dataAssinatura: '2026-08-12' },
    { id: 'p3', leadId: null, agentUserId: null, agentNome: 'FLAVIA CEOLIN', vgv: 200000, vgc: 12000, dataAssinatura: '2026-08-14' },
  ];

  it('leads, visitas, vendas e VGV dos individuais somam o total do período', async () => {
    let leadsSomados = 0;
    let visitasSomadas = 0;
    let vendasSomadas = 0;
    let vgvSomado = 0;

    for (const corretor of CORRETORES) {
      queries.length = 0;
      respostaPorTabela = { leads: [LEADS_DO_TENANT] };
      const l = await buscarMetricasIndividuaisLeads(TENANT, corretor, DE, ATE);
      leadsSomados += l.leadsRecebidos;
      visitasSomadas += l.visitas;

      queries.length = 0;
      respostaPorTabela = { leads: [[]] };
      vendasFake = VENDAS_DO_TENANT;
      const v = await buscarMetricasIndividuaisVendas(TENANT, corretor, DE, ATE);
      vendasSomadas += v.vendasTotal;
      vgvSomado += v.vgvTotal;
    }

    expect(leadsSomados).toBe(LEADS_DO_TENANT.length);
    expect(visitasSomadas).toBe(LEADS_DO_TENANT.filter((x) => x.visit_date).length);
    expect(vendasSomadas).toBe(VENDAS_DO_TENANT.length);
    expect(vgvSomado).toBe(VENDAS_DO_TENANT.reduce((s, x) => s + x.vgv, 0));
  });
});
