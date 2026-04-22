import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, User } from 'lucide-react';
import { RANKING_BLUE_GRADIENT } from '@/utils/colors';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface CorretoresLineChartProps {
  leads: ProcessedLead[];
}

export const CorretoresLineChart = ({ leads }: CorretoresLineChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const timelineData = useMemo(() => {
    if (!leads || leads.length === 0) {
      // Retornar dados vazios em vez de null
      return {
        series: [],
        topCorretores: []
      };
    }

    // Obter últimos 6 meses
    const monthsData = [];
    const today = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthKey = date.toISOString().slice(0, 7); // YYYY-MM
      const monthName = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      
      monthsData.push({
        month: monthKey,
        label: monthName,
        data: {}
      });
    }

    // Agrupar leads por corretor e mês
    const corretorMonthlyData = leads.reduce((acc, lead) => {
      const corretor = lead.corretor_responsavel?.trim() || 'Não atribuído';
      
      // Verificar se a data é válida
      if (!lead.data_entrada) {
        return acc;
      }
      
      const leadDate = new Date(lead.data_entrada);
      if (isNaN(leadDate.getTime())) {
        return acc;
      }
      
      const monthKey = leadDate.toISOString().slice(0, 7);
      
      if (!acc[corretor]) {
        acc[corretor] = {};
      }
      
      if (!acc[corretor][monthKey]) {
        acc[corretor][monthKey] = {
          leads: 0,
          visitas: 0,
          negociacoes: 0,
          vendas: 0,
          pipeline: 0
        };
      }
      
      acc[corretor][monthKey].leads++;
      acc[corretor][monthKey].pipeline += lead.valor_imovel || 0;
      
      if ((lead.Data_visita && lead.Data_visita.trim() !== "") || 
          lead.etapa_atual === 'Visita Agendada') {
        acc[corretor][monthKey].visitas++;
      }
      
      if (lead.etapa_atual === 'Em Negociação' || 
          lead.etapa_atual === 'Negociação' ||
          lead.etapa_atual === 'Proposta Enviada') {
        acc[corretor][monthKey].negociacoes++;
      }
      
      if (lead.data_finalizacao && lead.data_finalizacao.trim() !== "") {
        acc[corretor][monthKey].vendas++;
      }
      
      return acc;
    }, {} as Record<string, any>);

    // Pegar top 5 corretores por total de leads
    const topCorretores = Object.entries(corretorMonthlyData)
      .map(([nome, data]) => {
        const totalLeads = Object.values(data as any).reduce((sum: number, month: any) => sum + month.leads, 0);
        return { nome, totalLeads, data };
      })
      .sort((a, b) => b.totalLeads - a.totalLeads)
      .slice(0, 5);

    // Cores originais para corretores (restauradas)
    const colors = [
      '#1D4ED8',    // Azul médio forte
      '#047857',    // Verde médio muito forte
      '#DC2626',    // Vermelho médio
      '#7C3AED',    // Roxo médio muito forte
      '#CA8A04'     // Amarelo médio muito forte
    ];

    // Preparar dados para gráfico de pizza (distribuição de leads por corretor)
    const pieData = topCorretores.map((corretor, index) => ({
      name: corretor.nome.length > 12 ? corretor.nome.substring(0, 12) + '...' : corretor.nome,
      y: corretor.totalLeads,
      color: colors[index],
      corretor: corretor.nome,
      totalLeads: corretor.totalLeads,
      visitasTotal: Object.values(corretor.data as any).reduce((sum: number, month: any) => sum + month.visitas, 0),
      negociacoesTotal: Object.values(corretor.data as any).reduce((sum: number, month: any) => sum + month.negociacoes, 0),
      pipelineTotal: Object.values(corretor.data as any).reduce((sum: number, month: any) => sum + month.pipeline, 0),
      indexLabel: `{name}: {y}`,
      indexLabelFontSize: 12,
      indexLabelFontWeight: "600",
      indexLabelFontColor: "#e5e7eb"
    }));

    const series = [{
      type: 'pie',
      name: 'Distribuição de Leads',
      showInLegend: true,
      dataPoints: pieData,
      indexLabelPlacement: "outside",
      indexLabelLineColor: "#6b7280",
      indexLabelLineThickness: 1
    }];

    // Verificar se há dados válidos para retornar
    if (series.length === 0 || topCorretores.length === 0) {
      // Retornar estrutura vazia em vez de null
      return {
        series: [],
        topCorretores: []
      };
    }

    const result = {
      series,
      topCorretores: topCorretores.map((c, i) => ({ ...c, color: colors[i] }))
    };
    
    
    return result;
  }, [leads]);

  useEffect(() => {
    
    const loadCanvasJS = () => {
      if (window.CanvasJS) {
        setTimeout(initializeChart, 100);
        return;
      }

      // Verificar se já existe um script CanvasJS
      const existingScript = document.querySelector('script[src*="canvasjs"]');
      if (existingScript) {
        let attempts = 0;
        const checkCanvasJS = setInterval(() => {
          attempts++;
          if (window.CanvasJS) {
            clearInterval(checkCanvasJS);
            setTimeout(initializeChart, 100);
          } else if (attempts > 50) { // 5 segundos
            clearInterval(checkCanvasJS);
            console.warn('⚠️ CorretoresLineChart - Timeout ao aguardar CanvasJS');
          }
        }, 100);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
      script.onload = () => {
        setTimeout(initializeChart, 100);
      };
      script.onerror = () => {
        console.error('❌ CorretoresLineChart - Falha ao carregar CanvasJS');
      };
      document.head.appendChild(script);
    };

    const initializeChart = () => {
      
      if (!chartRef.current || !window.CanvasJS || !timelineData) {
        return;
      }

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
        height: 280,
        width: null,
        axisY: {
          title: "",
          labelFontColor: "#9ca3af",
          labelFontSize: 12,
          gridColor: "#374151",
          gridThickness: 0.5,
          minimum: 0
        },
        axisX: {
          title: "",
          labelFontColor: "#9ca3af",
          labelFontSize: 12,
          lineColor: "#4b5563",
          tickColor: "#4b5563"
        },
        legend: {
          fontColor: "#e5e7eb",
          fontSize: 11,
          horizontalAlign: "center",
          verticalAlign: "bottom",
          markerMargin: 8
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
                  ${data.corretor}
                </div>
                <div style="font-size: 12px;">
                  <div><strong>Total de Leads:</strong> ${data.totalLeads}</div>
                  <div><strong>Visitas Agendadas:</strong> ${data.visitasTotal}</div>
                  <div><strong>Negociações:</strong> ${data.negociacoesTotal}</div>
                  <div><strong>Pipeline:</strong> R$ ${(data.pipelineTotal / 1000).toFixed(0)}K</div>
                </div>
              </div>
            `;
          }
        },
        data: timelineData.series,
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
  }, [timelineData]);


  if (!timelineData || timelineData.series.length === 0) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <StandardCardTitle icon={TrendingUp}>
            Evolução de Performance
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="h-5 w-5 text-cyan-400" />
            </div>
            <h4 className="text-lg font-semibold text-text-primary mb-2">Evolução de Performance</h4>
            <p className="text-sm text-text-secondary">Carregando dados históricos...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Gráfico de fallback simples se CanvasJS falhar
  const renderFallbackChart = () => (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <StandardCardTitle icon={TrendingUp}>
          Evolução de Performance (Fallback)
        </StandardCardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-4">
        <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-lg p-6 text-center">
          <TrendingUp className="h-12 w-12 text-cyan-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-cyan-400 mb-2">Gráfico Temporário</h3>
          <p className="text-sm text-text-secondary mb-4">
            Sistema em modo de fallback - Dados: {leads?.length || 0} leads
          </p>
          {timelineData?.topCorretores && (
            <div className="grid grid-cols-2 gap-2 mt-4">
              {timelineData.topCorretores.slice(0, 4).map((corretor, index) => (
                <div key={corretor.nome} className="bg-bg-secondary/30 rounded p-2">
                  <div className="text-xs text-text-secondary">{corretor.nome}</div>
                  <div className="text-sm font-bold text-cyan-400">{corretor.totalLeads} leads</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <StandardCardTitle icon={TrendingUp}>
          Distribuição de Leads
        </StandardCardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-3">
        {/* Gráfico */}
        <div className="flex-1 min-h-[360px] flex items-center justify-center">
          <div ref={chartRef} className="w-full h-full min-h-[360px]" />
        </div>
      </CardContent>
    </Card>
  );
};
