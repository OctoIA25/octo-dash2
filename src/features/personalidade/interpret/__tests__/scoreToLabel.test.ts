import { describe, it, expect } from 'vitest';
import { scoreToLabel, discScoreToLabel, decimalToPercent } from '../scoreToLabel';

describe('scoreToLabel', () => {
  it('mapeia faixas para rótulos qualitativos', () => {
    expect(scoreToLabel(10).label).toBe('Muito baixo');
    expect(scoreToLabel(30).label).toBe('Baixo');
    expect(scoreToLabel(50).label).toBe('Moderado');
    expect(scoreToLabel(70).label).toBe('Elevado');
    expect(scoreToLabel(87).label).toBe('Muito elevado'); // exemplo do briefing
  });

  it('respeita as bordas das faixas (<=)', () => {
    expect(scoreToLabel(20).intensidade).toBe('muito-baixa');
    expect(scoreToLabel(21).intensidade).toBe('baixa');
    expect(scoreToLabel(100).nivel).toBe(5);
  });

  it('clampa entradas fora de 0–100 e trata não-finitos', () => {
    expect(scoreToLabel(-5).label).toBe('Muito baixo');
    expect(scoreToLabel(150).label).toBe('Muito elevado');
    expect(scoreToLabel(NaN).label).toBe('Muito baixo');
  });
});

describe('discScoreToLabel (escala relativa)', () => {
  it('ancora na média ~25% das 4 dimensões competindo', () => {
    expect(discScoreToLabel(8).label).toBe('Pouco presente');
    expect(discScoreToLabel(18).label).toBe('Secundário');
    expect(discScoreToLabel(25).label).toBe('Equilibrado');
    expect(discScoreToLabel(38).label).toBe('Forte');
    expect(discScoreToLabel(50).label).toBe('Predominante');
  });

  it('a dimensão dominante (42%) não cai mais como "Moderado"', () => {
    expect(discScoreToLabel(42).label).toBe('Forte');
  });
});

describe('decimalToPercent', () => {
  it('converte decimal 0–1 para 0–100', () => {
    expect(decimalToPercent(0.45)).toBe(45);
    expect(decimalToPercent(1)).toBe(100);
  });

  it('passa valores já em 0–100 sem dobrar a escala', () => {
    expect(decimalToPercent(45)).toBe(45);
    expect(decimalToPercent(87)).toBe(87);
  });

  it('trata não-finitos como 0', () => {
    expect(decimalToPercent(NaN)).toBe(0);
  });
});
