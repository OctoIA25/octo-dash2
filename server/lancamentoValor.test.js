import { describe, it, expect } from 'vitest';
import { avisoValorLancamento, formatDiaMes } from './lancamentoValor.js';

describe('formatDiaMes', () => {
  it('formata em DD/MM no fuso de Brasília', () => {
    expect(formatDiaMes('2026-08-16T12:00:00Z')).toBe('16/08');
  });

  it('usa o dia de Brasília, não o UTC, na virada da meia-noite', () => {
    // 2026-08-17T02:00Z = 16/08 23:00 em Brasília.
    expect(formatDiaMes('2026-08-17T02:00:00Z')).toBe('16/08');
  });

  it('devolve null para data ausente ou inválida', () => {
    expect(formatDiaMes(null)).toBeNull();
    expect(formatDiaMes('')).toBeNull();
    expect(formatDiaMes('não é data')).toBeNull();
  });
});

describe('avisoValorLancamento', () => {
  it('ressalva a variação e informa a data', () => {
    expect(avisoValorLancamento('a partir de R$ 500 mil', '2026-08-16T12:00:00Z')).toBe(
      'Este é o valor mínimo do empreendimento e pode variar conforme o imóvel escolhido. Dados atualizados em 16/08.',
    );
  });

  it('mantém a ressalva quando não há data válida', () => {
    expect(avisoValorLancamento('Consultar valor', null)).toBe(
      'Este é o valor mínimo do empreendimento e pode variar conforme o imóvel escolhido.',
    );
  });

  it('devolve null quando não há valor cadastrado', () => {
    expect(avisoValorLancamento(null, '2026-08-16T12:00:00Z')).toBeNull();
    expect(avisoValorLancamento('   ', '2026-08-16T12:00:00Z')).toBeNull();
  });
});
