import { useEffect, useRef, useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Thermometer } from 'lucide-react';

interface VendedoresTemperaturaChartProps {
  leads: ProcessedLead[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const VendedoresTemperaturaChart = ({ leads }: VendedoresTemperaturaChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  // Processar dados de temperatura dos vendedores
  const chartData = useMemo(() => {
    if (!leads || leads.length === 0) {
      // Dados de demonstração quando não há dados reais
      return [
        { y: 0, label: "Quente", color: "#234890" },
        { y: 0, label: "Morno", color: "#73A6D3" },
        { y: 0, label: "Frio", color: "#F4F8FA" }
      ];
    }

    const quentes = leads.filter(lead => 
      lead.status_temperatura === 'Quente'
    ).length;

    const mornos = leads.filter(lead => 
      lead.status_temperatura === 'Morno'
    ).length;

    const frios = leads.filter(lead => 
      lead.status_temperatura === 'Frio'
    ).length;

    return [
      { y: quentes, label: "Quente", color: "#234890" },
      { y: mornos, label: "Morno", color: "#73A6D3" },
      { y: frios, label: "Frio", color: "#F4F8FA" }
    ];
  }, [leads]);

  useEffect(() => {
    const loadCanvasJS = () => {
      if (window.CanvasJS) {
        initializeChart();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
      script.onload = initializeChart;
      script.onerror = () => console.error('Erro ao carregar CanvasJS');
      document.head.appendChild(script);
    };

    const initializeChart = () => {
      if (!chartRef.current) return;

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
        data: [{
          type: "pie",
          indexLabelFontSize: 16,
          indexLabelFontWeight: "700",
          indexLabelFontColor: "#ffffff",
          indexLabelPlacement: "outside",
          indexLabel: "{label}: {y}",
          toolTipContent: "{label}: <b>{y}</b> ({percentage}%)",
          startAngle: 90,
          dataPoints: chartData.map(point => ({
            ...point,
            percentage: leads.length > 0 ? ((point.y / leads.length) * 100).toFixed(1) : 0
          }))
        }],
        height: 400,
        animationEnabled: true,
        animationDuration: 1000
      });

      chart.render();
      chartInstance.current = chart;
    };

    loadCanvasJS();

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [chartData, leads.length]);

  // Calcular estatísticas
  const stats = useMemo(() => {
    const total = leads.length;
    const quentes = chartData.find(item => item.label === "Quente")?.y || 0;
    const mornos = chartData.find(item => item.label === "Morno")?.y || 0;
    const frios = chartData.find(item => item.label === "Frio")?.y || 0;
    
    const urgentes = quentes + mornos; // Quentes + Mornos = necessitam atenção urgente
    const taxaUrgencia = total > 0 ? ((urgentes / total) * 100).toFixed(1) : '0';
    
    return {
      total,
      quentes,
      mornos,
      frios,
      urgentes,
      taxaUrgencia,
      maisComum: quentes >= mornos && quentes >= frios ? 'Quente' : 
                 mornos >= frios ? 'Morno' : 'Frio'
    };
  }, [chartData, leads.length]);

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full overflow-hidden">
      <CardHeader className="pb-1">
        <CardTitle className="text-text-primary text-lg neon-text-subtle flex items-center gap-2">
          <Thermometer className="h-5 w-5 text-text-primary glow-accent-purple" />
          <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent font-bold">
            Temperatura dos Vendedores
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 h-[calc(100%-4rem)]">

      {/* Estatísticas resumidas */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <div className="text-center">
          <div className="text-lg font-bold text-red-400">{stats.quentes}</div>
          <div className="text-xs text-gray-400">Quente</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-orange-400">{stats.mornos}</div>
          <div className="text-xs text-gray-400">Morno</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-blue-400">{stats.frios}</div>
          <div className="text-xs text-gray-400">Frio</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-purple-400">{stats.taxaUrgencia}%</div>
          <div className="text-xs text-gray-400">Urgentes</div>
        </div>
      </div>

      {/* Gráfico */}
      <div className="flex-1 min-h-0">
        <div 
          ref={chartRef} 
          className="w-full h-full"
        />
      </div>

      {/* Insights */}
      <div className="mt-4 space-y-2">
        <div className="text-center text-sm text-gray-300">
          Mais comum: <span className="text-yellow-400 font-semibold">
            {stats.maisComum}
          </span>
        </div>
        <div className="text-center text-sm text-gray-300">
          <span className="text-red-400 font-semibold">{stats.urgentes}</span> vendedores 
          necessitam atenção urgente
        </div>
      </div>
      </CardContent>
    </Card>
  );
};
