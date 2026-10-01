import { describe, it, expect } from 'vitest';
import { hojeSP, mesSP, primeiroDoMesSP, primeiroDoAnoSP, ultimoDoMesSP, mesAnterior } from './dataSP';

// 30/09/2026 às 23h30 em São Paulo — em Greenwich já é 01/10, 02h30.
const virada = new Date('2026-10-01T02:30:00Z');

describe('datas no dia de São Paulo', () => {
  it('na última noite do mês, ainda é o mês que termina — o caso do Financeiro "de 01/10 até 30/09"', () => {
    expect(hojeSP(virada)).toBe('2026-09-30');
    expect(primeiroDoMesSP(virada)).toBe('2026-09-01');
    expect(ultimoDoMesSP(virada)).toBe('2026-09-30');
    expect(mesSP(virada)).toBe('2026-09');
  });

  it('o período do mês nunca sai invertido', () => {
    expect(primeiroDoMesSP(virada) <= ultimoDoMesSP(virada)).toBe(true);
  });

  it('último dia de fevereiro, inclusive em ano bissexto', () => {
    expect(ultimoDoMesSP(new Date('2026-02-10T15:00:00Z'))).toBe('2026-02-28');
    expect(ultimoDoMesSP(new Date('2028-02-10T15:00:00Z'))).toBe('2028-02-29');
  });

  it('primeiro do ano na virada do ano é o do ano que termina', () => {
    expect(primeiroDoAnoSP(new Date('2027-01-01T01:00:00Z'))).toBe('2026-01-01');
  });

  it('mês anterior atravessa o ano e não pula mês', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(mesAnterior('2026-10')).toBe('2026-09');
  });
});
