/**
 * Leitura/escrita de metas (kpi_targets) e realizado (kpi_values), por período.
 * O upsert é IDEMPOTENTE (onConflict na chave de período) — re-importar o mesmo
 * mês atualiza em vez de duplicar.
 */
import { supabase } from '@/integrations/supabase/client';
import type { KpiTarget, KpiValue } from '@/features/kpis/domain/kpiTypes';
import type { KpiPeriodType } from '@/features/kpis/domain/periods';

const toNumber = (v: number | string): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
};

export function mapTargetRow(row: Record<string, unknown>): KpiTarget {
  return {
    id: row.id as string,
    kpiId: row.kpi_id as string,
    tenantId: row.tenant_id as string,
    periodType: row.period_type as KpiPeriodType,
    periodStart: row.period_start as string,
    targetValue: toNumber(row.target_value as number | string),
    source: (row.source as KpiTarget['source']) ?? 'manual',
    batchId: (row.batch_id as string | null) ?? null,
  };
}

export function mapValueRow(row: Record<string, unknown>): KpiValue {
  return {
    id: row.id as string,
    kpiId: row.kpi_id as string,
    tenantId: row.tenant_id as string,
    periodType: row.period_type as KpiPeriodType,
    periodStart: row.period_start as string,
    value: toNumber(row.value as number | string),
    source: (row.source as KpiValue['source']) ?? 'manual',
    batchId: (row.batch_id as string | null) ?? null,
  };
}

// Soft-fail nas leituras: metas/realizado não devem QUEBRAR o overview (o card
// só aparece "sem meta"). Mas logamos o erro para a falha de rede não ficar
// invisível em produção (distinto de "nunca cadastrou meta").
export async function fetchTargets(tenantId: string, periodType: KpiPeriodType, periodStart: string): Promise<KpiTarget[]> {
  const { data, error } = await supabase.from('kpi_targets').select('*')
    .eq('tenant_id', tenantId).eq('period_type', periodType).eq('period_start', periodStart);
  if (error) {
    console.error('[kpiTargetsService] erro ao buscar metas:', error.message);
    return [];
  }
  return (data ?? []).map(mapTargetRow);
}

export async function fetchValues(tenantId: string, periodType: KpiPeriodType, periodStart: string): Promise<KpiValue[]> {
  const { data, error } = await supabase.from('kpi_values').select('*')
    .eq('tenant_id', tenantId).eq('period_type', periodType).eq('period_start', periodStart);
  if (error) {
    console.error('[kpiTargetsService] erro ao buscar realizado:', error.message);
    return [];
  }
  return (data ?? []).map(mapValueRow);
}

export async function upsertTarget(input: {
  kpiId: string;
  tenantId: string;
  periodType: KpiPeriodType;
  periodStart: string;
  targetValue: number;
  source: 'manual' | 'import';
  batchId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('kpi_targets').upsert({
    kpi_id: input.kpiId,
    tenant_id: input.tenantId,
    period_type: input.periodType,
    period_start: input.periodStart,
    target_value: input.targetValue,
    source: input.source,
    batch_id: input.batchId ?? null,
  }, { onConflict: 'kpi_id,period_type,period_start' });
  if (error) throw new Error('Não foi possível salvar a meta.');
}

export async function upsertValue(input: {
  kpiId: string;
  tenantId: string;
  periodType: KpiPeriodType;
  periodStart: string;
  value: number;
  source: 'manual' | 'import';
  batchId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('kpi_values').upsert({
    kpi_id: input.kpiId,
    tenant_id: input.tenantId,
    period_type: input.periodType,
    period_start: input.periodStart,
    value: input.value,
    source: input.source,
    batch_id: input.batchId ?? null,
  }, { onConflict: 'kpi_id,period_type,period_start' });
  if (error) throw new Error('Não foi possível salvar o realizado.');
}
