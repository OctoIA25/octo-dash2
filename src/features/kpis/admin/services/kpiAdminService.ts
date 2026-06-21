/**
 * Acesso a dados dos KPIs configuráveis (Supabase). Molde de goalsService:
 *  - traduz snake_case (DB) ↔ camelCase (domínio);
 *  - isola por tenant em TODA operação;
 *  - registra histórico (auxiliar: falha não quebra a operação principal).
 */
import { supabase } from '@/integrations/supabase/client';
import type { DashboardKpi, DashboardKpiDraft } from '@/features/kpis/domain/kpiTypes';

const TABLE = 'dashboard_kpis';
const HISTORY = 'dashboard_kpi_history';

interface ActorContext { tenantId: string; actorName: string; }

const toNumber = (v: number | string): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
};

export function mapRowToKpi(row: Record<string, unknown>): DashboardKpi {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    name: (row.name as string) ?? '',
    description: (row.description as string) ?? '',
    categoryId: (row.category_id as string) ?? 'geral',
    unit: (row.unit as DashboardKpi['unit']) ?? 'count',
    source: (row.source as DashboardKpi['source']) ?? 'manual',
    metricKey: (row.metric_key as string | null) ?? null,
    status: (row.status as DashboardKpi['status']) ?? 'active',
    isVisible: (row.is_visible as boolean) ?? true,
    isFeatured: (row.is_featured as boolean) ?? false,
    displayOrder: toNumber(row.display_order as number | string),
    isSystem: (row.is_system as boolean) ?? false,
    config: (row.config as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapDraftToRow(draft: DashboardKpiDraft, tenantId: string) {
  return {
    tenant_id: tenantId,
    name: draft.name.trim(),
    description: draft.description.trim(),
    category_id: draft.categoryId,
    unit: draft.unit,
    source: draft.source,
    metric_key: draft.metricKey,
    status: draft.status,
    is_visible: draft.isVisible,
    display_order: draft.displayOrder,
    config: draft.config,
  };
}

/** Lança se o KPI for de sistema (nativos seedados não são excluíveis). */
export function assertDeletable(kpi: Pick<DashboardKpi, 'isSystem'>): void {
  if (kpi.isSystem) throw new Error('KPIs nativos não podem ser excluídos.');
}

async function recordHistory(kpiId: string, ctx: ActorContext, changeType: string, summary: string) {
  const { error } = await supabase.from(HISTORY).insert({
    kpi_id: kpiId, tenant_id: ctx.tenantId, changed_by_name: ctx.actorName, change_type: changeType, summary,
  });
  if (error) console.warn('[kpiAdminService] histórico falhou:', error.message);
}

export async function fetchKpis(tenantId: string): Promise<DashboardKpi[]> {
  if (!tenantId) return [];
  const { data, error } = await supabase.from(TABLE).select('*').eq('tenant_id', tenantId).order('display_order', { ascending: true });
  if (error) throw new Error('Não foi possível carregar os KPIs.');
  return (data ?? []).map(mapRowToKpi);
}

export async function createKpi(draft: DashboardKpiDraft, ctx: ActorContext): Promise<DashboardKpi> {
  const { data, error } = await supabase.from(TABLE).insert(mapDraftToRow(draft, ctx.tenantId)).select('*').single();
  if (error || !data) throw new Error('Não foi possível criar o KPI.');
  const kpi = mapRowToKpi(data);
  await recordHistory(kpi.id, ctx, 'created', 'KPI criado');
  return kpi;
}

export async function updateKpi(id: string, draft: DashboardKpiDraft, ctx: ActorContext): Promise<DashboardKpi> {
  const { data, error } = await supabase.from(TABLE).update(mapDraftToRow(draft, ctx.tenantId)).eq('id', id).eq('tenant_id', ctx.tenantId).select('*').single();
  if (error || !data) throw new Error('Não foi possível atualizar o KPI.');
  const kpi = mapRowToKpi(data);
  await recordHistory(kpi.id, ctx, 'updated', 'KPI atualizado');
  return kpi;
}

export async function deleteKpi(id: string, tenantId: string): Promise<void> {
  // Defesa em profundidade (o guard is_system é da APLICAÇÃO — o RLS não o impõe):
  // FAIL-CLOSED. Se a leitura falhar, abortamos antes do DELETE (não excluímos às
  // cegas). maybeSingle() distingue erro real (rede/RLS) de "não encontrado".
  const { data, error: readError } = await supabase
    .from(TABLE).select('is_system').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
  if (readError) throw new Error('Não foi possível verificar o KPI antes de excluir.');
  if (data) assertDeletable({ isSystem: Boolean(data.is_system) });

  const { error } = await supabase.from(TABLE).delete().eq('id', id).eq('tenant_id', tenantId);
  if (error) throw new Error('Não foi possível excluir o KPI.');
}

export async function reorderKpis(orderedIds: string[], tenantId: string): Promise<void> {
  // Grava display_order = índice. supabase-js NÃO rejeita em erro (fica em {error}),
  // então coletamos os resultados e lançamos se qualquer update falhar — caso
  // contrário a reordenação falharia silenciosamente (ordem parcial invisível).
  const results = await Promise.all(orderedIds.map((id, index) =>
    supabase.from(TABLE).update({ display_order: index }).eq('id', id).eq('tenant_id', tenantId)));
  if (results.some((r) => r.error)) throw new Error('Não foi possível reordenar os KPIs.');
}

export async function setKpiVisibility(id: string, isVisible: boolean, tenantId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ is_visible: isVisible }).eq('id', id).eq('tenant_id', tenantId);
  if (error) throw new Error('Não foi possível alterar a visibilidade.');
}

export async function setKpiStatus(id: string, status: DashboardKpi['status'], tenantId: string): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ status }).eq('id', id).eq('tenant_id', tenantId);
  if (error) throw new Error('Não foi possível alterar o status.');
}
