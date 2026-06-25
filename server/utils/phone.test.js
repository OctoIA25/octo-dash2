import { describe, it, expect } from 'vitest';
import { normalizePhone, phonesMatch } from './phone.js';

describe('normalizePhone', () => {
  it('remove não-dígitos', () => {
    expect(normalizePhone('(11) 98888-7777')).toBe('11988887777');
  });
  it('remove DDI 55 quando presente', () => {
    expect(normalizePhone('5511988887777')).toBe('11988887777');
  });
  it('trata vazio/undefined sem quebrar', () => {
    expect(normalizePhone(undefined)).toBe('');
    expect(normalizePhone('')).toBe('');
  });
});

describe('phonesMatch', () => {
  it('casa com e sem DDI/máscara', () => {
    expect(phonesMatch('5511988887777', '(11) 98888-7777')).toBe(true);
  });
  it('não casa números diferentes', () => {
    expect(phonesMatch('11988887777', '11999990000')).toBe(false);
  });
});
