import { useMemo, useRef, useEffect } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, Calendar, Target, CheckCircle } from 'lucide-react';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

interface LeadsMetricsChartProps {
  leads: ProcessedLead[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const LeadsMetricsChart = ({ leads }: LeadsMetricsChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  // Calcular métricas principais
  const metricsData = useMemo(() => {
    const totalLeads = leads?.length || 0;
    
    // Interações (em atendimento)
    const interacoes = leads.filter(lead => 
      lead.etapa_atual === 'Interação' ||
      lead.etapa_atual === 'Em Atendimento'
    ).length;
    
    // Visitas agendadas/realizadas
    const visitas = leads.filter(lead => 
      lead.Data_visita && lead.Data_visita.trim() !== "" ||
      lead.etapa_atual === 'Visita Agendada' ||
      lead.etapa_atual === 'Visita Realizada'
    ).length;
    
    // Em negociação
    const negociacoes = leads.filter(lead => 
      lead.etapa_atual === 'Em Negociação' ||
      lead.etapa_atual === 'Negociação' ||
      lead.etapa_atual === 'Proposta Enviada'
    ).length;
    
    // Leads quentes
    const quentes = leads.filter(lead => 
      lead.status_temperatura === 'Quente'
    ).length;

    // Taxa de conversão geral
    const taxaConversaoGeral = totalLeads > 0 ? (negociacoes / totalLeads * 100) : 0;

    return {
      totalLeads,
      interacoes,
      visitas,
      negociacoes,
      quentes,
      taxaConversaoGeral,
      dataPoints: [
        { label: 'Total Leads', y: totalLeads, color: '#F4F8FA' },
        { label: 'Interações', y: interacoes, color: '#B4D1E6' },
        { label: 'Visitas', y: visitas, color: '#73A6D3' },
        { label: 'Negociações', y: negociacoes, color: '#3A6B9D' },
        { label: 'Leads Quentes', y: quentes, color: '#234890' }
      ]
    };
  }, [leads]);

  useEffect(() => {
    if (!chartRef.current) return;

    const initializeChart = () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      if (!window.CanvasJS) return;

      const chart = new window.CanvasJS.Chart(chartRef.current, {
        theme: "dark2",
        backgroundColor: "transparent",
        creditText: "",
        creditHref: null,
        title: { text: "" },
        height: 600,
        animationEnabled: true,
        animationDuration: 1200,
        data: [{
          type: "column",
          indexLabel: "{y}",
          indexLabelFontColor: "#ffffff",
          indexLabelFontSize: 16,
          indexLabelFontWeight: "800",
          indexLabelPlacement: "outside",
          cornerRadius: 8,
          toolTipContent: `
            <div style="background: rgba(17, 24, 39, 0.96); color: white; padding: 12px; border-radius: 8px; border: 1px solid rgba(139, 92, 246, 0.4); box-shadow: 0 4px 16px rgba(0,0,0,0.4);">
              <strong style="color: #8b5cf6; font-size: 14px;">{label}</strong><br/>
              <span style="color: #10b981; font-weight: bold; font-size: 16px;">{y}</span> leads
            </div>
          `,
          dataPoints: metricsData.dataPoints
        }],
        axisX: {
          labelFontColor: "transparent",
          tickLength: 0,
          lineThickness: 0,
          gridThickness: 0
        },
        axisY: {
          labelFontColor: "transparent",
          tickLength: 0,
          lineThickness: 0,
          gridThickness: 0
        }
      });

      chart.render();
      chartInstance.current = chart;
    };

    if (window.CanvasJS) {
      initializeChart();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
      script.onload = initializeChart;
      document.head.appendChild(script);
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [metricsData]);

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container">
      <CardHeader className="pb-3">
        <StandardCardTitle icon={TrendingUp}>
          Métricas dos Leads
        </StandardCardTitle>
      </CardHeader>
      <CardContent>
        {/* Números principais em destaque */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center p-3 metric-card-purple rounded-lg">
            <div className="text-2xl font-bold text-purple-400 metric-number">{metricsData.totalLeads}</div>
            <div className="text-xs text-purple-300">Total de Leads</div>
          </div>
          <div className="text-center p-3 metric-card-green rounded-lg">
            <div className="text-2xl font-bold text-green-400 metric-number">{metricsData.taxaConversaoGeral.toFixed(1)}%</div>
            <div className="text-xs text-green-300">Taxa de Conversão</div>
          </div>
        </div>
        
        {/* Gráfico */}
        <div ref={chartRef} className="w-full h-[600px]"></div>
      </CardContent>
    </Card>
  );
};
