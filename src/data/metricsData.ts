/**
 * Dados Estáticos para o Dashboard de Métricas
 * TODO: Conectar com a API para dados dinâmicos
 */

import type {
  TeamKPI,
  VGCMensalData,
  LeadsPorEquipeData,
  VendasPorFaixaData,
  DistribuicaoExclusivoFichaData,
  EvolucaoAtivacaoData,
  NegocioFechadoPorFonteData,
  CorretorMetricasCompletas,
  TempoRespostaPorEquipeData
} from '@/types/metricsTypes';

// ================================================================================
// DADOS DA ABA 1: MÉTRICAS DA EQUIPE
// ================================================================================

// TODO: Conectar com a API
export const teamKPIs: TeamKPI = {
  vendasCriadas: 155,
  vendasAssinadas: 146,
  imoveisAtivos: 448,
  totalLeadsMes: 537,
  valorTotalVendasMes: 6898000,
  tempoMedioRespostaGeral: 12 // 12 minutos
};

// TODO: Conectar com a API
export const tempoRespostaPorEquipeData: TempoRespostaPorEquipeData[] = [
  { equipe: 'Equipe Verde', tempoMedio: 8, cor: '#22c55e' },
  { equipe: 'Equipe Amarela', tempoMedio: 14, cor: '#eab308' },
  { equipe: 'Equipe Vermelha', tempoMedio: 18, cor: '#ef4444' }
];

// TODO: Conectar com a API
export const vgcMensalData: VGCMensalData[] = [
  { mes: 'Jan', valor: 290070 },
  { mes: 'Fev', valor: 268648 },
  { mes: 'Mar', valor: 433545 },
  { mes: 'Abr', valor: 566735 },
  { mes: 'Mai', valor: 531690 },
  { mes: 'Jun', valor: 290774 },
  { mes: 'Jul', valor: 455680 },
  { mes: 'Ago', valor: 344930 },
  { mes: 'Set', valor: 511140 },
  { mes: 'Out', valor: 697347 },
  { mes: 'Nov', valor: 846530 }
];

 // TODO: Conectar com a API
 // VGV (Valor Geral de Vendas) - valores mensais agregados
 export const vgvMensalData: VGCMensalData[] = [
   { mes: 'Jan', valor: 3898000 },
   { mes: 'Fev', valor: 3612000 },
   { mes: 'Mar', valor: 5245000 },
   { mes: 'Abr', valor: 6810000 },
   { mes: 'Mai', valor: 6429000 },
   { mes: 'Jun', valor: 4023000 },
   { mes: 'Jul', valor: 5967000 },
   { mes: 'Ago', valor: 4778000 },
   { mes: 'Set', valor: 6284000 },
   { mes: 'Out', valor: 8126000 },
   { mes: 'Nov', valor: 9481000 }
 ];

// TODO: Conectar com a API
export const leadsPorEquipeData: LeadsPorEquipeData[] = [
  { equipe: 'Equipe Verde', quantidade: 211, cor: '#22c55e' },
  { equipe: 'Equipe Amarela', quantidade: 188, cor: '#eab308' },
  { equipe: 'Equipe Vermelha', quantidade: 138, cor: '#ef4444' }
];

// TODO: Conectar com a API
export const vendasPorFaixaData: VendasPorFaixaData[] = [
  { mes: 'Jan', ate_500k: 5, de_500k_999k: 8, acima_1m: 2 },
  { mes: 'Fev', ate_500k: 5, de_500k_999k: 5, acima_1m: 1 },
  { mes: 'Mar', ate_500k: 6, de_500k_999k: 5, acima_1m: 2 },
  { mes: 'Abr', ate_500k: 7, de_500k_999k: 5, acima_1m: 2 },
  { mes: 'Mai', ate_500k: 4, de_500k_999k: 10, acima_1m: 4 },
  { mes: 'Jun', ate_500k: 3, de_500k_999k: 6, acima_1m: 2 },
  { mes: 'Jul', ate_500k: 4, de_500k_999k: 6, acima_1m: 2 },
  { mes: 'Ago', ate_500k: 0, de_500k_999k: 11, acima_1m: 2 },
  { mes: 'Set', ate_500k: 3, de_500k_999k: 8, acima_1m: 1 },
  { mes: 'Out', ate_500k: 6, de_500k_999k: 11, acima_1m: 4 },
  { mes: 'Nov', ate_500k: 3, de_500k_999k: 10, acima_1m: 1 }
];

