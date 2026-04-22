import { useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';

// Hook para otimizar cálculos de dados com memoização
export const useOptimizedData = (leads: ProcessedLead[]) => {
  
  // Memoizar leads ordenados por data
  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => {
      const dateA = new Date(a.data_entrada);
      const dateB = new Date(b.data_entrada);
      return dateB.getTime() - dateA.getTime();
    });
  }, [leads]);

  // Memoizar estatísticas básicas
  const stats = useMemo(() => {
    const totalLeads = leads.length; // Total real de leads (ignorando campo Exists)
    const activeLeads = leads.length; // Todos os leads são considerados ativos
    
    // Contagem por temperatura
    const temperatureStats = leads.reduce((acc, lead) => {
      const temp = lead.status_temperatura?.toLowerCase() || 'frio';
      acc[temp] = (acc[temp] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Contagem por etapa
    const stageStats = leads.reduce((acc, lead) => {
      const stage = lead.etapa_atual || 'Em Atendimento';
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Valor total do pipeline
    const totalPipelineValue = leads.reduce((sum, lead) => {
      return sum + (lead.valor_imovel || 0);
    }, 0);

    // Leads com conversas
    const leadsWithConversations = leads.filter(lead => 
      lead.Conversa && lead.Conversa.trim().length > 0
    ).length;

    return {
      totalLeads,
      activeLeads,
      temperatureStats,
      stageStats,
      totalPipelineValue,
      leadsWithConversations,
      conversionRate: totalLeads > 0 ? (activeLeads / totalLeads) * 100 : 0
    };
  }, [leads]);

  // Memoizar leads por corretor
  const leadsByBroker = useMemo(() => {
    return leads.reduce((acc, lead) => {
      const broker = lead.corretor_responsavel || 'Não atribuído';
      if (!acc[broker]) {
        acc[broker] = {
          count: 0,
          totalValue: 0,
          leads: []
        };
      }
      acc[broker].count++;
      acc[broker].totalValue += lead.valor_imovel || 0;
      acc[broker].leads.push(lead);
      return acc;
    }, {} as Record<string, { count: number; totalValue: number; leads: ProcessedLead[] }>);
  }, [leads]);

  // Memoizar dados para gráficos (últimos 30 dias)
  const chartData = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentLeads = leads.filter(lead => {
      const leadDate = new Date(lead.data_entrada);
      return leadDate >= thirtyDaysAgo;
    });

    // Agrupar por dia
    const dailyData = recentLeads.reduce((acc, lead) => {
      const date = new Date(lead.data_entrada).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = {
          date,
          count: 0,
          value: 0
        };
      }
      acc[date].count++;
      acc[date].value += lead.valor_imovel || 0;
      return acc;
    }, {} as Record<string, { date: string; count: number; value: number }>);

    return Object.values(dailyData).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [leads]);

  // Memoizar leads recentes (últimos 7 dias)
  const recentLeads = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return leads.filter(lead => {
      const leadDate = new Date(lead.data_entrada);
      return leadDate >= sevenDaysAgo;
    }).sort((a, b) => {
      const dateA = new Date(a.data_entrada);
      const dateB = new Date(b.data_entrada);
      return dateB.getTime() - dateA.getTime();
    });
  }, [leads]);

  return {
    sortedLeads,
    stats,
    leadsByBroker,
    chartData,
    recentLeads
  };
};
