import { describe, it, expect } from 'vitest';
import { isMappingComplete, renderWithExample } from '../variableMapping';

describe('isMappingComplete', () => {
  it('sem variáveis → true', () => { expect(isMappingComplete([], {})).toBe(true); });
  it('completo → true', () => { expect(isMappingComplete(['1'], { 1: { type: 'lead_field', value: 'name' } })).toBe(true); });
  it('faltando → false', () => { expect(isMappingComplete(['1', '2'], { 1: { type: 'lead_field', value: 'name' } })).toBe(false); });
  it('fixed vazio → false', () => { expect(isMappingComplete(['1'], { 1: { type: 'fixed', value: ' ' } })).toBe(false); });
});

describe('renderWithExample', () => {
  it('substitui {{N}} por rótulo de exemplo', () => {
    expect(renderWithExample('Olá {{1}}, mês {{2}}', ['1', '2'], { 1: { type: 'lead_field', value: 'name' }, 2: { type: 'fixed', value: 'jan' } }))
      .toBe('Olá (Nome do lead), mês jan');
  });
});
