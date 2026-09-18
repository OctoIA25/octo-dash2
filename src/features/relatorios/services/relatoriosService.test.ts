import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regressão dos KPIs de Relatórios.
 *
 * `buscarKPIsGerais` filtrava por `l.first_interaction_at` e `l.etapa_atual` — duas
 * colunas que NÃO existem em `leads` (a tabela tem `first_response_at`, e etapa é
 * `status`). Em JS isso não dá erro: o campo vem `undefined`, o filtro nunca casa e
 * três dos cinco KPIs eram zero fixo desde sempre. Ninguém percebeu porque zero é
 * um número plausível.
 *
 * O outro defeito era contar com `.length` de um `select('*')`: o PostgREST corta em
 * 1000 linhas SEM erro, então o total empacava em 1000 (a Imobiliaria Japi já tem
 * 1685 leads).
 *
 * Estes testes travam as duas coisas: as COLUNAS/filtros consultados e a contagem
 * feita no banco.
 */

type Query = {
  table: string;
  columns: string | null;
  opts: unknown;
  filters: Array<{ op: string; col?: string; val?: unknown }>;
  limit: number | null;
  ordered: boolean;
};

const queries: Query[] = [];
// Resposta por índice de chamada; o serviço dispara as 5 leituras num Promise.all.
let respostas: Array<{ count?: number; data?: unknown[]; error?: unknown }> = [];

vi.mock('@/lib/supabaseClient', () => {
  const from = (table: string) => {
    const q: Query = { table, columns: null, opts: null, filters: [], limit: null, ordered: false };
    queries.push(q);
    const chain: Record<string, unknown> = {
      select(columns: string, opts: unknown) { q.columns = columns; q.opts = opts ?? null; return chain; },
      eq(col: string, val: unknown) { q.filters.push({ op: 'eq', col, val }); return chain; },
      gt(col: string, val: unknown) { q.filters.push({ op: 'gt', col, val }); return chain; },
      gte(col: string, val: unknown) { q.filters.push({ op: 'gte', col, val }); return chain; },
      is(col: string, val: unknown) { q.filters.push({ op: 'is', col, val }); return chain; },
      lte(col: string, val: unknown) { q.filters.push({ op: 'lte', col, val }); return chain; },
      neq(col: string, val: unknown) { q.filters.push({ op: 'neq', col, val }); return chain; },
      in(col: string, val: unknown) { q.filters.push({ op: 'in', col, val }); return chain; },
      range() { return chain; },
      not(col: string, op: string, val: unknown) { q.filters.push({ op: `not.${op}`, col, val }); return chain; },
      order() { q.ordered = true; return chain; },
      limit(n: number) { q.limit = n; return chain; },
      then(resolve: (v: unknown) => void) {
        const i = queries.indexOf(q);
        return Promise.resolve(respostas[i] ?? { count: 0, data: [], error: null }).then(resolve);
      },
    };
    return chain;
  };
  return { supabase: { from } };
});

vi.mock('@/data/realLeadsProcessor', () => ({ canonicalizeFonteCounts: (x: unknown) => x }));

// Vendas vêm de `proposals` por um serviço já testado à parte; aqui só interessa
// o que o KPI faz com elas (leads convertidos distintos, VGV/VGC).
let vendasFake: Array<Record<string, unknown>> = [];
vi.mock('@/features/metricas/services/vendasAssinadasService', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/metricas/services/vendasAssinadasService')>();
  return { ...real, buscarVendasAssinadas: async () => vendasFake };
});

import { buscarEvolucaoCarteira, buscarKPIsGerais, buscarVendasPorFaixa, contarImoveisPorExclusividade, montarEvolucaoCarteira } from './relatoriosService';

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';
const INICIO = '2026-08-01';
const FIM = '2026-08-30'; // 30 dias
const filtroDe = (q: Query, col: string) => q.filters.find((f) => f.col === col);

