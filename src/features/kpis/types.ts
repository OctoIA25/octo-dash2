/**
 * Contrato (DTOs) da área de KPIs.
 *
 * Estes tipos são a FRONTEIRA entre a UI e a fonte de dados. A página e os
 * componentes só conhecem estes tipos — nunca o Supabase nem o formato das
 * tabelas. Isso permite trocar a fonte (Supabase ↔ endpoint REST) sem tocar
 * na UI: basta fornecer outra implementação de `KpisService` que devolva
 * exatamente este shape.
 */

/** Filtro de período aplicado a todos os KPIs da aba. */
export interface KpiPeriod {
  /** Início do período (inclusive), ISO 'YYYY-MM-DD'. */
  startDate: string;
  /** Fim do período (inclusive), ISO 'YYYY-MM-DD'. */
  endDate: string;
  /** Rótulo amigável para exibição (ex.: "Junho/2026"). */
  label: string;
}

/** Variação percentual de um indicador vs. o período anterior comparável. */
export interface KpiTrend {
  /** Variação em pontos percentuais (ex.: 12.5 = +12,5%). `null` = sem baseline. */
  percent: number | null;
  /** true se a variação é "boa" para o negócio (considera métricas invertidas). */
  positive: boolean;
}

/** Cartão de KPI já formatado para exibição (configurável, vindo do registro). */
export interface KpiSummaryCard {
  /** Id do registro em `dashboard_kpis`. */
  id: string;
  /** Métrica nativa quando source='crm' (catálogo de server/kpis); senão null. */
  metricKey: string | null;
  source: 'crm' | 'manual' | 'planilha';
  unit: 'count' | 'currency' | 'percent';
  label: string;
  /** Ordem de exibição no dashboard (display_order). */
  displayOrder: number;
  /** Valor numérico bruto (realizado). */
  rawValue: number;
  /** Valor já formatado para a tela. */
  displayValue: string;
  /** Meta do período (null quando não há meta cadastrada). */
  target: number | null;
  /** Progresso vs. meta (0–100, null quando sem meta). */
  progressPercent: number | null;
  trend: KpiTrend | null;
}

/** Uma etapa do funil de conversão. */
export interface KpiFunnelStage {
  label: string;
  count: number;
  /** Percentual sobre o topo do funil (0–100). */
  percentOfTotal: number;
  /** Conversão em relação à etapa anterior (0–100); `null` na primeira etapa. */
  conversionFromPrevious: number | null;
}

export interface KpiFunnel {
  stages: KpiFunnelStage[];
  /** Conversão geral: última etapa / topo do funil (0–100). */
  overallConversion: number;
}

/** Negócios fechados agrupados por fonte do lead. */
export interface KpiSourceBreakdown {
  fonte: string;
  quantidade: number;
  valor: number;
}

/** Distribuição de vendas por faixa de preço. */
export interface KpiPriceRange {
  faixa: string;
  quantidade: number;
}

/** Progresso de uma meta (espelha o domínio de metas, já formatado). */
export interface KpiGoalProgress {
  id: string;
  name: string;
  /** Valor realizado já formatado (moeda/quantidade). */
  realizadoDisplay: string;
  /** Valor da meta já formatado. */
  metaDisplay: string;
  /** Percentual de atingimento (0–100, clamped). */
  percent: number;
}

/**
 * Comparação mensal de um indicador comercial (VGV ou VGC): mês anterior vs
 * atual, com valores já formatados e a variação %.
 */
export interface KpiCommercialComparison {
  key: 'vgv' | 'vgc';
  label: string;
  previousLabel: string;
  currentLabel: string;
  previousValue: number;
  currentValue: number;
  previousDisplay: string;
  currentDisplay: string;
  trend: KpiTrend;
}

/** Pacote completo consumido pela página de KPIs. */
export interface KpisOverview {
  period: KpiPeriod;
  cards: KpiSummaryCard[];
  funnel: KpiFunnel;
  sources: KpiSourceBreakdown[];
  priceRanges: KpiPriceRange[];
  goals: KpiGoalProgress[];
  /** Comparação mês a mês de VGV e VGC (sempre 2 itens: VGV e VGC). */
  commercial: KpiCommercialComparison[];
}

/**
 * Contrato do provedor de dados de KPIs.
 *
 * Implementação atual: Supabase (client-side). Implementação futura: cliente
 * REST que chama `GET /api/v1/kpis`. A UI não muda.
 */
export interface KpisService {
  getOverview(params: {
    tenantId: string;
    period: KpiPeriod;
    /** Quando informado, restringe ao corretor (escopo individual). */
    agentId?: string | null;
  }): Promise<KpisOverview>;
}
