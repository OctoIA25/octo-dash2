import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Clock, Users } from 'lucide-react';
import { RANKING_BLUE_GRADIENT } from '@/utils/colors';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface CorretoresActivityChartProps {
  leads: ProcessedLead[];
}

export const CorretoresActivityChart = ({ leads }: CorretoresActivityChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const activityData = useMemo(() => {
    if (!leads || leads.length === 0) {
      // Retornar dados vazios em vez de null
      return {
        radarData: [],
        barData: [],
        corretoresMetrics: [],
        stats: {
          totalAtivos: 0,
          mediaAtividade: 0,
          totalLeads7Dias: 0
        }
      };
    }

    // Calcular atividade por corretor e período
    const today = new Date();
    const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last7Days = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const corretorActivity = leads.reduce((acc, lead) => {
      const corretor = lead.corretor_responsavel?.trim() || 'Não atribuído';
      const leadDate = new Date(lead.data_entrada);
      
      if (!acc[corretor]) {
        acc[corretor] = {
          totalLeads: 0,
          leads7Dias: 0,
          leads30Dias: 0,
          ativosRecentes: 0,
          visitasAgendadas: 0,
          negociacoes: 0,
          conversas: 0,
          tempoMedioResposta: 0,
          leadsPorSemana: 0,
          intensidadeAtividade: 0
        };
      }
      
      acc[corretor].totalLeads++;
      
      // Contar por período
      if (leadDate >= last7Days) {
        acc[corretor].leads7Dias++;
      }
      if (leadDate >= last30Days) {
        acc[corretor].leads30Dias++;
      }
      
      // Atividade recente (leads com interação nos últimos 7 dias)
      if (leadDate >= last7Days && 
          (lead.etapa_atual !== 'Em Atendimento' && lead.etapa_atual !== '')) {
        acc[corretor].ativosRecentes++;
      }
      
      // Contabilizar atividades
      if ((lead.Data_visita && lead.Data_visita.trim() !== "") || 
          lead.etapa_atual === 'Visita Agendada') {
        acc[corretor].visitasAgendadas++;
      }
      
      if (lead.etapa_atual === 'Em Negociação' || 
          lead.etapa_atual === 'Negociação' ||
          lead.etapa_atual === 'Proposta Enviada') {
        acc[corretor].negociacoes++;
      }
      
      if (lead.Conversa && lead.Conversa.trim() !== '') {
        acc[corretor].conversas++;
      }
      
      return acc;
    }, {} as Record<string, any>);

    // Calcular métricas derivadas
    const corretoresMetrics = Object.entries(corretorActivity).map(([nome, data]) => {
      const leadsPorSemana = data.leads30Dias / 4; // Média semanal baseada em 30 dias
      const taxaAtividade = data.totalLeads > 0 ? (data.ativosRecentes / data.totalLeads) * 100 : 0;
      const taxaEngajamento = data.totalLeads > 0 ? (data.conversas / data.totalLeads) * 100 : 0;
      const taxaConversao = data.totalLeads > 0 ? (data.visitasAgendadas / data.totalLeads) * 100 : 0;
      
      // Score de atividade composto (0-100)
      const scoreAtividade = Math.min(100, (
        (leadsPorSemana * 10) + // Até 10 pontos por lead/semana (max 10 leads = 100 pontos)
        (taxaAtividade * 0.3) + // 30% da taxa de atividade
        (taxaEngajamento * 0.2) + // 20% da taxa de engajamento
        (taxaConversao * 0.3) // 30% da taxa de conversão
      ));
      
      return {
        nome,
        ...data,
        leadsPorSemana,
        taxaAtividade,
        taxaEngajamento,
        taxaConversao,
        scoreAtividade
      };
    })
    .filter(corretor => corretor.totalLeads >= 2) // Mínimo 2 leads
    .sort((a, b) => b.scoreAtividade - a.scoreAtividade);

    // Preparar dados para gráfico de radar/polar
    const radarData = corretoresMetrics.slice(0, 6).map((corretor, index) => {
      return {
        type: 'line',
        name: corretor.nome.length > 15 ? corretor.nome.substring(0, 15) + '...' : corretor.nome,
        color: RANKING_BLUE_GRADIENT[index % RANKING_BLUE_GRADIENT.length],
        lineThickness: 3,
        markerSize: 8,
        dataPoints: [
          { label: 'Leads/Semana', y: Math.min(100, corretor.leadsPorSemana * 10) },
          { label: 'Taxa Atividade', y: corretor.taxaAtividade },
          { label: 'Engajamento', y: corretor.taxaEngajamento },
          { label: 'Conversão', y: corretor.taxaConversao },
          { label: 'Leads 7 dias', y: Math.min(100, corretor.leads7Dias * 10) }
        ]
      };
    });

    // Preparar dados para gráfico de barras de atividade
    const barData = corretoresMetrics.slice(0, 8).map((corretor, index) => {
      return {
        label: corretor.nome.length > 12 ? corretor.nome.substring(0, 12) + '...' : corretor.nome,
        y: corretor.scoreAtividade,
        color: RANKING_BLUE_GRADIENT[index % RANKING_BLUE_GRADIENT.length],
        leads7Dias: corretor.leads7Dias,
        leads30Dias: corretor.leads30Dias,
        ativosRecentes: corretor.ativosRecentes,
        visitasAgendadas: corretor.visitasAgendadas,
        conversas: corretor.conversas,
        leadsPorSemana: corretor.leadsPorSemana
      };
    });

    return {
      radarData,
      barData,
      corretoresMetrics,
      stats: {
        totalAtivos: corretoresMetrics.filter(c => c.leads7Dias > 0).length,
        mediaAtividade: corretoresMetrics.reduce((sum, c) => sum + c.scoreAtividade, 0) / corretoresMetrics.length,
        totalLeads7Dias: corretoresMetrics.reduce((sum, c) => sum + c.leads7Dias, 0)
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
      if (!chartRef.current || !window.CanvasJS || !activityData) return;

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
          labelFontColor: "#9ca3af",
          labelFontSize: 11,
          labelAngle: -25,
          lineColor: "#4b5563",
          tickColor: "#4b5563"
        },
        toolTip: {
          backgroundColor: "rgba(17, 24, 39, 0.98)",
          fontColor: "#ffffff",
          borderColor: "#6b7280",
          cornerRadius: 8,
          contentFormatter: function (e: any) {
            const data = e.entries[0].dataPoint;
            
            return `
              <div style="padding: 12px; font-family: Inter, sans-serif;">
                <div style="font-weight: 700; font-size: 14px; color: ${data.color}; margin-bottom: 8px;">
                  📊 ${data.label}
                </div>
                <div style="font-size: 12px;">
                  <div><strong>Score Atividade:</strong> ${data.y.toFixed(1)}%</div>
                  <div><strong>Leads 7 dias:</strong> ${data.leads7Dias}</div>
                  <div><strong>Leads 30 dias:</strong> ${data.leads30Dias}</div>
                  <div><strong>Leads/semana:</strong> ${data.leadsPorSemana.toFixed(1)}</div>
                  <div><strong>Ativos Recentes:</strong> ${data.ativosRecentes}</div>
                  <div><strong>Visitas Agendadas:</strong> ${data.visitasAgendadas}</div>
                  <div><strong>Conversas:</strong> ${data.conversas}</div>
                </div>
              </div>
            `;
          }
        },
        data: [{
          type: "column",
          name: "Score de Atividade",
          dataPoints: activityData.barData
        }],
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
  }, [activityData]);

  // Sempre mostrar o gráfico, mesmo com dados vazios
  if (!activityData || activityData.barData.length === 0) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <StandardCardTitle icon={Activity}>
            Atividade dos Corretores
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Activity className="h-5 w-5 text-blue-400" />
            </div>
            <h4 className="text-lg font-semibold text-text-primary mb-2">Atividade dos Corretores</h4>
            <p className="text-sm text-text-secondary">Analisando padrões de atividade...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <StandardCardTitle icon={Activity}>
          Atividade dos Corretores
        </StandardCardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-3">
        {/* Stats superiores compactos */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-2">
            <div className="text-lg font-bold text-blue-400">
              {activityData.stats.totalAtivos}
            </div>
            <div className="text-xs text-text-secondary">Ativos</div>
          </div>
          <div className="text-center p-2">
            <div className="text-lg font-bold text-green-400">
              {activityData.stats.mediaAtividade.toFixed(1)}%
            </div>
            <div className="text-xs text-text-secondary">Média</div>
          </div>
          <div className="text-center p-2">
            <div className="text-lg font-bold text-purple-400">
              {activityData.stats.totalLeads7Dias}
            </div>
            <div className="text-xs text-text-secondary">7 dias</div>
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



