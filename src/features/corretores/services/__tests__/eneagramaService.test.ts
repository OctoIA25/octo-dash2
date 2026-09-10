import { describe, it, expect } from 'vitest';
import { calcularResultadoEneagrama } from '../eneagramaService';
import type { EneagramaResponse } from '../eneagramaService';
import { ENEAGRAMA_QUESTIONS, ENEAGRAMA_MAPPING } from '@/data/eneagramaQuestions';

const TIPOS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const TOTAL = ENEAGRAMA_QUESTIONS.length; // 36

/** Responde de forma a favorecer `alvo` sempre que ele aparece no par. */
function respostasFavorecendo(alvo: number): EneagramaResponse[] {
  return ENEAGRAMA_QUESTIONS.map((q) => (q.tipoB === alvo ? 'B' : 'A'));
}

describe('calcularResultadoEneagrama', () => {
  it('soma 1 ponto por resposta ao tipo daquele lado', () => {
    const respostas: EneagramaResponse[] = Array(TOTAL).fill('A');
    const { scores } = calcularResultadoEneagrama(respostas);
    const esperado: Record<number, number> = Object.fromEntries(TIPOS.map((t) => [t, 0]));
    for (let q = 1; q <= TOTAL; q++) esperado[ENEAGRAMA_MAPPING[q].A]++;
    for (const t of TIPOS) expect(scores[t]).toBe(esperado[t]);
  });

  it('distribui exatamente 1 ponto por pergunta, sempre', () => {
    const total = (r: EneagramaResponse[]) =>
      Object.values(calcularResultadoEneagrama(r).scores).reduce((s, v) => s + Number(v), 0);
    expect(total(Array(TOTAL).fill('A'))).toBe(TOTAL);
    expect(total(Array(TOTAL).fill('B'))).toBe(TOTAL);
    expect(total(respostasFavorecendo(7))).toBe(TOTAL);
  });

  it('quem favorece um tipo em todos os pares dele vence isolado, sem empate', () => {
    // Teto de qualquer tipo é 8 (aparece em 8 dos 36 pares) — igual para todos.
    for (const alvo of TIPOS) {
      const { scores, tipoPrincipal, empate } = calcularResultadoEneagrama(respostasFavorecendo(alvo));
      expect(scores[alvo]).toBe(8);
      expect(tipoPrincipal).toBe(alvo);
      expect(empate).toBe(false);
    }
  });

  it('nenhum tipo tem teto maior que outro', () => {
    // O bug do questionário antigo: tipos 1 e 5 chegavam a 3 e o resto a 2.
    const tetos = TIPOS.map((t) => calcularResultadoEneagrama(respostasFavorecendo(t)).scores[t]);
    expect(new Set(tetos).size).toBe(1);
  });

  it('sinaliza empate em vez de premiar o menor índice', () => {
    // Empate construído: o tipo 1 vence todos os seus pares menos contra o 3, e o
    // tipo 2 vence todos os seus menos contra o 1 — os dois terminam com 7.
    const respostas: EneagramaResponse[] = ENEAGRAMA_QUESTIONS.map((q) => {
      const par = [q.tipoA, q.tipoB];
      const paraTipo = (t: number): EneagramaResponse => (q.tipoA === t ? 'A' : 'B');
      if (par.includes(1) && par.includes(3)) return paraTipo(3);
      if (par.includes(1)) return paraTipo(1);
      if (par.includes(2)) return paraTipo(2);
      return 'A';
    });

    const { scores, empate, topTipos } = calcularResultadoEneagrama(respostas);
    expect(scores[1]).toBe(7);
    expect(scores[2]).toBe(7);
    expect(empate).toBe(true);
    expect(topTipos).toEqual(expect.arrayContaining([1, 2]));
    // o antigo comportamento era devolver 1 calado; agora quem escolhe é a tela
    expect(topTipos.length).toBeGreaterThan(1);
  });

  it('trata entrada sem respostas válidas como empate (não devolve Tipo 1 fabricado)', () => {
    const { empate, scores } = calcularResultadoEneagrama([]);
    expect(empate).toBe(true);
    expect(Object.values(scores).every((v) => v === 0)).toBe(true);
  });
});

// O percentual exibido é RELATIVO ao total de pontos distribuídos, não ao nº de
// perguntas — a soma dos 9 dá 100%.
describe('percentual relativo do Eneagrama (regra da tela)', () => {
  const pctRelativo = (scores: Record<number, number>) => {
    const total = Object.values(scores).reduce((s, v) => s + Number(v), 0) || 1;
    const pct: Record<number, number> = {};
    for (const t of TIPOS) pct[t] = Math.round((Number(scores[t]) / total) * 100);
    return { total, pct };
  };

  it('usa o total de pontos como divisor (não o nº de perguntas)', () => {
    const { scores } = calcularResultadoEneagrama(Array(TOTAL).fill('A'));
    const { total } = pctRelativo(scores);
    expect(total).toBe(TOTAL);
  });

  it('um tipo dominante recebe o maior percentual', () => {
    const { scores } = calcularResultadoEneagrama(respostasFavorecendo(5));
    const { pct } = pctRelativo(scores);
    expect(pct[5]).toBe(Math.round((8 / TOTAL) * 100)); // 8 de 36 → 22%
    const maxOutros = Math.max(...TIPOS.filter((t) => t !== 5).map((t) => pct[t]));
    expect(pct[5]).toBeGreaterThan(maxOutros);
  });
});
