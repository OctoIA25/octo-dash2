import { describe, it, expect } from 'vitest';
import {
  calcularComissaoForecast,
  isLancamento,
  percentualComissao,
  PERCENTUAL_LANCAMENTO,
  PERCENTUAL_TERCEIROS,
} from './comissao';

describe('isLancamento — aceita a coluna nas duas formas', () => {
  // `leads.classification` está migrando de text para text[] (20260818). As duas
  // formas convivem até a migration rodar em produção.
  it('string simples (formato atual em produção)', () => {
    expect(isLancamento('lancamento')).toBe(true);
    expect(isLancamento('pronto')).toBe(false);
  });

  it('array (formato pós-20260818)', () => {
    expect(isLancamento(['lancamento'])).toBe(true);
    expect(isLancamento(['pronto', 'lancamento'])).toBe(true);
    expect(isLancamento(['pronto', 'locacao'])).toBe(false);
  });

  it('acento e caixa não escapam da regra', () => {
    expect(isLancamento('Lançamento')).toBe(true);
    expect(isLancamento(['LANÇAMENTO'])).toBe(true);
  });

  it('ausência de classificação é terceiros, não erro', () => {
    expect(isLancamento(null)).toBe(false);
    expect(isLancamento(undefined)).toBe(false);
    expect(isLancamento([])).toBe(false);
    expect(isLancamento('')).toBe(false);
  });

  it('locação NÃO é lançamento — cai em terceiros (decisão registrada na spec)', () => {
    expect(percentualComissao('locacao')).toBe(PERCENTUAL_TERCEIROS);
  });
});

describe('calcularComissaoForecast', () => {
  it('lançamento aplica 3,5%', () => {
    const r = calcularComissaoForecast(1_000_000, 'lancamento');
    expect(r.percentual).toBe(PERCENTUAL_LANCAMENTO);
    expect(r.valor).toBe(35_000);
  });

  it('terceiros aplica 6%', () => {
    const r = calcularComissaoForecast(1_000_000, 'pronto');
    expect(r.percentual).toBe(PERCENTUAL_TERCEIROS);
    expect(r.valor).toBe(60_000);
  });

  it('valor como string (NUMERIC do PostgREST chega assim)', () => {
    expect(calcularComissaoForecast('500000.00', 'lancamento').valor).toBe(17_500);
  });

  it('valor ausente, zerado ou impossível não vira NaN na tela', () => {
    expect(calcularComissaoForecast(null, 'lancamento').valor).toBe(0);
    expect(calcularComissaoForecast(undefined, 'pronto').valor).toBe(0);
    expect(calcularComissaoForecast(0, 'pronto').valor).toBe(0);
    expect(calcularComissaoForecast('', 'pronto').valor).toBe(0);
    expect(calcularComissaoForecast('abc', 'pronto').valor).toBe(0);
    expect(calcularComissaoForecast(-100, 'pronto').valor).toBe(0);
  });

  it('percentual é devolvido mesmo sem valor — a linha mostra "6%" e R$ 0', () => {
    expect(calcularComissaoForecast(null, 'pronto').percentual).toBe(PERCENTUAL_TERCEIROS);
  });

  it('arredonda a centavos — nada de 28000.000000000004 somando no rodapé', () => {
    expect(calcularComissaoForecast(800_000, 'lancamento').valor).toBe(28_000);
    expect(calcularComissaoForecast(333_333.33, 'pronto').valor).toBe(20_000);
    expect(calcularComissaoForecast(123_456.78, 'lancamento').valor).toBe(4320.99);
  });
});
