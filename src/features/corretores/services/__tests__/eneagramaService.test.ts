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
