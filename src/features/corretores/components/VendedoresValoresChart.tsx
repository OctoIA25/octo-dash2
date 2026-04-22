import { useEffect, useRef, useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';

interface VendedoresValoresChartProps {
  leads: ProcessedLead[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const VendedoresValoresChart = ({ leads }: VendedoresValoresChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  // Processar dados de valores dos imóveis dos vendedores
  const chartData = useMemo(() => {
    if (!leads || leads.length === 0) return [];

    // Filtrar leads com valores e agrupar por faixas
    const leadsComValor = leads.filter(lead => lead.valor_imovel && lead.valor_imovel > 0);
    
    if (leadsComValor.length === 0) {
      // Dados de demonstração quando não há dados reais - NOVO gradiente azul
      // 🎨 REGRA: Quanto MAIOR o valor do imóvel, MAIS ESCURO o tom
      return [
        { y: 0, label: "Até 200K", color: "#8ec8f2" },      // Azul Muito Claro (menores valores)
        { y: 0, label: "200K - 500K", color: "#6391c5" },   // Azul Médio-Claro
        { y: 0, label: "500K - 1M", color: "#2a4a8d" },     // Azul Médio-Escuro
        { y: 0, label: "1M - 2M", color: "#23385f" },       // Azul Escuro
        { y: 0, label: "Acima 2M", color: "#1a233b" }       // Azul Muito Escuro (maiores valores)
      ];
    }

    // Definir faixas de valores - NOVO gradiente azul
    // 🎨 REGRA: Quanto MAIOR o valor do imóvel, MAIS ESCURO o tom de azul
    const faixas = [
      { min: 0, max: 200000, label: "Até 200K", color: "#8ec8f2" },        // Azul Muito Claro
      { min: 200000, max: 500000, label: "200K - 500K", color: "#6391c5" }, // Azul Médio-Claro
      { min: 500000, max: 1000000, label: "500K - 1M", color: "#2a4a8d" },  // Azul Médio-Escuro
      { min: 1000000, max: 2000000, label: "1M - 2M", color: "#23385f" },   // Azul Escuro
      { min: 2000000, max: Infinity, label: "Acima 2M", color: "#1a233b" }  // Azul Muito Escuro
    ];

    return faixas.map(faixa => {
      const count = leadsComValor.filter(lead => 
        lead.valor_imovel! >= faixa.min && lead.valor_imovel! < faixa.max
      ).length;

      return {
        y: count,
        label: faixa.label,
        color: faixa.color
      };
    });
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
        axisY: {
          title: "Quantidade",
          titleFontColor: "#ffffff",
          titleFontSize: 14,
          labelFontColor: "#ffffff",
          labelFontSize: 12,
          gridColor: "#374151",
          gridThickness: 1
        },
        axisX: {
          labelFontColor: "#ffffff",
          labelFontSize: 12,
          labelAngle: -45
        },
        data: [{
          type: "column",
          indexLabelFontSize: 14,
          indexLabelFontWeight: "700",
          indexLabelFontColor: "#ffffff",
          indexLabelPlacement: "outside",
          dataPoints: chartData
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
  }, [chartData]);

  // Calcular estatísticas
  const stats = useMemo(() => {
    const leadsComValor = leads.filter(lead => lead.valor_imovel && lead.valor_imovel > 0);
    
    if (leadsComValor.length === 0) {
      return {
        total: 0,
        valorMedio: 0,
        valorTotal: 0,
        maiorValor: 0
      };
    }

    const valores = leadsComValor.map(lead => lead.valor_imovel!);
    const valorTotal = valores.reduce((sum, val) => sum + val, 0);
    const valorMedio = valorTotal / valores.length;
    const maiorValor = Math.max(...valores);

    return {
      total: leadsComValor.length,
      valorMedio,
      valorTotal,
      maiorValor
    };
  }, [leads]);

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full overflow-hidden">
      <CardHeader className="pb-1">
        <CardTitle className="text-text-primary text-lg neon-text-subtle flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-text-primary glow-accent-purple" />
          <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent font-bold">
            Faixas de Valor dos Imóveis
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 h-[calc(100%-4rem)]">

      {/* Estatísticas resumidas */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="text-center">
          <div className="text-lg font-bold text-green-400">{stats.total}</div>
          <div className="text-xs text-gray-400">Com Valor</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-blue-400">
            R$ {(stats.valorMedio / 1000).toFixed(0)}K
          </div>
          <div className="text-xs text-gray-400">Valor Médio</div>
        </div>
      </div>

      {/* Gráfico */}
      <div className="flex-1 min-h-0">
        <div 
          ref={chartRef} 
          className="w-full h-full"
        />
      </div>

      {/* Resumo inferior */}
      <div className="mt-4 text-center">
        <div className="text-sm text-gray-300">
          Valor Total: <span className="text-green-400 font-semibold">
            R$ {(stats.valorTotal / 1000000).toFixed(1)}M
          </span>
        </div>
      </div>
      </CardContent>
    </Card>
  );
};
