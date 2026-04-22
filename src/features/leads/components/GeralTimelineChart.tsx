import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, Zap } from 'lucide-react';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface GeralTimelineChartProps {
  leads: ProcessedLead[];
}

export const GeralTimelineChart = ({ leads }: GeralTimelineChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const timelineData = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    // Agrupar leads por semana nos últimos 3 meses
    const semanas = [];
    const hoje = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const dataInicio = new Date(hoje.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
      const dataFim = new Date(dataInicio.getTime() + (6 * 24 * 60 * 60 * 1000));
      
      semanas.push({
        inicio: dataInicio,
        fim: dataFim,
        label: `${dataInicio.getDate()}/${dataInicio.getMonth() + 1}`,
        leads: [],
        totalLeads: 0,
        quentes: 0,
        visitas: 0,
        negociacoes: 0,
        valorTotal: 0
      });
    }

    // Distribuir leads por semana
    leads.forEach(lead => {
      const dataLead = new Date(lead.data_entrada);
      const semanaIndex = semanas.findIndex(s => dataLead >= s.inicio && dataLead <= s.fim);
      
      if (semanaIndex !== -1) {
        const semana = semanas[semanaIndex];
        semana.leads.push(lead);
        semana.totalLeads++;
        semana.valorTotal += lead.valor_imovel || 0;
        
        if (lead.status_temperatura === 'Quente') semana.quentes++;
        if ((lead.Data_visita && lead.Data_visita.trim() !== "") || 
            lead.etapa_atual === 'Visita Agendada') semana.visitas++;
        if (lead.etapa_atual === 'Em Negociação' || 
            lead.etapa_atual === 'Negociação') semana.negociacoes++;
      }
    });

    // Criar séries para o gráfico usando gradiente azul
    // REGRA: Linhas mais importantes/maior valor = mais escuro
    const series = [
      {
        type: 'line',
        name: 'Volume de Leads',
        color: '#2d5f9f', // Azul Intenso (linha mais importante)
        lineThickness: 3,
        markerSize: 8,
        dataPoints: semanas.map(s => ({
          label: s.label,
          y: s.totalLeads,
          valorTotal: s.valorTotal,
          quentes: s.quentes,
          visitas: s.visitas,
          negociacoes: s.negociacoes
        }))
      },
      {
        type: 'line',
        name: 'Leads Quentes',
        color: '#1e4d8b', // Azul Escuro/Royal
        lineThickness: 2,
        markerSize: 6,
        dataPoints: semanas.map(s => ({
          label: s.label,
          y: s.quentes,
          totalLeads: s.totalLeads,
          percentual: s.totalLeads > 0 ? (s.quentes / s.totalLeads) * 100 : 0
        }))
      },
      {
        type: 'line',
        name: 'Visitas Agendadas',
        color: '#4a7ab0', // Azul Médio Escuro
        lineThickness: 2,
        markerSize: 6,
        dataPoints: semanas.map(s => ({
          label: s.label,
          y: s.visitas,
          totalLeads: s.totalLeads,
          percentual: s.totalLeads > 0 ? (s.visitas / s.totalLeads) * 100 : 0
        }))
      }
    ];

    return { series, semanas };
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
      if (!chartRef.current || !window.CanvasJS || !timelineData) return;

      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      const chart = new window.CanvasJS.Chart(chartRef.current, {
        theme: "dark2",
        backgroundColor: "transparent",
        creditText: "",
        creditHref: null,
        exportEnabled: false,
        title: { text: "", fontColor: "#ffffff" },
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
          labelFontColor: "#e5e7eb",
          labelFontSize: 12,
          labelFontWeight: "600",
          lineColor: "#6b7280",
          tickColor: "#6b7280"
        },
        legend: {
          fontColor: "#ffffff",
          fontSize: 12,
          horizontalAlign: "center",
          verticalAlign: "top"
        },
        toolTip: {
          backgroundColor: "rgba(17, 24, 39, 0.98)",
          fontColor: "#ffffff",
          borderColor: "#6b7280",
          cornerRadius: 8,
          shared: true
        },
        data: timelineData.series,
        height: 400,
        animationEnabled: true,
        animationDuration: 1200
      });

      chart.render();
      chartInstance.current = chart;

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

  if (!timelineData || !leads || leads.length === 0) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full">
        <CardHeader>
          <StandardCardTitle icon={Calendar}>
            Timeline de Atividades
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <Clock className="h-12 w-12 text-purple-400 mx-auto mb-4" />
            <p className="text-text-secondary">Carregando timeline...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full">
      <CardHeader>
        <CardTitle className="text-text-primary text-lg neon-text flex items-center gap-2">
          <Calendar className="h-5 w-5 text-purple-400" />
          Timeline de Atividades
        </CardTitle>
      </CardHeader>
      <CardContent className="h-full p-4">
        <div ref={chartRef} className="w-full h-[320px]" />
      </CardContent>
    </Card>
  );
};
