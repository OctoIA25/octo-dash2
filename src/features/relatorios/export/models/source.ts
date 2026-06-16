/**
 * Contrato de dados de entrada para os builders de modelo.
 *
 * A página (`RelatoriosPage`) preenche apenas o bloco correspondente à sub-área
 * ativa, reutilizando os memos que já calcula. Os gráficos chegam como
 * `ChartInput` (dados neutros), convertidos dos memos do Chart.js via
 * `fromChartJs` — nada de captura de tela.
 */

import type { CommercialSalesFinanceSummary } from '@/features/metricas/services/commercialSalesService';
import type { FinanceiroResumo } from '../../utils/buildFinanceiroResumo';
import type { ChartType, ValueFormat, ChartSeries } from '../types';

export type RelatoriosSubArea =
  | 'marketing'
  | 'metricas'
  | 'metricas-individuais'
  | 'imoveis'
  | 'financeiro';

/** Descrição neutra de um gráfico (sem id/título — o builder os adiciona). */
export interface ChartInput {
  chartType: ChartType;
  labels: string[];
  series: ChartSeries[];
  sliceColors?: string[];
  valueFormat?: ValueFormat;
}

export interface MarketingSource {
  kpis: {
    totalLeadsRecebidos: number;
    totalLeadsInteragidos: number;
    mediaInteracaoDia: number;
    mediaTempoPrimeiraInteracao: number;
    totalLeadsConvertidos: number;
  };
  charts: {
    canal: ChartInput;
    origem: ChartInput;
    origemTotal: ChartInput;
    convOrigem: ChartInput;
    convCanal: ChartInput;
    motivos: ChartInput;
  };
}

export interface MetricasRankingRow {
  ranking: number;
  corretor: string;
  valorComissao: number;
  vendasFeitas: number;
  gestaoAtiva: number;
}

export interface MetricasSource {
  subArea: 'visao-geral' | 'ranking';
  kpis: {
    vendasCriadas: number;
    vendasAssinadas: number;
    imoveisAtivos: number;
    totalLeadsMensal: number;
    valorTotalFormatado: string;
  };
  charts: {
    leadsEquipe: ChartInput;
    tempoEquipe: ChartInput;
    convEquipe: ChartInput;
    leadsUsuario: ChartInput;
    tempoUsuario: ChartInput;
    atividadesUsuario: ChartInput;
    convUsuario: ChartInput;
  };
  ranking: MetricasRankingRow[];
}

export interface MetricasIndividuaisSource {
  subArea: 'comissao-metas' | 'leads' | 'vendas';
  corretor: string;
  comissaoMetas: {
    metaAnual: number;
    comissaoRecebida: number;
    faltaParaMeta: number;
    percentual: number;
    exclusivos: number;
    metaExclusivo: number;
    ficha: number;
    metaFicha: number;
  };
  leads: {
    totalLeads: number;
    leadsRecebidos: number;
    visitas: number;
    vendasRealizadas: number;
  };
  vendas: {
    vendasTotal: number;
    vendasExclusivas: number;
    vendasNaoExclusivas: number;
    vgvTotal: number;
    comissaoTotal: number;
    ticketMedio: number;
    rows: Array<{
      codigo_imovel: string;
      exclusividade: string;
      fonte: string;
      valor_imovel: number;
      comissao: number;
      data: string;
    }>;
  };
  charts: {
    leadsBairro: ChartInput;
    leadsFonte: ChartInput;
    leadsImovel: ChartInput;
    vendasFonte: ChartInput;
  };
}

export interface ImoveisSource {
  financeiro: CommercialSalesFinanceSummary | null;
  charts: {
    vgv: ChartInput;
    vgc: ChartInput;
    bairros: ChartInput;
    faixa: ChartInput;
    exclusivo: ChartInput;
  };
}

export interface FinanceiroSource {
  resumo: FinanceiroResumo;
}

export interface ReportSource {
  subtitle?: string;
  meta?: Array<{ label: string; value: string }>;
  marketing?: MarketingSource;
  metricas?: MetricasSource;
  metricasIndividuais?: MetricasIndividuaisSource;
  imoveis?: ImoveisSource;
  financeiro?: FinanceiroSource;
}
