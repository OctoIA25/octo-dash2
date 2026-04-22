import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { Globe, Users, TrendingUp, MapPin } from 'lucide-react';
import { RANKING_BLUE_GRADIENT } from '@/utils/colors';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface LeadsOriginChartProps {
  leads: ProcessedLead[];
}

export const LeadsOriginChart = ({ leads }: LeadsOriginChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  // Calcular dados de origem com métricas avançadas
  const originData = useMemo(() => {

    if (!leads || leads.length === 0) {
      return { chartDataPoints: [], metrics: null, topOrigins: [] };
    }

    // Debug: verificar se todos os leads têm origem_lead
    const leadsWithOrigin = leads.filter(lead => lead.origem_lead);
    const leadsWithoutOrigin = leads.length - leadsWithOrigin.length;

    // Processar leads com métricas detalhadas
    const originStats = leads.reduce((acc, lead) => {
      let origem = lead.origem_lead?.trim() || 'Orgânico';
      
      if (!origem || origem === '' || origem.toLowerCase() === 'não informado') {
        origem = 'Orgânico';
      }
      
      if (!acc[origem]) {
        acc[origem] = {
          quantidade: 0,
          conversoes: 0,
          valorTotal: 0,
          quentes: 0,
          visitasAgendadas: 0
        };
      }
      
      acc[origem].quantidade++;
      acc[origem].valorTotal += lead.valor_imovel || 0;
      
      // Contar leads quentes
      if (lead.status_temperatura?.toLowerCase() === 'quente') {
        acc[origem].quentes++;
      }
      
      // Contar visitas agendadas
      if (lead.Data_visita && lead.Data_visita.trim() !== "") {
        acc[origem].visitasAgendadas++;
      }
      
      // Contar conversões (leads com valor final de venda)
      if (lead.valor_final_venda && lead.valor_final_venda > 0) {
        acc[origem].conversoes++;
      }
      
      return acc;
    }, {} as Record<string, any>);

    // Converter para array e ordenar por quantidade
    const sortedOrigins = Object.entries(originStats)
      .sort(([,a], [,b]) => b.quantidade - a.quantidade)
      .slice(0, 8); // Top 8 origens

    const totalLeads = leads.length;
    const totalConversoes = Object.values(originStats).reduce((acc: number, stats: any) => acc + stats.conversoes, 0);

    // Dados para o gráfico CanvasJS sem cores (serão atribuídas depois)
    const chartDataPointsBase = sortedOrigins.map(([origem, stats], index) => ({
      y: stats.quantidade,
      label: origem,
      quantidade: stats.quantidade,
      percentual: ((stats.quantidade / totalLeads) * 100),
      conversoes: stats.conversoes,
      quentes: stats.quentes,
      visitasAgendadas: stats.visitasAgendadas,
      valorMedio: stats.quantidade > 0 ? stats.valorTotal / stats.quantidade : 0
    }));
    
    // 🎨 Restaurar cores originais específicas por origem
    const chartDataPoints = chartDataPointsBase.map(point => {
      const origemLower = point.label.toLowerCase();
      
      // Cores específicas por origem (restauradas)
      if (origemLower.includes('facebook')) {
        return { ...point, color: "#1877F2" }; // Azul oficial Facebook
      }
      if (origemLower.includes('instagram')) {
        return { ...point, color: "#FF6B35" }; // Laranja avermelhado vibrante
      }
      if (origemLower.includes('orgânico') || origemLower.includes('organico')) {
        return { ...point, color: "#22C55E" }; // Verde natureza
      }
      if (origemLower.includes('google ads')) {
        return { ...point, color: "#4285F4" }; // Azul oficial Google
      }
      if (origemLower.includes('google')) {
        return { ...point, color: "#34A853" }; // Verde oficial Google
      }
      if (origemLower.includes('site')) {
        return { ...point, color: "#8B5CF6" }; // Roxo moderno
      }
      if (origemLower.includes('whatsapp')) {
        return { ...point, color: "#25D366" }; // Verde oficial WhatsApp
      }
      if (origemLower.includes('linkedin')) {
        return { ...point, color: "#0A66C2" }; // Azul oficial LinkedIn
      }
      
      // Fallback para outras origens
      const fallbackColors = ["#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#22d3ee", "#ec4899", "#84cc16", "#f97316"];
      const index = chartDataPointsBase.indexOf(point);
      return { ...point, color: fallbackColors[index % fallbackColors.length] };
    });

    const metrics = {
      totalLeads,
      totalConversoes,
      origemPrincipal: sortedOrigins[0] ? sortedOrigins[0][0] : 'N/A',
      quantidadePrincipal: sortedOrigins[0] ? sortedOrigins[0][1].quantidade : 0,
      diversidadeOrigens: Object.keys(originStats).length,
      taxaConversaoGeral: totalLeads > 0 ? (totalConversoes / totalLeads * 100) : 0
    };


    return { chartDataPoints, metrics, topOrigins: sortedOrigins };
  }, [leads]);

  // Carregar CanvasJS e criar gráfico donut
  useEffect(() => {
    
    const loadCanvasJS = () => {
      if (!window.CanvasJS) {
        const script = document.createElement('script');
        script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
        script.async = true;
        script.onload = () => {
          createChart();
        };
        script.onerror = () => {
          console.error('❌ Erro ao carregar CanvasJS');
        };
        document.head.appendChild(script);
      } else {
        createChart();
      }
    };

    const createChart = () => {
      if (!chartRef.current || !originData.metrics || !window.CanvasJS) {
        console.warn('⚠️ Condições não atendidas para criar gráfico de origem');
        return;
      }

      // Destruir gráfico anterior se existir
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      try {
        const chart = new window.CanvasJS.Chart(chartRef.current, {
          animationEnabled: true,
          animationDuration: 2000,
          theme: "dark2",
          backgroundColor: "transparent",
          
          // Remover marca d'água
          creditHref: null,
          creditText: "",
          
          title: {
            text: "",
            fontFamily: "Inter, system-ui, sans-serif"
          },
          
          toolTip: {
            backgroundColor: "#1F2937",
            borderColor: "#8B5CF6",
            borderThickness: 2,
            cornerRadius: 8,
            fontColor: "#F9FAFB",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 14,
            fontWeight: "600",
            content: "<span style='color: #8B5CF6; font-weight: bold; font-size: 15px;'>{label}</span><br/>" +
                    "<span style='color: #F9FAFB; font-size: 14px; font-weight: 600;'>Leads: {y}</span><br/>" +
                    "<span style='color: #10B981; font-size: 13px; font-weight: 600;'>Percentual: {percentual}%</span><br/>" +
                    "<span style='color: #F59E0B; font-size: 13px;'>Quentes: {quentes}</span>"
          },
          
          data: [{
            type: "doughnut",
            showInLegend: false,
            legendText: "{label}",
            indexLabel: "{label}: {y}",
            indexLabelFontColor: "#F9FAFB",
            indexLabelFontSize: 15,
            indexLabelFontWeight: "700",
            indexLabelFontFamily: "Inter, system-ui, sans-serif",
            indexLabelPlacement: "outside",
            dataPoints: originData.chartDataPoints
          }],
          height: 550
        });

        chart.render();
        chartInstance.current = chart;
        
        
      } catch (error) {
        console.error('❌ Erro ao criar gráfico de origem:', error);
      }
    };

    if (originData.metrics) {
      loadCanvasJS();
    }

    // Cleanup
    return () => {
      if (chartInstance.current) {
        try {
          chartInstance.current.destroy();
        } catch (error) {
          console.warn('⚠️ Erro ao destruir gráfico:', error);
        }
      }
    };
  }, [originData]);

  // Função para obter cor por origem
  const getColorByOrigin = (origem: string) => {
    const origemLower = origem.toLowerCase();
    if (origemLower.includes('facebook')) return "#1877F2"; // Azul Facebook
    if (origemLower.includes('instagram')) return "#E4405F"; // Laranja Instagram
    if (origemLower.includes('orgânico') || origemLower.includes('organico')) return "#22C55E"; // Verde Orgânico
    
    // Cores para outras origens
    const fallbackColors = ["#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#84cc16", "#ec4899"];
    return fallbackColors[Math.abs(origem.length) % fallbackColors.length];
  };

  if (!originData.metrics) {
    return (
      <div className="flex items-center justify-center h-[450px] text-text-secondary">
        <div className="text-center">
          <Globe className="h-12 w-12 text-purple-400 mx-auto mb-4" />
          <h4 className="text-lg font-semibold text-text-primary mb-2">Origem dos Leads</h4>
          <p className="text-sm">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full overflow-hidden">
      <CardHeader className="pb-1">
        <StandardCardTitle icon={Globe}>
          Origem dos Leads
        </StandardCardTitle>
      </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden p-6">
        {/* Informações por origem e temperatura - EM CIMA */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {originData.topOrigins.slice(0, 3).map(([origem, stats]) => {
            const color = getColorByOrigin(origem);
            const mornos = leads.filter(l => l.origem_lead === origem && l.status_temperatura === 'Morno').length;
            const frios = leads.filter(l => l.origem_lead === origem && l.status_temperatura === 'Frio').length;
            
            return (
              <div 
                key={origem}
                className="backdrop-blur-sm rounded-lg p-2 border hover:scale-[1.02] transition-all duration-300 shadow-lg"
                style={{ 
                  backgroundColor: `${color}15`,
                  borderColor: `${color}40`
                }}
              >
                <div className="flex items-center gap-1 mb-2">
                  <div 
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-text-primary text-xs font-medium truncate">{origem}</span>
                </div>
                
                <div className="flex justify-between items-center text-xs">
                  <div className="flex flex-col items-center">
                    <span className="text-purple-400 font-bold">{stats.quentes}</span>
                    <div className="w-2 h-0.5 bg-purple-500/80 rounded-full mt-0.5"></div>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-gray-400 font-bold">{mornos}</span>
                    <div className="w-2 h-0.5 bg-gray-500/80 rounded-full mt-0.5"></div>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-blue-400 font-bold">{frios}</span>
                    <div className="w-2 h-0.5 bg-blue-500/80 rounded-full mt-0.5"></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Gráfico CanvasJS Donut - MEIO */}
        <div className="flex-1 w-full bg-transparent mb-4">
          <div ref={chartRef} className="w-full h-full" />
        </div>
        
        {/* Total de leads por portal com % - EM BAIXO */}
        <div className="grid grid-cols-3 gap-2">
          {originData.chartDataPoints.slice(0, 3).map((dataPoint) => (
            <div key={dataPoint.label} className="flex flex-col items-center p-2 rounded-lg border hover:scale-[1.02] transition-all duration-300 shadow-md"
              style={{ 
                backgroundColor: `${dataPoint.color}12`,
                borderColor: `${dataPoint.color}30`
              }}>
              <div className="flex items-center gap-1 mb-1">
                <div 
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: dataPoint.color }}
                />
                <span className="text-text-secondary text-xs truncate">{dataPoint.label}</span>
              </div>
              <div className="text-center">
                <span className="text-text-primary text-sm font-bold">{dataPoint.quantidade}</span>
                <span className="text-text-secondary text-xs ml-1">({dataPoint.percentual.toFixed(1)}%)</span>
              </div>
            </div>
          ))}
        </div>
        </CardContent>
      </Card>
  );
};