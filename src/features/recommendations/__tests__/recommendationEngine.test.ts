import { describe, it, expect } from 'vitest';
import {
  recommendImoveis,
  hasUsablePreferences,
} from '../engine/recommendationEngine';
import type { LeadPreferences } from '../engine/types';
import { makeImovel } from './fixtures';

describe('hasUsablePreferences', () => {
  it('false quando vazio; true quando há ao menos um critério útil', () => {
    expect(hasUsablePreferences({})).toBe(false);
    expect(hasUsablePreferences({ cidades: ['SP'] })).toBe(true);
    expect(hasUsablePreferences({ precoAlvo: 100 })).toBe(true);
  });
});

describe('recommendImoveis', () => {
  const prefs: LeadPreferences = {
    finalidade: 'venda',
    cidades: ['São Paulo'],
    bairros: ['Pinheiros'],
    tipos: ['apartamento'],
    precoAlvo: 500000,
    quartos: 3,
    areaUtil: 90,
  };

  it('ordena por relevância: match perfeito vem primeiro', () => {
    const perfeito = makeImovel({ referencia: 'A', bairro: 'Pinheiros', valor_venda: 500000 });
    const ok = makeImovel({ referencia: 'B', bairro: 'Outro', cidade: 'São Paulo', valor_venda: 520000 });
    const fraco = makeImovel({ referencia: 'C', bairro: 'Outro', cidade: 'Campinas', valor_venda: 900000, tipoSimplificado: 'casa' });

    const result = recommendImoveis(prefs, [fraco, ok, perfeito]);
    expect(result[0].imovel.referencia).toBe('A');
    expect(result[0].score).toBeGreaterThan(result[1].score);
    expect(result[0].matched.some((m) => m.label === 'Mesmo bairro')).toBe(true);
  });

  it('lead sem dados utilizáveis → lista vazia (fallback para seleção manual)', () => {
    expect(recommendImoveis({}, [makeImovel()])).toEqual([]);
  });

  it('sem imóveis → lista vazia', () => {
    expect(recommendImoveis(prefs, [])).toEqual([]);
  });

  it('enforceFinalidade descarta imóveis incompatíveis (lead quer alugar)', () => {
    const aluguel = makeImovel({ referencia: 'L', finalidade: 'locacao', valor_locacao: 3000 });
    const venda = makeImovel({ referencia: 'V', finalidade: 'venda' });
    const ambos = makeImovel({ referencia: 'AB', finalidade: 'venda_locacao', valor_locacao: 3000 });

    const result = recommendImoveis(
      { finalidade: 'locacao', cidades: ['São Paulo'], precoAlvo: 3000 },
      [aluguel, venda, ambos],
    );
    const refs = result.map((r) => r.imovel.referencia);
    expect(refs).toContain('L');
    expect(refs).toContain('AB');
    expect(refs).not.toContain('V');
  });

  it('exclui as referências informadas (imóveis já vistos)', () => {
    const a = makeImovel({ referencia: 'SEEN' });
    const b = makeImovel({ referencia: 'NEW' });
    const result = recommendImoveis(prefs, [a, b], { excludeReferencias: ['SEEN'] });
    expect(result.map((r) => r.imovel.referencia)).toEqual(['NEW']);
  });

  it('respeita o limite', () => {
    const imoveis = Array.from({ length: 20 }, (_, i) =>
      makeImovel({ referencia: `R${i}`, bairro: 'Pinheiros' }),
    );
    expect(recommendImoveis(prefs, imoveis, { limit: 5 })).toHaveLength(5);
  });

  it('lead com histórico parcial: pontua só pelos critérios aplicáveis', () => {
    // Só cidade conhecida → imóveis pontuam apenas por cidade.
    const parcial: LeadPreferences = { cidades: ['São Paulo'] };
    const naCidade = makeImovel({ referencia: 'IN', cidade: 'São Paulo' });
    const foraCidade = makeImovel({ referencia: 'OUT', cidade: 'Rio' });
    const result = recommendImoveis(parcial, [naCidade, foraCidade], { enforceFinalidade: false });
    expect(result.map((r) => r.imovel.referencia)).toEqual(['IN']);
    expect(result[0].score).toBe(100);
    expect(result[0].applicableCriteria).toBe(1);
  });

  it('nenhum imóvel compatível → lista vazia (minScore filtra)', () => {
    const incompativel = makeImovel({ cidade: 'Rio', bairro: 'X', tipoSimplificado: 'terreno', valor_venda: 9_000_000, quartos: 0, area_util: 0 });
    const result = recommendImoveis(prefs, [incompativel], { enforceFinalidade: false, minScore: 10 });
    expect(result).toEqual([]);
  });
});
