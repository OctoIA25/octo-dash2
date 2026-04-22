import { ProcessedLead } from '../data/realLeadsProcessor';

export interface DashboardMetrics {
  totalLeads: number;
  leadsQuentes: number;
  leadsMornos: number;
  leadsFrios: number;
  taxaConversao: number;
  ticketMedio: number;
  cicloMedio: number;
  totalInteracoes: number;
  visitasRealizadas: number;
  valorTotalPipeline: number;
  valorFinalizado: number;
}

export interface FunnelData {
  etapa: string;
  quantidade: number;
  percentual: number;
  color: string;
}

export interface ConversaoData {
  de: string;
  para: string;
  taxa: number;
  color: string;
}

export const normalizePercentagesFromCounts = (counts: number[], decimals: number = 1): number[] => {
  const total = counts.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  if (total <= 0) return counts.map(() => 0);

  const factor = Math.pow(10, decimals);
  const target = 100 * factor;

  const scaled = counts.map((v) => ((v / total) * 100) * factor);
  const floors = scaled.map((v) => Math.floor(v));
  const remainders = scaled.map((v, i) => v - floors[i]);

  let diff = target - floors.reduce((s, v) => s + v, 0);

  const indicesByRemainderDesc = remainders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r - a.r)
    .map((x) => x.i);

  const indicesByRemainderAsc = remainders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.i);

  if (diff > 0) {
    for (let k = 0; k < diff; k++) {
      const idx = indicesByRemainderDesc[k % indicesByRemainderDesc.length];
      floors[idx] += 1;
    }
  } else if (diff < 0) {
    diff = Math.abs(diff);
    for (let k = 0; k < diff; k++) {
      const idx = indicesByRemainderAsc[k % indicesByRemainderAsc.length];
      floors[idx] -= 1;
    }
  }

  return floors.map((v) => v / factor);
};

