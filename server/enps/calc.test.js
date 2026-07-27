import { describe, it, expect } from 'vitest';
import { classify, enps, summarize } from './calc.js';

describe('classify', () => {
  it('detrator: 0 a 6', () => {
    expect(classify(0)).toBe('detractor');
    expect(classify(6)).toBe('detractor');
  });
  it('neutro: 7 e 8', () => {
    expect(classify(7)).toBe('passive');
    expect(classify(8)).toBe('passive');
  });
  it('promotor: 9 e 10', () => {
    expect(classify(9)).toBe('promoter');
    expect(classify(10)).toBe('promoter');
  });
});

describe('enps', () => {
  it('vazio ⇒ null (não NaN)', () => {
    expect(enps([])).toBeNull();
  });
  it('só neutros ⇒ 0', () => {
    expect(enps([7, 8, 7])).toBe(0);
  });
  it('%promotores − %detratores', () => {
    // 2 promotores, 1 neutro, 1 detrator de 4 ⇒ 50% − 25% = 25
    expect(enps([10, 9, 8, 0])).toBe(25);
  });
  it('só promotores ⇒ 100', () => {
    expect(enps([9, 10])).toBe(100);
  });
  it('só detratores ⇒ -100', () => {
    expect(enps([0, 6])).toBe(-100);
  });
  it('arredonda para inteiro (1 promotor, 2 detratores de 3)', () => {
    // 33.33% − 66.66% = -33.33 ⇒ -33
    expect(enps([9, 0, 6])).toBe(-33);
  });
});

describe('summarize', () => {
  it('conta cada classe, count e enps juntos', () => {
    expect(summarize([10, 9, 8, 0])).toEqual({
      score: 25, enps: 25, promoters: 2, passives: 1, detractors: 1, count: 4,
    });
  });
  it('vazio ⇒ zeros e enps null', () => {
    expect(summarize([])).toEqual({
      score: null, enps: null, promoters: 0, passives: 0, detractors: 0, count: 0,
    });
  });
});
