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

import { buscarKPIsGerais } from './relatoriosService';

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';
const filtroDe = (q: Query, col: string) => q.filters.find((f) => f.col === col);

/** Ordem das leituras em buscarKPIsGerais. */
const RECEBIDOS = 0;
const INTERAGIDOS = 1;
const CONVERTIDOS = 2;
const ULTIMOS30 = 3;
const AMOSTRA = 4;

beforeEach(() => {
  queries.length = 0;
  respostas = [];
});

describe('buscarKPIsGerais', () => {
  it('não consulta coluna que não existe na tabela', async () => {
    await buscarKPIsGerais(TENANT);

    const tudo = JSON.stringify(queries);
    expect(tudo).not.toContain('etapa_atual');
    expect(tudo).not.toContain('first_interaction_at');
  });

  it('conta no banco em vez de baixar linhas e usar .length', async () => {
    await buscarKPIsGerais(TENANT);

    for (const i of [RECEBIDOS, INTERAGIDOS, CONVERTIDOS, ULTIMOS30]) {
      expect(queries[i].opts).toEqual({ count: 'exact', head: true });
    }
    // A única leitura que traz linha é a amostra do tempo de resposta, e ela é limitada.
    expect(queries[AMOSTRA].opts).toBeNull();
    expect(queries[AMOSTRA].limit).toBe(1000);
  });

  it('escopa toda leitura pelo tenant', async () => {
    await buscarKPIsGerais(TENANT);
    for (const q of queries) {
      expect(filtroDe(q, 'tenant_id')).toEqual({ op: 'eq', col: 'tenant_id', val: TENANT });
    }
  });

  it('"interagido" é lead com first_response_at preenchido', async () => {
    await buscarKPIsGerais(TENANT);
    expect(filtroDe(queries[INTERAGIDOS], 'first_response_at')).toMatchObject({ op: 'not.is', val: null });
  });

  it('"convertido" é venda com valor fechado (final_sale_value > 0)', async () => {
    await buscarKPIsGerais(TENANT);
    expect(filtroDe(queries[CONVERTIDOS], 'final_sale_value')).toEqual({
      op: 'gt', col: 'final_sale_value', val: 0,
    });
  });

  it('devolve as contagens do banco, não 1000 truncado', async () => {
    respostas = [
      { count: 1685, error: null },
      { count: 13, error: null },
      { count: 14, error: null },
      { count: 1442, error: null },
      { data: [], error: null },
    ];

    const kpis = await buscarKPIsGerais(TENANT);

    expect(kpis.totalLeadsRecebidos).toBe(1685);
    expect(kpis.totalLeadsInteragidos).toBe(13);
    expect(kpis.totalLeadsConvertidos).toBe(14);
    expect(kpis.mediaInteracaoDia).toBe(Math.round(1442 / 30));
  });

  it('média de primeira resposta em minutos, ignorando diferença não positiva', async () => {
    const base = '2026-08-01T10:00:00.000Z';
    respostas = [
      { count: 3, error: null },
      { count: 3, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      {
        data: [
          { created_at: base, first_response_at: '2026-08-01T10:10:00.000Z' }, // 10 min
          { created_at: base, first_response_at: '2026-08-01T10:30:00.000Z' }, // 30 min
          { created_at: base, first_response_at: '2026-08-01T09:00:00.000Z' }, // negativo → fora
        ],
        error: null,
      },
    ];

    const kpis = await buscarKPIsGerais(TENANT);
    expect(kpis.mediaTempoPrimeiraInteracao).toBe(20);
  });

  it('sem lead respondido a média é 0, não NaN', async () => {
    respostas = [
      { count: 0, error: null }, { count: 0, error: null }, { count: 0, error: null },
      { count: 0, error: null }, { data: [], error: null },
    ];
    const kpis = await buscarKPIsGerais(TENANT);
    expect(kpis.mediaTempoPrimeiraInteracao).toBe(0);
  });

  // Falha de leitura não pode virar KPI zerado — foi exatamente assim que o bug
  // original passou despercebido.
  it('propaga erro do banco em vez de devolver zeros', async () => {
    respostas = [
      { count: 10, error: null },
      { count: null as unknown as number, error: { code: '42703', message: 'column does not exist' } },
      { count: 0, error: null }, { count: 0, error: null }, { data: [], error: null },
    ];

    await expect(buscarKPIsGerais(TENANT)).rejects.toMatchObject({ code: '42703' });
  });
});
