import { describe, it, expect } from 'vitest';
import { pickRate, toBrl } from './exchange.js';

// Linhas no shape de exchange_rates: { pair, rate, effective_from }.
const rates = [
  { pair: 'USD/BRL', rate: 5.0, effective_from: '2026-01-01T00:00:00Z' },
  { pair: 'USD/BRL', rate: 5.4, effective_from: '2026-06-01T00:00:00Z' },
  { pair: 'USD/BRL', rate: 5.2, effective_from: '2026-03-01T00:00:00Z' },
];

describe('pickRate — taxa vigente na data (histórico preservado)', () => {
  it('escolhe a taxa mais recente com effective_from <= data de referência', () => {
    expect(pickRate(rates, new Date('2026-07-15T00:00:00Z'))).toBe(5.4);
    expect(pickRate(rates, new Date('2026-04-15T00:00:00Z'))).toBe(5.2);
    expect(pickRate(rates, new Date('2026-02-15T00:00:00Z'))).toBe(5.0);
  });

  it('data anterior a qualquer taxa → null (não inventa câmbio)', () => {
    expect(pickRate(rates, new Date('2025-12-01T00:00:00Z'))).toBeNull();
  });

  it('lista vazia → null', () => {
    expect(pickRate([], new Date('2026-07-15T00:00:00Z'))).toBeNull();
  });

  it('exatamente no instante de vigência já aplica a nova taxa', () => {
    expect(pickRate(rates, new Date('2026-06-01T00:00:00Z'))).toBe(5.4);
  });
});

describe('toBrl — conversão preservando o USD (auditoria)', () => {
  it('devolve usd, rate e brl juntos', () => {
    expect(toBrl(10, 5.4)).toEqual({ cost_usd: 10, exchange_rate: 5.4, cost_brl: 54 });
  });

  it('usd null → tudo null (não há custo a converter)', () => {
    expect(toBrl(null, 5.4)).toEqual({ cost_usd: null, exchange_rate: 5.4, cost_brl: null });
  });

  it('taxa null (sem câmbio na data) → brl null, mas o USD original permanece', () => {
    expect(toBrl(10, null)).toEqual({ cost_usd: 10, exchange_rate: null, cost_brl: null });
  });

  it('nunca sobrescreve o USD: 0 dólares convertido continua 0, não vira null', () => {
    expect(toBrl(0, 5.4)).toEqual({ cost_usd: 0, exchange_rate: 5.4, cost_brl: 0 });
  });
});
