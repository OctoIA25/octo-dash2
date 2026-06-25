import { describe, it, expect } from 'vitest';
import { groupCardsByCategory } from '../groupCardsByCategory';
import type { KpiSummaryCard } from '../types';

const card = (category: string, displayOrder: number): KpiSummaryCard => ({
  id: `${category}-${displayOrder}`, metricKey: null, source: 'crm', unit: 'count',
  label: 'X', displayOrder, rawValue: 0, displayValue: '0',
  target: null, progressPercent: null, trend: null, category, isFeatured: false,
});

describe('groupCardsByCategory', () => {
  it('agrupa por categoria', () => {
    const grouped = groupCardsByCategory([card('comercial', 0), card('marketing', 1), card('comercial', 2)]);
    expect(grouped.comercial).toHaveLength(2);
    expect(grouped.marketing).toHaveLength(1);
  });
  it('preserva ordem por displayOrder dentro da categoria', () => {
    const grouped = groupCardsByCategory([card('comercial', 5), card('comercial', 1)]);
    expect(grouped.comercial.map((c) => c.displayOrder)).toEqual([1, 5]);
  });
  it('categoria vazia cai em geral', () => {
    const grouped = groupCardsByCategory([card('', 0)]);
    expect(grouped.geral).toHaveLength(1);
  });

  it('sem knownCategories, mantém qualquer categoria preenchida (não força geral)', () => {
    const grouped = groupCardsByCategory([card('financeiro', 0)]);
    expect(grouped.financeiro).toHaveLength(1);
  });

  it('com knownCategories, categoria fora do conjunto cai em geral (não some da Home)', () => {
    const grouped = groupCardsByCategory(
      [card('comercial', 0), card('financeiro', 1)], // 'financeiro' = categoria customizada (texto livre no admin)
      ['comercial', 'marketing', 'operacao', 'equipe', 'geral'],
    );
    expect(grouped.comercial).toHaveLength(1);
    expect(grouped.financeiro).toBeUndefined();
    expect(grouped.geral).toHaveLength(1); // 'financeiro' foi dobrado em geral
  });
});
