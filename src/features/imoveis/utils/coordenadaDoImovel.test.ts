import { describe, expect, it } from 'vitest';
import type { Imovel } from '../services/kenloService';
import type { GeoCoords } from '../services/geocodingService';
import { coordenadaDoImovel } from './coordenadaDoImovel';

const imovel = (extra: Partial<Imovel>) => ({ referencia: 'AP0689', ...extra }) as Imovel;
const palpiteDoBairro: GeoCoords = { lat: -23.2, lng: -46.9, source: 'nominatim', confidence: 'low' };

describe('coordenadaDoImovel', () => {
  /**
   * O caso de 02/10: AP0689 (Rua Tiradentes 1615) não foi achado pelo endereço
   * e aparecia no meio do bairro, com desvio aleatório, como se estivesse certo.
   */
  it('imóvel do cadastro sem coordenada não ganha pino chutado no bairro', () => {
    expect(coordenadaDoImovel(imovel({ cadastro_local: true }), undefined, palpiteDoBairro)).toBeNull();
  });

  it('imóvel do XML sem coordenada continua com o palpite do bairro', () => {
    expect(coordenadaDoImovel(imovel({}), undefined, palpiteDoBairro)).toBe(palpiteDoBairro);
  });

  it('o pino marcado à mão no cadastro é exato e se diz marcado à mão', () => {
    expect(
      coordenadaDoImovel(
        imovel({ cadastro_local: true, latitude: -23.17461, longitude: -46.88737, geo_origem: 'manual', geo_precisao: 'exata' }),
        undefined,
        palpiteDoBairro
      )
    ).toEqual({ lat: -23.17461, lng: -46.88737, source: 'manual', confidence: 'high' });
  });

  it('achado só na rua chega ao mapa como aproximado', () => {
    const c = coordenadaDoImovel(
      imovel({ cadastro_local: true, latitude: -23.18, longitude: -46.9, geo_origem: 'automatica', geo_precisao: 'aproximada' })
    );
    expect(c?.confidence).toBe('low');
  });

  it('a linha do banco vence o catálogo carregado antes da marcação', () => {
    const doBanco: GeoCoords = { lat: -23.1, lng: -46.8, source: 'manual', confidence: 'high' };
    expect(coordenadaDoImovel(imovel({ cadastro_local: true, latitude: -23.5, longitude: -46.6 }), doBanco)).toBe(doBanco);
  });

  it('GPS do XML vence o palpite; 0,0 não é coordenada', () => {
    expect(coordenadaDoImovel(imovel({ latitude: -23.3, longitude: -46.7 }), undefined, palpiteDoBairro)?.source).toBe('xml');
    expect(coordenadaDoImovel(imovel({ latitude: 0, longitude: 0 }), undefined, palpiteDoBairro)).toBe(palpiteDoBairro);
  });
});
