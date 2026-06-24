import { describe, it, expect } from 'vitest';
import { validarUrl16Personalities, derivarDimensoesMBTI } from './16personalitiesMapper';

// A validação precisa garantir DOIS níveis: o formato da URL E que as 4 letras
// formem um dos 16 tipos reais. Antes, a regex aceitava qualquer 4 letras (ex.:
// "xxxx-a"), salvando um mbti_tipo inválido que ia parar no Agente Comportamental.
describe('validarUrl16Personalities', () => {
  it('aceita URLs de tipos reais (profiles/EN e resultados/PT)', () => {
    expect(validarUrl16Personalities('https://www.16personalities.com/profiles/enfj-a/m/abc1234')).toBe(true);
    expect(validarUrl16Personalities('https://www.16personalities.com/br/resultados/intj-t/f/7mzp9qk3w')).toBe(true);
  });

  it('é case-insensitive no tipo', () => {
    expect(validarUrl16Personalities('https://www.16personalities.com/profiles/ESFP-T/m/AbC123')).toBe(true);
  });

  it('rejeita tipo com formato válido mas inexistente (regex antiga deixava passar)', () => {
    expect(validarUrl16Personalities('https://www.16personalities.com/profiles/xxxx-a/m/abc123')).toBe(false);
    expect(validarUrl16Personalities('https://www.16personalities.com/profiles/abcd-a/m/x1')).toBe(false);
  });

  it('rejeita identidade inválida (só -A ou -T)', () => {
    expect(validarUrl16Personalities('https://www.16personalities.com/profiles/intj-x/m/abc')).toBe(false);
  });

  it('rejeita domínio/estrutura fora do padrão', () => {
    expect(validarUrl16Personalities('https://google.com/foo')).toBe(false);
    expect(validarUrl16Personalities('https://www.16personalities.com/profiles/intj-a/m/')).toBe(false);
  });
});

// A letra/lado de cada dimensão DEVE vir do código do tipo, não do percentual.
// Antes, a UI derivava o lado por "percentual >= 50", e o estimador grava 55%
// para a 1ª letra (I/S/T/J) — então um INTJ salvo reabria mostrando E/N/F/P.
describe('derivarDimensoesMBTI', () => {
  it('deriva letras coerentes com o tipo, mesmo com percentuais "55 na 1ª letra"', () => {
    // Percentuais como o estimador grava para INTJ-A: 55 nas 4 primeiras letras.
    const dims = derivarDimensoesMBTI('INTJ-A', { mind: 55, energy: 45, nature: 55, tactics: 55, identity: 60 });
    expect(dims.energia.letra).toBe('I');
    expect(dims.mente.letra).toBe('N');
    expect(dims.natureza.letra).toBe('T');
    expect(dims.abordagem.letra).toBe('J');
    expect(dims.identidade.letra).toBe('A');
    // o percentual permanece como magnitude
    expect(dims.energia.percentual).toBe(55);
  });

  it('cobre o tipo oposto (ESFP-T)', () => {
    const dims = derivarDimensoesMBTI('ESFP-T', { mind: 55, energy: 55, nature: 55, tactics: 55, identity: 55 });
    expect(dims.energia.letra).toBe('E');
    expect(dims.mente.letra).toBe('S');
    expect(dims.natureza.letra).toBe('F');
    expect(dims.abordagem.letra).toBe('P');
    expect(dims.identidade.letra).toBe('T');
    expect(dims.identidade.lado).toBe('Turbulento');
  });

  it('identidade A vs T usa o sufixo, não o percentual', () => {
    expect(derivarDimensoesMBTI('INTJ-A', { identity: 10 }).identidade.letra).toBe('A');
    expect(derivarDimensoesMBTI('INTJ-T', { identity: 90 }).identidade.letra).toBe('T');
  });

  it('percentual ausente cai para 50 (magnitude neutra), sem afetar a letra', () => {
    const dims = derivarDimensoesMBTI('ENFP-A', {});
    expect(dims.energia.letra).toBe('E');
    expect(dims.energia.percentual).toBe(50);
  });
});
