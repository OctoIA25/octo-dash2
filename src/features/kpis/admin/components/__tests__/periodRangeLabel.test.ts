import { describe, expect, it } from 'vitest';
import { monthLabel, periodRangeLabel } from '../importMessages';

describe('monthLabel', () => {
  it('formata o 1º dia do mês em jan/2026', () => {
    expect(monthLabel('2026-01-01')).toBe('jan/2026');
    expect(monthLabel('2026-12-01')).toBe('dez/2026');
  });
});

describe('periodRangeLabel', () => {
  it('um mês só', () => {
    expect(periodRangeLabel(['2026-03-01'])).toBe('mar/2026');
  });
  it('intervalo: do menor ao maior, deduplicando e ordenando', () => {
    // fora de ordem + repetidos (vários KPIs no mesmo mês)
    expect(periodRangeLabel(['2026-03-01', '2026-01-01', '2026-02-01', '2026-01-01']))
      .toBe('jan/2026 a mar/2026');
  });
  it('vazio → string vazia', () => {
    expect(periodRangeLabel([])).toBe('');
  });
});
