import { describe, it, expect } from 'vitest';
import { calcularResultadoDISC, validarResposta } from '../discTestService';
import type { DISCResponse } from '../discTestService';

/**
 * Semântica da UI (TesteDISC.tsx): a escala de cada palavra vai de
 * 1 = "Pouco" até 4 = "Muito". Ou seja, quanto MAIOR a nota, MAIS a
 * pessoa se identifica com aquela característica.
 *
 * O cálculo precisa respeitar essa direção: nota 4 deve gerar MAIS
 * pontos para o perfil do que a nota 1.
 */

/** Gera 10 respostas idênticas marcando "Muito" (4) no perfil-alvo e "Pouco" (1) nos demais. */
function perfilPuro(alvo: keyof DISCResponse): DISCResponse[] {
  const base: DISCResponse = { D: 1, I: 1, S: 1, C: 1 };
  return Array.from({ length: 10 }, () => ({ ...base, [alvo]: 4 }));
}

describe('calcularResultadoDISC', () => {
  it('retorna como dominante o perfil em que o usuário marcou "Muito" (4)', () => {
    (['D', 'I', 'S', 'C'] as const).forEach((alvo) => {
      const { dominantes } = calcularResultadoDISC(perfilPuro(alvo));
      expect(dominantes[0].perfil).toBe(alvo);
    });
  });

  it('dá ao perfil-alvo o maior percentual quando ele recebe a nota máxima', () => {
    const { resultado } = calcularResultadoDISC(perfilPuro('D'));
    expect(resultado.D).toBeGreaterThan(resultado.I);
    expect(resultado.D).toBeGreaterThan(resultado.S);
    expect(resultado.D).toBeGreaterThan(resultado.C);
  });

  it('garante que os percentuais sempre somam 100% (1.0)', () => {
    const respostas = perfilPuro('S');
    const { resultado } = calcularResultadoDISC(respostas);
    const soma = resultado.D + resultado.I + resultado.S + resultado.C;
    expect(soma).toBeCloseTo(1, 10);
  });

  it('preserva a ordem do perfil misto: maior nota → maior percentual', () => {
    // Pessoa D+I forte, baixa S/C. Na UI ela marca D=4, I=4, S=2, C=1.
    const misto: DISCResponse[] = Array.from({ length: 10 }, () => ({ D: 4, I: 4, S: 2, C: 1 }));
    const { resultado, dominantes } = calcularResultadoDISC(misto);

    expect(resultado.D).toBeGreaterThan(resultado.S);
    expect(resultado.I).toBeGreaterThan(resultado.S);
    expect(resultado.S).toBeGreaterThan(resultado.C);
    // Os dois primeiros dominantes devem ser D e I (em qualquer ordem entre si).
    expect([dominantes[0].perfil, dominantes[1].perfil].sort()).toEqual(['D', 'I']);
  });

  it('trata empate total (todas as notas iguais) como 25% para cada perfil', () => {
    const empate: DISCResponse[] = Array.from({ length: 10 }, () => ({ D: 3, I: 3, S: 3, C: 3 }));
    const { resultado, dominantes } = calcularResultadoDISC(empate);

    expect(resultado.D).toBeCloseTo(0.25, 10);
    expect(resultado.I).toBeCloseTo(0.25, 10);
    expect(resultado.S).toBeCloseTo(0.25, 10);
    expect(resultado.C).toBeCloseTo(0.25, 10);
    expect(dominantes).toHaveLength(4);
  });

  it('não quebra com lista de respostas vazia (divisor protegido)', () => {
    const { resultado, dominantes } = calcularResultadoDISC([]);
    expect(resultado).toEqual({ D: 0, I: 0, S: 0, C: 0 });
    expect(dominantes).toHaveLength(0);
  });
});

describe('validarResposta', () => {
  it('aceita notas entre 1 e 4, inclusive repetidas', () => {
    expect(validarResposta({ D: 4, I: 4, S: 2, C: 1 })).toBe(true);
    expect(validarResposta({ D: 1, I: 2, S: 3, C: 4 })).toBe(true);
  });

  it('rejeita quando algum valor está fora do intervalo 1-4', () => {
    expect(validarResposta({ D: 0, I: 2, S: 3, C: 4 })).toBe(false);
    expect(validarResposta({ D: 5, I: 2, S: 3, C: 4 })).toBe(false);
  });
});
