import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Calendar, Activity } from 'lucide-react';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface ImoveisTrendChartProps {
  leads: ProcessedLead[];
}

export const ImoveisTrendChart = ({ leads }: ImoveisTrendChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const trendData = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    // Filtrar leads com valor e data válida
    const leadsValidos = leads.filter(lead => 
      lead.valor_imovel && lead.valor_imovel > 0 && lead.data_entrada
    );

    if (leadsValidos.length === 0) return null;

    // Obter últimos 12 meses
    const monthsData = [];
    const today = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthKey = date.toISOString().slice(0, 7); // YYYY-MM
      const monthName = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      
      monthsData.push({
        month: monthKey,
        label: monthName,
        leads: [],
        totalLeads: 0,
        valorMedio: 0,
        valorTotal: 0,
        apartamentos: 0,
        casas: 0,
        comercial: 0,
        quentes: 0,
        visitas: 0,
        negociacoes: 0
      });
    }

    // Agrupar leads por mês
    leadsValidos.forEach(lead => {
      const leadDate = new Date(lead.data_entrada);
      const monthKey = leadDate.toISOString().slice(0, 7);
      
      const monthIndex = monthsData.findIndex(m => m.month === monthKey);
      if (monthIndex !== -1) {
        const month = monthsData[monthIndex];
        month.leads.push(lead);
        month.totalLeads++;
        month.valorTotal += lead.valor_imovel;
        
        // Categorizar por tipo
        if (lead.codigo_imovel) {
          const codigo = lead.codigo_imovel.toUpperCase();
          if (codigo.includes('AP')) month.apartamentos++;
          else if (codigo.includes('CS')) month.casas++;
          else if (codigo.includes('CM')) month.comercial++;
        }
        
        // Analisar atividade
        if (lead.status_temperatura === 'Quente') month.quentes++;
        if ((lead.Data_visita && lead.Data_visita.trim() !== "") || 
            lead.etapa_atual === 'Visita Agendada') month.visitas++;
        if (lead.etapa_atual === 'Em Negociação' || 
            lead.etapa_atual === 'Negociação' ||
            lead.etapa_atual === 'Proposta Enviada') month.negociacoes++;
      }
    });

    // Calcular médias
    monthsData.forEach(month => {
      month.valorMedio = month.totalLeads > 0 ? month.valorTotal / month.totalLeads : 0;
    });

    // Análise de tendências
    const tendencias = {
      volumeLeads: calcularTendencia(monthsData.map(m => m.totalLeads)),
      valorMedio: calcularTendencia(monthsData.map(m => m.valorMedio)),
      interesseQuente: calcularTendencia(monthsData.map(m => m.quentes)),
      atividadeVisitas: calcularTendencia(monthsData.map(m => m.visitas))
    };

    // Preparar séries de dados para gráfico de linhas múltiplas
    // REGRA: Cores do gradiente azul baseadas na importância da métrica
    const series = [
      {
        type: 'area',
        name: 'Volume de Leads',
        color: '#2d5f9f', // Azul Intenso (métrica principal)
        fillOpacity: 0.3,
        lineThickness: 2,
        markerSize: 6,
        axisYType: 'primary',
        dataPoints: monthsData.map(m => ({
          label: m.label,
          y: m.totalLeads,
          valorMedio: m.valorMedio,
          valorTotal: m.valorTotal,
          quentes: m.quentes,
          visitas: m.visitas
        }))
      },
      {
        type: 'area',
        name: 'Valor Médio (R$ 100K)',
        color: '#4a7ab0', // Azul Médio Escuro (métrica secundária)
        fillOpacity: 0.2,
        lineThickness: 2,
        markerSize: 6,
        axisYType: 'secondary',
        dataPoints: monthsData.map(m => ({
          label: m.label,
          y: m.valorMedio / 100000, // Escalar para caber no gráfico
          valorMedioOriginal: m.valorMedio,
          totalLeads: m.totalLeads,
          valorTotal: m.valorTotal
        }))
      },
      {
        type: 'area',
        name: 'Leads Quentes',
        color: '#1e4d8b', // Azul Escuro/Royal (métrica importante)
        fillOpacity: 0.25,
        lineThickness: 2,
        markerSize: 5,
        axisYType: 'primary',
        dataPoints: monthsData.map(m => ({
          label: m.label,
          y: m.quentes,
          totalLeads: m.totalLeads,
          percentualQuentes: m.totalLeads > 0 ? (m.quentes / m.totalLeads) * 100 : 0
        }))
      }
    ];

    // Estatísticas gerais
    const stats = {
      totalPeriodo: monthsData.reduce((sum, m) => sum + m.totalLeads, 0),
      valorMedioPeriodo: monthsData.reduce((sum, m) => sum + m.valorMedio, 0) / monthsData.filter(m => m.valorMedio > 0).length,
      melhorMes: monthsData.reduce((max, m) => m.totalLeads > max.totalLeads ? m : max, monthsData[0]),
      piorMes: monthsData.reduce((min, m) => m.totalLeads < min.totalLeads && m.totalLeads > 0 ? m : min, monthsData[0]),
      tendencias
    };

    return {
      series,
      monthsData,
      stats,
      tendencias
    };
  }, [leads]);

  // Função para calcular tendência (crescimento/decrescimento)
  function calcularTendencia(valores: number[]): { direcao: string; percentual: number; emoji: string } {
    if (valores.length < 2) return { direcao: 'Estável', percentual: 0, emoji: '➡️' };
    
    const inicio = valores.slice(0, 3).reduce((sum, v) => sum + v, 0) / 3; // Média primeiros 3 meses
    const fim = valores.slice(-3).reduce((sum, v) => sum + v, 0) / 3; // Média últimos 3 meses
    
    if (inicio === 0) return { direcao: 'Estável', percentual: 0, emoji: '➡️' };
    
    const percentual = ((fim - inicio) / inicio) * 100;
    
    if (percentual > 10) return { direcao: 'Crescimento', percentual, emoji: '📈' };
    if (percentual < -10) return { direcao: 'Queda', percentual, emoji: '📉' };
    return { direcao: 'Estável', percentual, emoji: '➡️' };
  }

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
      if (!chartRef.current || !window.CanvasJS || !trendData) return;

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
          title: "",
          labelFontColor: "#9ca3af",
          labelFontSize: 12,
          gridColor: "#374151",
          gridThickness: 0.5,
          minimum: 0
        },
        axisY2: {
          title: "",
          labelFontColor: "#4a7ab0",
          labelFontSize: 12,
          gridColor: "transparent",
          minimum: 0
        },
        axisX: {
          title: "",
          labelFontColor: "#e5e7eb",
          labelFontSize: 12,
          labelFontWeight: "600",
          lineColor: "#6b7280",
          tickColor: "#6b7280"
        },
        legend: {
          fontColor: "#ffffff",
          fontSize: 12,
          horizontalAlign: "center",
          verticalAlign: "top"
        },
        toolTip: {
          backgroundColor: "rgba(17, 24, 39, 0.98)",
          fontColor: "#ffffff",
          borderColor: "#6b7280",
          cornerRadius: 8,
          shared: true,
          contentFormatter: function (e: any) {
            let content = `<div style="padding: 12px; font-family: Inter, sans-serif;">`;
            content += `<div style="font-weight: 700; font-size: 14px; color: #1e4d8b; margin-bottom: 8px;">
              📅 ${e.entries[0].dataPoint.label}
            </div>`;
            
            e.entries.forEach((entry: any) => {
              const data = entry.dataPoint;
              const seriesName = entry.dataSeries.name;
              
              content += `
                <div style="margin-bottom: 6px; padding: 4px 0; border-bottom: 1px solid #374151;">
                  <div style="color: ${entry.dataSeries.color}; font-weight: 600; margin-bottom: 2px;">
                    ${seriesName}
                  </div>
                  <div style="font-size: 11px;">
              `;
              
              if (seriesName === 'Volume de Leads') {
                content += `
                  <div><strong>Leads:</strong> ${data.y}</div>
                  <div><strong>Valor Total:</strong> R$ ${(data.valorTotal / 1000000).toFixed(2)}M</div>
                  <div><strong>Quentes:</strong> ${data.quentes}</div>
                `;
              } else if (seriesName === 'Valor Médio (R$ 100K)') {
                content += `
                  <div><strong>Valor Médio:</strong> R$ ${(data.valorMedioOriginal / 1000).toFixed(0)}K</div>
                  <div><strong>Total Leads:</strong> ${data.totalLeads}</div>
                `;
              } else if (seriesName === 'Leads Quentes') {
                content += `
                  <div><strong>Quentes:</strong> ${data.y}</div>
                  <div><strong>% Quentes:</strong> ${data.percentualQuentes.toFixed(1)}%</div>
                `;
              }
              
              content += `</div></div>`;
            });
            
            content += '</div>';
            return content;
          }
        },
        data: trendData.series,
        height: 280,
        animationEnabled: true,
        animationDuration: 1500
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
  }, [trendData]);

  if (!trendData || !leads || leads.length === 0) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <StandardCardTitle icon={TrendingUp}>
            Tendências Temporais
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="h-5 w-5 text-purple-400" />
            </div>
            <h4 className="text-lg font-semibold text-text-primary mb-2">Tendências Temporais</h4>
            <p className="text-sm text-text-secondary">Analisando evolução temporal...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-text-primary text-lg neon-text flex items-center gap-2">
          <div className="w-2 h-2 bg-purple-400 rounded-full glow-accent-purple"></div>
          Tendências Temporais
          <TrendingUp className="h-5 w-5 text-purple-400 ml-2" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-4">
        {/* Stats superiores */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="text-center p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/30">
            <div className="text-lg font-bold text-purple-400">
              {trendData.stats.totalPeriodo}
            </div>
            <div className="text-xs text-text-secondary">Total 12 meses</div>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-lg border border-cyan-500/30">
            <div className="text-lg font-bold text-cyan-400">
              R$ {(trendData.stats.valorMedioPeriodo / 1000).toFixed(0)}K
            </div>
            <div className="text-xs text-text-secondary">Valor Médio</div>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/30">
            <div className="text-lg font-bold text-green-400">
              {trendData.stats.melhorMes.totalLeads}
            </div>
            <div className="text-xs text-text-secondary">Melhor Mês</div>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 rounded-lg border border-orange-500/30">
            <div className="text-lg font-bold text-orange-400">
              {trendData.stats.melhorMes.label}
            </div>
            <div className="text-xs text-text-secondary">Pico</div>
          </div>
        </div>

        {/* Análise de tendências */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-text-primary mb-2">📊 Análise de Tendências:</div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(trendData.tendencias).map(([key, trend]) => {
              const labels: Record<string, string> = {
                volumeLeads: 'Volume',
                valorMedio: 'Valor Médio',
                interesseQuente: 'Interesse',
                atividadeVisitas: 'Visitas'
              };
              
              return (
                <div key={key} className="flex items-center justify-between p-2 bg-bg-secondary/20 rounded-lg">
                  <span className="text-xs text-text-primary">{labels[key]}:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm">{trend.emoji}</span>
                    <span className="text-xs text-text-secondary">
                      {trend.percentual > 0 ? '+' : ''}{trend.percentual.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gráfico */}
        <div className="flex-1 flex items-center justify-center">
          <div ref={chartRef} className="w-full h-[400px]" />
        </div>

        {/* Resumo dos últimos 3 meses */}
        <div className="mt-4 pt-3 border-t border-bg-secondary/40">
          <div className="text-sm font-semibold text-text-primary mb-2">🕒 Últimos 3 Meses:</div>
          <div className="grid grid-cols-3 gap-2">
            {trendData.monthsData.slice(-3).map((month) => (
              <div key={month.month} className="text-center p-2 bg-bg-secondary/20 rounded-lg">
                <div className="text-sm font-bold text-cyan-400">{month.label}</div>
                <div className="text-xs text-text-secondary">
                  {month.totalLeads} leads
                </div>
                <div className="text-xs text-text-secondary">
                  R$ {(month.valorMedio / 1000).toFixed(0)}K médio
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
