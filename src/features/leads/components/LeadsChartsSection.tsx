import { useState, useMemo, useRef, useEffect } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  Calendar,
  Target,
  Activity,
  Users,
  Clock,
  MapPin,
  DollarSign
} from 'lucide-react';

interface LeadsChartsSectionProps {
  leads: ProcessedLead[];
}

type ChartType = 'origem' | 'temperatura' | 'mensal' | 'corretores' | 'valores' | 'etapas';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const LeadsChartsSection = ({ leads }: LeadsChartsSectionProps) => {
  const [activeChart, setActiveChart] = useState<ChartType>('origem');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  // Processar dados baseados nos campos disponíveis do Supabase
  const chartData = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    // Dados por origem
    const origemData = leads.reduce((acc, lead) => {
      const origem = lead.origem_lead || 'Orgânico';
      acc[origem] = (acc[origem] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Dados por temperatura
    const temperaturaData = leads.reduce((acc, lead) => {
      const temp = lead.status_temperatura || 'Orgânico';
      acc[temp] = (acc[temp] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Dados mensais baseados na data_entrada (quando o lead entrou no sistema)
    const mensalData = leads.reduce((acc, lead) => {
      const date = new Date(lead.data_entrada);
      if (!isNaN(date.getTime())) {
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthName = date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
        
        if (!acc[monthKey]) {
          acc[monthKey] = {
            name: monthName,
            count: 0,
            value: 0,
            visitasAgendadas: 0,
            negociacoes: 0
          };
        }
        
        acc[monthKey].count++;
        acc[monthKey].value += lead.valor_imovel || 0;
        
        if (lead.Data_visita && lead.Data_visita.trim() !== '') {
          acc[monthKey].visitasAgendadas++;
        }
        
        if (lead.etapa_atual === 'Em Negociação' || lead.etapa_atual === 'Negociação') {
          acc[monthKey].negociacoes++;
        }
      }
      return acc;
    }, {} as Record<string, any>);

    // Dados por corretor
    const corretorData = leads.reduce((acc, lead) => {
      const corretor = lead.corretor_responsavel || 'Não atribuído';
      if (!acc[corretor]) {
        acc[corretor] = {
          count: 0,
          visitas: 0,
          negociacoes: 0,
          valor: 0
        };
      }
      
      acc[corretor].count++;
      acc[corretor].valor += lead.valor_imovel || 0;
      
      if (lead.Data_visita && lead.Data_visita.trim() !== '') {
        acc[corretor].visitas++;
      }
      
      if (lead.etapa_atual === 'Em Negociação' || lead.etapa_atual === 'Negociação') {
        acc[corretor].negociacoes++;
      }
      
      return acc;
    }, {} as Record<string, any>);

    // Dados por valor de imóvel (faixas)
    const valorData = leads.reduce((acc, lead) => {
      const valor = lead.valor_imovel || 0;
      let faixa = 'Orgânico';
      
      if (valor > 0) {
        if (valor <= 200000) faixa = 'Até R$ 200k';
        else if (valor <= 400000) faixa = 'R$ 200k - R$ 400k';
        else if (valor <= 600000) faixa = 'R$ 400k - R$ 600k';
        else if (valor <= 1000000) faixa = 'R$ 600k - R$ 1M';
        else faixa = 'Acima de R$ 1M';
      }
      
      acc[faixa] = (acc[faixa] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Dados por etapa atual
    const etapaData = leads.reduce((acc, lead) => {
      const etapa = lead.etapa_atual || 'Orgânico';
      acc[etapa] = (acc[etapa] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      origemData,
      temperaturaData,
      mensalData: Object.values(mensalData).sort((a: any, b: any) => a.name.localeCompare(b.name)),
      corretorData,
      valorData,
      etapaData
    };
  }, [leads]);

  // Configurar gráfico baseado no tipo ativo
  useEffect(() => {
    if (!chartData || !window.CanvasJS || !chartRef.current) return;

    const initializeChart = () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      let chartConfig: any = {
        theme: "dark2",
        backgroundColor: "transparent",
        creditText: "",
        creditHref: null,
        title: { text: "" },
        height: 680,
        animationEnabled: true,
        animationDuration: 1000,
        interactivityEnabled: true
      };

      switch (activeChart) {
        case 'origem':
          const origemEntries = Object.entries(chartData.origemData)
            .sort(([,a], [,b]) => (b as number) - (a as number))
            .slice(0, 8);
          
          chartConfig.data = [{
            type: "pie",
            indexLabel: "{label}: {y}",
            indexLabelFontColor: "#ffffff",
            indexLabelFontSize: 15,
            dataPoints: origemEntries.map(([origem, count], index) => {
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
              
              return {
                label: origem,
                y: count,
                color: coresPorOrigem[origem] || [
                  "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", 
                  "#22d3ee", "#ec4899", "#84cc16", "#f97316"
                ][index % 8]
              };
            })
          }];
          break;

        case 'temperatura':
          const tempColors = {
            'Frio': '#3B82F6',     // Azul vibrante
            'Morno': '#F59E0B',    // Laranja vibrante
            'Quente': '#DC2626',   // Vermelho #DC2626 (tom do funil)
            'Orgânico': '#10B981'  // Verde limão
          };
          
          chartConfig.data = [{
            type: "doughnut",
            innerRadius: "50%",
            indexLabel: "{label}: {y}",
            indexLabelFontColor: "#ffffff",
            indexLabelFontSize: 16,
            dataPoints: Object.entries(chartData.temperaturaData).map(([temp, count]) => ({
              label: temp,
              y: count,
              color: tempColors[temp as keyof typeof tempColors] || '#8b5cf6'
            }))
          }];
          break;

        case 'mensal':
          chartConfig.axisX = {
            title: "Mês",
            titleFontColor: "#8b5cf6",
            labelFontColor: "#e5e7eb",
            gridColor: "#374151"
          };
          chartConfig.axisY = {
            title: "Quantidade de Leads",
            titleFontColor: "#8b5cf6",
            labelFontColor: "#e5e7eb",
            gridColor: "#374151"
          };
          chartConfig.data = [{
            type: "splineArea",
            markerSize: 8,
            color: "#8b5cf6",
            fillOpacity: 0.3,
            dataPoints: chartData.mensalData.map((item: any) => ({
              label: item.name,
              y: item.count,
              toolTipContent: `<strong>${item.name}</strong><br/>Leads: {y}<br/>Visitas: ${item.visitasAgendadas}<br/>Negociações: ${item.negociacoes}<br/>Valor Total: R$ ${(item.value / 1000).toFixed(0)}k`
            }))
          }];
          break;

        case 'corretores':
          const corretorEntries = Object.entries(chartData.corretorData)
            .sort(([,a], [,b]) => (b as any).count - (a as any).count)
            .slice(0, 10);
          
          chartConfig.axisX = {
            title: "Corretores",
            titleFontColor: "#8b5cf6",
            labelFontColor: "#e5e7eb",
            labelAngle: -45
          };
          chartConfig.axisY = {
            title: "Quantidade de Leads",
            titleFontColor: "#8b5cf6",
            labelFontColor: "#e5e7eb"
          };
          chartConfig.data = [{
            type: "column",
            color: "#10b981",
            dataPoints: corretorEntries.map(([corretor, data]) => ({
              label: corretor.length > 15 ? corretor.substring(0, 15) + '...' : corretor,
              y: (data as any).count,
              toolTipContent: `<strong>${corretor}</strong><br/>Leads: {y}<br/>Visitas: ${(data as any).visitas}<br/>Negociações: ${(data as any).negociacoes}<br/>Pipeline: R$ ${((data as any).valor / 1000).toFixed(0)}k`
            }))
          }];
          break;

        case 'valores':
          const valorEntries = Object.entries(chartData.valorData)
            .sort(([,a], [,b]) => (b as number) - (a as number));
          
          chartConfig.data = [{
            type: "bar",
            color: "#f59e0b",
            dataPoints: valorEntries.map(([faixa, count]) => ({
              label: faixa,
              y: count
            }))
          }];
          break;

        case 'etapas':
          const etapaEntries = Object.entries(chartData.etapaData)
            .sort(([,a], [,b]) => (b as number) - (a as number));
          
          chartConfig.data = [{
            type: "pyramid",
            indexLabel: "{label}: {y}",
            indexLabelFontColor: "#ffffff",
            dataPoints: etapaEntries.map(([etapa, count], index) => ({
              label: etapa,
              y: count,
              color: [
                "#22d3ee", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#ec4899"
              ][index % 6]
            }))
          }];
          break;
      }

      const chart = new window.CanvasJS.Chart(chartRef.current, chartConfig);
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
  }, [activeChart, chartData]);

  if (!chartData) {
    return (
      <div className="flex items-center justify-center h-[350px] text-text-secondary">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 text-purple-400 mx-auto mb-4" />
          <h4 className="text-lg font-semibold text-text-primary mb-2">Gráficos de Análise</h4>
          <p className="text-sm">Carregando dados para análise...</p>
        </div>
      </div>
    );
  }

  const chartButtons = [
    { key: 'origem' as ChartType, label: 'Origens', icon: MapPin, color: 'blue' },
    { key: 'temperatura' as ChartType, label: 'Temperatura', icon: Target, color: 'red' },
    { key: 'mensal' as ChartType, label: 'Mensal', icon: Calendar, color: 'green' },
    { key: 'corretores' as ChartType, label: 'Corretores', icon: Users, color: 'purple' },
    { key: 'valores' as ChartType, label: 'Valores', icon: DollarSign, color: 'yellow' },
    { key: 'etapas' as ChartType, label: 'Etapas', icon: Activity, color: 'cyan' }
  ];

  const getButtonClass = (chartType: ChartType, color: string) => {
    const isActive = activeChart === chartType;
    const colorClasses = {
      blue: isActive ? 'bg-blue-500/20 border-blue-400 text-blue-300' : 'border-blue-500/30 hover:bg-blue-500/10 hover:border-blue-400',
      red: isActive ? 'bg-red-500/20 border-red-400 text-red-300' : 'border-red-500/30 hover:bg-red-500/10 hover:border-red-400',
      green: isActive ? 'bg-green-500/20 border-green-400 text-green-300' : 'border-green-500/30 hover:bg-green-500/10 hover:border-green-400',
      purple: isActive ? 'bg-purple-500/20 border-purple-400 text-purple-300' : 'border-purple-500/30 hover:bg-purple-500/10 hover:border-purple-400',
      yellow: isActive ? 'bg-yellow-500/20 border-yellow-400 text-yellow-300' : 'border-yellow-500/30 hover:bg-yellow-500/10 hover:border-yellow-400',
      cyan: isActive ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' : 'border-cyan-500/30 hover:bg-cyan-500/10 hover:border-cyan-400'
    };
    
    return `px-3 py-2 text-xs font-medium rounded-lg border transition-all duration-300 ${colorClasses[color as keyof typeof colorClasses]} ${isActive ? 'shadow-lg' : ''}`;
  };

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <CardTitle className="text-text-primary text-lg neon-text flex items-center gap-2">
            <div className="w-2 h-2 bg-purple-400 rounded-full glow-accent-purple"></div>
            Análise de Dados
          </CardTitle>
          
          {/* Botões de navegação */}
          <div className="flex flex-wrap gap-2">
            {chartButtons.map(({ key, label, icon: Icon, color }) => (
              <button
                key={key}
                onClick={() => setActiveChart(key)}
                className={getButtonClass(key, color)}
              >
                <Icon className="h-3 w-3 mr-1.5 inline" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={chartRef} className="w-full h-[350px]"></div>
      </CardContent>
    </Card>
  );
};
