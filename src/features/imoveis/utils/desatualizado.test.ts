import { describe, it, expect } from 'vitest';
import { isDesatualizado, DIAS_SEM_AJUSTE_DESATUALIZADO } from './desatualizado';

const agora = new Date('2026-08-17T12:00:00Z');
const diasAtras = (dias: number) =>
  new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();

describe('isDesatualizado', () => {
  it('é falso um dia antes do limite', () => {
    expect(isDesatualizado(diasAtras(DIAS_SEM_AJUSTE_DESATUALIZADO - 1), agora)).toBe(false);
  });

  it('é falso exatamente no limite', () => {
    expect(isDesatualizado(diasAtras(DIAS_SEM_AJUSTE_DESATUALIZADO), agora)).toBe(false);
  });

  it('é verdadeiro um dia depois do limite', () => {
    expect(isDesatualizado(diasAtras(DIAS_SEM_AJUSTE_DESATUALIZADO + 1), agora)).toBe(true);
  });

  it('não marca imóvel sem timestamp (só existe no XML do Kenlo)', () => {
    expect(isDesatualizado(null, agora)).toBe(false);
    expect(isDesatualizado(undefined, agora)).toBe(false);
  });

  it('não marca timestamp inválido', () => {
    expect(isDesatualizado('nao-e-data', agora)).toBe(false);
  });
});
