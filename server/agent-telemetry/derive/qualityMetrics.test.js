import { describe, it, expect } from 'vitest';
import { computeQualityMetrics } from './qualityMetrics.js';

describe('computeQualityMetrics — três estados, não-avaliado NUNCA é correto', () => {
  it('separa correct / incorrect / not_evaluated', () => {
    // 100 execuções elegíveis; 30 avaliadas (20 corretas, 10 incorretas)
    const m = computeQualityMetrics({ evaluable: 100, correct: 20, incorrect: 10 });
    expect(m.confirmed_correct).toBe(20);
    expect(m.confirmed_wrong).toBe(10);
    expect(m.not_evaluated).toBe(70);
    expect(m.evaluated).toBe(30);
  });

  it('taxa de incorretas é sobre AVALIADAS, não sobre o total (não dilui com não-avaliado)', () => {
    const m = computeQualityMetrics({ evaluable: 100, correct: 20, incorrect: 10 });
    expect(m.wrong_rate).toBeCloseTo(10 / 30, 10); // incorrect / evaluated
  });

  it('sem avaliações → wrong_rate null (insufficient_data), NUNCA 0 (que leria como "tudo certo")', () => {
    const m = computeQualityMetrics({ evaluable: 100, correct: 0, incorrect: 0 });
    expect(m.evaluated).toBe(0);
    expect(m.not_evaluated).toBe(100);
    expect(m.wrong_rate).toBeNull();
  });

  it('sem execuções elegíveis → tudo zero e taxa null', () => {
    const m = computeQualityMetrics({ evaluable: 0, correct: 0, incorrect: 0 });
    expect(m.not_evaluated).toBe(0);
    expect(m.wrong_rate).toBeNull();
  });

  it('avaliações não excedem elegíveis: not_evaluated nunca fica negativo (clamp defensivo)', () => {
    // dado inconsistente (mais avaliações que elegíveis) não vira número negativo
    const m = computeQualityMetrics({ evaluable: 5, correct: 4, incorrect: 4 });
    expect(m.not_evaluated).toBe(0);
  });
});
