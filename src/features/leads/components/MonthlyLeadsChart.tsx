import { useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card } from '@/components/ui/card';

interface MonthlyLeadsChartProps {
  leads: ProcessedLead[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const MonthlyLeadsChart = ({ leads }: MonthlyLeadsChartProps) => {
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

      // Processar dados mensais dos leads
      const monthlyData: { [key: string]: number } = {};
      
      leads.forEach(lead => {
        if (lead.data_entrada) {
          const date = new Date(lead.data_entrada);
          const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
        }
      });

      // Converter para formato CanvasJS e ordenar por data
      const dataPoints = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => {
          const [year, monthNum] = month.split('-');
          const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
          const monthName = date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
          
          return {
            x: date,
            y: count,
            label: monthName.charAt(0).toUpperCase() + monthName.slice(1)
          };
        });

      // Destruir gráfico anterior se existir
      if (chartRef.current) {
        chartRef.current.destroy();
      }

      // Criar novo gráfico
      const chart = new window.CanvasJS.Chart(chartContainerRef.current, {
        animationEnabled: true,
        backgroundColor: "transparent",
        theme: "dark2",
        creditText: "",
        creditHref: null,
        title: {
          text: "Leads por Mês",
          fontColor: "#F9FAFB",
          fontSize: 18,
          fontFamily: "Inter, sans-serif"
        },
        axisY: {
          title: "Quantidade de Leads",
          titleFontColor: "#F9FAFB",
          titleFontSize: 14,
          labelFontColor: "#9CA3AF",
          gridColor: "#374151",
          includeZero: true
        },
        axisX: {
          title: "Período",
          titleFontColor: "#F9FAFB",
          titleFontSize: 14,
          labelFontColor: "#9CA3AF",
          gridColor: "#374151",
          valueFormatString: "MMM YYYY"
        },
        toolTip: {
          backgroundColor: "#1F2937",
          borderColor: "#374151",
          fontColor: "#F9FAFB"
        },
        data: [{
          type: "column",
          yValueFormatString: "#,### Leads",
          color: "#8B5CF6",
          dataPoints: dataPoints
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
            <p className="text-sm">Carregando dados mensais...</p>
          </div>
        </div>
      </Card>
    );
  }

  // Calcular estatísticas para o resumo
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const currentMonthLeads = leads.filter(lead => {
    if (!lead.data_entrada) return false;
    const date = new Date(lead.data_entrada);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  }).length;

  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const lastMonthLeads = leads.filter(lead => {
    if (!lead.data_entrada) return false;
    const date = new Date(lead.data_entrada);
    return date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear;
  }).length;

  const growthPercentage = lastMonthLeads > 0 
    ? (((currentMonthLeads - lastMonthLeads) / lastMonthLeads) * 100).toFixed(1)
    : '0';

  return (
    <Card className="bg-bg-card/60 backdrop-blur-sm border-bg-secondary/40 p-5 card-glow">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-4 bg-accent-green rounded-full glow-accent-green"></div>
        <h3 className="text-text-primary text-base font-semibold neon-text">
          Métricas Mensais dos Leads
        </h3>
      </div>
      
      <div 
        ref={chartContainerRef}
        className="w-full"
        style={{ height: "370px", width: "100%" }}
      />
      
      {/* Resumo estatístico */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="text-center p-3 bg-gradient-to-br from-accent-green/20 to-accent-green/10 rounded-lg border border-accent-green/30">
          <p className="text-xl font-bold text-accent-green">{currentMonthLeads}</p>
          <p className="text-text-secondary text-xs">Este Mês</p>
        </div>
        <div className="text-center p-3 bg-gradient-to-br from-accent-blue/20 to-accent-blue/10 rounded-lg border border-accent-blue/30">
          <p className="text-xl font-bold text-accent-blue">{lastMonthLeads}</p>
          <p className="text-text-secondary text-xs">Mês Anterior</p>
        </div>
        <div className={`text-center p-3 bg-gradient-to-br rounded-lg border ${
          parseFloat(growthPercentage) >= 0 
            ? 'from-green-500/20 to-green-500/10 border-green-500/30' 
            : 'from-red-500/20 to-red-500/10 border-red-500/30'
        }`}>
          <p className={`text-xl font-bold ${
            parseFloat(growthPercentage) >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {parseFloat(growthPercentage) >= 0 ? '+' : ''}{growthPercentage}%
          </p>
          <p className="text-text-secondary text-xs">Crescimento</p>
        </div>
      </div>
    </Card>
  );
};