/**
 * Ordem das leituras dentro de buscarKPIsGerais. Desde 18/09 são DUAS: a
 * contagem de recebidos em `leads` e a amostra de interação na view
 * `primeira_interacao`. As leituras de `first_response_at` sumiram junto com a
 * coluna — ela marca a saída do card da primeira coluna do kanban, não uma
 * resposta ao lead.
 */
const RECEBIDOS = 0;
const INTERACAO = 1;

beforeEach(() => {
  queries.length = 0;
  respostas = [];
  vendasFake = [];
});

describe('buscarKPIsGerais', () => {
  it('não consulta coluna que não existe na tabela', async () => {
    await buscarKPIsGerais(TENANT, INICIO, FIM);

    const tudo = JSON.stringify(queries);
    expect(tudo).not.toContain('etapa_atual');
    expect(tudo).not.toContain('first_interaction_at');
  });

  it('conta no banco em vez de baixar linhas e usar .length', async () => {
    await buscarKPIsGerais(TENANT, INICIO, FIM);

    expect(queries[RECEBIDOS].opts).toEqual({ count: 'exact', head: true });
    // A única leitura que traz linha é a amostra da interação, e ela é paginada
    // (não usa `.limit`, que cortaria em silêncio um tenant grande).
    expect(queries[INTERACAO].opts).toBeNull();
    expect(queries[INTERACAO].limit).toBeNull();
  });

  it('a amostra de interacao vem da view, nao da tabela leads', async () => {
    await buscarKPIsGerais(TENANT, INICIO, FIM);
    expect(queries[INTERACAO].table).toBe('primeira_interacao');
    // A coluna que media card arrastado no kanban não é mais consultada.
    expect(JSON.stringify(queries)).not.toContain('first_response_at');
  });

  // A view do corretor nasce de `lead_toques`, que tem RLS sem policy: do
  // browser ela devolve 42501. Se alguém apontar esta tela para ela, quebra aqui.
  it('nao tenta ler a view do corretor, que e server-only', async () => {
    await buscarKPIsGerais(TENANT, INICIO, FIM);
    expect(queries.map((q) => q.table)).not.toContain('primeira_interacao_corretor');
  });

  it('escopa toda leitura pelo tenant', async () => {
    await buscarKPIsGerais(TENANT, INICIO, FIM);
    for (const q of queries) {
      expect(filtroDe(q, 'tenant_id')).toEqual({ op: 'eq', col: 'tenant_id', val: TENANT });
    }
  });

  // "Interagido" passou a ser "a LIA falou com o lead". Antes era "o card saiu
  // da primeira coluna do kanban", que é outra coisa e cobria 2,4% da base.
  it('"interagido" e lead que a LIA contatou, contado na view', async () => {
    respostas = [
      { count: 100, error: null },
      { data: [{ minutos_ate_primeiro_contato: 5 }, { minutos_ate_primeiro_contato: 9 }], error: null },
    ];
    const kpis = await buscarKPIsGerais(TENANT, INICIO, FIM);
    expect(kpis.totalLeadsInteragidos).toBe(2);
  });

  it('toda leitura é recortada pelo período e pelo não-arquivado', async () => {
    await buscarKPIsGerais(TENANT, INICIO, FIM);
    expect(filtroDe(queries[RECEBIDOS], 'created_at')).toBeDefined();
    // Na view a coluna de data chama `lead_criado_em`.
    expect(filtroDe(queries[INTERACAO], 'lead_criado_em')).toBeDefined();
    expect(queries[INTERACAO].filters.some((f) => f.op === 'lte' && f.col === 'lead_criado_em')).toBe(true);
    // Sem este filtro a taxa de atendimento passa de 100%: lead arquivado entra
    // no numerador e fica fora do denominador.
    expect(filtroDe(queries[INTERACAO], 'archived_at')).toMatchObject({ op: 'is', val: null });
  });

  // `leads.final_sale_value` está vazia em produção: a venda mora em `proposals`.
  it('"convertido" é lead distinto com proposta assinada, não lead com valor preenchido', async () => {
    respostas = [{ count: 100, error: null }, { data: [], error: null }];
    vendasFake = [
      { id: 'p1', leadId: 'lead-a', vgv: 500000, vgc: 30000 },
      { id: 'p2', leadId: 'lead-a', vgv: 300000, vgc: 18000 }, // mesmo lead, 2 propostas
      { id: 'p3', leadId: 'lead-b', vgv: 200000, vgc: 12000 },
    ];

    const kpis = await buscarKPIsGerais(TENANT, INICIO, FIM);

    expect(kpis.totalLeadsConvertidos).toBe(2);
    expect(kpis.vendasAssinadas).toBe(3);
    expect(kpis.vgv).toBe(1000000);
    expect(kpis.vgc).toBe(60000);
    expect(JSON.stringify(queries)).not.toContain('final_sale_value');
  });

  it('devolve as contagens do banco, não 1000 truncado', async () => {
    respostas = [
      { count: 1685, error: null },
      { data: Array.from({ length: 13 }, () => ({ minutos_ate_primeiro_contato: 7 })), error: null },
    ];

    const kpis = await buscarKPIsGerais(TENANT, INICIO, FIM);

    expect(kpis.totalLeadsRecebidos).toBe(1685);
    expect(kpis.totalLeadsInteragidos).toBe(13);
    // Média por dia do período — contagem, não percentual.
    expect(kpis.mediaLeadsDia).toBe(Math.round((1685 / 30) * 10) / 10);
  });

  // MEDIANA, não média. Nos dados reais da Lotus a média dá 2.432 min e a
  // mediana 1,2 min: um punhado de leads recontatados semanas depois desloca a
  // média em horas e não toca a mediana.
  it('tempo de interacao e a MEDIANA, nao a media', async () => {
    respostas = [
      { count: 5, error: null },
      { data: [1, 2, 3, 4, 100000].map((m) => ({ minutos_ate_primeiro_contato: m })), error: null },
    ];

    const kpis = await buscarKPIsGerais(TENANT, INICIO, FIM);
    expect(kpis.mediaTempoPrimeiraInteracao).toBe(3);        // mediana
    expect(kpis.mediaTempoPrimeiraInteracao).not.toBe(20002); // a média
  });

  // `0` afirmaria resposta instantânea; `null` desce como "Sem dados".
  it('sem lead contatado o tempo e null, nao 0', async () => {
    respostas = [{ count: 10, error: null }, { data: [], error: null }];
    const kpis = await buscarKPIsGerais(TENANT, INICIO, FIM);
    expect(kpis.mediaTempoPrimeiraInteracao).toBeNull();
    expect(kpis.totalLeadsInteragidos).toBe(0);
  });

  // Falha de leitura não pode virar KPI zerado — foi exatamente assim que o bug
  // original passou despercebido.
  it('propaga erro da contagem de leads em vez de devolver zeros', async () => {
    respostas = [
      { count: null as unknown as number, error: { code: '42703', message: 'column does not exist' } },
      { data: [], error: null },
    ];

    await expect(buscarKPIsGerais(TENANT, INICIO, FIM)).rejects.toMatchObject({ code: '42703' });
  });

  // A view degrada diferente da contagem: em vez de derrubar a tela inteira,
  // devolve `null` e a tela diz "Sem dados". O que ela NÃO pode fazer é
  // devolver 0, que é um número plausível e esconderia a falha.
  it('falha ao ler a view vira null, nao zero interagidos', async () => {
    respostas = [
      { count: 100, error: null },
      { data: null, error: { code: '42501', message: 'permission denied' } },
    ];

    const kpis = await buscarKPIsGerais(TENANT, INICIO, FIM);
    expect(kpis.totalLeadsRecebidos).toBe(100);
    expect(kpis.totalLeadsInteragidos).toBeNull();
    expect(kpis.mediaTempoPrimeiraInteracao).toBeNull();
  });
});

