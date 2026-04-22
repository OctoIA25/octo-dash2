import { useMemo, useRef, useEffect } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, ArrowRight } from 'lucide-react';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

interface LeadsConversionChartProps {
  leads: ProcessedLead[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const LeadsConversionChart = ({ leads }: LeadsConversionChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  // Calcular dados de conversão por etapa
  const conversionData = useMemo(() => {
    const totalLeads = leads?.length || 0;
    
    // Calcular cada etapa
    const interacoes = leads.filter(lead => 
      lead.etapa_atual === 'Interação' ||
      lead.etapa_atual === 'Em Atendimento'
    ).length;
    
    const visitasAgendadas = leads.filter(lead => 
      lead.Data_visita && lead.Data_visita.trim() !== "" ||
      lead.etapa_atual === 'Visita Agendada'
    ).length;
    
    const visitasRealizadas = leads.filter(lead => 
      lead.etapa_atual === 'Visita Realizada' ||
      lead.etapa_atual === 'Visita realizada'
    ).length;
    
    const negociacoes = leads.filter(lead => 
      lead.etapa_atual === 'Em Negociação' ||
      lead.etapa_atual === 'Negociação' ||
      lead.etapa_atual === 'Proposta Enviada'
    ).length;

    // Calcular taxas de conversão
    const taxaInteracaoVisita = interacoes > 0 ? (visitasAgendadas / interacoes * 100) : 0;
    const taxaAgendadaRealizada = visitasAgendadas > 0 ? (visitasRealizadas / visitasAgendadas * 100) : 0;
    const taxaVisitaNegociacao = visitasRealizadas > 0 ? (negociacoes / visitasRealizadas * 100) : 0;
    const taxaGeralNegociacao = totalLeads > 0 ? (negociacoes / totalLeads * 100) : 0;

    return {
      etapas: [
        { etapa: 'Interação → Visita', taxa: taxaInteracaoVisita, valor: visitasAgendadas, de: interacoes },
        { etapa: 'Agendada → Realizada', taxa: taxaAgendadaRealizada, valor: visitasRealizadas, de: visitasAgendadas },
        { etapa: 'Visita → Negociação', taxa: taxaVisitaNegociacao, valor: negociacoes, de: visitasRealizadas },
        { etapa: 'Total → Negociação', taxa: taxaGeralNegociacao, valor: negociacoes, de: totalLeads }
      ],
      chartData: [
        { x: 1, y: taxaInteracaoVisita, label: 'Int→Vis', color: '#22d3ee' },
        { x: 2, y: taxaAgendadaRealizada, label: 'Age→Rea', color: '#10b981' },
        { x: 3, y: taxaVisitaNegociacao, label: 'Vis→Neg', color: '#f59e0b' },
        { x: 4, y: taxaGeralNegociacao, label: 'Tot→Neg', color: '#ef4444' }
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
        height: 250,
        animationEnabled: true,
        animationDuration: 1000,
        data: [{
          type: "spline",
          lineThickness: 4,
          markerSize: 12,
          markerType: "circle",
          indexLabel: "{y}%",
          indexLabelFontColor: "#ffffff",
          indexLabelFontSize: 14,
          indexLabelFontWeight: "800",
          indexLabelPlacement: "outside",
          toolTipContent: `
            <div style="background: rgba(17, 24, 39, 0.96); color: white; padding: 12px; border-radius: 8px; border: 1px solid rgba(139, 92, 246, 0.4); box-shadow: 0 4px 16px rgba(0,0,0,0.4);">
              <strong style="color: #8b5cf6; font-size: 14px;">{label}</strong><br/>
              <span style="color: #10b981; font-weight: bold; font-size: 16px;">{y}%</span> conversão
            </div>
          `,
          dataPoints: conversionData.chartData
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
          gridThickness: 0,
          maximum: 100
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
  }, [conversionData]);

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20">
      <CardHeader className="pb-3">
        <StandardCardTitle icon={TrendingUp}>
          Taxa de Conversão por Etapa
        </StandardCardTitle>
      </CardHeader>
      <CardContent>
        {/* Números de conversão em destaque */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {conversionData.etapas.slice(0, 2).map((item, index) => (
            <div key={index} className="text-center p-3 metric-card-green rounded-lg">
              <div className="text-xl font-bold text-green-400 metric-number">{item.taxa.toFixed(1)}%</div>
              <div className="text-xs text-green-300">{item.etapa}</div>
              <div className="text-xs text-gray-400 mt-1">{item.valor}/{item.de}</div>
            </div>
          ))}
        </div>
        
        {/* Gráfico de linha */}
        <div ref={chartRef} className="w-full h-[250px]"></div>
        
        {/* Métricas resumidas embaixo */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          {conversionData.etapas.slice(2).map((item, index) => (
            <div key={index + 2} className="text-center p-2 metric-card-orange rounded-lg">
              <div className="text-lg font-bold text-orange-400 metric-number">{item.taxa.toFixed(1)}%</div>
              <div className="text-xs text-orange-300">{item.etapa}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
