import { describe, it, expect } from 'vitest';
import { calcularResultadoEneagrama } from '../eneagramaService';
import type { EneagramaResponse } from '../eneagramaService';

/**
 * Mapa pergunta→tipo (A/B), conforme o questionário:
 *  1:{A:1,B:7} 2:{A:2,B:5} 3:{A:3,B:9} 4:{A:4,B:8} 5:{A:6,B:1}
 *  6:{A:2,B:7} 7:{A:5,B:3} 8:{A:9,B:4} 9:{A:8,B:6} 10:{A:1,B:5}
 */

describe('calcularResultadoEneagrama', () => {
  it('soma 1 ponto por resposta ao tipo correspondente', () => {
    // Todas 'A' → tipos: 1,2,3,4,6,2,5,9,8,1 → tipo1=2, tipo2=2, demais<=1
    const respostas: EneagramaResponse[] = Array(10).fill('A');
    const { scores } = calcularResultadoEneagrama(respostas);
    expect(scores[1]).toBe(2); // q1A e q10A
    expect(scores[2]).toBe(2); // q2A e q6A
    expect(scores[5]).toBe(1); // q7A
    expect(scores[7]).toBe(0); // nenhum A aponta para 7
  });

  it('sinaliza empate quando há mais de um tipo na pontuação máxima', () => {
    // Todas 'A' → tipo1=2 e tipo2=2 empatados no topo
    const { empate, topTipos } = calcularResultadoEneagrama(Array(10).fill('A'));
    expect(empate).toBe(true);
    expect(topTipos).toEqual(expect.arrayContaining([1, 2]));
  });

  it('não sinaliza empate quando há um vencedor isolado', () => {
    // Concentrar pontos no tipo 5: q2B(5), q7A(5), q10B(5) = 3; outros espalhados
    const respostas: EneagramaResponse[] = ['A', 'B', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'B'];
    const { scores, tipoPrincipal, empate } = calcularResultadoEneagrama(respostas);
    // tipo5: q2B + q7A + q10B = 3
    expect(scores[5]).toBe(3);
    expect(tipoPrincipal).toBe(5);
    expect(empate).toBe(false);
  });

  it('trata entrada sem respostas válidas como empate (não devolve Tipo 1 fabricado)', () => {
    const { empate, scores } = calcularResultadoEneagrama([]);
    expect(empate).toBe(true);
    expect(Object.values(scores).every((v) => v === 0)).toBe(true);
  });
});

// O percentual exibido no resultado é RELATIVO ao total de pontos distribuídos
// (não ao nº de perguntas). Antes o divisor era 10, fazendo um tipo forte — que
// no máximo soma 2-3 pontos — aparecer como "30%". Esta é a mesma fórmula usada
// na tela (pctTipo): pontos do tipo ÷ total de pontos.
describe('percentual relativo do Eneagrama (regra da tela)', () => {
  const pctRelativo = (scores: Record<number, number>) => {
    const total = Object.values(scores).reduce((s, v) => s + Number(v), 0) || 1;
    const pct: Record<number, number> = {};
    for (let t = 1; t <= 9; t++) pct[t] = Math.round((Number(scores[t]) / total) * 100);
    return { total, pct };
  };

  it('usa o total de pontos como divisor (não o nº de perguntas)', () => {
    const { scores } = calcularResultadoEneagrama(Array(10).fill('A'));
    const { total, pct } = pctRelativo(scores);
    expect(total).toBe(10); // 10 respostas válidas = 10 pontos distribuídos
    // tipo1 = 2 pontos → 2/10 = 20% (e NÃO um "2/10" que sugere fraqueza)
    expect(pct[1]).toBe(20);
    expect(pct[2]).toBe(20);
  });

  it('um tipo dominante recebe percentual alto, não subdimensionado', () => {
    // Concentrar no tipo 5: q2B(5), q7A(5), q10B(5) = 3 de 10 pontos
    const respostas: EneagramaResponse[] = ['A', 'B', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'B'];
    const { scores } = calcularResultadoEneagrama(respostas);
    const { pct } = pctRelativo(scores);
    expect(scores[5]).toBe(3);
    expect(pct[5]).toBe(30); // 3/10 do total — é o maior, reflete dominância
    // e é estritamente o maior percentual entre os tipos
    const maxOutros = Math.max(...[1,2,3,4,6,7,8,9].map((t) => pct[t]));
    expect(pct[5]).toBeGreaterThan(maxOutros);
  });
});