/**
 * Regressão do gráfico "Vendas por Faixa de Valor" da aba Imóveis.
 *
 * Ele lia `leads.final_sale_value`, coluna NULA em 100% das linhas dos tenants
 * em produção — o gráfico voltava vazio e a tela exibia, no lugar, leads por
 * mês sob o título de vendas. A venda mora em `proposals`.
 */
describe('buscarVendasPorFaixa', () => {
  const hoje = new Date();
  const venda = (vgv: number, offsetMeses = 0) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - offsetMeses, 1);
    return {
      id: `p-${vgv}-${offsetMeses}`,
      leadId: null,
      agentUserId: null,
      agentNome: '',
      vgv,
      vgc: 0,
      dataAssinatura: `${d.getFullYear()}-01-01`,
      mes: d.getMonth() + 1,
      ano: d.getFullYear(),
    };
  };

  it('classifica pelas faixas e devolve a janela inteira de meses', async () => {
    vendasFake = [venda(500_000), venda(500_001), venda(999_999), venda(1_000_000)];

    const faixas = await buscarVendasPorFaixa(TENANT, 12);

    expect(faixas).toHaveLength(12);
    // O mês corrente é o último bucket da janela.
    expect(faixas[11]).toMatchObject({ ate_500k: 1, de_500k_999k: 2, acima_1m: 1 });
    // Mês sem venda continua no eixo, zerado.
    expect(faixas[0]).toMatchObject({ ate_500k: 0, de_500k_999k: 0, acima_1m: 0 });
  });

  it('ignora proposta assinada sem valor em vez de somá-la na faixa mais baixa', async () => {
    vendasFake = [venda(0), venda(0), venda(300_000)];

    const faixas = await buscarVendasPorFaixa(TENANT, 12);

    expect(faixas[11]).toMatchObject({ ate_500k: 1, de_500k_999k: 0, acima_1m: 0 });
  });

  it('não lê `leads` nem `final_sale_value`', async () => {
    vendasFake = [venda(300_000)];

    await buscarVendasPorFaixa(TENANT, 12);

    expect(JSON.stringify(queries)).not.toContain('final_sale_value');
    expect(queries.some((q) => q.table === 'leads')).toBe(false);
  });
});

