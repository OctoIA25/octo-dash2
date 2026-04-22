import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target } from 'lucide-react';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface LeadsPerformanceChartProps {
  leads: ProcessedLead[];
}

export const LeadsPerformanceChart = ({ leads }: LeadsPerformanceChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  // Calcular análise completa do funil baseada nas etapas reais
  const funnelAnalysis = useMemo(() => {
    const safeLeads = leads || [];
    const totalLeads = safeLeads.length;

    // Definir as etapas do funil na mesma ordem do EnhancedFunnelChart
    const etapasOrdem = [
      'Em Atendimento',
      'Interação', 
      'Visita Agendada',
      'Visita Realizada',
      'Proposta Enviada',
      'Negociação',
      'Negócio Fechado'
    ];

    // Calcular quantidade para cada etapa (mesmo cálculo do funil)
    const calcularEtapa = (etapa: string): number => {
      switch (etapa) {
        case 'Em Atendimento':
          return safeLeads.filter(l => l.etapa_atual === 'Em Atendimento').length;
        case 'Interação':
          return safeLeads.filter(l => l.etapa_atual === 'Interação').length;
        case 'Visita Agendada':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Visita Agendada' ||
            l.etapa_atual === 'Visita agendada' ||
            (l.Data_visita && l.Data_visita.trim() !== '')
    ).length;
        case 'Visita Realizada':
          return safeLeads.filter(l => 
      l.etapa_atual === 'Visita Realizada' ||
      l.etapa_atual === 'Visita realizada'
    ).length;
        case 'Proposta Enviada':
          return safeLeads.filter(l => l.etapa_atual === 'Proposta Enviada').length;
        case 'Negociação':
          return safeLeads.filter(l => l.etapa_atual === 'Negociação').length;
        case 'Negócio Fechado':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Negócio Fechado' ||
            l.etapa_atual === 'Fechamento' ||
            l.etapa_atual === 'Finalizado' ||
            (l.valor_final_venda && l.valor_final_venda > 0)
          ).length;

        default:
          return 0;
      }
    };

    // Calcular dados para cada etapa
    const etapasData = etapasOrdem.map((etapa, index) => {
      const quantidade = calcularEtapa(etapa);
      const percentualTotal = totalLeads > 0 ? (quantidade / totalLeads) * 100 : 0;
      
      return { etapa, quantidade, percentualTotal, index };
    });

    // Calcular taxas de conversão entre etapas consecutivas
    const taxasConversao = etapasData.map((etapa, index) => {
      if (index === 0) return { from: '', to: etapa.etapa, taxa: 100 };
      
      const etapaAnterior = etapasData[index - 1];
      const taxa = etapaAnterior.quantidade > 0 ? 
        (etapa.quantidade / etapaAnterior.quantidade) * 100 : 0;
      
      return { 
        from: etapaAnterior.etapa, 
        to: etapa.etapa, 
        taxa,
        perdas: etapaAnterior.quantidade - etapa.quantidade
      };
    });

    // Identificar os maiores gargalos (maiores perdas entre etapas)
    const gargalos = taxasConversao
      .slice(1) // Pular a primeira (100%)
      .sort((a, b) => a.taxa - b.taxa)
      .slice(0, 3); // Top 3 piores conversões

    // Calcular valor total do pipeline por etapa
    const valorPorEtapa = etapasData.map(etapa => {
      const leadsEtapa = safeLeads.filter(l => {
        switch (etapa.etapa) {
          case 'Em Atendimento':
            return l.etapa_atual === 'Em Atendimento';
          case 'Interação':
            return l.etapa_atual === 'Interação';
          case 'Visita Agendada':
            return l.etapa_atual === 'Visita Agendada' || 
                   l.etapa_atual === 'Visita agendada' ||
                   (l.Data_visita && l.Data_visita.trim() !== '');
          case 'Visita Realizada':
            return l.etapa_atual === 'Visita Realizada' || 
                   l.etapa_atual === 'Visita realizada';
          case 'Proposta Enviada':
            return l.etapa_atual === 'Proposta Enviada';
          case 'Negociação':
            return l.etapa_atual === 'Negociação';
          case 'Negócio Fechado':
            return l.etapa_atual === 'Negócio Fechado' ||
                   l.etapa_atual === 'Fechamento' ||
                   l.etapa_atual === 'Finalizado' ||
                   (l.valor_final_venda && l.valor_final_venda > 0);
          default:
            return false;
        }
      });
      
      const valorTotal = leadsEtapa.reduce((sum, lead) => sum + (lead.valor_imovel || 0), 0);
      const valorMedio = leadsEtapa.length > 0 ? valorTotal / leadsEtapa.length : 0;
      
      return { ...etapa, valorTotal, valorMedio };
    });

    // Métricas de performance do funil
    const emAtendimento = etapasData[0].quantidade;
    const visitasAgendadas = etapasData[2].quantidade;
    // Usar ÚLTIMA ETAPA dinamicamente ao invés de índice fixo
    const ultimaEtapaIndex = etapasData.length - 1;
    const ultimaEtapaData = etapasData[ultimaEtapaIndex];
    const leadsUltimaEtapa = ultimaEtapaData.quantidade;
    const nomeUltimaEtapa = ultimaEtapaData.etapa;
    
    const taxaAgendamento = emAtendimento > 0 ? (visitasAgendadas / emAtendimento) * 100 : 0;
    const taxaFechamento = totalLeads > 0 ? (leadsUltimaEtapa / totalLeads) * 100 : 0;
    const taxaVisitaFechamento = visitasAgendadas > 0 ? (leadsUltimaEtapa / visitasAgendadas) * 100 : 0;

    // Valor total do pipeline
    const valorTotalPipeline = safeLeads.reduce((sum, lead) => sum + (lead.valor_imovel || 0), 0);
    const valorMedioLead = totalLeads > 0 ? valorTotalPipeline / totalLeads : 0;
    const valorFechado = valorPorEtapa[ultimaEtapaIndex].valorTotal;

    return {
      totalLeads,
      etapasData,
      taxasConversao,
      gargalos,
      valorPorEtapa,
      metricas: {
        taxaAgendamento,
        taxaFechamento,
        taxaVisitaFechamento,
        valorTotalPipeline,
        valorMedioLead,
        valorFechado,
        emAtendimento,
        visitasAgendadas,
        leadsUltimaEtapa,
        nomeUltimaEtapa
      }
    };
  }, [leads]);

  // Carregar CanvasJS e criar gráfico de análise do funil
  useEffect(() => {
    if (!chartRef.current) return;

    const loadCanvasJS = () => {
      if (window.CanvasJS) {
        createChart();
      } else {
        const script = document.createElement('script');
        script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
        script.onload = createChart;
        document.head.appendChild(script);
      }
    };

    const createChart = () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      try {
        // Preparar dados para o gráfico - usando as etapas reais do funil
        const etapasLabels = [
          'Em Atendimento',
          'Interação',
          'Visita Agendada',
          'Visita Realizada',
          'Proposta Enviada',
          'Negociação',
          'Negócio Fechado'
        ];

        // Criar dataPoints com as métricas reais do funil
        const dataPoints = funnelAnalysis.etapasData.map((etapa, index) => {
          // Calcular a taxa de conversão acumulada até esta etapa
          let taxaAcumulada = 100;
          if (index > 0) {
            const etapasAnteriores = funnelAnalysis.etapasData.slice(0, index);
            const leadsAnteriores = etapasAnteriores.reduce((sum, e) => sum + e.quantidade, 0);
            if (leadsAnteriores > 0) {
              taxaAcumulada = (etapa.quantidade / leadsAnteriores) * 100;
            } else {
              taxaAcumulada = 0;
            }
          }

          // Cor baseada na etapa (mesmo padrão do funil)
          const cores = ['#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#f97316', '#16a34a'];
          const cor = cores[index] || '#6b7280';

          return {
            label: etapa.etapa,
            y: taxaAcumulada,
            quantidade: etapa.quantidade,
            percentualTotal: etapa.percentualTotal,
            color: cor,
            markerColor: cor,
            lineColor: cor
          };
        });

        const chart = new window.CanvasJS.Chart(chartRef.current, {
          animationEnabled: true,
          animationDuration: 1000,
          backgroundColor: "transparent",
          creditHref: null,
          creditText: "",

          axisX: {
            gridColor: "transparent",
            lineColor: "transparent",
            tickColor: "transparent",
            labelFontColor: "#6B7280",
            labelFontSize: 9,
            labelFontWeight: "500",
            labels: etapasLabels.map(etapa => etapa.split(' ').slice(0, 2).join(' ')),
            interval: 1
          },

          axisY: {
            gridColor: "transparent",
            lineColor: "transparent",
            tickColor: "transparent",
            labelFontColor: "#6B7280",
            labelFontSize: 9,
            labelFontWeight: "500",
            minimum: 0,
            maximum: 100,
            suffix: "%",
            interval: 20
          },

          toolTip: {
            backgroundColor: "#1F2937",
            borderColor: "#374151",
            fontColor: "#F9FAFB",
            fontSize: 10,
            contentFormatter: function(e: any) {
              const dataPoint = e.entries[0].dataPoint;
              return `${dataPoint.label}: ${dataPoint.y.toFixed(1)}%`;
            }
          },

          data: [{
            type: "line",
            lineThickness: 2,
            markerSize: 6,
            dataPoints: dataPoints
          }]
        });

        chart.render();
        chartInstance.current = chart;

      } catch (error) {
        console.error('❌ Erro ao criar gráfico de análise do funil:', error);
      }
    };

    loadCanvasJS();

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [funnelAnalysis]);

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full overflow-hidden">
      <CardHeader className="pb-1">
        <CardTitle className="text-text-primary text-lg neon-text-subtle flex items-center gap-2">
          <Target className="h-5 w-5 text-text-primary glow-accent-purple" />
          <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent font-bold">
            Performance de Conversão
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
        {/* Métricas Principais - Grandes e Visíveis */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-4 bg-neutral-800/50 rounded-lg border border-gray-600/30">
            <div className="text-3xl font-bold text-green-400 mb-1">
              {funnelAnalysis.metricas.taxaFechamento.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-400">Taxa de Conversão</div>
            <div className="text-xs text-green-300 mt-1">
              {funnelAnalysis.metricas.leadsUltimaEtapa} {funnelAnalysis.metricas.nomeUltimaEtapa}
            </div>
          </div>

          <div className="text-center p-4 bg-neutral-800/50 rounded-lg border border-gray-600/30">
            <div className="text-3xl font-bold text-blue-400 mb-1">
              {funnelAnalysis.totalLeads}
            </div>
            <div className="text-sm text-gray-400">Total de Leads</div>
            <div className="text-xs text-blue-300 mt-1">
              No sistema
            </div>
          </div>
        </div>

        {/* Taxas de Conversão Entre Etapas */}
        <div className="space-y-2">
          <div className="text-sm text-text-secondary font-semibold mb-3">
            Conversão por Etapa
          </div>

          <div className="space-y-2">
            {funnelAnalysis.taxasConversao.slice(1).map((conversao, index) => {
              const cores = ['#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#f97316', '#16a34a'];
              const cor = cores[index] || '#6b7280';

              return (
                <div key={index} className="flex items-center justify-between p-2 bg-neutral-800/30 rounded border border-gray-600/20">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: cor }}
                    ></div>
                    <span className="text-sm font-medium text-text-primary">
                      {conversao.from} → {conversao.to}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white">
                      {conversao.taxa.toFixed(1)}%
                    </span>
                    <span className="text-xs text-text-secondary">
                      (-{conversao.perdas})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gráfico Simples de Área */}
        <div className="flex-1 min-h-[100px]">
          <div className="text-xs text-text-secondary mb-2">Evolução das Taxas</div>
          <div ref={chartRef} className="w-full h-full" />
        </div>

        {/* Resumo Final - Números Grandes */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-600/30">
          <div className="text-center">
            <p className="text-lg font-bold text-purple-400">
              {funnelAnalysis.metricas.emAtendimento}
            </p>
            <p className="text-xs text-gray-400">Atendimento</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-yellow-400">
              {funnelAnalysis.metricas.visitasAgendadas}
            </p>
            <p className="text-xs text-gray-400">Visitas</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-blue-400">
              {funnelAnalysis.etapasData[3]?.quantidade || 0}
            </p>
            <p className="text-xs text-gray-400">Realizadas</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-green-400">
              {funnelAnalysis.metricas.leadsUltimaEtapa}
            </p>
            <p className="text-xs text-gray-400">{funnelAnalysis.metricas.nomeUltimaEtapa}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};