import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target, Award, Zap } from 'lucide-react';
import { RANKING_BLUE_GRADIENT } from '@/utils/colors';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface CorretoresEfficiencyChartProps {
  leads: ProcessedLead[];
}

export const CorretoresEfficiencyChart = ({ leads }: CorretoresEfficiencyChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const efficiencyData = useMemo(() => {
    if (!leads || leads.length === 0) {
      // Retornar dados vazios em vez de null
      return {
        radarData: [],
        corretoresMetrics: [],
        stats: {
          melhorScore: 0,
          medianaScore: 0,
          totalCorretores: 0
        }
      };
    }

    // Calcular métricas de eficiência por corretor
    const corretorEfficiency = leads.reduce((acc, lead) => {
      const corretor = lead.corretor_responsavel?.trim() || 'Não atribuído';
      
      if (!acc[corretor]) {
        acc[corretor] = {
          totalLeads: 0,
          visitasAgendadas: 0,
          negociacoes: 0,
          fechamentos: 0,
          leadsQuentes: 0,
          tempoMedioResposta: 0,
          valorMedio: 0,
          valorTotal: 0,
          leadsMornos: 0,
          leadsFrios: 0
        };
      }
      
      acc[corretor].totalLeads++;
      acc[corretor].valorTotal += lead.valor_imovel || 0;
      
      // Contar por temperatura
      if (lead.status_temperatura === 'Quente') {
        acc[corretor].leadsQuentes++;
      } else if (lead.status_temperatura === 'Morno') {
        acc[corretor].leadsMornos++;
      } else if (lead.status_temperatura === 'Frio') {
        acc[corretor].leadsFrios++;
      }
      
      // Contar visitas
      if ((lead.Data_visita && lead.Data_visita.trim() !== "") || 
          lead.etapa_atual === 'Visita Agendada') {
        acc[corretor].visitasAgendadas++;
      }
      
      // Contar negociações
      if (lead.etapa_atual === 'Em Negociação' || 
          lead.etapa_atual === 'Negociação' ||
          lead.etapa_atual === 'Proposta Enviada') {
        acc[corretor].negociacoes++;
      }
      
      // Contar fechamentos
      if (lead.data_finalizacao && lead.data_finalizacao.trim() !== "") {
        acc[corretor].fechamentos++;
      }
      
      return acc;
    }, {} as Record<string, any>);

    // Calcular métricas derivadas
    const corretoresMetrics = Object.entries(corretorEfficiency).map(([nome, data]) => {
      const taxaConversaoVisita = data.totalLeads > 0 ? (data.visitasAgendadas / data.totalLeads) * 100 : 0;
      const taxaConversaoNegociacao = data.visitasAgendadas > 0 ? (data.negociacoes / data.visitasAgendadas) * 100 : 0;
      const taxaFechamento = data.negociacoes > 0 ? (data.fechamentos / data.negociacoes) * 100 : 0;
      const taxaAquecimento = data.totalLeads > 0 ? (data.leadsQuentes / data.totalLeads) * 100 : 0;
      const valorMedio = data.totalLeads > 0 ? data.valorTotal / data.totalLeads : 0;
      
      // Score de eficiência composto (0-100)
      const scoreEficiencia = (
        (taxaConversaoVisita * 0.25) +
        (taxaConversaoNegociacao * 0.25) +
        (taxaFechamento * 0.30) +
        (taxaAquecimento * 0.20)
      );
      
      return {
        nome,
        ...data,
        taxaConversaoVisita,
        taxaConversaoNegociacao,
        taxaFechamento,
        taxaAquecimento,
        valorMedio,
        scoreEficiencia
      };
    })
    .filter(corretor => corretor.totalLeads >= 3) // Mínimo 3 leads para análise
    .sort((a, b) => b.scoreEficiencia - a.scoreEficiencia)
    .slice(0, 10);

    // Cores para classificação
    const getClassificacao = (score: number) => {
      if (score >= 80) return { classe: 'Excelente', cor: '#10b981', emoji: '🌟' };
      if (score >= 65) return { classe: 'Muito Bom', cor: '#22d3ee', emoji: '⭐' };
      if (score >= 50) return { classe: 'Bom', cor: '#8b5cf6', emoji: '👍' };
      if (score >= 35) return { classe: 'Regular', cor: '#385f92', emoji: '⚠️' }; // Azul médio
      return { classe: 'Baixo', cor: '#4a7ab0', emoji: '📈' }; // Azul Médio Escuro (baixo desempenho = mais claro)
    };

    // Preparar dados para gráfico de radar (múltiplas métricas por corretor)
    const radarData = corretoresMetrics.slice(0, 4).map((corretor, index) => {
      const classificacao = getClassificacao(corretor.scoreEficiencia);
      
      return {
        type: 'line',
        name: corretor.nome.length > 12 ? corretor.nome.substring(0, 12) + '...' : corretor.nome,
        color: RANKING_BLUE_GRADIENT[index % RANKING_BLUE_GRADIENT.length],
        lineThickness: 3,
        markerSize: 8,
        markerType: 'circle',
        dataPoints: [
          { 
            label: 'Conversão', 
            y: Math.min(100, corretor.taxaConversaoVisita),
            fullName: 'Taxa Conversão Visita',
            value: corretor.taxaConversaoVisita
          },
          { 
            label: 'Negociação', 
            y: Math.min(100, corretor.taxaConversaoNegociacao),
            fullName: 'Taxa Conversão Negociação',
            value: corretor.taxaConversaoNegociacao
          },
          { 
            label: 'Fechamento', 
            y: Math.min(100, corretor.taxaFechamento),
            fullName: 'Taxa Fechamento',
            value: corretor.taxaFechamento
          },
          { 
            label: 'Aquecimento', 
            y: Math.min(100, corretor.taxaAquecimento),
            fullName: 'Taxa Aquecimento',
            value: corretor.taxaAquecimento
          },
          { 
            label: 'Eficiência', 
            y: Math.min(100, corretor.scoreEficiencia),
            fullName: 'Score de Eficiência',
            value: corretor.scoreEficiencia
          }
        ],
        corretor: corretor,
        classificacao: classificacao
      };
    });

    return {
      radarData,
      corretoresMetrics,
      stats: {
        melhorScore: corretoresMetrics[0]?.scoreEficiencia || 0,
        medianaScore: corretoresMetrics[Math.floor(corretoresMetrics.length / 2)]?.scoreEficiencia || 0,
        totalCorretores: corretoresMetrics.length
      }
    };
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
      if (!chartRef.current || !window.CanvasJS || !efficiencyData) return;

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
        height: 380,
        width: null,
        axisY: {
          title: "",
          labelFontColor: "#9ca3af",
          labelFontSize: 12,
          gridColor: "#374151",
          gridThickness: 0.5,
          minimum: 0,
          maximum: 100,
          suffix: "%"
        },
        axisX: {
          title: "",
          labelFontColor: "#e5e7eb",
          labelFontSize: 12,
          labelFontWeight: "600",
          lineColor: "#4b5563",
          tickColor: "#4b5563"
        },
        toolTip: {
          backgroundColor: "rgba(17, 24, 39, 0.98)",
          fontColor: "#ffffff",
          borderColor: "#6b7280",
          cornerRadius: 8,
          contentFormatter: function (e: any) {
            const entry = e.entries[0];
            const data = entry.dataPoint;
            const seriesName = entry.dataSeries.name;
            const seriesColor = entry.dataSeries.color;
            
            return `
              <div style="padding: 12px; font-family: Inter, sans-serif;">
                <div style="font-weight: 700; font-size: 14px; color: ${seriesColor}; margin-bottom: 8px;">
                  📊 ${seriesName}
                </div>
                <div style="font-size: 12px;">
                  <div><strong>${data.fullName}:</strong> ${data.value.toFixed(1)}%</div>
                  <div style="margin-top: 4px; color: #9ca3af;">
                    Métrica: ${data.label}
                  </div>
                </div>
              </div>
            `;
          }
        },
        data: efficiencyData.radarData,
        animationEnabled: true,
        animationDuration: 1200
      });

      chart.render();
      chartInstance.current = chart;

      // Remover marcas d'água
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
  }, [efficiencyData]);

  // Sempre mostrar o gráfico, mesmo com dados vazios
  if (!efficiencyData || efficiencyData.radarData.length === 0) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <CardTitle className="text-text-primary text-lg neon-text flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full glow-accent-green"></div>
            Análise de Eficiência
            <Target className="h-5 w-5 text-green-400 ml-2" />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Target className="h-5 w-5 text-green-400" />
            </div>
            <h4 className="text-lg font-semibold text-text-primary mb-2">Análise de Eficiência</h4>
            <p className="text-sm text-text-secondary">Calculando métricas de performance...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <StandardCardTitle icon={Target}>
          Radar de Performance
        </StandardCardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-3">
        {/* Stats superiores compactos */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-2">
            <div className="text-lg font-bold text-green-400">
              {efficiencyData.stats.melhorScore.toFixed(1)}%
            </div>
            <div className="text-xs text-text-secondary">Melhor</div>
          </div>
          <div className="text-center p-2">
            <div className="text-lg font-bold text-cyan-400">
              {efficiencyData.stats.medianaScore.toFixed(1)}%
            </div>
            <div className="text-xs text-text-secondary">Média</div>
          </div>
          <div className="text-center p-2">
            <div className="text-lg font-bold text-purple-400">
              {efficiencyData.stats.totalCorretores}
            </div>
            <div className="text-xs text-text-secondary">Total</div>
          </div>
        </div>

        {/* Gráfico */}
        <div className="flex-1 min-h-[420px] flex items-center justify-center">
          <div ref={chartRef} className="w-full h-full min-h-[420px]" />
        </div>
      </CardContent>
    </Card>
  );
};



