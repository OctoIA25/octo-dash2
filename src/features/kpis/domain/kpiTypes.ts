/**
 * Tipos de domínio dos KPIs configuráveis.
 *
 * Espelha a separação de `metas`: campos comuns à entidade + `config` JSONB
 * para extensão futura. `source` define a ORIGEM do realizado:
 *   - 'crm'      → calculado pelo servidor (metricKey aponta p/ o catálogo).
 *   - 'manual'   → digitado pelo gestor (kpi_values, por período).
 *   - 'planilha' → importado de Excel (kpi_values, por período).
 */
import type { KpiPeriodType } from './periods';

export type KpiSource = 'crm' | 'manual' | 'planilha';
export type KpiUnit = 'count' | 'currency' | 'percent';
export type KpiStatus = 'active' | 'inactive';

/** Métricas nativas que o servidor sabe calcular (catálogo fechado p/ crm). */
export const NATIVE_METRIC_KEYS = [
  'totalLeads', 'vendas', 'valorVendas', 'imoveisAtivos', 'tempoMedioResposta', 'taxaAtendimento',
] as const;
export type NativeMetricKey = (typeof NATIVE_METRIC_KEYS)[number];

export interface DashboardKpi {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  categoryId: string;
  unit: KpiUnit;
  source: KpiSource;
  /** Só preenchido quando source='crm'. */
  metricKey: string | null;
  status: KpiStatus;
  isVisible: boolean;
  isFeatured: boolean;
  displayOrder: number;
  /** Nativos seedados: não excluíveis. */
  isSystem: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Campos editáveis no formulário. isFeatured/isSystem têm ações próprias. */
export type DashboardKpiDraft = Omit<
  DashboardKpi, 'id' | 'tenantId' | 'isFeatured' | 'isSystem' | 'createdAt' | 'updatedAt'
>;

export interface KpiTarget {
  id: string;
  kpiId: string;
  tenantId: string;
  periodType: KpiPeriodType;
  periodStart: string;
  targetValue: number;
  source: 'manual' | 'import';
  batchId: string | null;
}

export interface KpiValue {
  id: string;
  kpiId: string;
  tenantId: string;
  periodType: KpiPeriodType;
  periodStart: string;
  value: number;
  source: 'manual' | 'import';
  batchId: string | null;
}
