import { describe, it, expect } from 'vitest';
import { ENEAGRAMA_QUESTIONS, ENEAGRAMA_MAPPING, AFIRMACOES } from '../eneagramaQuestions';

const TIPOS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

describe('item bank do Eneagrama', () => {
  it('tem os 36 pares possíveis entre 9 tipos', () => {
    expect(ENEAGRAMA_QUESTIONS).toHaveLength(36);
  });

  it('cada par de tipos aparece exatamente uma vez', () => {
    const vistos = ENEAGRAMA_QUESTIONS.map((q) => [q.tipoA, q.tipoB].sort((a, b) => a - b).join('-'));
    expect(new Set(vistos).size).toBe(36);
  });

  it('nenhuma pergunta opõe um tipo a ele mesmo', () => {
    expect(ENEAGRAMA_QUESTIONS.every((q) => q.tipoA !== q.tipoB)).toBe(true);
  });

  it('cada tipo aparece exatamente 8 vezes — nenhum tem teto maior', () => {
    // Invariante que o questionário antigo violava: tipos 1 e 5 podiam chegar a
    // 3 pontos e os demais a 2, e por isso o Tipo 1 saía em 46,9% das respostas
    // possíveis contra 0,2% do Tipo 9.
    const exposicao = Object.fromEntries(TIPOS.map((t) => [t, 0])) as Record<number, number>;
    for (const q of ENEAGRAMA_QUESTIONS) {
      exposicao[q.tipoA]++;
      exposicao[q.tipoB]++;
    }
    expect(Object.values(exposicao)).toEqual(TIPOS.map(() => 8));
  });

  it('nenhum tipo fica preso a um lado da tela', () => {
    // posição influencia escolha; nenhum tipo pode cair sempre como opção A
    for (const t of TIPOS) {
      const comoA = ENEAGRAMA_QUESTIONS.filter((q) => q.tipoA === t).length;
      expect(comoA).toBeGreaterThan(0);
      expect(comoA).toBeLessThan(8);
    }
  });

  it('numeração é sequencial de 1 a 36', () => {
    expect(ENEAGRAMA_QUESTIONS.map((q) => q.numero)).toEqual(
      Array.from({ length: 36 }, (_, i) => i + 1),
    );
  });

  it('toda pergunta tem as duas afirmações preenchidas e distintas', () => {
    for (const q of ENEAGRAMA_QUESTIONS) {
      expect(q.opcaoA.trim().length).toBeGreaterThan(0);
      expect(q.opcaoB.trim().length).toBeGreaterThan(0);
      expect(q.opcaoA).not.toBe(q.opcaoB);
    }
  });

  it('a afirmação de cada lado pertence ao tipo daquele lado', () => {
    // Trocar os lados é fácil de introduzir e silencioso: a pessoa escolheria a
    // frase do tipo X e pontuaria o tipo Y. Conferimos contra AFIRMACOES, a
    // fonte — comparar as perguntas consigo mesmas não falharia nunca.
    for (const q of ENEAGRAMA_QUESTIONS) {
      expect(AFIRMACOES[q.tipoA]).toContain(q.opcaoA);
      expect(AFIRMACOES[q.tipoB]).toContain(q.opcaoB);
    }
  });

  it('cada afirmação do banco é usada, e nenhuma é usada demais', () => {
    // 8 aparições por tipo sobre 4 frases = cada frase exatamente 2 vezes
    const usos = new Map<string, number>();
    for (const q of ENEAGRAMA_QUESTIONS) {
      usos.set(q.opcaoA, (usos.get(q.opcaoA) ?? 0) + 1);
      usos.set(q.opcaoB, (usos.get(q.opcaoB) ?? 0) + 1);
    }
    const todas = TIPOS.flatMap((t) => AFIRMACOES[t]);
    expect(usos.size).toBe(todas.length);
    for (const frase of todas) expect(usos.get(frase)).toBe(2);
  });

  it('ENEAGRAMA_MAPPING deriva das perguntas, sem cópia manual', () => {
    for (const q of ENEAGRAMA_QUESTIONS) {
      expect(ENEAGRAMA_MAPPING[q.numero]).toEqual({ A: q.tipoA, B: q.tipoB });
    }
  });
});
