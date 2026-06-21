/**
 * Leitura da CONFIGURAÇÃO de KPIs (tabelas novas) no servidor. service_role
 * bypassa RLS → o isolamento por tenant é responsabilidade DESTE código
 * (sempre filtra tenant_id), igual ao restante de server/kpis.
 */
const num = (v) => { const n = typeof v === 'string' ? Number(v) : v; return Number.isFinite(n) ? n : 0; };

export async function fetchDashboardKpis(supabase, { tenantId }) {
  const { data, error } = await supabase.from('dashboard_kpis').select('*').eq('tenant_id', tenantId).order('display_order', { ascending: true });
  if (error) return [];
  return (data || []).map((r) => ({
    id: r.id, name: r.name, description: r.description || '', categoryId: r.category_id,
    source: r.source, metricKey: r.metric_key, unit: r.unit, status: r.status,
    isVisible: r.is_visible, isFeatured: r.is_featured, displayOrder: num(r.display_order), isSystem: r.is_system,
  }));
}

async function fetchPeriodScoped(supabase, table, { tenantId, periodType, periodStart }) {
  const { data, error } = await supabase.from(table).select('*')
    .eq('tenant_id', tenantId).eq('period_type', periodType).eq('period_start', periodStart);
  if (error) return [];
  return data || [];
}

export async function fetchKpiTargets(supabase, scope) {
  return (await fetchPeriodScoped(supabase, 'kpi_targets', scope)).map((r) => ({ kpiId: r.kpi_id, targetValue: num(r.target_value) }));
}
export async function fetchKpiValues(supabase, scope) {
  return (await fetchPeriodScoped(supabase, 'kpi_values', scope)).map((r) => ({ kpiId: r.kpi_id, value: num(r.value) }));
}
