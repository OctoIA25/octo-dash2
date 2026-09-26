/**
 * Job que traz o ranking da planilha para a Dash.
 *
 * O que importa aqui: o que é gravado (uma linha por corretor e mês, só com
 * número lido de verdade), quem fica sem dono (nome não reconhecido não some)
 * e o fato de o job não apagar o que já existe quando a planilha falha.
 */
import { describe, it, expect, vi } from 'vitest';
import { makeRankingPlanilhaRunner } from './index.js';

const TENANT = '65c69875-dc83-4062-90f6-6f6adc30df26';

const GRADE = [
  ['RANKING CORRETORES', 'NÍVEL', 'EQUIPE', '', '', 'MÊS'],
  ['', '', '', '', 'Vendas', 'JANEIRO', 'FEVEREIRO', 'Vendas', 'MARÇO', 'Vendas'],
  ['Flavia Ceolin', 'Pleno', 'Lançamentos', '', '2', 'R$ 1,00', 'R$ 0.00', '0', 'R$ 9,00', '3'],
  ['Mariana Mamede', 'Coordenador', 'Terceiros', '', '1', 'R$ 2,00', '', '', 'R$ 0.00', '0'],
];

const env = (extra = {}) => ({
  RANKING_PLANILHA_SHEET_ID: 'SHEET1',
  RANKING_PLANILHA_TENANT_ID: TENANT,
  RANKING_PLANILHA_TAB: 'REPORT 2026',
  RANKING_PLANILHA_ANO: '2026',
  GOOGLE_SA_EMAIL: 'sa@x.iam.gserviceaccount.com',
  GOOGLE_SA_PRIVATE_KEY_B64: Buffer.from('chave-fake').toString('base64'),
  ...extra,
});

/** Supabase falsificado: devolve os membros e guarda o upsert. */
function supabaseFalso(membros = [{ id: 'u2', full_name: 'Flávia Ceolin' }]) {
  const state = { upsert: null, conflito: null };
  return {
    state,
    from(tabela) {
      if (tabela === 'user_profiles') {
        return { select: () => ({ eq: async () => ({ data: membros, error: null }) }) };
      }
      return {
        upsert: (linhas, opcoes) => {
          state.upsert = linhas;
          state.conflito = opcoes?.onConflict ?? null;
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

const sheetsFalso = (grade = GRADE) => ({ readTab: vi.fn(async () => grade) });

describe('makeRankingPlanilhaRunner', () => {
  it('grava uma linha por corretor e mês, só com número lido da planilha', async () => {
    const supabase = supabaseFalso();
    const run = makeRankingPlanilhaRunner(supabase, env(), { sheets: sheetsFalso() });

    const r = await run();

    expect(supabase.state.conflito).toBe('tenant_id,ano,mes,nome_planilha');
    const flavia = supabase.state.upsert.filter((l) => l.nome_planilha === 'Flavia Ceolin');
    expect(flavia.map((l) => [l.mes, l.vendas])).toEqual([[1, 2], [2, 0], [3, 3]]);
    expect(flavia.every((l) => l.tenant_id === TENANT && l.ano === 2026)).toBe(true);
    // Fevereiro da Mariana veio vazio na planilha: não vira linha nem zero.
    const mariana = supabase.state.upsert.filter((l) => l.nome_planilha === 'Mariana Mamede');
    expect(mariana.map((l) => l.mes)).toEqual([1, 3]);
    expect(r.linhas).toBe(5);
  });

  it('casa o corretor cadastrado e deixa o não reconhecido visível, sem dono', async () => {
    const supabase = supabaseFalso();
    const run = makeRankingPlanilhaRunner(supabase, env(), { sheets: sheetsFalso() });

    const r = await run();

    expect(supabase.state.upsert.find((l) => l.nome_planilha === 'Flavia Ceolin').user_id).toBe('u2');
    expect(supabase.state.upsert.find((l) => l.nome_planilha === 'Mariana Mamede').user_id).toBeNull();
    expect(r.naoReconhecidos).toEqual(['Mariana Mamede']);
  });

  it('planilha fora do ar não apaga o que já está gravado', async () => {
    const supabase = supabaseFalso();
    const sheets = { readTab: vi.fn(async () => { throw new Error('403 sem acesso à planilha'); }) };
    const run = makeRankingPlanilhaRunner(supabase, env(), { sheets });

    await expect(run()).rejects.toThrow(/sem acesso/);
    expect(supabase.state.upsert).toBeNull();
  });

  it('sem as variáveis de ambiente, avisa na hora de montar o job', () => {
    expect(() => makeRankingPlanilhaRunner(supabaseFalso(), { GOOGLE_SA_EMAIL: 'x' }))
      .toThrow(/RANKING_PLANILHA_SHEET_ID/);
  });
});
