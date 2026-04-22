import { useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card } from '@/components/ui/card';
import { RANKING_BLUE_GRADIENT } from '@/utils/colors';

interface OrigemChartProps {
  leads: ProcessedLead[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const OrigemChart = ({ leads }: OrigemChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    // Função para carregar CanvasJS se não estiver carregado
    const loadCanvasJS = () => {
      return new Promise((resolve) => {
        if (window.CanvasJS) {
          resolve(window.CanvasJS);
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
        script.onload = () => resolve(window.CanvasJS);
        document.head.appendChild(script);
      });
    };

    const initChart = async () => {
      await loadCanvasJS();

      if (!chartContainerRef.current) return;

      // Calcular dados de origem dos leads
      const origemData: { [key: string]: number } = {};
      leads.forEach(lead => {
        const origem = lead.origem_lead || 'Orgânico';
        origemData[origem] = (origemData[origem] || 0) + 1;
      });
      
      // Cores específicas por origem (restauradas)
      const coresPorOrigem: Record<string, string> = {
        'Facebook': '#1877F2', // Azul oficial Facebook
        'Instagram': '#FF6B35', // Laranja avermelhado vibrante
        'Orgânico': '#22C55E', // Verde natureza
        'Google Ads': '#4285F4', // Azul oficial Google
        'Google': '#34A853', // Verde oficial Google
        'Site': '#8B5CF6', // Roxo moderno
        'WhatsApp': '#25D366', // Verde oficial WhatsApp
        'LinkedIn': '#0A66C2' // Azul oficial LinkedIn
      };
      
      // Cores de fallback usando paleta oficial do funil
      const fallbackColors = RANKING_BLUE_GRADIENT;
      let colorIndex = 0;

      // Função para destacar colunas ao clicar
      const toggleColumnHighlight = (e: any) => {
        if (e.dataSeries.dataPoints[e.dataPointIndex].color === "#8b5cf6") {
          e.dataSeries.dataPoints[e.dataPointIndex].color = "#00ff88";
        } else {
          e.dataSeries.dataPoints[e.dataPointIndex].color = "#8b5cf6";
        }
        e.chart.render();
      };

      // Destruir gráfico anterior se existir
      if (chartRef.current) {
        chartRef.current.destroy();
      }

      // Criar novo gráfico com colunas
      const chart = new window.CanvasJS.Chart(chartContainerRef.current, {
        exportEnabled: true,
        animationEnabled: true,
        backgroundColor: "transparent",
        theme: "dark2",
        creditText: "",
        creditHref: null,
        title: {
          text: "Origem dos Leads",
          fontColor: "#F9FAFB",
          fontSize: 18,
          fontFamily: "Inter, sans-serif"
        },
        axisY: {
          title: "Quantidade de Leads",
          titleFontColor: "#F9FAFB",
          labelFontColor: "#F9FAFB",
          gridColor: "rgba(255, 255, 255, 0.1)"
        },
        axisX: {
          labelFontColor: "#F9FAFB",
          labelAngle: -45
        },
        data: [{
          type: "column",
          showInLegend: true,
          legendMarkerColor: "#8b5cf6",
          legendText: "Origens dos Leads",
          toolTipContent: "<b>{label}</b><br>Leads: {y}",
          indexLabelFontColor: "#F9FAFB",
          indexLabelFontSize: 11,
          indexLabel: "{y}",
          indexLabelPlacement: "outside",
          dataPoints: Object.entries(origemData)
            .map(([origem, count], index) => ({
              y: count,
              label: origem,
              color: coresPorOrigem[origem] || fallbackColors[colorIndex++ % fallbackColors.length]
            }))
            .sort((a, b) => b.y - a.y)
        }]
      });

      chart.render();
      chartRef.current = chart;
    };

    initChart();

    // Cleanup function
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [leads]);

  // Proteção contra renders durante carregamento
  if (!leads || leads.length === 0) {
    return (
      <Card className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 p-5 card-glow">
        <div className="flex items-center justify-center h-[400px] text-text-secondary">
          <div className="text-center">
            <div className="w-12 h-12 border-2 border-gradient-to-r from-purple-500/30 to-blue-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm">Carregando dados das origens...</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 p-5 card-glow">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-4 bg-accent-purple rounded-full glow-accent-purple"></div>
        <h3 className="text-text-primary text-base font-semibold neon-text">
Origens - Distribuição de Leads
        </h3>
      </div>
      
      <div 
        ref={chartContainerRef}
        className="w-full"
        style={{ height: "370px", width: "100%" }}
      />
      
      {/* Resumo estatístico */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {Object.entries(leads.reduce((acc, lead) => {
          const origem = lead.origem_lead || 'Orgânico';
          acc[origem] = (acc[origem] || 0) + 1;
          return acc;
        }, {} as { [key: string]: number }))
        .sort(([,a], [,b]) => b - a)
        .slice(0, 4)
        .map(([origem, count]) => (
          <div key={origem} className="text-center p-2 bg-gradient-to-br from-accent-blue/10 to-accent-purple/10 rounded-lg border border-accent-blue/20">
            <p className="text-lg font-bold text-accent-blue">{count}</p>
            <p className="text-text-secondary text-xs truncate">{origem}</p>
          </div>
        ))}
      </div>
    </Card>
  );
};
