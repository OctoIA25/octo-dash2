import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  valorParaFinalidade,
  DEFAULT_CRITERIA,
} from '../engine/criteria';
import type { LeadPreferences } from '../engine/types';
import { makeImovel } from './fixtures';

const criterion = (key: string) => DEFAULT_CRITERIA.find((c) => c.key === key)!;

describe('normalizeText', () => {
  it('remove acentos, caixa e espaços', () => {
    expect(normalizeText('  São PAULO ')).toBe('sao paulo');
    expect(normalizeText('Jardim Botânico')).toBe('jardim botanico');
  });
  it('trata null/undefined', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('valorParaFinalidade', () => {
  it('usa o valor correto por finalidade', () => {
    const imovel = makeImovel({ valor_venda: 800000, valor_locacao: 3000 });
    expect(valorParaFinalidade(imovel, 'venda')).toBe(800000);
    expect(valorParaFinalidade(imovel, 'locacao')).toBe(3000);
    // Sem finalidade: maior valor disponível.
    expect(valorParaFinalidade(imovel, undefined)).toBe(800000);
  });
});

describe('critérios individuais', () => {
  it('cidade: 1 quando casa, 0 quando difere, null sem preferência', () => {
    const c = criterion('cidade');
    expect(c.score({ cidades: ['São Paulo'] }, makeImovel({ cidade: 'sao paulo' }))).toBe(1);
    expect(c.score({ cidades: ['São Paulo'] }, makeImovel({ cidade: 'Campinas' }))).toBe(0);
    expect(c.score({}, makeImovel())).toBeNull();
  });

  it('tipo: compara o tipoSimplificado', () => {
    const c = criterion('tipo');
    expect(c.score({ tipos: ['casa'] }, makeImovel({ tipoSimplificado: 'casa' }))).toBe(1);
    expect(c.score({ tipos: ['casa'] }, makeImovel({ tipoSimplificado: 'apartamento' }))).toBe(0);
    expect(c.score({}, makeImovel())).toBeNull();
  });

  it('preco: decai com a distância relativa e zera além da tolerância (30%)', () => {
    const c = criterion('preco');
    const pref: LeadPreferences = { precoAlvo: 500000, finalidade: 'venda' };
    expect(c.score(pref, makeImovel({ valor_venda: 500000 }))).toBe(1);
    expect(c.score(pref, makeImovel({ valor_venda: 575000 }))!).toBeCloseTo(0.5, 5); // 15% → 0.5
    expect(c.score(pref, makeImovel({ valor_venda: 700000 }))).toBe(0); // 40% > 30%
    expect(c.score({}, makeImovel())).toBeNull();
  });

  it('quartos: proximidade por contagem', () => {
    const c = criterion('quartos');
    expect(c.score({ quartos: 3 }, makeImovel({ quartos: 3 }))).toBe(1);
    expect(c.score({ quartos: 3 }, makeImovel({ quartos: 2 }))).toBeCloseTo(0.6, 5);
    expect(c.score({ quartos: 3 }, makeImovel({ quartos: 0 }))).toBe(0); // diff 3 * 0.4 = 1.2 → clamp 0
  });

  it('area: proximidade relativa com tolerância de 40%', () => {
    const c = criterion('area');
    expect(c.score({ areaUtil: 100 }, makeImovel({ area_util: 100 }))).toBe(1);
    expect(c.score({ areaUtil: 100 }, makeImovel({ area_util: 200 }))).toBe(0);
    expect(c.score({ areaUtil: 100 }, makeImovel({ area_util: 0 }))).toBeNull();
  });
});
