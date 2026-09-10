import { describe, it, expect } from 'vitest';
import { scoreToLabel, discScoreToLabel, decimalToPercent, percentuaisDiscExibicao } from '../scoreToLabel';

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

describe('percentuaisDiscExibicao', () => {
  const soma = (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0);

  it('converte decimais do banco em inteiros que somam 100', () => {
    const p = percentuaisDiscExibicao({ D: 0.4, I: 0.3, S: 0.2, C: 0.1 });
    expect(p).toEqual({ D: 40, I: 30, S: 20, C: 10 });
    expect(soma(p)).toBe(100);
  });

  it('soma 100 mesmo quando o arredondamento simples daria 99 ou 101', () => {
    // 1/3 cada em três dimensões: arredondar cada uma daria 33+33+33 = 99
    const p = percentuaisDiscExibicao({ D: 1, I: 1, S: 1, C: 0 });
    expect(soma(p)).toBe(100);
  });

  it('normaliza linha antiga cujos valores não somam 1,0', () => {
    // era aqui que as duas telas divergiam: uma normalizava, a outra não
    const p = percentuaisDiscExibicao({ D: 0.2, I: 0.1, S: 0.1, C: 0 });
    expect(p).toEqual({ D: 50, I: 25, S: 25, C: 0 });
    expect(soma(p)).toBe(100);
  });

  it('aceita valores já em 0–100 sem dobrar a escala', () => {
    const p = percentuaisDiscExibicao({ D: 40, I: 30, S: 20, C: 10 });
    expect(p).toEqual({ D: 40, I: 30, S: 20, C: 10 });
  });

  it('tudo zerado devolve zeros, não NaN', () => {
    expect(percentuaisDiscExibicao({ D: 0, I: 0, S: 0, C: 0 })).toEqual({ D: 0, I: 0, S: 0, C: 0 });
    expect(percentuaisDiscExibicao({ D: NaN, I: 0, S: 0, C: 0 })).toEqual({ D: 0, I: 0, S: 0, C: 0 });
  });
});
