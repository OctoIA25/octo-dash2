import { ProcessedLead } from '@/data/realLeadsProcessor';

export interface MonthlyMetrics {
  month: string;
  year: number;
  totalLeads: number;
  newLeads: number;
  closedLeads: number;
  revenue: number;
  averageTicket: number;
  conversionRate: number;
  leadsQuentes: number;
  leadsMornos: number;
  leadsFrios: number;
  visitasRealizadas: number;
  pipelineValue: number;
}

export interface MonthlyComparison {
  current: MonthlyMetrics;
  previous: MonthlyMetrics | null;
  growth: {
    leads: number;
    revenue: number;
    conversion: number;
  };
}

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Função para calcular métricas mensais
export function calculateMonthlyMetrics(leads: ProcessedLead[]): MonthlyMetrics[] {
  // Usar TODOS os leads, ignorando campo Exists
  const activeLeads = leads;
  
  // Agrupar leads por mês/ano
  const monthlyGroups = new Map<string, ProcessedLead[]>();
  
  activeLeads.forEach(lead => {
    const date = new Date(lead.data_entrada);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyGroups.has(monthKey)) {
      monthlyGroups.set(monthKey, []);
    }
    monthlyGroups.get(monthKey)!.push(lead);
  });
  
  // Calcular métricas para cada mês
  const monthlyMetrics: MonthlyMetrics[] = [];
  
  monthlyGroups.forEach((monthLeads, monthKey) => {
    const [year, month] = monthKey.split('-').map(Number);
    
    // Leads que entraram neste mês
    const newLeads = monthLeads.length;
    
    // Leads finalizados neste mês
    const closedThisMonth = activeLeads.filter(lead => {
      if (!lead.data_finalizacao) return false;
      const closeDate = new Date(lead.data_finalizacao);
      return closeDate.getFullYear() === year && closeDate.getMonth() + 1 === month;
    });
    
    // Revenue (soma dos valores finais de venda dos leads fechados)
    const revenue = closedThisMonth.reduce((sum, lead) => 
      sum + (lead.valor_final_venda || 0), 0
    );
    
    // Ticket médio
    const averageTicket = closedThisMonth.length > 0 ? 
      revenue / closedThisMonth.length : 0;
    
    // Taxa de conversão (leads fechados / leads que entraram neste mês)
    const conversionRate = newLeads > 0 ? 
      (closedThisMonth.length / newLeads) * 100 : 0;
    
    // Distribuição por temperatura
    const leadsQuentes = monthLeads.filter(lead => 
      lead.status_temperatura === 'Quente'
    ).length;
    
    const leadsMornos = monthLeads.filter(lead => 
      lead.status_temperatura === 'Morno'
    ).length;
    
    const leadsFrios = monthLeads.filter(lead => 
      lead.status_temperatura === 'Frio'
    ).length;
    
    // Visitas realizadas
    const visitasRealizadas = monthLeads.filter(lead => 
      lead.Data_visita && lead.Data_visita.trim() !== ""
    ).length;
    
    // Valor total do pipeline
    const pipelineValue = monthLeads.reduce((sum, lead) => 
      sum + (lead.valor_imovel || 0), 0
    );
    
    monthlyMetrics.push({
      month: monthNames[month - 1],
      year,
      totalLeads: newLeads,
      newLeads,
      closedLeads: closedThisMonth.length,
      revenue,
      averageTicket,
      conversionRate,
      leadsQuentes,
      leadsMornos,
      leadsFrios,
      visitasRealizadas,
      pipelineValue
    });
  });
  
  // Ordenar por ano e mês (mais recente primeiro)
  return monthlyMetrics.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return monthNames.indexOf(b.month) - monthNames.indexOf(a.month);
  });
}

// Função para comparar mês atual com anterior
export function getMonthlyComparison(monthlyMetrics: MonthlyMetrics[]): MonthlyComparison | null {
  if (monthlyMetrics.length === 0) return null;
  
  const current = monthlyMetrics[0]; // Mês mais recente
  const previous = monthlyMetrics.length > 1 ? monthlyMetrics[1] : null;
  
  const growth = {
    leads: previous ? ((current.totalLeads - previous.totalLeads) / previous.totalLeads) * 100 : 0,
    revenue: previous ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : 0,
    conversion: previous ? current.conversionRate - previous.conversionRate : 0
  };
  
  return {
    current,
    previous,
    growth
  };
}

// Função para obter dados dos últimos 6 meses para gráficos
export function getLast6MonthsData(leads: ProcessedLead[]) {
  const monthlyMetrics = calculateMonthlyMetrics(leads);
  const last6Months = monthlyMetrics.slice(0, 6).reverse(); // Últimos 6 meses, ordem cronológica
  
  return {
    labels: last6Months.map(m => `${m.month.substring(0, 3)}/${m.year.toString().substring(2)}`),
    datasets: {
      leads: last6Months.map(m => m.totalLeads),
      revenue: last6Months.map(m => m.revenue),
      conversion: last6Months.map(m => m.conversionRate),
      pipeline: last6Months.map(m => m.pipelineValue)
    }
  };
}

// Função para formatar moeda
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Função para formatar porcentagem
export function formatPercentage(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}
