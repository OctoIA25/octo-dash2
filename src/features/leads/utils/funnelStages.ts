/**
 * Lógica pura e reutilizável das ETAPAS DO FUNIL de leads.
 *
 * Esta lógica era embutida em `FunnelStagesBubbleChart`. Foi extraída para um
 * módulo puro (sem React) para:
 *  - permitir reaproveitamento por outros relatórios (ex.: Funil por Unidade)
 *    sem duplicar as regras de negócio das etapas;
 *  - tornar as regras testáveis isoladamente.
 *
 * IMPORTANTE: o comportamento aqui deve permanecer idêntico ao que o
 * componente calculava antes da extração (ver testes de regressão).
 */

import { ProcessedLead } from '@/data/realLeadsProcessor';

/** Subseção do funil exibida — controla quais etapas compõem o funil. */
export type FunnelSubSection = 'pre-atendimento' | 'atendimento' | 'geral' | 'proprietario';

/**
 * As 11 etapas do funil de Cliente Proprietário, na mesma ordem do kanban
 * (ver mapKanbanSlugToStatus em leadsService.ts). Fonte única: antes cada
 * gráfico mantinha a própria lista, e elas divergiam.
 */
export const PROPRIETARIO_STAGE_ORDER = [
  'Novos Proprietários',
  'Em Atendimento',
  'Primeira Visita',
  'Criação do Estudo de Mercado',
  'Apresentação do Estudo de Mercado',
  'Não Exclusivo',
  'Exclusivo',
  'Cadastro',
  'Plano de Marketing',
  'Propostas Respondidas',
  'Feitura de Contrato',
] as const;

