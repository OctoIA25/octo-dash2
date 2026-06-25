import { describe, expect, it } from 'vitest';
import type { KpiSummaryCard } from '../types';

describe('contrato KpiSummaryCard', () => {
  it('aceita um card configurável completo', () => {
    const card: KpiSummaryCard = {
      id: 'k1', label: 'Total de Leads', metricKey: 'totalLeads', source: 'crm',
      unit: 'count', displayOrder: 0, rawValue: 100, displayValue: '100',
      target: 120, progressPercent: 83.3, trend: { percent: 5, positive: true },
      category: 'comercial', isFeatured: false,
    };
    expect(card.id).toBe('k1');
    expect(card.metricKey).toBe('totalLeads');
    expect(card.source).toBe('crm');
    expect(card.unit).toBe('count');
    expect(card.displayOrder).toBe(0);
    expect(card.target).toBe(120);
    expect(card.progressPercent).toBe(83.3);
  });

  it('permite KPI sem meta (target/progressPercent nulos; origem não-crm sem metricKey)', () => {
    const card: KpiSummaryCard = {
      id: 'k2', label: 'NPS', metricKey: null, source: 'manual',
      unit: 'count', displayOrder: 3, rawValue: 0, displayValue: '0',
      target: null, progressPercent: null, trend: null,
      category: 'geral', isFeatured: false,
    };
    expect(card.target).toBeNull();
    expect(card.progressPercent).toBeNull();
    expect(card.metricKey).toBeNull();
  });

  it('KpiSummaryCard inclui category e isFeatured', () => {
    const card: KpiSummaryCard = {
      id: 'k1', metricKey: 'vgv', source: 'crm', unit: 'currency',
      label: 'VGV', displayOrder: 0, rawValue: 0, displayValue: 'R$ 0',
      target: null, progressPercent: null, trend: null,
      category: 'comercial', isFeatured: true,
    };
    expect(card.category).toBe('comercial');
    expect(card.isFeatured).toBe(true);
  });
});
