import { describe, expect, it } from 'vitest';
import { correspondeAoDestaque, type NivelDestaque } from './destaque';

const nenhum = { destaque: false, super_destaque: false };
const soDestaque = { destaque: true, super_destaque: false };
const soSuper = { destaque: false, super_destaque: true };
const ambos = { destaque: true, super_destaque: true };
/** Imóvel só do XML: o merge não põe flag nenhuma. */
const doXml = {};

const casa = (imovel: object, sel: NivelDestaque[]) => correspondeAoDestaque(imovel, sel);

describe('correspondeAoDestaque', () => {
  it('seleção vazia não filtra nada', () => {
    for (const imovel of [nenhum, soDestaque, soSuper, ambos, doXml]) {
      expect(casa(imovel, [])).toBe(true);
    }
  });

  it('"Sem Destaque" casa só quem não tem nenhuma flag (inclui XML)', () => {
    expect(casa(nenhum, ['sem_destaque'])).toBe(true);
    expect(casa(doXml, ['sem_destaque'])).toBe(true);
    expect(casa(soDestaque, ['sem_destaque'])).toBe(false);
    expect(casa(soSuper, ['sem_destaque'])).toBe(false);
    expect(casa(ambos, ['sem_destaque'])).toBe(false);
  });

  // O filtro antigo usava `destaque ?? super_destaque`: com destaque=false o
  // super destaque nunca era olhado.
  it('"Destaque" e "Super Destaque" olham cada flag isoladamente', () => {
    expect(casa(soDestaque, ['destaque'])).toBe(true);
    expect(casa(soSuper, ['destaque'])).toBe(false);
    expect(casa(soSuper, ['super_destaque'])).toBe(true);
    expect(casa(soDestaque, ['super_destaque'])).toBe(false);
    expect(casa(doXml, ['destaque'])).toBe(false);
    expect(casa(doXml, ['super_destaque'])).toBe(false);
  });

  it('com as duas flags, aparece em "Destaque" e em "Super Destaque"', () => {
    expect(casa(ambos, ['destaque'])).toBe(true);
    expect(casa(ambos, ['super_destaque'])).toBe(true);
  });

  it('vários níveis combinam com OU', () => {
    expect(casa(soDestaque, ['destaque', 'super_destaque'])).toBe(true);
    expect(casa(soSuper, ['destaque', 'super_destaque'])).toBe(true);
    expect(casa(nenhum, ['destaque', 'super_destaque'])).toBe(false);
    expect(casa(nenhum, ['sem_destaque', 'super_destaque'])).toBe(true);
    for (const imovel of [nenhum, soDestaque, soSuper, ambos, doXml]) {
      expect(casa(imovel, ['sem_destaque', 'destaque', 'super_destaque'])).toBe(true);
    }
  });
});
