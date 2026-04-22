import { useEffect, useRef, useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home } from 'lucide-react';

interface VendedoresTiposChartProps {
  leads: ProcessedLead[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const VendedoresTiposChart = ({ leads }: VendedoresTiposChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  // Processar dados de tipos de negócio dos vendedores
  const chartData = useMemo(() => {
    if (!leads || leads.length === 0) {
      // Dados de demonstração quando não há dados reais
      return [
        { y: 0, label: "Venda", color: "#22C55E" },
        { y: 0, label: "Locação", color: "#3B82F6" },
        { y: 0, label: "Ambos", color: "#F59E0B" }
      ];
    }

    const venda = leads.filter(lead => {
      const tipo = lead.tipo_negocio?.toLowerCase() || '';
      return tipo.includes('venda') || tipo.includes('vender');
    }).length;

    const locacao = leads.filter(lead => {
      const tipo = lead.tipo_negocio?.toLowerCase() || '';
      return tipo.includes('locação') || tipo.includes('locacao') || 
             tipo.includes('alugar') || tipo.includes('locar');
    }).length;

    // Leads que podem estar em ambas as categorias (se houver sobreposição nos dados)
    const ambos = leads.filter(lead => {
      const tipo = lead.tipo_negocio?.toLowerCase() || '';
      const temVenda = tipo.includes('venda') || tipo.includes('vender');
      const temLocacao = tipo.includes('locação') || tipo.includes('locacao') || 
                        tipo.includes('alugar') || tipo.includes('locar');
      return temVenda && temLocacao;
    }).length;

    return [
      { y: venda, label: "Venda", color: "#22C55E" },
      { y: locacao, label: "Locação", color: "#3B82F6" },
      { y: ambos, label: "Ambos", color: "#F59E0B" }
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
          type: "doughnut",
          indexLabelFontSize: 16,
          indexLabelFontWeight: "700",
          indexLabelFontColor: "#ffffff",
          indexLabelPlacement: "outside",
          indexLabel: "{label}: {y}",
          toolTipContent: "{label}: <b>{y}</b> ({percentage}%)",
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
    const venda = chartData.find(item => item.label === "Venda")?.y || 0;
    const locacao = chartData.find(item => item.label === "Locação")?.y || 0;
    
    return {
      total,
      percentualVenda: total > 0 ? ((venda / total) * 100).toFixed(1) : '0',
      percentualLocacao: total > 0 ? ((locacao / total) * 100).toFixed(1) : '0',
      maisComum: venda >= locacao ? 'Venda' : 'Locação'
    };
  }, [chartData, leads.length]);

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full overflow-hidden">
      <CardHeader className="pb-1">
        <CardTitle className="text-text-primary text-lg neon-text-subtle flex items-center gap-2">
          <Home className="h-5 w-5 text-text-primary glow-accent-purple" />
          <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent font-bold">
            Tipos de Negócio
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 h-[calc(100%-4rem)]">

      {/* Estatísticas resumidas */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="text-center">
          <div className="text-lg font-bold text-green-400">{stats.percentualVenda}%</div>
          <div className="text-xs text-gray-400">Venda</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-blue-400">{stats.percentualLocacao}%</div>
          <div className="text-xs text-gray-400">Locação</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-orange-400">{stats.total}</div>
          <div className="text-xs text-gray-400">Total</div>
        </div>
      </div>

      {/* Gráfico */}
      <div className="flex-1 min-h-0">
        <div 
          ref={chartRef} 
          className="w-full h-full"
        />
      </div>

      {/* Insight */}
      <div className="mt-4 text-center">
        <div className="text-sm text-gray-300">
          Mais comum: <span className="text-yellow-400 font-semibold">
            {stats.maisComum}
          </span>
        </div>
      </div>
      </CardContent>
    </Card>
  );
};
