/**
 * De onde sai o pino de um imóvel no Mapa — nesta ordem:
 *
 * 1. a linha do banco agora (`mapa_pontos`): o pino recém-marcado aparece
 *    mesmo com o catálogo da tela carregado antes da marcação;
 * 2. a coordenada que o próprio imóvel carrega (cadastro local ou GPS do XML);
 * 3. só para imóvel do XML: o palpite pelo bairro, com desvio aleatório.
 *
 * Imóvel do cadastro local sem coordenada NÃO ganha palpite. Até 02/10 os 22
 * imóveis da Lotus que o endereço não achou apareciam no meio do bairro, com
 * desvio aleatório e o mesmo pino sólido dos certos — o corretor não tinha
 * como saber. Sem pino ele aparece no contador como "falta marcar".
 */

import type { GeoCoords } from '../services/geocodingService';
import type { Imovel } from '../services/kenloService';

function coordenadaValida(lat: number | undefined, lng: number | undefined): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

export function coordenadaDoImovel(
  imovel: Imovel,
  doBanco?: GeoCoords,
  palpite?: GeoCoords
): GeoCoords | null {
  if (doBanco) return doBanco;
  const { latitude: lat, longitude: lng } = imovel;
  if (coordenadaValida(lat, lng)) {
    return {
      lat: lat as number,
      lng: lng as number,
      source: imovel.geo_origem === 'manual' ? 'manual' : imovel.geo_origem ? 'nominatim' : 'xml',
      confidence: imovel.geo_precisao === 'aproximada' ? 'low' : 'high',
    };
  }
  return imovel.cadastro_local ? null : palpite ?? null;
}
