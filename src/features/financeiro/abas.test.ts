import { describe, it, expect } from 'vitest';
import { ABAS_DO_FINANCEIRO, abaDoEndereco, rotaDaAba } from './abas';

describe('a aba do Financeiro vem do endereço', () => {
  it('cada aba tem o seu endereço, e o endereço volta para ela', () => {
    for (const { id } of ABAS_DO_FINANCEIRO) {
      const tab = new URL(rotaDaAba(id), 'http://x').searchParams.get('tab');
      expect(abaDoEndereco(tab)).toBe(id);
    }
  });

  it('sem aba, ou com uma que não existe, abre "A receber"', () => {
    expect(abaDoEndereco(null)).toBe('receber');
    expect(abaDoEndereco('qualquer')).toBe('receber');
  });
});
