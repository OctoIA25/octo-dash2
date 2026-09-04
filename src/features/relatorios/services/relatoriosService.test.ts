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

import { buscarKPIsGerais } from './relatoriosService';

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';
const INICIO = '2026-08-01';
const FIM = '2026-08-30'; // 30 dias
const filtroDe = (q: Query, col: string) => q.filters.find((f) => f.col === col);

/** Ordem das leituras em `leads` dentro de buscarKPIsGerais. */
const RECEBIDOS = 0;
const INTERAGIDOS = 1;
const AMOSTRA = 2;

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

    for (const i of [RECEBIDOS, INTERAGIDOS]) {
      expect(queries[i].opts).toEqual({ count: 'exact', head: true });
    }
    // A única leitura que traz linha é a amostra do tempo de resposta, e ela é limitada.
    expect(queries[AMOSTRA].opts).toBeNull();
    expect(queries[AMOSTRA].limit).toBe(1000);
  });

  it('escopa toda leitura pelo tenant', async () => {
    await buscarKPIsGerais(TENANT, INICIO, FIM);
    for (const q of queries) {
      expect(filtroDe(q, 'tenant_id')).toEqual({ op: 'eq', col: 'tenant_id', val: TENANT });
    }
  });

  it('"interagido" é lead com first_response_at preenchido', async () => {
    await buscarKPIsGerais(TENANT, INICIO, FIM);
    expect(filtroDe(queries[INTERAGIDOS], 'first_response_at')).toMatchObject({ op: 'not.is', val: null });
  });

  it('toda leitura de leads é recortada pelo período', async () => {
    await buscarKPIsGerais(TENANT, INICIO, FIM);
    for (const q of queries) {
      expect(filtroDe(q, 'created_at')).toBeDefined();
      expect(q.filters.some((f) => f.op === 'lte' && f.col === 'created_at')).toBe(true);
    }
  });

  // `leads.final_sale_value` está vazia em produção: a venda mora em `proposals`.
  it('"convertido" é lead distinto com proposta assinada, não lead com valor preenchido', async () => {
    respostas = [{ count: 100, error: null }, { count: 40, error: null }, { data: [], error: null }];
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
      { count: 13, error: null },
      { data: [], error: null },
    ];

    const kpis = await buscarKPIsGerais(TENANT, INICIO, FIM);

    expect(kpis.totalLeadsRecebidos).toBe(1685);
    expect(kpis.totalLeadsInteragidos).toBe(13);
    // Média por dia do período — contagem, não percentual.
    expect(kpis.mediaLeadsDia).toBe(Math.round((1685 / 30) * 10) / 10);
  });

  it('média de primeira resposta em minutos, ignorando diferença não positiva', async () => {
    const base = '2026-08-01T10:00:00.000Z';
    respostas = [
      { count: 3, error: null },
      { count: 3, error: null },
      {
        data: [
          { created_at: base, first_response_at: '2026-08-01T10:10:00.000Z' }, // 10 min
          { created_at: base, first_response_at: '2026-08-01T10:30:00.000Z' }, // 30 min
          { created_at: base, first_response_at: '2026-08-01T09:00:00.000Z' }, // negativo → fora
        ],
        error: null,
      },
    ];

    const kpis = await buscarKPIsGerais(TENANT, INICIO, FIM);
    expect(kpis.mediaTempoPrimeiraInteracao).toBe(20);
  });

  it('sem lead respondido a média é 0, não NaN', async () => {
    respostas = [
      { count: 0, error: null }, { count: 0, error: null }, { data: [], error: null },
    ];
    const kpis = await buscarKPIsGerais(TENANT, INICIO, FIM);
    expect(kpis.mediaTempoPrimeiraInteracao).toBe(0);
  });

  // Falha de leitura não pode virar KPI zerado — foi exatamente assim que o bug
  // original passou despercebido.
  it('propaga erro do banco em vez de devolver zeros', async () => {
    respostas = [
      { count: 10, error: null },
      { count: null as unknown as number, error: { code: '42703', message: 'column does not exist' } },
      { data: [], error: null },
    ];

    await expect(buscarKPIsGerais(TENANT, INICIO, FIM)).rejects.toMatchObject({ code: '42703' });
  });
});
