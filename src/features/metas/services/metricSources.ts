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

/**
 * VGV: soma do valor das propostas assinadas no período.
 *
 * Recorta por `signed_at`, não por `created_at`: proposta criada em janeiro e
 * assinada em março é venda de março — era o que a planilha sempre contou.
 */
const vgvSource: GoalMetricSource = {
  categoryId: 'vgv',
  label: 'Vendas (propostas assinadas)',
  async compute(tenantId, startDate, endDate) {
    const vendas = await buscarVendasAssinadas(tenantId, startDate, endDate);
    return somarVendas(vendas).vgv;
  },
};

/**
 * VGC: soma da comissão das vendas assinadas no período.
 *
 * Origem trocada de `commercial_sales` para `proposals` em 02/09/2026 — aquela
 * tabela é o histórico congelado da importação da planilha e não recebe venda
 * nova desde que o sync horário foi desligado. A comissão sai do override
 * (`commission_total`, exato da planilha nas vendas antigas) ou da derivação
 * 3,5% lançamento / 6% terceiros. Ver `vendasAssinadasService`.
 */
const vgcSource: GoalMetricSource = {
  categoryId: 'vgc',
  label: 'Comissão (vendas assinadas)',
  async compute(tenantId, startDate, endDate) {
    const vendas = await buscarVendasAssinadas(tenantId, startDate, endDate);
    return somarVendas(vendas).vgc;
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
