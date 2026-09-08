import { describe, it, expect } from 'vitest';
import { formatCpf, formatCnpj } from './documentoMasks';

describe('formatCpf', () => {
  it('formata o CPF completo', () => {
    expect(formatCpf('12345678901')).toBe('123.456.789-01');
  });
  it('formata parcialmente enquanto o usuário digita', () => {
    expect(formatCpf('123')).toBe('123');
    expect(formatCpf('1234')).toBe('123.4');
    expect(formatCpf('1234567')).toBe('123.456.7');
    expect(formatCpf('123456789')).toBe('123.456.789');
  });
  it('ignora não-dígitos e corta o excedente', () => {
    expect(formatCpf('123.456.789-01999')).toBe('123.456.789-01');
    expect(formatCpf('abc')).toBe('');
  });
});

describe('formatCnpj', () => {
  it('formata o CNPJ completo', () => {
    expect(formatCnpj('12345678000199')).toBe('12.345.678/0001-99');
  });
  it('formata parcialmente enquanto o usuário digita', () => {
    expect(formatCnpj('12')).toBe('12');
    expect(formatCnpj('123')).toBe('12.3');
    expect(formatCnpj('12345678')).toBe('12.345.678');
    expect(formatCnpj('123456780001')).toBe('12.345.678/0001');
  });
  it('ignora não-dígitos e corta o excedente', () => {
    expect(formatCnpj('12.345.678/0001-99000')).toBe('12.345.678/0001-99');
  });
});
