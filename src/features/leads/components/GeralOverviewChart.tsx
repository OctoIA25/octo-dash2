import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, PieChart, Eye } from 'lucide-react';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface GeralOverviewChartProps {
  leads: ProcessedLead[];
}

export const GeralOverviewChart = ({ leads }: GeralOverviewChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const overviewData = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    // Métricas gerais consolidadas
    const metrics = {
      totalLeads: leads.length,
      leadsQuentes: leads.filter(l => l.status_temperatura === 'Quente').length,
      leadsMornos: leads.filter(l => l.status_temperatura === 'Morno').length,
      leadsFrios: leads.filter(l => l.status_temperatura === 'Frio').length,
      visitasAgendadas: leads.filter(l => 
        (l.Data_visita && l.Data_visita.trim() !== "") ||
        l.etapa_atual === 'Visita Agendada'
      ).length,
      negociacoes: leads.filter(l => 
        l.etapa_atual === 'Em Negociação' || 
        l.etapa_atual === 'Negociação' ||
        l.etapa_atual === 'Proposta Enviada'
      ).length,
      fechamentos: leads.filter(l => 
        l.data_finalizacao && l.data_finalizacao.trim() !== ""
      ).length,
      origens: [...new Set(leads.map(l => l.origem_lead).filter(Boolean))].length,
      corretores: [...new Set(leads.map(l => l.corretor_responsavel).filter(Boolean))].length,
      imoveisUnicos: [...new Set(leads.map(l => l.codigo_imovel).filter(Boolean))].length
    };

    // Dados para gráfico de pizza - Status do Funil
    // REGRA: Quanto mais quente (maior conversão), mais escuro
    const funnelData = [
      {
        label: 'Leads Quentes',
        y: metrics.leadsQuentes,
        color: '#2d5f9f', // Azul Intenso (mais quente = mais escuro)
        percentage: (metrics.leadsQuentes / metrics.totalLeads) * 100
      },
      {
        label: 'Leads Mornos',
        y: metrics.leadsMornos,
        color: '#1e4d8b', // Azul Escuro/Royal
        percentage: (metrics.leadsMornos / metrics.totalLeads) * 100
      },
      {
        label: 'Leads Frios',
        y: metrics.leadsFrios,
        color: '#4a7ab0', // Azul Médio Escuro (mais frio = mais claro)
        percentage: (metrics.leadsFrios / metrics.totalLeads) * 100
      },
      {
        label: 'Outros',
        y: metrics.totalLeads - metrics.leadsQuentes - metrics.leadsMornos - metrics.leadsFrios,
        color: '#6b7280',
        percentage: ((metrics.totalLeads - metrics.leadsQuentes - metrics.leadsMornos - metrics.leadsFrios) / metrics.totalLeads) * 100
      }
    ].filter(item => item.y > 0);

    // Cálculos de performance
    const taxaConversaoVisita = metrics.totalLeads > 0 ? (metrics.visitasAgendadas / metrics.totalLeads) * 100 : 0;
    const taxaNegociacao = metrics.visitasAgendadas > 0 ? (metrics.negociacoes / metrics.visitasAgendadas) * 100 : 0;
    const taxaFechamento = metrics.negociacoes > 0 ? (metrics.fechamentos / metrics.negociacoes) * 100 : 0;
    const taxaAquecimento = metrics.totalLeads > 0 ? (metrics.leadsQuentes / metrics.totalLeads) * 100 : 0;

    // Análise temporal básica
    const hoje = new Date();
    const last30Days = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last7Days = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);

    const leads30Dias = leads.filter(l => new Date(l.data_entrada) >= last30Days).length;
    const leads7Dias = leads.filter(l => new Date(l.data_entrada) >= last7Days).length;

    return {
      funnelData,
      metrics,
      performance: {
        taxaConversaoVisita,
        taxaNegociacao,
        taxaFechamento,
        taxaAquecimento
      },
      temporal: {
        leads30Dias,
        leads7Dias,
        mediaSemanal: leads30Dias / 4.3, // Aproximadamente 4.3 semanas em 30 dias
        crescimentoSemanal: leads7Dias > 0 && leads30Dias > 0 ? ((leads7Dias / (leads30Dias / 4.3)) - 1) * 100 : 0
      }
    };
  }, [leads]);

  useEffect(() => {
    const loadCanvasJS = () => {
      if (window.CanvasJS) {
        initializeChart();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
      script.onload = () => initializeChart();
      script.onerror = () => console.warn('⚠️ Falha ao carregar CanvasJS');
      document.head.appendChild(script);
    };

    const initializeChart = () => {
      if (!chartRef.current || !window.CanvasJS || !overviewData) return;

      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      const chart = new window.CanvasJS.Chart(chartRef.current, {
        theme: "dark2",
        backgroundColor: "transparent",
        creditText: "",
        creditHref: null,
        exportEnabled: false,
        title: {
          text: "",
          fontColor: "#ffffff"
        },
        toolTip: {
          backgroundColor: "rgba(17, 24, 39, 0.98)",
          fontColor: "#ffffff",
          borderColor: "#6b7280",
          cornerRadius: 8,
          contentFormatter: function (e: any) {
            const data = e.entries[0].dataPoint;
            
            return `
              <div style="padding: 12px; font-family: Inter, sans-serif;">
                <div style="font-weight: 700; font-size: 14px; color: ${data.color}; margin-bottom: 8px;">
                  📊 ${data.label}
                </div>
                <div style="font-size: 12px;">
                  <div><strong>Quantidade:</strong> ${data.y} leads</div>
                  <div><strong>Percentual:</strong> ${data.percentage.toFixed(1)}%</div>
                </div>
              </div>
            `;
          }
        },
        data: [{
          type: "doughnut",
          name: "Distribuição de Leads",
          innerRadius: "45%",
          indexLabelFontSize: 16,
          indexLabelFontWeight: "700",
          indexLabelFontColor: "#ffffff",
          indexLabel: "{label}: {y}",
          dataPoints: overviewData.funnelData
        }],
        height: 400,
        animationEnabled: true,
        animationDuration: 1200
      });

      chart.render();
      chartInstance.current = chart;

      // Remover marcas d'água
      setTimeout(() => {
        const container = chartRef.current;
        if (container) {
          const creditLinks = container.querySelectorAll('a[href*="canvasjs"]');
          creditLinks.forEach(link => link.remove());
        }
      }, 100);
    };

    loadCanvasJS();

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [overviewData]);

  if (!overviewData || !leads || leads.length === 0) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <CardTitle className="text-text-primary text-lg neon-text flex items-center gap-2">
            <div className="w-2 h-2 bg-cyan-400 rounded-full glow-accent-cyan"></div>
            Visão Geral do CRM
            <BarChart3 className="h-5 w-5 text-cyan-400 ml-2" />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
            </div>
            <h4 className="text-lg font-semibold text-text-primary mb-2">Visão Geral do CRM</h4>
            <p className="text-sm text-text-secondary">Carregando dados gerais...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <StandardCardTitle icon={BarChart3}>
          Visão Geral do CRM
        </StandardCardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-4">
        {/* Métricas principais */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-lg border border-cyan-500/30">
            <div className="text-lg font-bold text-cyan-400">
              {overviewData.metrics.totalLeads}
            </div>
            <div className="text-xs text-text-secondary">Total Leads</div>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/30">
            <div className="text-lg font-bold text-green-400">
              {overviewData.metrics.corretores}
            </div>
            <div className="text-xs text-text-secondary">Corretores</div>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/30">
            <div className="text-lg font-bold text-purple-400">
              {overviewData.metrics.imoveisUnicos}
            </div>
            <div className="text-xs text-text-secondary">Imóveis</div>
          </div>
        </div>

        {/* Indicadores de performance */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-text-primary mb-2">🎯 Performance Geral:</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-bg-secondary/20 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">Taxa Aquecimento</span>
                <span className="text-sm font-bold text-red-400">
                  {overviewData.performance.taxaAquecimento.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="p-2 bg-bg-secondary/20 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">Conversão Visita</span>
                <span className="text-sm font-bold text-green-400">
                  {overviewData.performance.taxaConversaoVisita.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="p-2 bg-bg-secondary/20 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">Taxa Negociação</span>
                <span className="text-sm font-bold text-orange-400">
                  {overviewData.performance.taxaNegociacao.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="p-2 bg-bg-secondary/20 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-xs text-text-secondary">Taxa Fechamento</span>
                <span className="text-sm font-bold text-purple-400">
                  {overviewData.performance.taxaFechamento.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Gráfico */}
        <div className="flex-1 flex items-center justify-center">
          <div ref={chartRef} className="w-full h-[320px]" />
        </div>

        {/* Análise temporal */}
        <div className="mt-4 pt-3 border-t border-bg-secondary/40">
          <div className="text-sm font-semibold text-text-primary mb-2">📅 Período Recente:</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <div className="text-cyan-400 font-bold">{overviewData.temporal.leads7Dias}</div>
              <div className="text-text-secondary">Últimos 7 dias</div>
            </div>
            <div className="text-center">
              <div className="text-green-400 font-bold">{overviewData.temporal.leads30Dias}</div>
              <div className="text-text-secondary">Últimos 30 dias</div>
            </div>
            <div className="text-center">
              <div className="text-purple-400 font-bold">
                {overviewData.temporal.mediaSemanal.toFixed(1)}
              </div>
              <div className="text-text-secondary">Média semanal</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