// TODO: Conectar com a API
export const distribuicaoExclusivoFichaData: DistribuicaoExclusivoFichaData[] = [
  { tipo: 'Exclusivo', quantidade: 105, percentual: 20.2 },
  { tipo: 'Ficha', quantidade: 416, percentual: 79.8 }
];

// TODO: Conectar com a API
export const evolucaoAtivacaoData: EvolucaoAtivacaoData[] = [
  { mes: 'Jan', quantidade: 31 },
  { mes: 'Fev', quantidade: 38 },
  { mes: 'Mar', quantidade: 53 },
  { mes: 'Abr', quantidade: 46 },
  { mes: 'Mai', quantidade: 41 },
  { mes: 'Jun', quantidade: 76 },
  { mes: 'Jul', quantidade: 50 },
  { mes: 'Ago', quantidade: 52 },
  { mes: 'Set', quantidade: 44 },
  { mes: 'Out', quantidade: 42 },
  { mes: 'Nov', quantidade: 48 }
];

// TODO: Conectar com a API
export const negocioFechadoPorFonteData: NegocioFechadoPorFonteData[] = [
  { fonte: 'Cliente Antigo', quantidade: 3 },
  { fonte: 'Chaves na Mão', quantidade: 2 },
  { fonte: 'Recepção', quantidade: 2 },
  { fonte: 'Site Japi', quantidade: 2 },
  { fonte: 'Imovel Web', quantidade: 1 },
  { fonte: 'Parceria Imóvel de Fora', quantidade: 1 },
  { fonte: 'Parceria Imóvel Nosso', quantidade: 1 },
  { fonte: 'Indicação', quantidade: 1 },
  { fonte: 'Posicionamento', quantidade: 1 }
];

// ================================================================================
// DADOS DA ABA 2: MÉTRICAS INDIVIDUAIS
// ================================================================================

// TODO: Conectar com a API
export const corretoresData: CorretorMetricasCompletas[] = [
  {
    id: '1',
    nome: 'Felipe Martins',
    ranking: 1,
    equipe: 'team_felipe_martins',
    kpis: {
      vendasFeitas: 55,
      comissaoTotal: 218231.82,
      gestaoAtiva: 19,
      percentualAtingimentoMeta: 56.3,
      tempoMedioResposta: 7
    },
    funil: {
      leadsRecebidos: 123,
      visitasRealizadas: 68,
      taxaConversaoVisitas: 55.28,
      vendasRealizadas: 6,
      taxaConversaoVendas: 4.88
    },
    portfolio: {
      imoveisFicha: 18,
      imoveisExclusivos: 6
    },
    leadsPorFonte: [
      { fonte: 'Grupo Zap', quantidade: 35 },
      { fonte: 'ImovelWeb', quantidade: 28 },
      { fonte: 'Facebook', quantidade: 22 },
      { fonte: 'Site Japi', quantidade: 20 },
      { fonte: 'Outros', quantidade: 18 }
    ],
    evolucaoLeads: [
      { mes: 'Ago', quantidade: 38 },
      { mes: 'Set', quantidade: 55 },
      { mes: 'Out', quantidade: 30 }
    ],
    participacaoTreinamentos: 95
  },
  {
    id: '2',
    nome: 'Mariana Mamede',
    ranking: 2,
    equipe: 'team_barbara',
    kpis: {
      vendasFeitas: 39,
      comissaoTotal: 201443.78,
      gestaoAtiva: 4,
      percentualAtingimentoMeta: 51.9,
      tempoMedioResposta: 11
    },
    funil: {
      leadsRecebidos: 98,
      visitasRealizadas: 52,
      taxaConversaoVisitas: 53.06,
      vendasRealizadas: 5,
      taxaConversaoVendas: 5.10
    },
    portfolio: {
      imoveisFicha: 15,
      imoveisExclusivos: 4
    },
    leadsPorFonte: [
      { fonte: 'Grupo Zap', quantidade: 28 },
      { fonte: 'ImovelWeb', quantidade: 25 },
      { fonte: 'Facebook', quantidade: 18 },
      { fonte: 'Site Japi', quantidade: 15 },
      { fonte: 'Outros', quantidade: 12 }
    ],
    evolucaoLeads: [
      { mes: 'Ago', quantidade: 32 },
      { mes: 'Set', quantidade: 42 },
      { mes: 'Out', quantidade: 24 }
    ],
    participacaoTreinamentos: 88
  },
  {
    id: '3',
    nome: 'Felipe Camargo',
    ranking: 3,
    equipe: 'team_felipe_camargo',
    kpis: {
      vendasFeitas: 37,
      comissaoTotal: 182941.19,
      gestaoAtiva: 6,
      percentualAtingimentoMeta: 47.2,
      tempoMedioResposta: 15
    },
    funil: {
      leadsRecebidos: 87,
      visitasRealizadas: 45,
      taxaConversaoVisitas: 51.72,
      vendasRealizadas: 4,
      taxaConversaoVendas: 4.60
    },
    portfolio: {
      imoveisFicha: 12,
      imoveisExclusivos: 5
    },
    leadsPorFonte: [
      { fonte: 'Grupo Zap', quantidade: 25 },
      { fonte: 'ImovelWeb', quantidade: 22 },
      { fonte: 'Facebook', quantidade: 15 },
      { fonte: 'Site Japi', quantidade: 13 },
      { fonte: 'Outros', quantidade: 12 }
    ],
    evolucaoLeads: [
      { mes: 'Ago', quantidade: 28 },
      { mes: 'Set', quantidade: 38 },
      { mes: 'Out', quantidade: 21 }
    ],
    participacaoTreinamentos: 92
  }
];

