import { describe, it, expect } from 'vitest';
import { anuncioNaoIdentificado } from './anuncioDoPortal';

describe('anuncioNaoIdentificado', () => {
  it('lead de portal sem código: o anúncio não foi identificado', () => {
    expect(anuncioNaoIdentificado({ portal: 'ZAP Imóveis', codigo: null })).toBe(true);
    expect(anuncioNaoIdentificado({ portal: 'Grupo OLX', codigo: '' })).toBe(true);
    expect(anuncioNaoIdentificado({ source: 'Instagram', property_code: null })).toBe(true);
    expect(anuncioNaoIdentificado({ source: 'Facebook Lead Ads', codigo_imovel: '   ' })).toBe(true);
  });

  it('com código, o imóvel está identificado — inclusive lançamento', () => {
    expect(anuncioNaoIdentificado({ portal: 'ZAP Imóveis', codigo: 'AP679' })).toBe(false);
    expect(anuncioNaoIdentificado({ portal: 'ZAP Imóveis', codigo: 'L003' })).toBe(false);
    expect(anuncioNaoIdentificado({ source: 'Instagram', property_code: 'RESERVA CASTANHEIRA' })).toBe(false);
  });

  // Lead de planilha, de indicação ou cadastrado à mão não veio de anúncio
  // nenhum: "sem imóvel" ali é o normal, não uma pendência a resolver.
  it('lead que não veio de portal nunca é pendência de anúncio', () => {
    expect(anuncioNaoIdentificado({ source: 'Excel', property_code: null })).toBe(false);
    expect(anuncioNaoIdentificado({ source: 'Santa Angela', property_code: null })).toBe(false);
    expect(anuncioNaoIdentificado({ portal: null, codigo: null })).toBe(false);
    expect(anuncioNaoIdentificado(null)).toBe(false);
    expect(anuncioNaoIdentificado(undefined)).toBe(false);
  });

  it('o canal é lido de portal, source OU origem_lead — os três mapeadores de lead', () => {
    expect(anuncioNaoIdentificado({ portal: 'zap imoveis', codigo: null })).toBe(true);
    expect(anuncioNaoIdentificado({ source: 'ZAP Imóveis', codigo: null })).toBe(true);
    expect(anuncioNaoIdentificado({ origem_lead: 'ZAP Imóveis', codigo_imovel: '' })).toBe(true);
    expect(anuncioNaoIdentificado({ origem_lead: 'Indicação', codigo_imovel: '' })).toBe(false);
  });
});
