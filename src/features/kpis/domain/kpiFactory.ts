/** Fábricas de rascunho de KPI (valores-padrão num único lugar). */
import type { DashboardKpi, DashboardKpiDraft } from './kpiTypes';

export function createEmptyKpiDraft(): DashboardKpiDraft {
  return {
    name: '',
    description: '',
    categoryId: 'geral',
    unit: 'count',
    source: 'manual',
    metricKey: null,
    status: 'active',
    isVisible: true,
    displayOrder: 0,
    config: {},
  };
}

/** Extrai os campos editáveis de um KPI existente. */
export function kpiToDraft(kpi: DashboardKpi): DashboardKpiDraft {
  const { id, tenantId, isFeatured, isSystem, createdAt, updatedAt, ...draft } = kpi;
  return draft;
}