// ================================================================================
// OPÇÕES DE EQUIPES PARA FILTRO
// ================================================================================

export const equipesOptions = [
  { value: 'todas', label: 'Todas as equipes' },
  { value: 'equipe_verde', label: 'Equipe Verde' },
  { value: 'equipe_amarela', label: 'Equipe Amarela' },
  { value: 'equipe_vermelha', label: 'Equipe Vermelha' },
  { value: 'team_barbara', label: 'Team Bárbara' },
  { value: 'team_felipe_martins', label: 'Team Felipe Martins' },
  { value: 'team_felipe_camargo', label: 'Team Felipe Camargo' },
  { value: 'team_renato', label: 'Team Renato' }
];

// ================================================================================
// CORES DOS GRÁFICOS
// ================================================================================

export const chartColors = {
  primary: '#3b82f6',
  success: '#22c55e',
  warning: '#eab308',
  danger: '#ef4444',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  orange: '#f97316',
  pink: '#ec4899',
  faixas: {
    ate_500k: '#3b82f6',
    de_500k_999k: '#eab308',
    acima_1m: '#22c55e'
  },
  exclusivoFicha: {
    exclusivo: '#22c55e',
    ficha: '#3b82f6'
  },
  leadsFonte: ['#3b82f6', '#22c55e', '#eab308', '#8b5cf6', '#ef4444']
};

// ================================================================================
// FUNÇÕES UTILITÁRIAS
// ================================================================================

export const formatarMoeda = (valor: number): string => {
  if (valor >= 1000000) {
    return `R$ ${(valor / 1000000).toFixed(2)} Mi`;
  }
  if (valor >= 1000) {
    return `R$ ${(valor / 1000).toFixed(0)} K`;
  }
  return `R$ ${valor.toFixed(2)}`;
};

export const formatarMoedaCurta = (valor: number): string => {
  if (valor >= 1000000) {
    return `${(valor / 1000000).toFixed(1)}M`;
  }
  if (valor >= 1000) {
    return `${(valor / 1000).toFixed(0)}K`;
  }
  return valor.toFixed(0);
};

export const getRankingBadgeColor = (ranking: number): string => {
  switch (ranking) {
    case 1:
      return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-300';
    case 2:
      return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300';
    case 3:
      return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-300';
    default:
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300';
  }
};

export const getRankingLabel = (ranking: number): string => {
  if (ranking === 1) return '1º Lugar';
  if (ranking === 2) return '2º Lugar';
  if (ranking === 3) return '3º Lugar';
  return `${ranking}º Lugar`;
};
