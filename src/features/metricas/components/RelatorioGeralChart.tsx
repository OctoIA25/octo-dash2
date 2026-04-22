import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Calendar, TrendingUp, Target } from 'lucide-react';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface RelatorioGeralChartProps {
  leads: ProcessedLead[];
}

// Funções auxiliares movidas para fora do componente
const formatarMes = (mesAno: string): string => {
  const [ano, mes] = mesAno.split('-');
  const meses = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];
  return `${meses[parseInt(mes) - 1]}/${ano.slice(-2)}`;
};

const calcularCrescimento = (atual: number, anterior: number): number => {
  if (anterior === 0) return atual > 0 ? 100 : 0;
  return ((atual - anterior) / anterior) * 100;
};

export const RelatorioGeralChart = ({ leads }: RelatorioGeralChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  // Calcular dados mensais e tendências
  const relatorioData = useMemo(() => {
    if (!leads || leads.length === 0) {
      return null;
    }

    // Agrupar leads por mês
    const leadsPorMes = leads.reduce((acc, lead) => {
      const data = new Date(lead.data_entrada);
      const mesAno = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      
      if (!acc[mesAno]) {
        acc[mesAno] = {
          totalLeads: 0,
          visitasAgendadas: 0,
          negociacoes: 0,
          vendas: 0,
          valorTotal: 0,
          leadsQuentes: 0,
          leadsMornos: 0,
          leadsFrios: 0
        };
      }
      
      const stats = acc[mesAno];
      stats.totalLeads++;
      
      // Visitas agendadas
      if ((lead.Data_visita && lead.Data_visita.trim() !== "") || 
          lead.etapa_atual === 'Visita Agendada') {
        stats.visitasAgendadas++;
      }
      
      // Negociações
      if (lead.etapa_atual === 'Em Negociação' || 
          lead.etapa_atual === 'Negociação' ||
          lead.etapa_atual === 'Proposta Enviada') {
        stats.negociacoes++;
      }
      
      // Vendas
      if (lead.data_finalizacao && lead.data_finalizacao.trim() !== "") {
        stats.vendas++;
      }
      
      // Valor total
      if (lead.valor_imovel && lead.valor_imovel > 0) {
        stats.valorTotal += lead.valor_imovel;
      }
      
      // Temperatura
      switch (lead.status_temperatura) {
        case 'Quente':
          stats.leadsQuentes++;
          break;
        case 'Morno':
          stats.leadsMornos++;
          break;
        case 'Frio':
          stats.leadsFrios++;
          break;
      }
      
      return acc;
    }, {} as Record<string, any>);

    // Converter para array ordenado por data
    const mesesOrdenados = Object.entries(leadsPorMes)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12); // Últimos 12 meses

    // Preparar dados para gráfico de linhas múltiplas
    const chartDataPoints = {
      totalLeads: mesesOrdenados.map(([mes, stats]: [string, any]) => ({
        x: new Date(mes + '-01'),
        y: stats.totalLeads,
        label: formatarMes(mes)
      })),
      visitasAgendadas: mesesOrdenados.map(([mes, stats]: [string, any]) => ({
        x: new Date(mes + '-01'),
        y: stats.visitasAgendadas,
        label: formatarMes(mes)
      })),
      negociacoes: mesesOrdenados.map(([mes, stats]: [string, any]) => ({
        x: new Date(mes + '-01'),
        y: stats.negociacoes,
        label: formatarMes(mes)
      })),
      vendas: mesesOrdenados.map(([mes, stats]: [string, any]) => ({
        x: new Date(mes + '-01'),
        y: stats.vendas,
        label: formatarMes(mes)
      }))
    };

    // Calcular métricas gerais
    const mesAtual = new Date().toISOString().slice(0, 7);
    const mesAnterior = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
    
    const statsMesAtual = leadsPorMes[mesAtual] || {};
    const statsMesAnterior = leadsPorMes[mesAnterior] || {};

    // Calcular crescimento mensal
    const crescimentoLeads = calcularCrescimento(statsMesAtual.totalLeads || 0, statsMesAnterior.totalLeads || 0);
    const crescimentoVisitas = calcularCrescimento(statsMesAtual.visitasAgendadas || 0, statsMesAnterior.visitasAgendadas || 0);
    const crescimentoNegociacoes = calcularCrescimento(statsMesAtual.negociacoes || 0, statsMesAnterior.negociacoes || 0);
    const crescimentoVendas = calcularCrescimento(statsMesAtual.vendas || 0, statsMesAnterior.vendas || 0);

    // Métricas de performance geral
    const totalLeadsAcumulado = leads.length;
    const totalVisitasAcumulado = leads.filter(l => 
      (l.Data_visita && l.Data_visita.trim() !== "") || l.etapa_atual === 'Visita Agendada'
    ).length;
    const totalNegociacoesAcumulado = leads.filter(l => 
      l.etapa_atual === 'Em Negociação' || l.etapa_atual === 'Negociação' || l.etapa_atual === 'Proposta Enviada'
    ).length;
    const totalVendasAcumulado = leads.filter(l => 
      l.data_finalizacao && l.data_finalizacao.trim() !== ""
    ).length;
    const valorTotalAcumulado = leads.reduce((sum, l) => sum + (l.valor_imovel || 0), 0);

    // Calcular taxas de conversão
    const taxaVisita = totalLeadsAcumulado > 0 ? (totalVisitasAcumulado / totalLeadsAcumulado * 100) : 0;
    const taxaNegociacao = totalVisitasAcumulado > 0 ? (totalNegociacoesAcumulado / totalVisitasAcumulado * 100) : 0;
    const taxaVenda = totalNegociacoesAcumulado > 0 ? (totalVendasAcumulado / totalNegociacoesAcumulado * 100) : 0;
    const taxaConversaoGeral = totalLeadsAcumulado > 0 ? (totalVendasAcumulado / totalLeadsAcumulado * 100) : 0;

    return {
      chartDataPoints,
      mesesData: mesesOrdenados,
      crescimento: {
        leads: crescimentoLeads,
        visitas: crescimentoVisitas,
        negociacoes: crescimentoNegociacoes,
        vendas: crescimentoVendas
      },
      metricas: {
        totalLeadsAcumulado,
        totalVisitasAcumulado,
        totalNegociacoesAcumulado,
        totalVendasAcumulado,
        valorTotalAcumulado,
        taxaVisita,
        taxaNegociacao,
        taxaVenda,
        taxaConversaoGeral
      },
      mesAtual: statsMesAtual,
      mesAnterior: statsMesAnterior
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
      if (!chartRef.current || !window.CanvasJS || !relatorioData) return;

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
          labelFontColor: "#9ca3af",
          gridColor: "#374151",
          gridThickness: 1
        },
        axisX: {
          labelFontColor: "#9ca3af",
          gridColor: "#374151",
          valueFormatString: "MMM/YY"
        },
        legend: {
          fontColor: "#ffffff",
          fontSize: 12
        },
        toolTip: {
          backgroundColor: "rgba(17, 24, 39, 0.98)",
          fontColor: "#ffffff",
          borderColor: "#6b7280",
          cornerRadius: 8,
          shared: true
        },
        data: [
          {
            type: "line",
            name: "Total Leads",
            color: "#22d3ee",
            lineThickness: 3,
            markerSize: 6,
            dataPoints: relatorioData.chartDataPoints.totalLeads
          },
          {
            type: "line",
            name: "Visitas Agendadas",
            color: "#10b981",
            lineThickness: 3,
            markerSize: 6,
            dataPoints: relatorioData.chartDataPoints.visitasAgendadas
          },
          {
            type: "line",
            name: "Negociações",
            color: "#8b5cf6",
            lineThickness: 3,
            markerSize: 6,
            dataPoints: relatorioData.chartDataPoints.negociacoes
          },
          {
            type: "line",
            name: "Vendas",
            color: "#ef4444",
            lineThickness: 3,
            markerSize: 6,
            dataPoints: relatorioData.chartDataPoints.vendas
          }
        ],
        height: 680,
        animationEnabled: true,
        animationDuration: 1000
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
  }, [relatorioData]);

  if (!relatorioData || !leads || leads.length === 0) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <CardTitle className="text-text-primary text-lg neon-text flex items-center gap-2">
            <div className="w-2 h-2 bg-orange-400 rounded-full glow-accent-orange"></div>
            Relatório Geral de Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="h-5 w-5 text-orange-400" />
            </div>
            <h4 className="text-lg font-semibold text-text-primary mb-2">Relatório Geral de Performance</h4>
            <p className="text-sm">Aguardando dados para análise temporal</p>
            <div className="mt-4">
              <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-text-primary text-lg neon-text flex items-center gap-2">
          <div className="w-2 h-2 bg-orange-400 rounded-full glow-accent-orange"></div>
          Relatório Geral de Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-4">
        {/* Métricas acumuladas */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-cyan-400">
              {relatorioData.metricas.totalLeadsAcumulado}
            </div>
            <div className="text-xs text-text-secondary">Total Leads</div>
            <div className={`text-xs ${relatorioData.crescimento.leads >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {relatorioData.crescimento.leads >= 0 ? '↗' : '↘'} {Math.abs(relatorioData.crescimento.leads).toFixed(1)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">
              {relatorioData.metricas.totalVisitasAcumulado}
            </div>
            <div className="text-xs text-text-secondary">Visitas</div>
            <div className={`text-xs ${relatorioData.crescimento.visitas >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {relatorioData.crescimento.visitas >= 0 ? '↗' : '↘'} {Math.abs(relatorioData.crescimento.visitas).toFixed(1)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400">
              {relatorioData.metricas.totalNegociacoesAcumulado}
            </div>
            <div className="text-xs text-text-secondary">Negociações</div>
            <div className={`text-xs ${relatorioData.crescimento.negociacoes >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {relatorioData.crescimento.negociacoes >= 0 ? '↗' : '↘'} {Math.abs(relatorioData.crescimento.negociacoes).toFixed(1)}%
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">
              {relatorioData.metricas.totalVendasAcumulado}
            </div>
            <div className="text-xs text-text-secondary">Vendas</div>
            <div className={`text-xs ${relatorioData.crescimento.vendas >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {relatorioData.crescimento.vendas >= 0 ? '↗' : '↘'} {Math.abs(relatorioData.crescimento.vendas).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Taxas de conversão */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="p-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-lg border border-cyan-500/30">
            <div className="text-center">
              <div className="text-lg font-bold text-cyan-400">
                {relatorioData.metricas.taxaVisita.toFixed(1)}%
              </div>
              <div className="text-xs text-text-secondary">Taxa de Visita</div>
            </div>
          </div>
          <div className="p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/30">
            <div className="text-center">
              <div className="text-lg font-bold text-green-400">
                {relatorioData.metricas.taxaNegociacao.toFixed(1)}%
              </div>
              <div className="text-xs text-text-secondary">Taxa Negociação</div>
            </div>
          </div>
          <div className="p-3 bg-gradient-to-r from-purple-500/10 to-violet-500/10 rounded-lg border border-purple-500/30">
            <div className="text-center">
              <div className="text-lg font-bold text-purple-400">
                {relatorioData.metricas.taxaVenda.toFixed(1)}%
              </div>
              <div className="text-xs text-text-secondary">Taxa de Venda</div>
            </div>
          </div>
          <div className="p-3 bg-gradient-to-r from-orange-500/10 to-red-500/10 rounded-lg border border-orange-500/30">
            <div className="text-center">
              <div className="text-lg font-bold text-orange-400">
                {relatorioData.metricas.taxaConversaoGeral.toFixed(1)}%
              </div>
              <div className="text-xs text-text-secondary">Conversão Geral</div>
            </div>
          </div>
        </div>

        {/* Pipeline total */}
        <div className="text-center mb-6 p-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-lg border border-yellow-500/30">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Target className="h-5 w-5 text-yellow-400" />
            <span className="text-lg font-bold text-yellow-400">Pipeline Total</span>
          </div>
          <div className="text-3xl font-bold text-text-primary">
            R$ {(relatorioData.metricas.valorTotalAcumulado / 1000000).toFixed(2)}M
          </div>
          <div className="text-sm text-text-secondary">
            Valor médio por lead: R$ {(relatorioData.metricas.valorTotalAcumulado / relatorioData.metricas.totalLeadsAcumulado / 1000).toFixed(0)}K
          </div>
        </div>

        {/* Gráfico de tendências */}
        <div className="flex-1 flex items-center justify-center min-h-[300px]">
          <div ref={chartRef} className="w-full h-full min-h-[280px]" />
        </div>
      </CardContent>
    </Card>
  );
};
