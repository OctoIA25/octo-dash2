import { describe, it, expect } from 'vitest';
import { DIMENSOES, poloAtivo } from '../mbtiDimensoes';

const byKey = (k: string) => DIMENSOES.find((d) => d.chave === k)!;

describe('poloAtivo', () => {
  it('resolve as 4 letras base de INTJ-A', () => {
    expect(poloAtivo(byKey('energia'), 'INTJ-A').letra).toBe('I');
    expect(poloAtivo(byKey('mente'), 'INTJ-A').letra).toBe('N');
    expect(poloAtivo(byKey('natureza'), 'INTJ-A').letra).toBe('T');
    expect(poloAtivo(byKey('abordagem'), 'INTJ-A').letra).toBe('J');
  });

  it('Identidade vem do sufixo, sem confundir com o T de Nature', () => {
    // INTJ-A tem T em Nature, mas a Identidade é Assertivo (A)
    expect(poloAtivo(byKey('identidade'), 'INTJ-A').letra).toBe('A');
    expect(poloAtivo(byKey('identidade'), 'ENFP-T').letra).toBe('T');
  });

  it('resolve o lado oposto em ENFP', () => {
    expect(poloAtivo(byKey('energia'), 'ENFP-T').letra).toBe('E');
    expect(poloAtivo(byKey('mente'), 'ENFP-T').letra).toBe('N');
    expect(poloAtivo(byKey('natureza'), 'ENFP-T').letra).toBe('F');
    expect(poloAtivo(byKey('abordagem'), 'ENFP-T').letra).toBe('P');
  });
});
