/**
 * Coleta (I/O) para a seção de Escalonamento. Só busca linhas; a matemática
 * vive em escalations.js (funções puras). Mantém o endpoint com CC baixa.
 */

const PAGE = 1000;

/**
 * Linhas de lia_perguntas_corretor do tenant na janela [from, to).
 * Paginado por range para não estourar o teto do PostgREST. Ordena por criado_em
 * (estável para paginação). Janela por criado_em: é o instante do escalonamento.
 */
export async function fetchEscalationRows(supabase, tenantId, { from, to }) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from('lia_perguntas_corretor')
      .select('lead_id, criado_em, respondida_em, status')
      .eq('tenant_id', tenantId)
      .order('criado_em', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (from) q = q.gte('criado_em', from);
    if (to) q = q.lt('criado_em', to);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/**
 * Ids dos leads FECHADOS (leads.final_sale_value > 0) do tenant. "Fechado" =
 * definição canônica dos KPIs (kpisCompute.js). O cruzamento com os leads
 * escalonados é feito em memória (computeEscalationMetrics): buscamos os
 * fechados do tenant — conjunto pequeno (fechados << total) — em vez de mandar
 * centenas de ids escalonados num IN() de URL (que estoura o limite de tamanho
 * e vira "fetch failed"). Retorna um Set.
 */
export async function fetchClosedLeadIds(supabase, tenantId) {
  const { data, error } = await supabase
    .from('leads')
    .select('id')
    .eq('tenant_id', tenantId)
    .gt('final_sale_value', 0);
  if (error) throw new Error(error.message);
  return new Set((data || []).map((r) => r.id));
}
