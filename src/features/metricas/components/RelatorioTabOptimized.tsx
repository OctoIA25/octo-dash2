import { useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { EnhancedFunnelChart } from '@/features/leads/components/EnhancedFunnelChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, Calendar, Target, Users, DollarSign, Award, Activity } from 'lucide-react';

interface RelatorioTabOptimizedProps {
  leads: ProcessedLead[];
}

export const RelatorioTabOptimized = ({ leads }: RelatorioTabOptimizedProps) => {
  
  // Análise completa dos dados
  const relatorioCompleto = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    const agora = new Date();
    const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    const mesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const mesAnteriorStr = `${mesAnterior.getFullYear()}-${String(mesAnterior.getMonth() + 1).padStart(2, '0')}`;

    // Análise mensal
    const leadsMesAtual = leads.filter(lead => {
      const dataLead = lead.data_lead ? new Date(lead.data_lead) : null;
      return dataLead && dataLead.toISOString().substring(0, 7) === mesAtual;
    });

    const leadsMesAnterior = leads.filter(lead => {
      const dataLead = lead.data_lead ? new Date(lead.data_lead) : null;
      return dataLead && dataLead.toISOString().substring(0, 7) === mesAnteriorStr;
    });

    // KPIs principais
    const totalLeads = leads.length;
    const leadsQuentes = leads.filter(l => l.status_temperatura === 'Quente').length;
    const visitasAgendadas = leads.filter(l => 
      (l.Data_visita && l.Data_visita.trim() !== "") ||
      l.etapa_atual === 'Visita Agendada'
    ).length;
    const vendas = leads.filter(l => l.data_finalizacao && l.data_finalizacao.trim() !== "").length;
    
    // Análise de conversão
    const taxaConversaoVisitas = totalLeads > 0 ? (visitasAgendadas / totalLeads * 100) : 0;
    const taxaConversaoVendas = totalLeads > 0 ? (vendas / totalLeads * 100) : 0;
    const taxaFechamentoVisitas = visitasAgendadas > 0 ? (vendas / visitasAgendadas * 100) : 0;

    // Análise financeira
    const leadsComValor = leads.filter(l => l.valor_imovel && l.valor_imovel > 0);
    const pipelineTotal = leadsComValor.reduce((sum, l) => sum + l.valor_imovel, 0);
    const ticketMedio = leadsComValor.length > 0 ? pipelineTotal / leadsComValor.length : 0;
    const pipelineVendas = leads
      .filter(l => l.data_finalizacao && l.data_finalizacao.trim() !== "" && l.valor_imovel)
      .reduce((sum, l) => sum + l.valor_imovel, 0);

    // Análise de corretores
    const corretoresAtivos = new Set(
      leads
        .map(l => l.corretor_responsavel?.trim())
        .filter(c => c && c !== 'Não atribuído')
    ).size;

    // Top performer
    const corretorStats = leads.reduce((acc, lead) => {
      const corretor = lead.corretor_responsavel?.trim() || 'Não atribuído';
      if (!acc[corretor]) acc[corretor] = { leads: 0, vendas: 0 };
      acc[corretor].leads++;
      if (lead.data_finalizacao && lead.data_finalizacao.trim() !== "") {
        acc[corretor].vendas++;
      }
      return acc;
    }, {} as Record<string, any>);

    const topPerformer = Object.entries(corretorStats)
      .filter(([nome]) => nome !== 'Não atribuído')
      .sort(([,a], [,b]) => b.vendas - a.vendas)[0];

    // Crescimento mensal
    const crescimentoLeads = leadsMesAnterior.length > 0 ? 
      ((leadsMesAtual.length - leadsMesAnterior.length) / leadsMesAnterior.length * 100) : 
      (leadsMesAtual.length > 0 ? 100 : 0);

    // Análise de origem
    const origens = leads.reduce((acc, lead) => {
      const origem = lead.origem_lead || 'Não informado';
      acc[origem] = (acc[origem] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const origemMaisEfetiva = Object.entries(origens)
      .sort(([,a], [,b]) => b - a)[0];

    // Análise de temperatura
    const temperaturas = {
      'Quente': leads.filter(l => l.status_temperatura === 'Quente').length,
      'Morno': leads.filter(l => l.status_temperatura === 'Morno').length,
      'Frio': leads.filter(l => l.status_temperatura === 'Frio').length
    };

    return {
      kpis: {
        totalLeads,
        leadsQuentes,
        visitasAgendadas,
        vendas,
        taxaConversaoVisitas,
        taxaConversaoVendas,
        taxaFechamentoVisitas,
        pipelineTotal,
        ticketMedio,
        pipelineVendas,
        corretoresAtivos,
        crescimentoLeads
      },
      mensal: {
        mesAtual: leadsMesAtual.length,
        mesAnterior: leadsMesAnterior.length,
        crescimento: crescimentoLeads
      },
      topPerformer: topPerformer ? {
        nome: topPerformer[0],
        leads: topPerformer[1].leads,
        vendas: topPerformer[1].vendas
      } : null,
      origemMaisEfetiva: origemMaisEfetiva ? {
        nome: origemMaisEfetiva[0],
        quantidade: origemMaisEfetiva[1]
      } : null,
      temperaturas
    };
  }, [leads]);

  if (!relatorioCompleto) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <BarChart3 className="h-16 w-16 notion-text-secondary mx-auto mb-4" />
          <p className="notion-text-secondary">Carregando relatório geral...</p>
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { 
      style: 'currency', 
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  const { kpis, mensal, topPerformer, origemMaisEfetiva, temperaturas } = relatorioCompleto;

  return (
    <div className="w-full space-y-8">
      {/* Header com KPIs principais - Gradiente Azul */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl font-bold mb-2" style={{ color: '#87CEEB' }}>
            {kpis.totalLeads}
          </div>
          <div className="text-sm notion-text-secondary">Total de Leads</div>
          <div className="mt-2 flex items-center justify-center gap-1">
            <span className={`text-xs font-medium ${mensal.crescimento >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {mensal.crescimento >= 0 ? '↗️' : '↘️'} {Math.abs(mensal.crescimento).toFixed(1)}%
            </span>
          </div>
        </div>
        
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl font-bold mb-2" style={{ color: '#60A5FA' }}>
            {kpis.vendas}
          </div>
          <div className="text-sm notion-text-secondary">Conversões</div>
          <div className="mt-2">
            <span className="text-xs font-medium" style={{ color: '#60A5FA' }}>
              {kpis.taxaConversaoVendas.toFixed(1)}% taxa
            </span>
          </div>
        </div>
        
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl font-bold mb-2" style={{ color: '#3B82F6' }}>
            {formatCurrency(kpis.pipelineVendas).replace('R$', '').trim()}
          </div>
          <div className="text-sm notion-text-secondary">Vendas Realizadas</div>
          <div className="mt-2">
            <span className="text-xs font-medium" style={{ color: '#3B82F6' }}>
              {formatCurrency(kpis.ticketMedio).replace('R$', '').trim()} ticket
            </span>
          </div>
        </div>
        
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl font-bold mb-2" style={{ color: '#1E40AF' }}>
            {kpis.corretoresAtivos}
          </div>
          <div className="text-sm notion-text-secondary">Corretores Ativos</div>
          <div className="mt-2">
            <span className="text-xs font-medium" style={{ color: '#1E40AF' }}>
              {topPerformer ? `${topPerformer.vendas} vendas (top)` : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Funil principal e métricas de conversão */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Funil de conversão */}
        <div className="xl:col-span-2">
          <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl h-[500px]">
            <ErrorBoundary fallbackTitle="Funil de Conversão">
              <EnhancedFunnelChart leads={leads} />
            </ErrorBoundary>
          </div>
        </div>

        {/* Métricas de conversão */}
        <div className="space-y-4">
          <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <Target className="h-5 w-5" style={{ color: '#60A5FA' }} />
              <h4 className="font-semibold notion-text-primary">Taxa de Conversão</h4>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm notion-text-secondary">Leads → Visitas</span>
                  <span className="font-bold" style={{ color: '#87CEEB' }}>{kpis.taxaConversaoVisitas.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-notion-bg-secondary rounded-full h-2">
                  <div 
                    className="h-2 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${Math.min(kpis.taxaConversaoVisitas, 100)}%`,
                      backgroundColor: '#87CEEB'
                    }}
                  ></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm notion-text-secondary">Visitas → Vendas</span>
                  <span className="font-bold" style={{ color: '#3B82F6' }}>{kpis.taxaFechamentoVisitas.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-notion-bg-secondary rounded-full h-2">
                  <div 
                    className="h-2 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${Math.min(kpis.taxaFechamentoVisitas, 100)}%`,
                      backgroundColor: '#3B82F6'
                    }}
                  ></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm notion-text-secondary">Taxa Geral</span>
                  <span className="font-bold" style={{ color: '#1E40AF' }}>{kpis.taxaConversaoVendas.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-notion-bg-secondary rounded-full h-2">
                  <div 
                    className="h-2 rounded-full transition-all duration-500"
                    style={{ 
                      width: `${Math.min(kpis.taxaConversaoVendas, 100)}%`,
                      backgroundColor: '#1E40AF'
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="h-5 w-5" style={{ color: '#60A5FA' }} />
              <h4 className="font-semibold notion-text-primary">Distribuição de Temperatura</h4>
            </div>
            
            <div className="space-y-3">
              {Object.entries(temperaturas).map(([temp, quantidade], index) => {
                // Gradiente azul: quanto maior o número, mais escuro
                const sortedTemps = Object.entries(temperaturas).sort(([,a], [,b]) => b - a);
                const position = sortedTemps.findIndex(([t]) => t === temp);
                const cores = ['#87CEEB', '#60A5FA', '#3B82F6', '#2563EB', '#1E40AF', '#1E3A8A'];
                const cor = cores[position] || '#3B82F6';
                const percentual = (quantidade / kpis.totalLeads) * 100;
                
                return (
                  <div key={temp} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cor }}
                      ></div>
                      <span className="text-sm notion-text-secondary">{temp}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold notion-text-primary">{quantidade}</div>
                      <div className="text-xs notion-text-secondary">{percentual.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Insights e análises - Gradiente Azul */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl mb-3">📈</div>
          <div className="text-lg font-bold notion-text-primary mb-1">
            {mensal.mesAtual} leads
          </div>
          <div className="text-sm notion-text-secondary mb-2">Este Mês</div>
          <div className={`text-xs font-medium ${mensal.crescimento >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {mensal.crescimento >= 0 ? '+' : ''}{mensal.crescimento.toFixed(1)}% vs mês anterior
          </div>
        </div>

        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl mb-3">🏆</div>
          <div className="text-lg font-bold mb-1" style={{ color: '#87CEEB' }}>
            {topPerformer?.nome.substring(0, 12) || 'N/A'}
          </div>
          <div className="text-sm notion-text-secondary mb-2">Top Performer</div>
          <div className="text-xs font-medium" style={{ color: '#87CEEB' }}>
            {topPerformer?.vendas || 0} vendas realizadas
          </div>
        </div>

        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl mb-3">🎯</div>
          <div className="text-lg font-bold mb-1" style={{ color: '#3B82F6' }}>
            {origemMaisEfetiva?.nome.substring(0, 12) || 'N/A'}
          </div>
          <div className="text-sm notion-text-secondary mb-2">Melhor Origem</div>
          <div className="text-xs font-medium" style={{ color: '#3B82F6' }}>
            {origemMaisEfetiva?.quantidade || 0} leads gerados
          </div>
        </div>

        <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl text-center">
          <div className="text-3xl mb-3">💰</div>
          <div className="text-lg font-bold mb-1" style={{ color: '#1E40AF' }}>
            {formatCurrency(kpis.pipelineTotal / 1000000).replace('R$', '').trim()}M
          </div>
          <div className="text-sm notion-text-secondary mb-2">Pipeline Total</div>
          <div className="text-xs font-medium" style={{ color: '#1E40AF' }}>
            {kpis.leadsQuentes} oportunidades quentes
          </div>
        </div>
      </div>

      {/* Resumo executivo - Gradiente Azul */}
      <div className="notion-card notion-card-hover notion-transition p-6 rounded-xl">
        <div className="flex items-center gap-3 mb-6">
          <Award className="h-6 w-6" style={{ color: '#60A5FA' }} />
          <h3 className="text-xl font-bold notion-text-primary">Resumo Executivo</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 rounded-lg border" style={{ 
            background: 'linear-gradient(135deg, rgba(135, 206, 235, 0.1) 0%, rgba(96, 165, 250, 0.1) 100%)',
            borderColor: 'rgba(135, 206, 235, 0.2)'
          }}>
            <div className="text-2xl font-bold mb-2" style={{ color: '#87CEEB' }}>
              {((kpis.vendas / kpis.totalLeads) * 100).toFixed(1)}%
            </div>
            <div className="text-sm notion-text-secondary mb-1">Taxa de Sucesso Geral</div>
            <div className="text-xs notion-text-muted">
              {kpis.vendas} vendas de {kpis.totalLeads} leads
            </div>
          </div>
          
          <div className="text-center p-4 rounded-lg border" style={{ 
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.1) 100%)',
            borderColor: 'rgba(59, 130, 246, 0.2)'
          }}>
            <div className="text-2xl font-bold mb-2" style={{ color: '#3B82F6' }}>
              {formatCurrency(kpis.ticketMedio).replace('R$', '').trim()}
            </div>
            <div className="text-sm notion-text-secondary mb-1">Ticket Médio</div>
            <div className="text-xs notion-text-muted">
              Baseado em {leads.filter(l => l.valor_imovel && l.valor_imovel > 0).length} leads com valor
            </div>
          </div>
          
          <div className="text-center p-4 rounded-lg border" style={{ 
            background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.1) 0%, rgba(30, 58, 138, 0.1) 100%)',
            borderColor: 'rgba(30, 64, 175, 0.2)'
          }}>
            <div className="text-2xl font-bold mb-2" style={{ color: '#1E40AF' }}>
              {((kpis.leadsQuentes / kpis.totalLeads) * 100).toFixed(1)}%
            </div>
            <div className="text-sm notion-text-secondary mb-1">Leads Qualificados</div>
            <div className="text-xs notion-text-muted">
              {kpis.leadsQuentes} leads com alta temperatura
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
