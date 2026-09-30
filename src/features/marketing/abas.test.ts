import { describe, it, expect } from 'vitest';
import { ABAS_DO_MARKETING, destinoDoEnderecoAntigo, rotaDoMarketing } from './abas';

describe('o endereço antigo de Relatórios leva à aba certa do Marketing', () => {
  it('cada visão que morava em ?view= tem o seu endereço novo', () => {
    expect(destinoDoEnderecoAntigo('?tab=marketing&view=campanhas')).toBe('/marketing/campanhas');
    expect(destinoDoEnderecoAntigo('?tab=marketing&view=anuncios')).toBe('/marketing/anuncios');
    expect(destinoDoEnderecoAntigo('?tab=marketing&view=site')).toBe('/marketing/site');
  });

  it('marketing sem visão (ou com uma desconhecida) era a Geral', () => {
    expect(destinoDoEnderecoAntigo('?tab=marketing')).toBe('/marketing/geral');
    expect(destinoDoEnderecoAntigo('?tab=marketing&view=qualquer')).toBe('/marketing/geral');
  });

  it('Formulários da Meta saiu de Relatórios também', () => {
    expect(destinoDoEnderecoAntigo('?tab=formularios-meta')).toBe('/marketing/formularios');
  });

  // O caso que sustenta o arquivo: Relatórios SEM aba não é mais Marketing.
  // Era esse o "Relatórios migrando para Marketing" que o chefe viu.
  it('Relatórios sem aba, ou com aba que não é de marketing, fica em Relatórios', () => {
    expect(destinoDoEnderecoAntigo('')).toBeNull();
    expect(destinoDoEnderecoAntigo('?tab=leads')).toBeNull();
    expect(destinoDoEnderecoAntigo('?tab=metricas&view=campanhas')).toBeNull();
  });

  it('toda aba mora debaixo de /marketing', () => {
    for (const { id } of ABAS_DO_MARKETING) {
      expect(rotaDoMarketing(id)).toBe(`/marketing/${id}`);
    }
  });
});
