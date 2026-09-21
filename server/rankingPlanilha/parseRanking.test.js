/**
 * Interpretador do bloco "RANKING CORRETORES" da planilha de comissionamento.
 *
 * O fixture abaixo é recorte REAL da planilha (Comissionamento, aba do ranking,
 * lida em 21/09/2026), com as suas armadilhas preservadas:
 *   - a coluna "Vendas" de JANEIRO vem ANTES do mês; a dos outros meses, DEPOIS;
 *   - meses do fim do ano ainda não têm coluna "Vendas";
 *   - células com "#VALUE!" e "#REF!";
 *   - pessoas repetidas embaixo de "Saida" (quem saiu da casa);
 *   - nomes com acento e espaço sobrando.
 * Por isso as colunas são deduzidas do cabeçalho, nunca fixas.
 */
import { describe, it, expect } from 'vitest';
import { lerRankingCorretores } from './parseRanking.js';

// Grade como a API do Sheets devolve: linhas de células já separadas.
const CABECALHO_1 = ['RANKING CORRETORES', 'NÍVEL', 'EQUIPE', '', '', 'MÊS', '', '', '', '', '', '', '', '', '', '', '', 'TOTAL 1º Sem'];
const CABECALHO_2 = ['', '', '', '', 'Vendas', 'JANEIRO', 'FEVEREIRO', 'Vendas', 'MARÇO', 'Vendas', 'ABRIL', 'Vendas', 'MAIO', 'Vendas', 'JUNHO', 'Vendas', '', '', '', 'JULHO', 'Vendas', 'AGOSTO', 'Vendas', 'SETEMBRO', 'Vendas', 'OUTUBRO', 'NOVEMBRO'];

const FERNANDA = ['Fernanda Souza', 'Coordenador', 'Lançamentos', '', '1', 'R$ 9.544,15', 'R$ 0.00', '0', 'R$ 28,690.55', '2', 'R$ 22,107.88', '4', 'R$ 19,790.00', '3', 'R$ 9,000.00', '2', '', 'R$ 89,132.58', '', 'R$ 0.00', '0', 'R$ 10,000.00', '2'];
const REGINALDO = ['Reginaldo Barbosa ', 'Estagiário', 'Lançamentos', '', '0', 'R$ 0.00', 'R$ 0.00', '0', 'R$ 0.00', '0', 'R$ 0.00', '0', 'R$ 0.00', '0', 'R$ 0.00', '0', '', 'R$ 0.00', '', 'R$ 0.00', '0', 'R$ 0.00', '0'];
const MARIANA = ['Mariana Mamede', 'Coordenador', 'Terceiros', '', '0', '', '', '', '', '0', '0.00', '0', 'R$ 0,00', '0', 'R$ 0.00', '0', '', '', '', 'R$ 0.00', '0', 'R$ 0.00', '0', '', '', '', '', '', '', '', '', '', '#VALUE!'];
const VAZIA = ['', '', '', '', '', '', '', '', ''];
const TOTAL = ['TOTAL MENSAL', '', '', '', '', '#REF!', '#REF!'];
const SAIDA = ['Saida '];
const NATHALIA = ['Nathália Lobo', 'PL', 'Lançamentos', '', '0', 'R$ 0.00', 'R$ 9,498.22', '1', 'R$ 0.00', '0'];

const GRADE = [
  ['REPORT 2026'],
  CABECALHO_1,
  CABECALHO_2,
  FERNANDA,
  REGINALDO,
  MARIANA,
  VAZIA,
  TOTAL,
  SAIDA,
  NATHALIA,
  ['RANKING 2025 CORRETORES', 'NÍVEL', 'EQUIPE'],
];

const corretor = (resultado, nome) => resultado.corretores.find((c) => c.nome === nome);
const vendasDe = (resultado, nome) =>
  Object.fromEntries(corretor(resultado, nome).meses.map((m) => [m.mes, m.vendas]));

describe('lerRankingCorretores', () => {
  it('lê nome, nível e equipe de cada corretor do ranking', () => {
    const r = lerRankingCorretores(GRADE);

    expect(r.corretores.map((c) => c.nome)).toEqual(['Fernanda Souza', 'Reginaldo Barbosa', 'Mariana Mamede']);
    expect(corretor(r, 'Fernanda Souza')).toMatchObject({ nivel: 'Coordenador', equipe: 'Lançamentos' });
  });

  it('casa cada mês com a SUA coluna de vendas, mesmo com janeiro invertido', () => {
    const vendas = vendasDe(lerRankingCorretores(GRADE), 'Fernanda Souza');

    expect(vendas[1]).toBe(1);  // janeiro: contagem ANTES do mês
    expect(vendas[2]).toBe(0);  // fevereiro em diante: contagem DEPOIS
    expect(vendas[3]).toBe(2);
    expect(vendas[4]).toBe(4);
    expect(vendas[5]).toBe(3);
    expect(vendas[6]).toBe(2);
    expect(vendas[7]).toBe(0);
    expect(vendas[8]).toBe(2);
  });

  it('mês sem coluna de vendas na planilha fica sem número, não vira zero', () => {
    const vendas = vendasDe(lerRankingCorretores(GRADE), 'Fernanda Souza');

    // OUTUBRO e NOVEMBRO existem no cabeçalho, mas ainda sem coluna "Vendas".
    expect(vendas[10]).toBeNull();
    expect(vendas[11]).toBeNull();
    // DEZEMBRO nem aparece no cabeçalho deste recorte.
    expect(vendas[12]).toBeUndefined();
  });

  it('célula vazia ou com erro da planilha fica sem número, e vira aviso', () => {
    const r = lerRankingCorretores(GRADE);
    const vendas = vendasDe(r, 'Mariana Mamede');

    expect(vendas[2]).toBeNull(); // fevereiro: célula vazia na planilha
    expect(vendas[3]).toBe(0);    // março: a planilha escreve 0 de verdade
    expect(r.avisos.some((a) => a.includes('Mariana Mamede'))).toBe(true);
  });

  it('para no fim do bloco: não lê "TOTAL MENSAL", quem saiu, nem o ranking de 2025', () => {
    const nomes = lerRankingCorretores(GRADE).corretores.map((c) => c.nome);

    expect(nomes).not.toContain('TOTAL MENSAL');
    expect(nomes).not.toContain('Nathália Lobo');
    expect(nomes.some((n) => n.startsWith('RANKING'))).toBe(false);
  });

  it('planilha sem o bloco do ranking devolve vazio com aviso, em vez de quebrar', () => {
    const r = lerRankingCorretores([['REPORT 2026'], ['Empreendimento', 'Quadra']]);

    expect(r.corretores).toEqual([]);
    expect(r.avisos.join(' ')).toMatch(/RANKING CORRETORES/);
  });
});
