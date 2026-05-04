/**
 * Tipos TypeScript para o Dashboard de Métricas
 * Gestão de Equipe - Métricas da Equipe e Métricas Individuais
 */

import { Team } from "@/features/corretores/services/teamsManagementService";

// ================================================================================
// TIPOS PARA MÉTRICAS DA EQUIPE (ABA 1)
// ================================================================================

export interface TeamKPI {
  vendasCriadas: number;
  vendasAssinadas: number;
  imoveisAtivos: number;
  totalLeadsMes: number;
  valorTotalVendasMes: number;
  tempoMedioRespostaGeral: number; // em minutos
}

export interface TempoRespostaPorEquipeData {
  equipe: string;
  tempoMedio: number; // em minutos
  cor: string;
}

export interface VGCMensalData {
  mes: string;
  valor: number;
}

export interface LeadsPorEquipeData {
  equipe: string;
  quantidade: number;
  cor: string;
}

export interface VendasPorFaixaData {
  mes: string;
  ate_500k: number;
  de_500k_999k: number;
  acima_1m: number;
}

export interface DistribuicaoExclusivoFichaData {
  tipo: string;
  quantidade: number;
  percentual: number;
}

export interface EvolucaoAtivacaoData {
  mes: string;
  quantidade: number;
}

export interface NegocioFechadoPorFonteData {
  fonte: string;
  quantidade: number;
}

// ================================================================================
// TIPOS PARA MÉTRICAS INDIVIDUAIS (ABA 2)
// ================================================================================

export interface CorretorKPIs {
  vendasFeitas: number;
  comissaoTotal: number;
  gestaoAtiva: number;
  percentualAtingimentoMeta: number;
  tempoMedioResposta: number; // em minutos
}

export interface FunilVendas {
  leadsRecebidos: number;
  visitasRealizadas: number;
  taxaConversaoVisitas: number;
  vendasRealizadas: number;
  taxaConversaoVendas: number;
}

export interface PortfolioImoveis {
  imoveisFicha: number;
  imoveisExclusivos: number;
}

export interface LeadsPorFonteData {
  fonte: string;
  quantidade: number;
}

export interface EvolucaoLeadsData {
  mes: string;
  quantidade: number;
}

export interface CorretorMetricasCompletas {
  id: string;
  nome: string;
  foto?: string;
  ranking: number;
  equipe: string;
  kpis: CorretorKPIs;
  funil: FunilVendas;
  portfolio: PortfolioImoveis;
  leadsPorFonte: LeadsPorFonteData[];
  evolucaoLeads: EvolucaoLeadsData[];
  participacaoTreinamentos: number;
}

// ================================================================================
// TIPOS PARA FILTROS
// ================================================================================

export interface FiltrosMetricasIndividuais {
  periodo: {
    dataInicio: Date | null;
    dataFim: Date | null;
  };
  equipe: string;
}

export type EquipeOption = Team['id'];

// ================================================================================
// TIPOS PARA GRÁFICOS (Recharts)
// ================================================================================

export interface ChartTooltipPayload {
  name: string;
  value: number;
  color: string;
  payload: Record<string, unknown>;
}

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// ================================================================================
// TIPOS PARA SKELETON LOADERS
// ================================================================================

export interface SkeletonProps {
  className?: string;
  isLoading?: boolean;
}