export const calculateMetrics = (leads: ProcessedLead[]): DashboardMetrics => {
  // Processar TODOS os leads, ignorando campo Exists
  const closedLeads = leads.filter(lead => lead.data_finalizacao && lead.etapa_atual === 'Finalizado');
  const leadsWithInteraction = leads.filter(lead => lead.etapa_atual !== 'Em Atendimento');
  const leadsWithVisit = leads.filter(lead => lead.Data_visita);

  // Total de Leads - USAR NÚMERO REAL TOTAL (não filtrado)
  const totalLeads = leads.length;

  // Distribuição por Temperatura - TODOS os leads
  const leadsQuentes = leads.filter(lead => lead.status_temperatura === 'Quente').length;
  const leadsMornos = leads.filter(lead => lead.status_temperatura === 'Morno').length;
  const leadsFrios = leads.filter(lead => lead.status_temperatura === 'Frio').length;

  // Taxa de Conversão
  const taxaConversao = totalLeads > 0 ? (closedLeads.length / totalLeads) * 100 : 0;

  // Ticket Médio (valor médio dos imóveis dos leads fechados)
  const ticketMedio = closedLeads.length > 0 
    ? closedLeads.reduce((sum, lead) => sum + (lead.valor_final_venda || lead.valor_imovel), 0) / closedLeads.length
    : 0;

  // Ciclo Médio (dias entre entrada e finalização)
  const cicloMedio = closedLeads.length > 0 
    ? closedLeads.reduce((sum, lead) => {
        const entrada = new Date(lead.data_entrada);
        const finalizacao = new Date(lead.data_finalizacao!);
        const diffTime = Math.abs(finalizacao.getTime() - entrada.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return sum + diffDays;
      }, 0) / closedLeads.length
    : 0;

  // Total Interações
  const totalInteracoes = leadsWithInteraction.length;

  // Visitas Realizadas
  const visitasRealizadas = leadsWithVisit.length;

  // Valor Total Pipeline (soma de todos os valores de imóveis)
  const valorTotalPipeline = leads.reduce((sum, lead) => sum + (lead.valor_imovel || 0), 0);

  // Valor Finalizado (soma dos valores finais de venda)
  const valorFinalizado = closedLeads.reduce((sum, lead) => sum + (lead.valor_final_venda || 0), 0);

  return {
    totalLeads,
    leadsQuentes,
    leadsMornos,
    leadsFrios,
    taxaConversao,
    ticketMedio,
    cicloMedio,
    totalInteracoes,
    visitasRealizadas,
    valorTotalPipeline,
    valorFinalizado
  };
};

export const getFunnelData = (leads: ProcessedLead[]): FunnelData[] => {
  // Usar TODOS os leads, ignorando campo Exists
  const totalLeads = leads.length;

  // Pipeline real: Em Atendimento → Qualificação → Apresentação → Proposta → Negociação → Fechamento → Finalizado
  const STAGES = ['Novos Leads', 'Em Atendimento', 'Interação', 'Visita Agendada', 'Visita Realizada', 'Negociação', 'Proposta Criada', 'Proposta Enviada', 'Proposta Assinada'] as const;
  
  // 🎨 PALETA DE CORES GRADIENTE AZUL (Médio -> Escuro #14263C)
  const STAGE_COLORS_ARRAY = [
    '#60A5FA', // 1. Azul Médio
    '#5294F8', // 2.
    '#3B82F6', // 3. Azul Vibrante
    '#3273F0', // 4.
    '#2563EB', // 5. Azul Forte
    '#1D4ED8', // 6. Azul Muito Forte
    '#1E40AF', // 7. Azul Escuro
    '#19316C', // 8.
    '#14263C'  // 9. Azul Marinho Escuro
  ];
  
  const counts: Record<string, number> = Object.fromEntries(STAGES.map(s => [s, 0]));
  counts['Novos Leads'] = totalLeads;
  leads.forEach(lead => {
    const etapa = lead.etapa_atual;
    if (etapa && counts.hasOwnProperty(etapa) && etapa !== 'Novos Leads') {
      counts[etapa] = (counts[etapa] || 0) + 1;
    }
  });

  return STAGES.map((etapa, index) => ({
    etapa,
    quantidade: counts[etapa] || 0,
    percentual: totalLeads > 0 ? ((counts[etapa] || 0) / totalLeads) * 100 : 0,
    color: STAGE_COLORS_ARRAY[index] || STAGE_COLORS_ARRAY[STAGE_COLORS_ARRAY.length - 1],
  }));
};

export const getConversaoData = (leads: ProcessedLead[]): ConversaoData[] => {
  // Usar TODOS os leads, ignorando campo Exists
  const totalLeads = leads.length;

  const STAGES = ['Novos Leads', 'Em Atendimento', 'Interação', 'Visita Agendada', 'Visita Realizada', 'Negociação', 'Proposta Criada', 'Proposta Enviada', 'Proposta Assinada'] as const;
  
  // 🎨 PALETA DE CORES GRADIENTE AZUL (Médio -> Escuro #14263C)
  const STAGE_COLORS_ARRAY = [
    '#60A5FA', // 1. Azul Médio
    '#5294F8', // 2.
    '#3B82F6', // 3. Azul Vibrante
    '#3273F0', // 4.
    '#2563EB', // 5. Azul Forte
    '#1D4ED8', // 6. Azul Muito Forte
    '#1E40AF', // 7. Azul Escuro
    '#19316C', // 8.
    '#14263C'  // 9. Azul Marinho Escuro
  ];
  
  const counts: Record<string, number> = Object.fromEntries(STAGES.map(s => [s, 0]));
  counts['Novos Leads'] = totalLeads;
  leads.forEach(lead => {
    const etapa = lead.etapa_atual;
    if (etapa && counts.hasOwnProperty(etapa) && etapa !== 'Novos Leads') {
      counts[etapa] = (counts[etapa] || 0) + 1;
    }
  });

  // Taxa de conversão entre etapas consecutivas  
  const pairs = STAGES.slice(0, -1).map((de, idx) => ({ de, para: STAGES[idx + 1] }));

  return pairs.map(({ de, para }) => {
    const countDe = counts[de] || 0;
    const countPara = counts[para] || 0;
    // Para calcular conversão corretamente, somamos todas as etapas posteriores
    const countPosteriores = STAGES.slice(STAGES.indexOf(para)).reduce((sum, stage) => sum + (counts[stage] || 0), 0);
    const taxa = countDe > 0 ? (countPosteriores / countDe) * 100 : 0;
    // Encontrar índice da etapa 'para'
    const paraIndex = STAGES.indexOf(para);
    const color = STAGE_COLORS_ARRAY[paraIndex] || STAGE_COLORS_ARRAY[STAGE_COLORS_ARRAY.length - 1];
    
    return { de, para, taxa, color };
  });
};

export const getOrigemData = (leads: ProcessedLead[]) => {
  // Usar TODOS os leads, ignorando campo Exists
  const origens = ['Site', 'Instagram', 'Indicação', 'Google Ads', 'Facebook', 'WhatsApp'];
  const colors = ['#3b82f6', '#ec4899', '#10b981', '#6b7280', '#8b5cf6', '#22c55e'];

  return origens.map((origem, index) => {
    const quantidade = leads.filter(lead => lead.origem_lead === origem).length;
    return {
      name: origem,
      value: quantidade,
      fill: colors[index]
    };
  }).filter(item => item.value > 0);
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('pt-BR').format(Math.round(value));
};

// Nova interface para performance por corretor
export interface CorretorPerformance {
  corretor: string;
  totalLeads: number;
  leadsFinalizados: number;
  taxaConversao: number;
  valorPipeline: number;
  valorFinalizado: number;
  tempoMedioCiclo: number;
}

// Nova interface para conversão por origem
export interface OrigemConversao {
  origem: string;
  totalLeads: number;
  leadsFinalizados: number;
  taxaConversao: number;
  valorMedio: number;
  color: string;
}

// Função para calcular performance por corretor
export const getCorretorPerformance = (leads: ProcessedLead[]): CorretorPerformance[] => {
  // Usar TODOS os leads, ignorando campo Exists
  const corretorMap = new Map<string, CorretorPerformance>();

  leads.forEach(lead => {
    const corretor = lead.corretor_responsavel || 'Não atribuído';
    
    if (!corretorMap.has(corretor)) {
      corretorMap.set(corretor, {
        corretor,
        totalLeads: 0,
        leadsFinalizados: 0,
        taxaConversao: 0,
        valorPipeline: 0,
        valorFinalizado: 0,
        tempoMedioCiclo: 0
      });
    }

    const performance = corretorMap.get(corretor)!;
    performance.totalLeads++;
    performance.valorPipeline += lead.valor_imovel || 0;

    if (lead.data_finalizacao && lead.etapa_atual === 'Finalizado') {
      performance.leadsFinalizados++;
      performance.valorFinalizado += lead.valor_final_venda || 0;
    }
  });

  // Calcular taxas de conversão e tempo médio
  corretorMap.forEach((performance, corretor) => {
    performance.taxaConversao = performance.totalLeads > 0 
      ? (performance.leadsFinalizados / performance.totalLeads) * 100 
      : 0;

    // Calcular tempo médio de ciclo para leads finalizados
    const leadsFinalizadosCorretor = leads.filter(lead => 
      lead.corretor_responsavel === corretor && 
      lead.data_finalizacao && 
      lead.etapa_atual === 'Finalizado'
    );

    if (leadsFinalizadosCorretor.length > 0) {
      const tempoTotal = leadsFinalizadosCorretor.reduce((sum, lead) => {
        const entrada = new Date(lead.data_entrada);
        const finalizacao = new Date(lead.data_finalizacao!);
        const diffTime = Math.abs(finalizacao.getTime() - entrada.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return sum + diffDays;
      }, 0);
      performance.tempoMedioCiclo = tempoTotal / leadsFinalizadosCorretor.length;
    }
  });

  return Array.from(corretorMap.values()).sort((a, b) => b.taxaConversao - a.taxaConversao);
};

// Função para calcular conversão por origem
export const getOrigemConversao = (leads: ProcessedLead[]): OrigemConversao[] => {
  // Usar TODOS os leads, ignorando campo Exists
  const origemMap = new Map<string, OrigemConversao>();
  
  const colors = {
    'Site': '#3b82f6',
    'Instagram': '#FF6B35', 
    'Indicação': '#10b981',
    'Google Ads': '#6b7280',
    'Facebook': '#1877F2',
    'WhatsApp': '#22c55e'
  };

  leads.forEach(lead => {
    const origem = lead.origem_lead || 'Orgânico';
    
    if (!origemMap.has(origem)) {
      origemMap.set(origem, {
        origem,
        totalLeads: 0,
        leadsFinalizados: 0,
        taxaConversao: 0,
        valorMedio: 0,
        color: colors[origem as keyof typeof colors] || '#6b7280'
      });
    }

    const conversao = origemMap.get(origem)!;
    conversao.totalLeads++;

    if (lead.data_finalizacao && lead.etapa_atual === 'Finalizado') {
      conversao.leadsFinalizados++;
    }
  });

  // Calcular taxas e valores médios
  origemMap.forEach((conversao) => {
    conversao.taxaConversao = conversao.totalLeads > 0 
      ? (conversao.leadsFinalizados / conversao.totalLeads) * 100 
      : 0;

    const leadsOrigem = leads.filter(lead => lead.origem_lead === conversao.origem);
    const valorTotal = leadsOrigem.reduce((sum, lead) => sum + (lead.valor_imovel || 0), 0);
    conversao.valorMedio = leadsOrigem.length > 0 ? valorTotal / leadsOrigem.length : 0;
  });

  return Array.from(origemMap.values()).sort((a, b) => b.totalLeads - a.totalLeads);
};