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

describe('enps (escala 0–10)', () => {
  it('vazio ⇒ null (não NaN)', () => {
    expect(enps([])).toBeNull();
  });
  it('só neutros ⇒ 5 (meio da escala)', () => {
    expect(enps([7, 8, 7])).toBe(5);
  });
  it('%promotores − %detratores normalizado', () => {
    // 2 promotores, 1 neutro, 1 detrator de 4 ⇒ índice 25 ⇒ (25+100)/20 = 6,3
    expect(enps([10, 9, 8, 0])).toBe(6.3);
  });
  it('só promotores ⇒ 10', () => {
    expect(enps([9, 10])).toBe(10);
  });
  it('só detratores ⇒ 0', () => {
    expect(enps([0, 6])).toBe(0);
  });
  it('arredonda para uma casa (1 promotor, 2 detratores de 3)', () => {
    // índice -33.33 ⇒ (-33.33+100)/20 = 3.33 ⇒ 3,3
    expect(enps([9, 0, 6])).toBe(3.3);
  });
});

describe('summarize', () => {
  it('conta cada classe, count e enps juntos', () => {
    expect(summarize([10, 9, 8, 0])).toEqual({
      score: 6.3, enps: 6.3, promoters: 2, passives: 1, detractors: 1, count: 4,
    });
  });
  it('vazio ⇒ zeros e enps null', () => {
    expect(summarize([])).toEqual({
      score: null, enps: null, promoters: 0, passives: 0, detractors: 0, count: 0,
    });
  });
});
