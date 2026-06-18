/**
 * Registry de FONTES DE MÉTRICA do CRM.
 *
 * Cada fonte sabe calcular o "valor realizado" de uma categoria de meta
 * a partir dos dados já existentes no banco, dentro de um período.
 *
 * Ponto de extensão: para tornar uma categoria auto-atualizável, registre
 * uma fonte aqui e marque `supportsAutoSync: true` na categoria
 * (domain/categories.ts). Um teste garante que os dois lados ficam em sincronia.
 *
 * Importante: este módulo é a ÚNICA parte que conhece as tabelas de origem
 * (proposals, imoveis, recruitment_candidates). As metas não dependem do
 * formato dessas tabelas — só do contrato `GoalMetricSource`.
 */

import { supabase } from '@/integrations/supabase/client';

export interface GoalMetricSource {
  categoryId: string;
  label: string;
  /**
   * Calcula o valor realizado no período [startDate, endDate] (datas ISO
   * 'YYYY-MM-DD'), isolado por tenant.
   */
  compute(tenantId: string, startDate: string, endDate: string): Promise<number>;
}

/** Converte uma data ISO ('YYYY-MM-DD') nos limites do dia em UTC. */
function dayStart(date: string): string {
  return `${date}T00:00:00.000Z`;
}
function dayEnd(date: string): string {
  return `${date}T23:59:59.999Z`;
}

/** VGV: soma do valor das propostas assinadas no período. */
const vgvSource: GoalMetricSource = {
  categoryId: 'vgv',
  label: 'Vendas (propostas assinadas)',
  async compute(tenantId, startDate, endDate) {
    const { data, error } = await supabase
      .from('proposals')
      .select('value')
      .eq('tenant_id', tenantId)
      .eq('stage_id', 'proposta-assinada')
      .gte('created_at', dayStart(startDate))
      .lte('created_at', dayEnd(endDate));

    if (error) throw new Error(`Falha ao calcular VGV: ${error.message}`);
    return (data ?? []).reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  },
};

/**
 * VGC: soma da comissão (`valor_vgc`) das vendas comerciais assinadas no
 * período. Diferente do VGV (origem em `proposals`), o VGC real é mantido em
 * `commercial_sales`, alimentado pela sincronização da planilha comercial.
 *
 * - Filtra por `data_assinatura` (coluna DATE) — o marco equivalente à
 *   "proposta assinada" do VGV. Vendas sem data de assinatura ficam fora do
 *   período. Por ser DATE, comparamos com as datas ISO cruas (sem dayStart/End).
 * - Pagina os resultados: `commercial_sales` é um dataset de importação em
 *   massa e o PostgREST limita ~1000 linhas por requisição — somar só a 1ª
 *   página subestimaria a meta silenciosamente.
 */
const COMMERCIAL_SALES_PAGE_SIZE = 1000;

const vgcSource: GoalMetricSource = {
  categoryId: 'vgc',
  label: 'Comissão (vendas comerciais assinadas)',
  async compute(tenantId, startDate, endDate) {
    let total = 0;
    let page = 0;

    while (true) {
      const { data, error } = await supabase
        .from('commercial_sales')
        .select('valor_vgc')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .gte('data_assinatura', startDate)
        .lte('data_assinatura', endDate)
        .range(page * COMMERCIAL_SALES_PAGE_SIZE, (page + 1) * COMMERCIAL_SALES_PAGE_SIZE - 1);

      if (error) throw new Error(`Falha ao calcular VGC: ${error.message}`);

      const rows = (data ?? []) as Array<{ valor_vgc: number | string | null }>;
      total += rows.reduce((sum, row) => sum + (Number(row.valor_vgc) || 0), 0);

      if (rows.length < COMMERCIAL_SALES_PAGE_SIZE) break;
      page += 1;
    }

    return total;
  },
};

/** Captação: contagem de imóveis ativos cadastrados no período. */
const captacaoSource: GoalMetricSource = {
  categoryId: 'captacao',
  label: 'Imóveis captados',
  async compute(tenantId, startDate, endDate) {
    const { count, error } = await supabase
      .from('imoveis')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'ativo')
      .gte('created_at', dayStart(startDate))
      .lte('created_at', dayEnd(endDate));

    if (error) throw new Error(`Falha ao calcular Captação: ${error.message}`);
    return count ?? 0;
  },
};

/** Recrutamento: contagem de candidatos aprovados no período. */
const recrutamentoSource: GoalMetricSource = {
  categoryId: 'recrutamento',
  label: 'Corretores recrutados',
  async compute(tenantId, startDate, endDate) {
    const { count, error } = await supabase
      .from('recruitment_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'Aprovado')
      .gte('data_inscricao', dayStart(startDate))
      .lte('data_inscricao', dayEnd(endDate));

    if (error) throw new Error(`Falha ao calcular Recrutamento: ${error.message}`);
    return count ?? 0;
  },
};

const GOAL_METRIC_SOURCES: Record<string, GoalMetricSource> = {
  [vgvSource.categoryId]: vgvSource,
  [vgcSource.categoryId]: vgcSource,
  [captacaoSource.categoryId]: captacaoSource,
  [recrutamentoSource.categoryId]: recrutamentoSource,
};

export function getMetricSource(categoryId: string): GoalMetricSource | undefined {
  return GOAL_METRIC_SOURCES[categoryId];
}

/** Ids das categorias que possuem fonte automática (para testes/UI). */
export function autoSyncableCategoryIds(): string[] {
  return Object.keys(GOAL_METRIC_SOURCES);
}
