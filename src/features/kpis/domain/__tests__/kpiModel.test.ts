import { describe, expect, it } from 'vitest';
import { validateKpiDraft, resolveProgress } from '../kpiModel';
import { createEmptyKpiDraft, kpiToDraft } from '../kpiFactory';
import type { DashboardKpi, DashboardKpiDraft } from '../kpiTypes';

function makeDraft(over: Partial<DashboardKpiDraft> = {}): DashboardKpiDraft {
  return { ...createEmptyKpiDraft(), ...over };
}

describe('validateKpiDraft', () => {
  it('exige nome', () => {
    expect(validateKpiDraft(makeDraft({ name: '' }))).toContain('Nome é obrigatório.');
  });
  it('crm exige metricKey de catálogo conhecido', () => {
    expect(validateKpiDraft(makeDraft({ source: 'crm', metricKey: null }))).toContain('KPI do CRM exige uma métrica de origem.');
    expect(validateKpiDraft(makeDraft({ source: 'crm', metricKey: 'inexistente' }))).toContain('Métrica de origem desconhecida.');
    expect(validateKpiDraft(makeDraft({ name: 'X', source: 'crm', metricKey: 'vendas' }))).toEqual([]);
  });
  it('manual/planilha NÃO podem ter metricKey', () => {
    expect(validateKpiDraft(makeDraft({ name: 'X', source: 'manual', metricKey: 'vendas' }))).toContain('Apenas KPIs do CRM usam métrica de origem.');
  });
  it('rascunho padrão (manual, sem metricKey) com nome é válido', () => {
    expect(validateKpiDraft(makeDraft({ name: 'Meu KPI' }))).toEqual([]);
  });
});

describe('resolveProgress', () => {
  it('calcula percentual e clampa em 100', () => {
    expect(resolveProgress(100, 50)).toEqual({ percent: 50, rawPercent: 50 });
    expect(resolveProgress(100, 150)).toEqual({ percent: 100, rawPercent: 150 });
  });
  it('alvo nulo/zero → zero', () => {
    expect(resolveProgress(null, 50)).toEqual({ percent: 0, rawPercent: 0 });
    expect(resolveProgress(0, 50)).toEqual({ percent: 0, rawPercent: 0 });
  });
});

describe('kpiToDraft', () => {
  it('descarta campos não-editáveis', () => {
    const kpi: DashboardKpi = {
      id: 'k1', tenantId: 't1', name: 'A', description: '', categoryId: 'geral',
      unit: 'count', source: 'manual', metricKey: null, status: 'active',
      isVisible: true, isFeatured: true, displayOrder: 3, isSystem: true,
      config: {}, createdAt: 'x', updatedAt: 'y',
    };
    const draft = kpiToDraft(kpi);
    expect('id' in draft).toBe(false);
    expect('isSystem' in draft).toBe(false);
    expect(draft.name).toBe('A');
  });
});
