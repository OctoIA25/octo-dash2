import { describe, it, expect } from 'vitest';
import { buildLeadPreferences } from '../engine/preferences';
import { makeImovel } from './fixtures';

describe('buildLeadPreferences', () => {
  it('lead com histórico completo: deriva preferências dos imóveis-semente', () => {
    const seeds = [
      makeImovel({ cidade: 'São Paulo', bairro: 'Pinheiros', tipoSimplificado: 'apartamento', valor_venda: 600000, quartos: 3, area_util: 90 }),
      makeImovel({ cidade: 'São Paulo', bairro: 'Vila Madalena', tipoSimplificado: 'apartamento', valor_venda: 800000, quartos: 3, area_util: 110 }),
    ];
    const prefs = buildLeadPreferences(seeds);

    expect(prefs.finalidade).toBe('venda');
    expect(prefs.cidades).toEqual(['São Paulo']);
    expect(prefs.bairros).toEqual(['Pinheiros', 'Vila Madalena']);
    expect(prefs.tipos).toEqual(['apartamento']);
    expect(prefs.precoAlvo).toBe(700000); // média
    expect(prefs.quartos).toBe(3);
    expect(prefs.areaUtil).toBe(100);
  });

  it('lead sem histórico: usa sinais estruturados como fallback', () => {
    const prefs = buildLeadPreferences([], {
      precoReferencia: 450000,
      tipo: 'casa',
      finalidade: 'locacao',
    });
    expect(prefs.precoAlvo).toBe(450000);
    expect(prefs.tipos).toEqual(['casa']);
    expect(prefs.finalidade).toBe('locacao');
    expect(prefs.cidades).toBeUndefined(); // sem semente, sem cidade
  });

  it('lead sem histórico nem sinais: preferências vazias', () => {
    expect(buildLeadPreferences([])).toEqual({});
  });

  it('finalidade venda_locacao da semente não vira finalidade rígida (cai no fallback)', () => {
    const seeds = [makeImovel({ finalidade: 'venda_locacao', valor_locacao: 2000, valor_venda: 0 })];
    const prefs = buildLeadPreferences(seeds, { finalidade: 'locacao' });
    expect(prefs.finalidade).toBe('locacao');
  });

  it('ignora valores zero/ausentes ao calcular médias', () => {
    const seeds = [
      makeImovel({ quartos: 0, area_util: 0, valor_venda: 0 }),
      makeImovel({ quartos: 2, area_util: 80, valor_venda: 400000 }),
    ];
    const prefs = buildLeadPreferences(seeds);
    expect(prefs.quartos).toBe(2);
    expect(prefs.areaUtil).toBe(80);
    expect(prefs.precoAlvo).toBe(400000);
  });
});