describe('montarEvolucaoCarteira', () => {
  const HOJE = new Date(2026, 8, 9); // 09/09/2026
  const mov = (data: string, valor = 0) => ({ data, valor });

  it('devolve os N meses da janela, mesmo os sem movimento', () => {
    const serie = montarEvolucaoCarteira([], [], 12, HOJE);
    expect(serie).toHaveLength(12);
    expect(serie[0].mes).toBe('Out');
    expect(serie[11].mes).toBe('Set');
    expect(serie.every((m) => m.carteira === 0 && m.valor === 0)).toBe(true);
  });

  it('acumula: carteira do mês = saldo do mês anterior + entradas - saídas, em quantidade e valor', () => {
    const serie = montarEvolucaoCarteira(
      [
        mov('2026-07-10T12:00:00Z', 500_000),
        mov('2026-07-20T12:00:00Z', 800_000),
        mov('2026-08-05T12:00:00Z', 1_200_000),
      ],
      [mov('2026-08-15T12:00:00Z', 500_000)],
      12,
      HOJE,
    );
    const jul = serie.find((m) => m.mes === 'Jul')!;
    const ago = serie.find((m) => m.mes === 'Ago')!;
    const set = serie.find((m) => m.mes === 'Set')!;

    expect(jul).toMatchObject({ entradas: 2, saidas: 0, carteira: 2, valor: 1_300_000 });
    expect(ago).toMatchObject({ entradas: 1, saidas: 1, carteira: 2, valor: 2_000_000 });
    expect(set).toMatchObject({ entradas: 0, saidas: 0, carteira: 2, valor: 2_000_000 }); // saldo não zera em mês parado
  });

  it('o que entrou antes da janela vira saldo inicial em vez de sumir', () => {
    const serie = montarEvolucaoCarteira(
      [mov('2020-01-01T00:00:00Z', 300_000), mov('2020-02-01T00:00:00Z', 700_000)],
      [mov('2019-05-01T00:00:00Z', 300_000)],
      12,
      HOJE,
    );
    expect(serie[0]).toMatchObject({ entradas: 0, saidas: 0, carteira: 1, valor: 700_000 });
  });
});

