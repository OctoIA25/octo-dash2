import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { DollarSign, TrendingUp } from 'lucide-react';
import { RANKING_BLUE_GRADIENT } from '@/utils/colors';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface CorretoresPipelineChartProps {
  leads: ProcessedLead[];
}

export const CorretoresPipelineChart = ({ leads }: CorretoresPipelineChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const pipelineData = useMemo(() => {
    if (!leads || leads.length === 0) {
      // Retornar dados vazios em vez de null
      return {
        barData: [],
        corretoresArray: [],
        stats: {
          totalPipeline: 0,
          totalVendas: 0,
          totalLeads: 0,
          ticketMedioGeral: 0,
          eficienciaGeral: 0,
          maxPipeline: 0
        }
      };
    }

    // Agrupar dados por corretor
    const corretorPipeline = leads.reduce((acc, lead) => {
      const corretor = lead.corretor_responsavel?.trim() || 'Não atribuído';
      
      if (!acc[corretor]) {
        acc[corretor] = {
          totalLeads: 0,
          pipelineTotal: 0,
          pipelineQuente: 0,
          pipelineNegociacao: 0,
          pipelineVendido: 0,
          leadsQuentes: 0,
          negociacoes: 0,
          vendas: 0
        };
      }
      
      acc[corretor].totalLeads++;
      
      const valor = lead.valor_imovel || 0;
      acc[corretor].pipelineTotal += valor;
      
      // Pipeline por temperatura/etapa
      if (lead.status_temperatura === 'Quente') {
        acc[corretor].pipelineQuente += valor;
        acc[corretor].leadsQuentes++;
      }
      
      if (lead.etapa_atual === 'Em Negociação' || 
          lead.etapa_atual === 'Negociação' ||
          lead.etapa_atual === 'Proposta Enviada') {
        acc[corretor].pipelineNegociacao += valor;
        acc[corretor].negociacoes++;
      }
      
      if (lead.data_finalizacao && lead.data_finalizacao.trim() !== "") {
        acc[corretor].pipelineVendido += valor;
        acc[corretor].vendas++;
      }
      
      return acc;
    }, {} as Record<string, any>);

    // Converter para array e ordenar por pipeline total
    const corretoresArray = Object.entries(corretorPipeline)
      .map(([nome, data]) => ({
        nome,
        ...data,
        ticketMedio: data.totalLeads > 0 ? data.pipelineTotal / data.totalLeads : 0,
        taxaConversao: data.totalLeads > 0 ? (data.vendas / data.totalLeads) * 100 : 0,
        eficiencia: data.pipelineTotal > 0 ? (data.pipelineVendido / data.pipelineTotal) * 100 : 0
      }))
      .sort((a, b) => b.pipelineTotal - a.pipelineTotal)
      .slice(0, 8);

    // Preparar dados para gráfico de barras horizontais (pipeline por corretor)
    const barData = corretoresArray.slice(0, 8).map((corretor, index) => ({
      label: corretor.nome.length > 15 ? corretor.nome.substring(0, 15) + '...' : corretor.nome,
      y: corretor.pipelineTotal / 1000000, // Converter para milhões
      color: RANKING_BLUE_GRADIENT[index % RANKING_BLUE_GRADIENT.length],
      corretor: corretor.nome,
      pipelineTotal: corretor.pipelineTotal,
      pipelineQuente: corretor.pipelineQuente,
      pipelineNegociacao: corretor.pipelineNegociacao,
      pipelineVendido: corretor.pipelineVendido,
      totalLeads: corretor.totalLeads,
      vendas: corretor.vendas,
      ticketMedio: corretor.ticketMedio,
      taxaConversao: corretor.taxaConversao,
      eficiencia: corretor.eficiencia
    })).sort((a, b) => b.y - a.y); // Ordenar por valor decrescente

    // Calcular totais
    const totalPipeline = corretoresArray.reduce((sum, c) => sum + c.pipelineTotal, 0);
    const totalVendas = corretoresArray.reduce((sum, c) => sum + c.pipelineVendido, 0);
    const totalLeads = corretoresArray.reduce((sum, c) => sum + c.totalLeads, 0);

    const result = {
      barData,
      corretoresArray,
      stats: {
        totalPipeline,
        totalVendas,
        totalLeads,
        ticketMedioGeral: totalLeads > 0 ? totalPipeline / totalLeads : 0,
        eficienciaGeral: totalPipeline > 0 ? (totalVendas / totalPipeline) * 100 : 0,
        maxPipeline: Math.max(...barData.map(d => d.y))
      }
    };
    
    
    return result;
  }, [leads]);

  useEffect(() => {
    
    const loadCanvasJS = () => {
      if (window.CanvasJS) {
        setTimeout(initializeChart, 100);
        return;
      }

      // Verificar se já existe um script CanvasJS
      const existingScript = document.querySelector('script[src*="canvasjs"]');
      if (existingScript) {
        let attempts = 0;
        const checkCanvasJS = setInterval(() => {
          attempts++;
          if (window.CanvasJS) {
            clearInterval(checkCanvasJS);
            setTimeout(initializeChart, 100);
          } else if (attempts > 50) { // 5 segundos
            clearInterval(checkCanvasJS);
            console.warn('⚠️ CorretoresPipelineChart - Timeout ao aguardar CanvasJS');
          }
        }, 100);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
      script.onload = () => {
        setTimeout(initializeChart, 100);
      };
      script.onerror = () => {
        console.error('❌ CorretoresPipelineChart - Falha ao carregar CanvasJS');
      };
      document.head.appendChild(script);
    };

    const initializeChart = () => {
      
      if (!chartRef.current || !window.CanvasJS || !pipelineData) {
        return;
      }

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
        height: 240,
        width: null,
        axisY: {
          title: "",
          labelFontColor: "#9ca3af",
          labelFontSize: 12,
          gridColor: "#374151",
          gridThickness: 0.5,
          minimum: 0,
          suffix: "M"
        },
        axisX: {
          title: "",
          labelFontColor: "#9ca3af",
          labelFontSize: 11,
          labelAngle: -25,
          lineColor: "#4b5563",
          tickColor: "#4b5563"
        },
        legend: {
          fontColor: "#ffffff",
          fontSize: 11,
          horizontalAlign: "center",
          verticalAlign: "top"
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
                  ${data.corretor}
                </div>
                <div style="font-size: 12px;">
                  <div><strong>Pipeline Total:</strong> R$ ${data.y.toFixed(2)}M</div>
                  <div><strong>Pipeline Quente:</strong> R$ ${(data.pipelineQuente / 1000000).toFixed(2)}M</div>
                  <div><strong>Pipeline Negociação:</strong> R$ ${(data.pipelineNegociacao / 1000000).toFixed(2)}M</div>
                  <div><strong>Pipeline Vendido:</strong> R$ ${(data.pipelineVendido / 1000000).toFixed(2)}M</div>
                  <div><strong>Total Leads:</strong> ${data.totalLeads}</div>
                  <div><strong>Vendas:</strong> ${data.vendas}</div>
                  <div><strong>Taxa Conversão:</strong> ${data.taxaConversao.toFixed(1)}%</div>
                </div>
              </div>
            `;
          }
        },
        data: [{
          type: "bar",
          name: "Pipeline por Corretor",
          dataPoints: pipelineData.barData
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
  }, [pipelineData]);


  if (!pipelineData || pipelineData.barData.length === 0) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <StandardCardTitle icon={DollarSign}>
            Pipeline de Vendas
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="h-5 w-5 text-orange-400" />
            </div>
            <h4 className="text-lg font-semibold text-text-primary mb-2">Pipeline de Vendas</h4>
            <p className="text-sm text-text-secondary">Carregando dados financeiros...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <StandardCardTitle icon={DollarSign}>
          Pipeline por Corretor
        </StandardCardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-3">
        {/* Métricas superiores compactas */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="text-center p-2">
            <div className="text-lg font-bold text-orange-400">
              R$ {(pipelineData.stats.totalPipeline / 1000000).toFixed(1)}M
            </div>
            <div className="text-xs text-text-secondary">Total</div>
          </div>
          <div className="text-center p-2">
            <div className="text-lg font-bold text-green-400">
              R$ {(pipelineData.stats.totalVendas / 1000000).toFixed(1)}M
            </div>
            <div className="text-xs text-text-secondary">Vendas</div>
          </div>
          <div className="text-center p-2">
            <div className="text-lg font-bold text-cyan-400">
              R$ {(pipelineData.stats.ticketMedioGeral / 1000).toFixed(0)}K
            </div>
            <div className="text-xs text-text-secondary">Ticket</div>
          </div>
          <div className="text-center p-2">
            <div className="text-lg font-bold text-purple-400">
              {pipelineData.stats.eficienciaGeral.toFixed(1)}%
            </div>
            <div className="text-xs text-text-secondary">Eficiência</div>
          </div>
        </div>

        {/* Gráfico */}
        <div className="flex-1 min-h-[320px] flex items-center justify-center">
          <div ref={chartRef} className="w-full h-full min-h-[320px]" />
        </div>
      </CardContent>
    </Card>
  );
};
