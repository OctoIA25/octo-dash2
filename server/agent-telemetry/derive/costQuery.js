/**
 * Coleta para os cards financeiros (Fatia B). Só I/O + somas triviais; a
 * matemática dos cards vive em costMetrics.js (puro).
 */

const VGC_PAGE = 1000;

/** Eventos faturáveis = soma de `events` dos modelos com preço conhecido (cost_usd != null). */
export function billableEventsFromByModel(byModel) {
  return (byModel || []).reduce((sum, m) => (m.cost_usd != null ? sum + (m.events || 0) : sum), 0);
}

/**
 * VGC (comissão) do período: soma de commercial_sales.valor_vgc das vendas
 * assinadas na janela. Mesmo filtro do metricSources (is_active + data_assinatura).
 * Já vem em BRL. Paginado. Retorna número (0 = zero real de VGC, não N/A).
 */
export async function sumVgcBrl(supabase, tenantId, startDate, endDate) {
  let total = 0;
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from('commercial_sales')
      .select('valor_vgc')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .gte('data_assinatura', startDate)
      .lte('data_assinatura', endDate)
      .range(page * VGC_PAGE, (page + 1) * VGC_PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    total += rows.reduce((s, r) => s + (Number(r.valor_vgc) || 0), 0);
    if (rows.length < VGC_PAGE) break;
  }
  return total;
}

/**
 * Câmbio vigente na data de referência: busca as taxas do par e delega a escolha
 * a pickRate. Devolve o número da taxa ou null (sem taxa vigente → cost_brl null).
 */
export async function fetchRateForDate(supabase, pickRate, refDate, pair = 'USD/BRL') {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('rate, effective_from')
    .eq('pair', pair);
  if (error) throw new Error(error.message);
  return pickRate(data || [], refDate);
}
