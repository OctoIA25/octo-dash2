import { describe, it, expect } from 'vitest';
import {
  WEEKLY_USAGE_ALERT_THRESHOLD_BPS,
  sumCostUsd, computePercentage, evaluateThreshold, classifyState, buildUsageDto,
} from './usage.js';

// buckets no formato do cost_report: data[].results[].amount (centavos, string)
const bucket = (...amounts) => ({ results: amounts.map((a) => ({ amount: String(a), currency: 'USD' })) });

describe('sumCostUsd', () => {
  it('soma amounts (centavos) e converte para USD', () => {
    // 6420 + 1080 centavos = 7500 centavos = 75.00 USD
    expect(sumCostUsd([bucket(6420), bucket(1080)])).toBeCloseTo(75.0, 5);
  });
  it('buckets vazios → 0', () => {
    expect(sumCostUsd([])).toBe(0);
    expect(sumCostUsd([bucket()])).toBe(0);
  });
  it('ignora amount não numérico sem quebrar', () => {
    expect(sumCostUsd([bucket(6420), { results: [{ amount: 'x' }] }])).toBeCloseTo(64.2, 5);
  });
});

describe('computePercentage', () => {
  it('current/limit*100 arredondado a 2 casas', () => {
    expect(computePercentage(64.2, 500)).toBe(12.84);
  });
  it('limite 0 → null (sem divisão por zero)', () => {
    expect(computePercentage(64.2, 0)).toBeNull();
  });
  it('limite null/negativo/NaN → null', () => {
    expect(computePercentage(64.2, null)).toBeNull();
    expect(computePercentage(64.2, -10)).toBeNull();
    expect(computePercentage(64.2, Number.NaN)).toBeNull();
  });
  it('uso 0 → 0%', () => {
    expect(computePercentage(0, 500)).toBe(0);
  });
});

describe('evaluateThreshold (basis points)', () => {
  it('14.29 → normal', () => { expect(evaluateThreshold(14.29)).toBe('normal'); });
  it('14.30 → warning', () => { expect(evaluateThreshold(14.30)).toBe('warning'); });
  it('14.31 → warning', () => { expect(evaluateThreshold(14.31)).toBe('warning'); });
  it('14.2999 (float) → normal (round p/ 1430? não: 1429.99→1430)', () => {
    // 14.2999 * 100 = 1429.99 → Math.round = 1430 → warning.
    // Garante que a decisão passa por Math.round e não por comparação de float cru.
    expect(evaluateThreshold(14.2999)).toBe('warning');
  });
  it('14.294 → normal (1429.4 → 1429)', () => {
    expect(evaluateThreshold(14.294)).toBe('normal');
  });
  it('threshold exportado é 1430', () => {
    expect(WEEKLY_USAGE_ALERT_THRESHOLD_BPS).toBe(1430);
  });
});

describe('classifyState', () => {
  it('sem key → not_configured', () => {
    expect(classifyState({ hasKey: false, hasLimit: true, errorCode: null, percentage: 10 })).toBe('not_configured');
  });
  it('sem limite → not_configured', () => {
    expect(classifyState({ hasKey: true, hasLimit: false, errorCode: null, percentage: null })).toBe('not_configured');
  });
  it('erro na chamada → error', () => {
    expect(classifyState({ hasKey: true, hasLimit: true, errorCode: 'rate_limited', percentage: null })).toBe('error');
  });
  it('key+limite mas percentage null (dados insuficientes) → insufficient_data', () => {
    expect(classifyState({ hasKey: true, hasLimit: true, errorCode: null, percentage: null })).toBe('insufficient_data');
  });
  it('percentage < 14.30 → normal', () => {
    expect(classifyState({ hasKey: true, hasLimit: true, errorCode: null, percentage: 12.84 })).toBe('normal');
  });
  it('percentage >= 14.30 → warning', () => {
    expect(classifyState({ hasKey: true, hasLimit: true, errorCode: null, percentage: 15.2 })).toBe('warning');
  });
});

describe('buildUsageDto', () => {
  it('monta o DTO estável do spec', () => {
    const dto = buildUsageDto({
      current: 64.2, limit: 500, percentage: 12.84, state: 'normal',
      window: { startsAt: '2026-07-22T00:00:00.000Z', endsAt: '2026-07-29T12:00:00.000Z' },
      fetchedAt: '2026-07-29T12:00:00.000Z',
    });
    expect(dto).toEqual({
      provider: 'anthropic',
      window: { startsAt: '2026-07-22T00:00:00.000Z', endsAt: '2026-07-29T12:00:00.000Z' },
      usage: { current: 64.2, limit: 500, percentage: 12.84 },
      status: 'normal',
      fetchedAt: '2026-07-29T12:00:00.000Z',
    });
  });
});
