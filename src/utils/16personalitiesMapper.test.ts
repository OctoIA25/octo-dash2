import { describe, it, expect } from 'vitest';
import { validarUrl16Personalities } from './16personalitiesMapper';

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