/** "Não Exclusivo" → "nao-exclusivo". Tolera acento, caixa e o formato slug. */
const slugEtapa = (valor: string | null | undefined): string =>
  (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Variantes gravadas em `leads.status` que apontam para a mesma etapa. */
const ALIAS_ETAPA_PROPRIETARIO: Record<string, string> = {
  'novo-proprietario': 'novos-proprietarios',
  'nao-exclusivo': 'nao-exclusivo',
  'criacao-estudo-mercado': 'criacao-do-estudo-de-mercado',
  'apresentacao-estudo-mercado': 'apresentacao-do-estudo-de-mercado',
  'feitura-do-contrato': 'feitura-de-contrato',
};

const etapaProprietarioDoLead = (etapa: string | null | undefined): string => {
  const slug = slugEtapa(etapa);
  return ALIAS_ETAPA_PROPRIETARIO[slug] ?? slug;
};

/**
 * Conta leads numa etapa do funil de Proprietário: comparação exata por etapa
 * atual, então cada lead entra em exatamente uma etapa (o funil de Interessado
 * segue com as regras históricas mais frouxas, ver countLeadsInStage).
 */
export function countProprietariosInStage(leads: ProcessedLead[], stage: string): number {
  const alvo = etapaProprietarioDoLead(stage);
  return (leads || []).filter((l) => etapaProprietarioDoLead(l.etapa_atual) === alvo).length;
}

/**
 * Retorna a ordem das etapas do funil conforme a subseção ativa.
 * A ordem é significativa (topo → base do funil).
 */
export function getFunnelStageOrder(subSection: FunnelSubSection): string[] {
  // Cliente Proprietário: 11 etapas próprias
  if (subSection === 'proprietario') {
    return [...PROPRIETARIO_STAGE_ORDER];
  }

  // Pré-Atendimento: apenas 4 etapas (termina em Visita Agendada)
  if (subSection === 'pre-atendimento') {
    return ['Novos Leads', 'Em Atendimento', 'Interação', 'Visita Agendada'];
  }

  // Atendimento: 6 etapas (começa em Bolsão, termina em Proposta Assinada)
  if (subSection === 'atendimento') {
    return [
      'Bolsão',
      'Visita Realizada',
      'Negociação',
      'Proposta Criada',
      'Proposta Enviada',
      'Proposta Assinada',
    ];
  }

  // Geral: funil completo com 9 etapas
  return [
    'Novos Leads',
    'Em Atendimento',
    'Interação',
    'Visita Agendada',
    'Visita Realizada',
    'Negociação',
    'Proposta Criada',
    'Proposta Enviada',
    'Proposta Assinada',
  ];
}

/**
 * Conta quantos leads pertencem a uma etapa específica do funil.
 *
 * As regras de pertencimento são exatamente as mesmas usadas historicamente
 * pelo `FunnelStagesBubbleChart` (mantém compatibilidade com os números dos
 * relatórios atuais).
 */
export function countLeadsInStage(leads: ProcessedLead[], stage: string): number {
  const safeLeads = leads || [];
  const totalLeads = safeLeads.length;

  switch (stage) {
    case 'Novos Leads':
      return totalLeads;
    case 'Em Atendimento':
      return safeLeads.filter((l) => l.etapa_atual === 'Em Atendimento').length;
    case 'Interação':
      return safeLeads.filter((l) => l.etapa_atual === 'Interação').length;
    case 'Visita Agendada':
      return safeLeads.filter(
        (l) =>
          l.etapa_atual === 'Visita Agendada' ||
          l.etapa_atual === 'Visita agendada' ||
          (l.Data_visita && l.Data_visita.trim() !== '' && l.etapa_atual !== 'Visita Realizada')
      ).length;
    case 'Bolsão':
      // Leads no bolsão = leads sem imóvel definido ou aguardando atribuição
      return safeLeads.filter(
        (l) =>
          l.etapa_atual === 'Bolsão' ||
          l.etapa_atual === 'Bolsao' ||
          l.etapa_atual === 'Sem Imóvel' ||
          l.etapa_atual === 'Aguardando Imóvel' ||
          !l.codigo_imovel ||
          l.codigo_imovel.trim() === ''
      ).length;
    case 'Visita Realizada':
      return safeLeads.filter(
        (l) =>
          l.etapa_atual === 'Visita Realizada' ||
          l.etapa_atual === 'Visita realizada' ||
          l.Imovel_visitado === 'Sim'
      ).length;
    case 'Negociação':
      return safeLeads.filter(
        (l) =>
          l.etapa_atual === 'Negociação' ||
          l.etapa_atual === 'Em Negociação' ||
          l.etapa_atual === 'Negociacao'
      ).length;
    case 'Proposta Criada':
      return safeLeads.filter(
        (l) => l.etapa_atual === 'Proposta Criada' || l.etapa_atual === 'Proposta criada'
      ).length;
    case 'Proposta Enviada':
      return safeLeads.filter(
        (l) => l.etapa_atual === 'Proposta Enviada' || l.etapa_atual === 'Proposta enviada'
      ).length;
    case 'Proposta Assinada':
      return safeLeads.filter(
        (l) =>
          l.etapa_atual === 'Proposta Assinada' ||
          l.etapa_atual === 'Proposta assinada' ||
          l.etapa_atual === 'Fechamento' ||
          l.etapa_atual === 'Fechado' ||
          l.etapa_atual === 'Finalizado' ||
          l.etapa_atual === 'Negócio Fechado' ||
          (l.data_finalizacao && l.data_finalizacao.trim() !== '') ||
          (l.valor_final_venda && l.valor_final_venda > 0)
      ).length;
    default:
      return 0;
  }
}

export interface FunnelStages {
  /** Rótulos das etapas (na ordem do funil). */
  labels: string[];
  /** Mesmas etapas, sem normalização de rótulo (chave original). */
  etapasOriginais: string[];
  /** Quantidade de leads por etapa (alinhado a `labels`). */
  data: number[];
  /** Percentual de cada etapa sobre o total (string com 1 casa). */
  percentuais: string[];
  totalLeads: number;
  // Métricas derivadas (Cliente Interessado)
  visitasRealizadas: number;
  propostasAssinadas: number;
  taxaConversaoVisitas: string;
  taxaConversaoProposta: string;
  // Métricas derivadas (Cliente Proprietário)
  naoExclusivo: number;
  exclusivo: number;
  feituraContrato: number;
  totalProprietariosConvertidos: number;
  taxaConversaoProprietarios: string;
}

const pct = (parte: number, total: number): string =>
  total > 0 ? ((parte / total) * 100).toFixed(1) : '0.0';

/**
 * Calcula todas as etapas do funil + métricas derivadas para um conjunto de
 * leads, conforme a subseção. Função pura — base compartilhada entre o
 * componente de funil e o relatório de Funil por Unidade.
 */
export function computeFunnelStages(
  leads: ProcessedLead[],
  subSection: FunnelSubSection = 'geral'
): FunnelStages {
  const etapasOrdem = getFunnelStageOrder(subSection);
  const safeLeads = leads || [];
  const totalLeads = safeLeads.length;

  const labels = etapasOrdem.map((e) => e.replace('\n', ' '));
  const data = etapasOrdem.map((etapa) =>
    subSection === 'proprietario'
      ? countProprietariosInStage(safeLeads, etapa)
      : countLeadsInStage(safeLeads, etapa),
  );
  const percentuais = data.map((valor) => pct(valor, totalLeads));

  const visitasRealizadas = countLeadsInStage(safeLeads, 'Visita Realizada');
  const propostasAssinadas = countLeadsInStage(safeLeads, 'Proposta Assinada');

  // Cliente Proprietário (vendedor): Não Exclusivo, Exclusivo e Feitura de Contrato
  const naoExclusivo = countProprietariosInStage(safeLeads, 'Não Exclusivo');
  const exclusivo = countProprietariosInStage(safeLeads, 'Exclusivo');
  const feituraContrato = countProprietariosInStage(safeLeads, 'Feitura de Contrato');
  const totalProprietariosConvertidos = naoExclusivo + exclusivo + feituraContrato;

  return {
    labels,
    etapasOriginais: etapasOrdem,
    data,
    percentuais,
    totalLeads,
    visitasRealizadas,
    propostasAssinadas,
    taxaConversaoVisitas: pct(visitasRealizadas, totalLeads),
    taxaConversaoProposta: pct(propostasAssinadas, totalLeads),
    naoExclusivo,
    exclusivo,
    feituraContrato,
    totalProprietariosConvertidos,
    taxaConversaoProprietarios: pct(totalProprietariosConvertidos, totalLeads),
  };
}
