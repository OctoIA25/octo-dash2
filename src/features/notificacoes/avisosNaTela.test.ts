import { describe, it, expect, afterEach, vi } from 'vitest';
import { CHAVE_AVISOS_NA_TELA, avisosNaTelaLigados, definirAvisosNaTela } from './avisosNaTela';

describe('avisos na tela', () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('começa ligado', () => {
    expect(avisosNaTelaLigados()).toBe(true);
  });

  it('desliga e religa, e guarda "0"/"1"', () => {
    definirAvisosNaTela(false);
    expect(localStorage.getItem(CHAVE_AVISOS_NA_TELA)).toBe('0');
    expect(avisosNaTelaLigados()).toBe(false);
    definirAvisosNaTela(true);
    expect(avisosNaTelaLigados()).toBe(true);
  });

  it('navegador que recusa o armazenamento: fica ligado e não quebra', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    expect(avisosNaTelaLigados()).toBe(true);
    expect(() => definirAvisosNaTela(false)).not.toThrow();
  });
});
