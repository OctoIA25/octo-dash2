/**
 * 🔌 Acesso a dados dos KPIs (Supabase).
 *
 * Camada FINA e isolada: só lê do banco e devolve linhas/contagens cruas. Toda
 * a regra de cálculo vive em kpisCompute.js (puro). Separar permite testar a
 * regra sem rede e trocar a fonte sem tocar na regra.
 *
 * Notas de corretude (auditoria de KPIs):
 *  - Todas as queries filtram tenant_id E archived_at IS NULL.
 *  - Leads são paginados (evita o corte silencioso de 1000 linhas do PostgREST).
 *  - Imóveis ativos são CONTADOS no banco (count exact, head) — não traz linhas.
 */

import { dayEndUtc, dayStartUtc } from './kpisPeriod.js';

const LEADS_PAGE_SIZE = 1000;

// Na tabela `leads`, o estágio do funil é a coluna `status` (não existe
// `etapa_atual` — esse nome só aparece no ProcessedLead normalizado do front).
const LEAD_FIELDS = 'status,source,final_sale_value,created_at,first_response_at';

/**
 * Lê todos os leads do período (paginado), escopados por tenant e sem
 * arquivados. `agentId` opcional restringe ao corretor (escopo individual).
 */
export async function fetchLeads(supabase, { tenantId, period, agentId }) {
  const rows = [];
  let from = 0;

  for (;;) {
    let query = supabase
      .from('leads')
      .select(LEAD_FIELDS)
      .eq('tenant_id', tenantId)
      .is('archived_at', null)
      .gte('created_at', dayStartUtc(period.startDate))
      .lte('created_at', dayEndUtc(period.endDate))
      .range(from, from + LEADS_PAGE_SIZE - 1);

    if (agentId) {
      query = query.eq('assigned_agent_id', agentId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const page = data || [];
    rows.push(...page);
    if (page.length < LEADS_PAGE_SIZE) break;
    from += LEADS_PAGE_SIZE;
  }

  return rows;
}

const COMMERCIAL_PAGE_SIZE = 1000;

/**
 * Soma VGV e VGC das vendas comerciais ASSINADAS no período (commercial_sales).
 *
 * Fonte única dos dois indicadores: a planilha comercial oficial. Filtra por
 * `data_assinatura` (coluna DATE → compara com as datas ISO cruas, sem UTC) e
 * por `is_active` (descarta linhas substituídas em reimportações). Pagina para
 * não sofrer o corte de 1000 linhas do PostgREST.
 *
 * Retorna { vgv, vgc } (números). Em erro, loga e retorna zeros — VGV/VGC são
 * KPIs auxiliares e não devem derrubar o painel inteiro.
 */
export async function fetchCommercialTotals(supabase, { tenantId, period }) {
  let vgv = 0;
  let vgc = 0;
  let page = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('commercial_sales')
      .select('valor_vgv,valor_vgc')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .gte('data_assinatura', period.startDate)
      .lte('data_assinatura', period.endDate)
      .range(page * COMMERCIAL_PAGE_SIZE, (page + 1) * COMMERCIAL_PAGE_SIZE - 1);

    if (error) {
      console.error('[kpis] falha ao somar VGV/VGC comerciais:', error.message);
      return { vgv: 0, vgc: 0 };
    }

    const rows = data || [];
    for (const row of rows) {
      vgv += Number(row.valor_vgv) || 0;
      vgc += Number(row.valor_vgc) || 0;
    }

    if (rows.length < COMMERCIAL_PAGE_SIZE) break;
    page += 1;
  }

  return { vgv, vgc };
}

/** Conta imóveis ativos do tenant (agregação no banco; não traz linhas). */
export async function countImoveisAtivos(supabase, { tenantId }) {
  const { count, error } = await supabase
    .from('imoveis_locais')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) {
    // Imóveis é um KPI auxiliar: falha aqui não deve derrubar o painel inteiro.
    console.error('[kpis] falha ao contar imóveis ativos:', error.message);
    return 0;
  }
  return count || 0;
}

const clampPercent = (n) => Math.max(0, Math.min(100, n));

function formatGoalValue(value, unit) {
  const v = Number(value) || 0;
  if (unit === 'currency') {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  if (unit === 'percent') return `${Math.round(v)}%`;
  return v.toLocaleString('pt-BR');
}

/**
 * Lê metas ativas do tenant e devolve o progresso já formatado.
 *
 * Usa os valores persistidos (current_value/target_value) — a mesma base que a
 * sincronização automática (auto-sync) grava. Mantém simples de propósito: não
 * re-deriva o domínio de metas no servidor.
 */
export async function fetchGoals(supabase, { tenantId, limit = 6 }) {
  const { data, error } = await supabase
    .from('goals')
    .select('id,name,unit,status,target_value,current_value')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  if (error) {
    console.error('[kpis] falha ao ler metas:', error.message);
    return [];
  }

  return (data || [])
    .map((row) => {
      const current = Number(row.current_value) || 0;
      const target = Number(row.target_value) || 0;
      const percent = target > 0 ? clampPercent((current / target) * 100) : 0;
      return {
        id: row.id,
        name: row.name,
        realizadoDisplay: formatGoalValue(current, row.unit),
        metaDisplay: formatGoalValue(target, row.unit),
        percent: Math.round(percent),
      };
    })
    .sort((a, b) => b.percent - a.percent)
    .slice(0, limit);
}