describe('buscarEvolucaoCarteira', () => {
  it('rascunho não entra: nem a linha viva, nem o log de código que hoje é rascunho', async () => {
    const agora = new Date().toISOString();
    respostas = [
      // 0: imoveis_locais
      { data: [
        { id: 'a', codigo_imovel: 'AP0001', status_aprovacao: 'aprovado', created_at: agora, valor_venda: 100 },
        { id: 'b', codigo_imovel: 'AP0002', status_aprovacao: 'rascunho', created_at: agora, valor_venda: 999 },
      ], error: null },
      // 1: log 'excluido' — AP0002 é o rascunho anterior, apagado e recriado com o mesmo código
      { data: [
        { imovel_id: 'x', codigo_imovel: 'AP0002', created_at: agora, valor_venda: 50 },
        { imovel_id: 'y', codigo_imovel: 'CA0001', created_at: agora, valor_venda: 200 },
      ], error: null },
      // 2: log 'criado' dos que saíram
      { data: [{ imovel_id: 'y', codigo_imovel: 'CA0001', created_at: agora, valor_venda: null }], error: null },
    ];

    const serie = await buscarEvolucaoCarteira(TENANT);

    expect(serie[serie.length - 1]).toMatchObject({ entradas: 2, saidas: 1, carteira: 1, valor: 100 });
    expect(filtroDe(queries[2], 'imovel_id')).toEqual({ op: 'in', col: 'imovel_id', val: ['y'] });
  });
});

/**
 * Regressão do gráfico "Distribuição Exclusivo/Ficha" da aba Imóveis: contava
 * leads de Proprietário nas etapas do kanban (funil sem uso → zero fixo). A
 * exclusividade mora no imóvel, `imoveis_locais.exclusivo`.
 */
describe('contarImoveisPorExclusividade', () => {
  it('conta imóveis do tenant por exclusivo, no banco', async () => {
    respostas = [{ count: 2, error: null }, { count: 20, error: null }];

    await expect(contarImoveisPorExclusividade(TENANT)).resolves.toEqual({ exclusivos: 2, ficha: 20 });

    expect(queries.map((q) => q.table)).toEqual(['imoveis_locais', 'imoveis_locais']);
    queries.forEach((q) => {
      expect(q.opts).toMatchObject({ count: 'exact', head: true });
      expect(filtroDe(q, 'tenant_id')?.val).toBe(TENANT);
      // Rascunho é cadastro incompleto, não carteira.
      expect(filtroDe(q, 'status_aprovacao')).toEqual({ op: 'neq', col: 'status_aprovacao', val: 'rascunho' });
    });
    // Ficha = IS NOT TRUE: com `= false` o "Indiferente" (NULL) sumiria dos dois lados.
    expect(queries.map((q) => filtroDe(q, 'exclusivo'))).toEqual([
      { op: 'eq', col: 'exclusivo', val: true },
      { op: 'not.is', col: 'exclusivo', val: true },
    ]);
  });

  it('propaga erro do banco em vez de devolver zeros', async () => {
    respostas = [{ count: 2, error: null }, { error: { code: '42501', message: 'permission denied' } }];

    await expect(contarImoveisPorExclusividade(TENANT)).rejects.toMatchObject({ code: '42501' });
  });
});
