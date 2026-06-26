import { describe, it, expect } from 'vitest';
import { DIMENSOES, poloAtivo } from '../mbtiDimensoes';

const byKey = (k: string) => DIMENSOES.find((d) => d.chave === k)!;

describe('poloAtivo', () => {
  it('resolve as 4 letras base de INTJ-A', () => {
    expect(poloAtivo(byKey('Energy'), 'INTJ-A', 0).letra).toBe('I');
    expect(poloAtivo(byKey('Mind'), 'INTJ-A', 0).letra).toBe('N');
    expect(poloAtivo(byKey('Nature'), 'INTJ-A', 0).letra).toBe('T');
    expect(poloAtivo(byKey('Tactics'), 'INTJ-A', 0).letra).toBe('J');
  });

  it('Identidade vem do sufixo, sem confundir com o T de Nature', () => {
    // INTJ-A tem T em Nature, mas a Identidade é Assertivo (A)
    expect(poloAtivo(byKey('Identity'), 'INTJ-A', 0).letra).toBe('A');
    expect(poloAtivo(byKey('Identity'), 'ENFP-T', 0).letra).toBe('T');
  });

  it('resolve o lado oposto em ENFP', () => {
    expect(poloAtivo(byKey('Energy'), 'ENFP-T', 0).letra).toBe('E');
    expect(poloAtivo(byKey('Mind'), 'ENFP-T', 0).letra).toBe('N');
    expect(poloAtivo(byKey('Nature'), 'ENFP-T', 0).letra).toBe('F');
    expect(poloAtivo(byKey('Tactics'), 'ENFP-T', 0).letra).toBe('P');
  });
});
