import { describe, expect, it } from 'vitest';
import { normalizePeriodStart, periodKey } from '../periods';

describe('normalizePeriodStart', () => {
  it('mês: zera para o dia 1', () => {
    expect(normalizePeriodStart('2026-06-20', 'month')).toBe('2026-06-01');
  });
  it('mês de 1 dígito: mantém o zero à esquerda', () => {
    expect(normalizePeriodStart('2026-03-15', 'month')).toBe('2026-03-01');
  });
  it('trimestre: volta para o 1º dia do trimestre (Q1–Q4)', () => {
    expect(normalizePeriodStart('2026-05-15', 'quarter')).toBe('2026-04-01'); // Q2
    expect(normalizePeriodStart('2026-01-31', 'quarter')).toBe('2026-01-01'); // Q1
    expect(normalizePeriodStart('2026-08-09', 'quarter')).toBe('2026-07-01'); // Q3
    expect(normalizePeriodStart('2026-12-01', 'quarter')).toBe('2026-10-01'); // Q4
  });
  it('ano: 1º de janeiro', () => {
    expect(normalizePeriodStart('2026-08-09', 'year')).toBe('2026-01-01');
  });
});

describe('periodKey', () => {
  it('compõe chave estável', () => {
    expect(periodKey('month', '2026-06-01')).toBe('month:2026-06-01');
  });
});
