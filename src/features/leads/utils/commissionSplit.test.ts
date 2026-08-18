import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMMISSION_PERCENT,
  formatPercent,
  isFullyAllocated,
  parsePercentInput,
  rateFromAmount,
  splitCommission,
  sumParticipations,
} from './commissionSplit';

describe('parsePercentInput', () => {
  it('lê o formato pt-BR digitado no campo', () => {
    expect(parsePercentInput('5,5%')).toBeCloseTo(0.055, 10);
    expect(parsePercentInput(' 5,5 % ')).toBeCloseTo(0.055, 10);
    expect(parsePercentInput(DEFAULT_COMMISSION_PERCENT)).toBeCloseTo(0.055, 10);
  });

  it('aceita ponto como separador decimal', () => {
    expect(parsePercentInput('5.5')).toBeCloseTo(0.055, 10);
  });

  it('zera entradas vazias, inválidas ou negativas', () => {
    expect(parsePercentInput('')).toBe(0);
    expect(parsePercentInput('abc')).toBe(0);
    expect(parsePercentInput('-3%')).toBe(0);
    expect(parsePercentInput(undefined)).toBe(0);
  });
});

describe('formatPercent', () => {
  it('devolve o percentual em pt-BR', () => {
    expect(formatPercent(0.055)).toBe('5,5%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0)).toBe('0%');
  });

  it('sobrevive a valor não numérico', () => {
    expect(formatPercent(Number.NaN)).toBe('0%');
  });
});

describe('rateFromAmount', () => {
  it('converte R$ em percentual da base', () => {
    expect(rateFromAmount(46750, 850000)).toBeCloseTo(0.055, 10);
  });

  it('não divide por zero quando o negócio não tem valor', () => {
    expect(rateFromAmount(46750, 0)).toBe(0);
  });
});

describe('splitCommission', () => {
  it('divide o total pelas participações', () => {
    const total = 850000 * 0.055; // 46.750
    const shares = splitCommission(total, [0.6, 0.25, 0.15]);

    expect(shares.map((share) => share.amount)).toEqual([28050, 11687.5, 7012.5]);
    expect(shares.reduce((sum, share) => sum + share.amount, 0)).toBeCloseTo(total, 6);
  });
});

describe('sumParticipations / isFullyAllocated', () => {
  it('reconhece a divisão fechada em 100%', () => {
    expect(isFullyAllocated(sumParticipations([0.6, 0.25, 0.15]))).toBe(true);
    expect(isFullyAllocated(sumParticipations([1]))).toBe(true);
  });

  it('acusa sobra e excesso', () => {
    expect(isFullyAllocated(sumParticipations([0.6, 0.25]))).toBe(false);
    expect(isFullyAllocated(sumParticipations([0.8, 0.4]))).toBe(false);
  });
});
