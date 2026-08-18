import { describe, it, expect } from 'vitest';
import { calcularValidadeTestes, formatarDataBr } from '../validadeTestes';

const HOJE = new Date('2026-08-18T12:00:00Z');

describe('calcularValidadeTestes', () => {
  it('conta a validade a partir do teste MAIS ANTIGO', () => {
    const v = calcularValidadeTestes(
      ['2026-06-01T00:00:00Z', '2026-01-10T00:00:00Z', '2026-08-01T00:00:00Z'],
      HOJE,
    );
    expect(v.baseEm).toBe(new Date('2026-01-10T00:00:00Z').toISOString());
    expect(v.venceEm).toBe(new Date('2027-01-10T00:00:00Z').toISOString());
    expect(v.vencido).toBe(false);
  });

  it('marca como vencido quando o teste mais antigo passou de 12 meses', () => {
    const v = calcularValidadeTestes(['2025-08-01T00:00:00Z', '2026-07-01T00:00:00Z'], HOJE);
    expect(v.vencido).toBe(true);
    expect(v.diasRestantes).toBeLessThan(0);
  });

  it('vence exatamente no aniversário de 12 meses (borda inclusiva)', () => {
    const umAnoExato = new Date('2025-08-18T12:00:00Z');
    expect(calcularValidadeTestes([umAnoExato.toISOString()], HOJE).vencido).toBe(true);

    const umDiaAntes = new Date('2025-08-19T12:00:00Z');
    expect(calcularValidadeTestes([umDiaAntes.toISOString()], HOJE).vencido).toBe(false);
  });

  it('ignora datas nulas e inválidas em vez de quebrar', () => {
    const v = calcularValidadeTestes([null, undefined, 'não é data', '2026-03-05T00:00:00Z'], HOJE);
    expect(v.baseEm).toBe(new Date('2026-03-05T00:00:00Z').toISOString());
    expect(v.vencido).toBe(false);
  });

  it('perfil sem nenhum teste não vence', () => {
    const v = calcularValidadeTestes([null, undefined, ''], HOJE);
    expect(v).toEqual({ baseEm: null, venceEm: null, vencido: false, diasRestantes: null });
  });
});

describe('formatarDataBr', () => {
  it('formata ISO em dd/mm/aaaa e devolve null para entrada inútil', () => {
    expect(formatarDataBr('2026-03-05T12:00:00Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(formatarDataBr(null)).toBeNull();
    expect(formatarDataBr('xxx')).toBeNull();
  });
});
