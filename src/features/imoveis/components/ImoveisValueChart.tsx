import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, Users } from 'lucide-react';
import { RANKING_BLUE_GRADIENT } from '@/utils/colors';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface ImoveisValueChartProps {
  leads: ProcessedLead[];
}

export const ImoveisValueChart = ({ leads }: ImoveisValueChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const valueData = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    // Análise completa de tipos de imóveis - paleta padronizada
    // REGRA: Quanto maior o interesse/quantidade, mais escuro
    const tiposImoveis = {
      casas: { icon: '🏠', color: '#2d5f9f', label: 'Casas' },        // Azul Intenso (mais interesse)
      apartamentos: { icon: '🏢', color: '#1e4d8b', label: 'Apartamentos' }, // Azul Escuro/Royal
      terrenos: { icon: '🏞️', color: '#385f92', label: 'Terrenos' },   // Azul médio
      outros: { icon: '🏘️', color: '#4a7ab0', label: 'Outros' }        // Azul Médio Escuro (menos interesse)
    };

    // Análise de tipos de negócio
    const negocioAnalysis = {
      compra: { total: 0, quentes: 0, visitas: 0, negociacoes: 0 },
      venda: { total: 0, quentes: 0, visitas: 0, negociacoes: 0 },
      locacao: { total: 0, quentes: 0, visitas: 0, negociacoes: 0 }
    };

    // Análise por tipo de imóvel
    const tiposAnalysis: Record<string, any> = {};

    leads.forEach(lead => {
      const codigoImovel = lead.codigo_imovel?.toLowerCase() || '';
      const preferencias = lead.Preferencias_lead?.toLowerCase() || '';
      const observacoes = lead.observacoes?.toLowerCase() || '';
      const tipoNegocio = lead.tipo_negocio?.toLowerCase() || '';
      
      // Detectar tipo de imóvel
      let tipoKey = 'outros';
      if (codigoImovel.includes('casa') || codigoImovel.startsWith('ca') || preferencias.includes('casa')) {
        tipoKey = 'casas';
      } else if (codigoImovel.includes('apartamento') || codigoImovel.includes('ap') || preferencias.includes('apartamento')) {
        tipoKey = 'apartamentos';
      } else if (codigoImovel.includes('terreno') || codigoImovel.includes('lote') || preferencias.includes('terreno')) {
        tipoKey = 'terrenos';
      }
      
      // Inicializar tipo se não existir
      if (!tiposAnalysis[tipoKey]) {
        tiposAnalysis[tipoKey] = {
          ...tiposImoveis[tipoKey as keyof typeof tiposImoveis],
          totalLeads: 0,
          quentes: 0,
          mornos: 0,
          frios: 0,
          visitas: 0,
          negociacoes: 0,
          finalizados: 0,
          compra: 0,
          venda: 0,
          locacao: 0,
          valorTotal: 0
        };
      }
      
      const tipo = tiposAnalysis[tipoKey];
      tipo.totalLeads++;
      tipo.valorTotal += lead.valor_imovel || 0;
      
      // Temperatura
      if (lead.status_temperatura === 'Quente') tipo.quentes++;
      else if (lead.status_temperatura === 'Morno') tipo.mornos++;
      else if (lead.status_temperatura === 'Frio') tipo.frios++;
      
      // Visitas
      if ((lead.Data_visita && lead.Data_visita.trim() !== '') || 
          lead.etapa_atual === 'Visita Agendada') {
        tipo.visitas++;
      }
      
      // Negociações
      if (lead.etapa_atual === 'Em Negociação' || 
          lead.etapa_atual === 'Negociação' ||
          lead.etapa_atual === 'Proposta Enviada') {
        tipo.negociacoes++;
      }
      
      // Finalizados
      if (lead.data_finalizacao && lead.data_finalizacao.trim() !== '') {
        tipo.finalizados++;
      }
      
      // Tipo de negócio
      if (tipoNegocio.includes('compra')) {
        tipo.compra++;
        negocioAnalysis.compra.total++;
        if (lead.status_temperatura === 'Quente') negocioAnalysis.compra.quentes++;
        if (tipo.visitas > 0) negocioAnalysis.compra.visitas++;
        if (tipo.negociacoes > 0) negocioAnalysis.compra.negociacoes++;
      } else if (tipoNegocio.includes('venda') || tipoNegocio.includes('vender')) {
        tipo.venda++;
        negocioAnalysis.venda.total++;
        if (lead.status_temperatura === 'Quente') negocioAnalysis.venda.quentes++;
        if (tipo.visitas > 0) negocioAnalysis.venda.visitas++;
        if (tipo.negociacoes > 0) negocioAnalysis.venda.negociacoes++;
      } else if (tipoNegocio.includes('locação') || tipoNegocio.includes('locacao') || tipoNegocio.includes('aluguel')) {
        tipo.locacao++;
        negocioAnalysis.locacao.total++;
        if (lead.status_temperatura === 'Quente') negocioAnalysis.locacao.quentes++;
        if (tipo.visitas > 0) negocioAnalysis.locacao.visitas++;
        if (tipo.negociacoes > 0) negocioAnalysis.locacao.negociacoes++;
      }
    });

    // Calcular métricas derivadas
    const tiposDataMap = Object.values(tiposAnalysis).reduce((acc: any, tipo: any) => {
      tipo.valorMedio = tipo.totalLeads > 0 ? tipo.valorTotal / tipo.totalLeads : 0;
      tipo.percentualQuentes = tipo.totalLeads > 0 ? (tipo.quentes / tipo.totalLeads) * 100 : 0;
      tipo.percentualVisitas = tipo.totalLeads > 0 ? (tipo.visitas / tipo.totalLeads) * 100 : 0;
      tipo.taxaConversao = tipo.quentes > 0 ? (tipo.negociacoes / tipo.quentes) * 100 : 0;
      
      acc[tipo.label] = tipo;
      return acc;
    }, {});

    // Ordem fixa: Casas, Apartamentos, Terrenos, Outros
    const ordemFixa = ['Casas', 'Apartamentos', 'Terrenos', 'Outros'];
    const tiposData = ordemFixa.map(label => tiposDataMap[label]).filter(Boolean);

    // Encontrar tipo mais procurado
    const tipoMaisProcurado = tiposData[0] || null;
    
    // Encontrar negócio predominante
    const negocioPredominante = negocioAnalysis.compra.total > negocioAnalysis.venda.total && 
                                 negocioAnalysis.compra.total > negocioAnalysis.locacao.total ? 'Compra' :
                                 negocioAnalysis.venda.total > negocioAnalysis.locacao.total ? 'Venda' : 'Locação';

    return {
      tiposData,
      negocioAnalysis,
      stats: {
        totalLeads: leads.length,
        totalQuentes: tiposData.reduce((sum, tipo) => sum + tipo.quentes, 0),
        totalVisitas: tiposData.reduce((sum, tipo) => sum + tipo.visitas, 0),
        totalNegociacoes: tiposData.reduce((sum, tipo) => sum + tipo.negociacoes, 0),
        tipoMaisProcurado: tipoMaisProcurado?.label || 'N/A',
        negocioPredominante,
        taxaConversaoGeral: tiposData.reduce((sum, tipo) => sum + tipo.quentes, 0) > 0 ?
          (tiposData.reduce((sum, tipo) => sum + tipo.negociacoes, 0) / 
           tiposData.reduce((sum, tipo) => sum + tipo.quentes, 0)) * 100 : 0
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
      if (!chartRef.current || !window.CanvasJS || !valueData) return;

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
          labelFontColor: "#e5e7eb",
          labelFontSize: 12,
          labelFontWeight: "600",
          gridColor: "#374151",
          gridThickness: 0.5
        },
        axisX: {
          title: "",
          labelFontColor: "#9ca3af",
          labelFontSize: 12,
          lineColor: "#6b7280",
          tickColor: "#6b7280",
          minimum: 0
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
                  ${data.icon} ${data.tipo}
                </div>
                <div style="font-size: 12px;">
                  <div><strong>Leads Quentes:</strong> ${data.y}</div>
                  <div><strong>Total Leads:</strong> ${data.totalLeads}</div>
                  <div><strong>Taxa Interesse:</strong> ${data.percentualQuentes.toFixed(1)}%</div>
                  <div><strong>Visitas Agendadas:</strong> ${data.visitas}</div>
                  <div><strong>Em Negociação:</strong> ${data.negociacoes}</div>
                </div>
              </div>
            `;
          }
        },
        data: [{
          type: "column",
          name: "Interesse por Tipo de Imóvel",
          indexLabel: "{y}",
          indexLabelFontColor: "#ffffff",
          indexLabelFontSize: 16,
          indexLabelFontWeight: "700",
          dataPoints: (() => {
            // Garantir ordem fixa: Casas, Apartamentos, Terrenos, Outros
            const ordemFixaGrafico = ['Casas', 'Apartamentos', 'Terrenos', 'Outros'];
            const tiposMap = valueData.tiposData.reduce((acc: any, tipo: any) => {
              acc[tipo.label] = tipo;
              return acc;
            }, {});
            
            return ordemFixaGrafico.map(label => {
              const tipo = tiposMap[label];
              return tipo ? {
                label: tipo.label,
                y: tipo.totalLeads,
                color: tipo.color,
                icon: tipo.icon,
                tipo: tipo.label,
                totalLeads: tipo.totalLeads,
                percentualQuentes: tipo.percentualQuentes,
                visitas: tipo.visitas,
                negociacoes: tipo.negociacoes
              } : null;
            }).filter(Boolean);
          })()
        }],
        height: 300,
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
        chartInstance.current = null;
      }
    };
  }, [valueData]);

  // Forçar recriação do gráfico quando os dados mudarem
  useEffect(() => {
    if (chartInstance.current && valueData) {
      chartInstance.current.destroy();
      chartInstance.current = null;
      
      // Pequeno delay para garantir que o gráfico seja recriado
      setTimeout(() => {
        if (window.CanvasJS && chartRef.current && valueData) {
          const initializeChart = () => {
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
                labelFontColor: "#e5e7eb",
                labelFontSize: 12,
                labelFontWeight: "600",
                gridColor: "#374151",
                gridThickness: 0.5
              },
              axisX: {
                title: "",
                labelFontColor: "#9ca3af",
                labelFontSize: 12,
                lineColor: "#6b7280",
                tickColor: "#6b7280",
                minimum: 0
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
                        ${data.icon} ${data.tipo}
                      </div>
                      <div style="font-size: 12px;">
                        <div><strong>Leads Quentes:</strong> ${data.y}</div>
                        <div><strong>Total Leads:</strong> ${data.totalLeads}</div>
                        <div><strong>Taxa Interesse:</strong> ${data.percentualQuentes.toFixed(1)}%</div>
                        <div><strong>Visitas Agendadas:</strong> ${data.visitas}</div>
                        <div><strong>Em Negociação:</strong> ${data.negociacoes}</div>
                      </div>
                    </div>
                  `;
                }
              },
              data: [{
                type: "column",
                name: "Interesse por Tipo de Imóvel",
                indexLabel: "{y}",
                indexLabelFontColor: "#ffffff",
                indexLabelFontSize: 16,
                indexLabelFontWeight: "700",
                dataPoints: [
                  // Ordem fixa garantida: Casas, Apartamentos, Terrenos, Outros
                  ...(valueData.tiposData.find((t: any) => t.label === 'Casas') ? [{
                    label: "Casas",
                    y: valueData.tiposData.find((t: any) => t.label === 'Casas').totalLeads,
                    color: "#2d5f9f",
                    icon: "🏠",
                    tipo: "Casas",
                    totalLeads: valueData.tiposData.find((t: any) => t.label === 'Casas').totalLeads,
                    percentualQuentes: valueData.tiposData.find((t: any) => t.label === 'Casas').percentualQuentes,
                    visitas: valueData.tiposData.find((t: any) => t.label === 'Casas').visitas,
                    negociacoes: valueData.tiposData.find((t: any) => t.label === 'Casas').negociacoes
                  }] : []),
                  ...(valueData.tiposData.find((t: any) => t.label === 'Apartamentos') ? [{
                    label: "Apartamentos",
                    y: valueData.tiposData.find((t: any) => t.label === 'Apartamentos').totalLeads,
                    color: "#1e4d8b",
                    icon: "🏢",
                    tipo: "Apartamentos",
                    totalLeads: valueData.tiposData.find((t: any) => t.label === 'Apartamentos').totalLeads,
                    percentualQuentes: valueData.tiposData.find((t: any) => t.label === 'Apartamentos').percentualQuentes,
                    visitas: valueData.tiposData.find((t: any) => t.label === 'Apartamentos').visitas,
                    negociacoes: valueData.tiposData.find((t: any) => t.label === 'Apartamentos').negociacoes
                  }] : []),
                  ...(valueData.tiposData.find((t: any) => t.label === 'Terrenos') ? [{
                    label: "Terrenos",
                    y: valueData.tiposData.find((t: any) => t.label === 'Terrenos').totalLeads,
                    color: "#385f92",
                    icon: "🏞️",
                    tipo: "Terrenos",
                    totalLeads: valueData.tiposData.find((t: any) => t.label === 'Terrenos').totalLeads,
                    percentualQuentes: valueData.tiposData.find((t: any) => t.label === 'Terrenos').percentualQuentes,
                    visitas: valueData.tiposData.find((t: any) => t.label === 'Terrenos').visitas,
                    negociacoes: valueData.tiposData.find((t: any) => t.label === 'Terrenos').negociacoes
                  }] : []),
                  ...(valueData.tiposData.find((t: any) => t.label === 'Outros') ? [{
                    label: "Outros",
                    y: valueData.tiposData.find((t: any) => t.label === 'Outros').totalLeads,
                    color: "#4a7ab0",
                    icon: "🏘️",
                    tipo: "Outros",
                    totalLeads: valueData.tiposData.find((t: any) => t.label === 'Outros').totalLeads,
                    percentualQuentes: valueData.tiposData.find((t: any) => t.label === 'Outros').percentualQuentes,
                    visitas: valueData.tiposData.find((t: any) => t.label === 'Outros').visitas,
                    negociacoes: valueData.tiposData.find((t: any) => t.label === 'Outros').negociacoes
                  }] : [])
                ]
              }],
              height: 300,
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
          
          initializeChart();
        }
      }, 100);
    }
  }, [valueData?.tiposData]);

  if (!valueData || !leads || leads.length === 0) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <StandardCardTitle icon={DollarSign}>
            Análise de Valores
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="h-5 w-5 text-orange-400" />
            </div>
            <h4 className="text-lg font-semibold text-text-primary mb-2">Análise de Valores</h4>
            <p className="text-sm text-text-secondary">Analisando faixas de preço...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-text-primary text-xl neon-text flex items-center gap-2">
          <div className="w-2 h-2 bg-orange-400 rounded-full glow-accent-orange"></div>
          Análise de Mercado Imobiliário
          <TrendingUp className="h-5 w-5 text-orange-400 ml-2" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-6">
        
        {/* Cards Superiores - 4 Categorias de Imóveis (ordem: Casas, Apartamentos, Terrenos, Outros) */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          
          {/* Casas - Azul */}
          <div className="text-center p-4 rounded-lg border" style={{ 
            backgroundColor: 'rgba(37, 99, 235, 0.1)', 
            borderColor: 'rgba(37, 99, 235, 0.3)' 
          }}>
            <div className="text-3xl font-bold mb-1" style={{ color: '#2563eb' }}>
              {valueData.tiposData.find(t => t.label === 'Casas')?.totalLeads || 0}
            </div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">
              Casas
            </div>
            <div className="text-sm font-bold" style={{ color: '#2563eb' }}>
              {(() => {
                const casas = valueData.tiposData.find(t => t.label === 'Casas')?.totalLeads || 0;
                const total = valueData.stats.totalLeads;
                return total > 0 ? `${((casas / total) * 100).toFixed(1)}%` : '0%';
              })()}
            </div>
          </div>

          {/* Apartamentos - Verde */}
          <div className="text-center p-4 rounded-lg border" style={{ 
            backgroundColor: 'rgba(5, 150, 105, 0.1)', 
            borderColor: 'rgba(5, 150, 105, 0.3)' 
          }}>
            <div className="text-3xl font-bold mb-1" style={{ color: '#059669' }}>
              {valueData.tiposData.find(t => t.label === 'Apartamentos')?.totalLeads || 0}
            </div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">
              Apartamentos
            </div>
            <div className="text-sm font-bold" style={{ color: '#059669' }}>
              {(() => {
                const apartamentos = valueData.tiposData.find(t => t.label === 'Apartamentos')?.totalLeads || 0;
                const total = valueData.stats.totalLeads;
                return total > 0 ? `${((apartamentos / total) * 100).toFixed(1)}%` : '0%';
              })()}
            </div>
          </div>

          {/* Terrenos - Roxo */}
          <div className="text-center p-4 rounded-lg border" style={{ 
            backgroundColor: 'rgba(147, 51, 234, 0.1)', 
            borderColor: 'rgba(147, 51, 234, 0.3)' 
          }}>
            <div className="text-3xl font-bold mb-1" style={{ color: '#9333ea' }}>
              {valueData.tiposData.find(t => t.label === 'Terrenos')?.totalLeads || 0}
            </div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">
              Terrenos
            </div>
            <div className="text-sm font-bold" style={{ color: '#9333ea' }}>
              {(() => {
                const terrenos = valueData.tiposData.find(t => t.label === 'Terrenos')?.totalLeads || 0;
                const total = valueData.stats.totalLeads;
                return total > 0 ? `${((terrenos / total) * 100).toFixed(1)}%` : '0%';
              })()}
            </div>
          </div>

          {/* Outros - Vermelho (sempre por último) */}
          <div className="text-center p-4 rounded-lg border" style={{ 
            backgroundColor: 'rgba(220, 38, 38, 0.1)', 
            borderColor: 'rgba(220, 38, 38, 0.3)' 
          }}>
            <div className="text-3xl font-bold mb-1" style={{ color: '#dc2626' }}>
              {valueData.tiposData.find(t => t.label === 'Outros')?.totalLeads || 0}
            </div>
            <div className="text-xs text-text-secondary uppercase tracking-wider">
              Outros
            </div>
            <div className="text-sm font-bold" style={{ color: '#dc2626' }}>
              {(() => {
                const outros = valueData.tiposData.find(t => t.label === 'Outros')?.totalLeads || 0;
                const total = valueData.stats.totalLeads;
                return total > 0 ? `${((outros / total) * 100).toFixed(1)}%` : '0%';
              })()}
            </div>
          </div>
        </div>

        {/* Análise de Tipos de Negócio */}
        <div className="mb-6">
          <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-blue-400" />
            Breakdown por Tipo de Negócio
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {/* Compra */}
            <div className="bg-bg-secondary/20 rounded-lg p-3 border border-emerald-500/30">
              <div className="text-center mb-2">
                <div className="text-2xl font-bold text-emerald-400">
                  {valueData.negocioAnalysis.compra.total}
                </div>
                <div className="text-xs text-text-secondary uppercase">Compra</div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Quentes:</span>
                  <span className="text-orange-400 font-bold">{valueData.negocioAnalysis.compra.quentes}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Visitas:</span>
                  <span className="text-blue-400 font-bold">{valueData.negocioAnalysis.compra.visitas}</span>
                </div>
              </div>
            </div>

            {/* Venda */}
            <div className="bg-bg-secondary/20 rounded-lg p-3 border border-blue-500/30">
              <div className="text-center mb-2">
                <div className="text-2xl font-bold text-blue-400">
                  {valueData.negocioAnalysis.venda.total}
                </div>
                <div className="text-xs text-text-secondary uppercase">Venda</div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Quentes:</span>
                  <span className="text-orange-400 font-bold">{valueData.negocioAnalysis.venda.quentes}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Visitas:</span>
                  <span className="text-blue-400 font-bold">{valueData.negocioAnalysis.venda.visitas}</span>
                </div>
              </div>
            </div>

            {/* Locação */}
            <div className="bg-bg-secondary/20 rounded-lg p-3 border border-purple-500/30">
              <div className="text-center mb-2">
                <div className="text-2xl font-bold text-purple-400">
                  {valueData.negocioAnalysis.locacao.total}
                </div>
                <div className="text-xs text-text-secondary uppercase">Locação</div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Quentes:</span>
                  <span className="text-orange-400 font-bold">{valueData.negocioAnalysis.locacao.quentes}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Visitas:</span>
                  <span className="text-blue-400 font-bold">{valueData.negocioAnalysis.locacao.visitas}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Gráfico de Tipos de Imóveis */}
        <div className="mb-6">
          <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-400" />
            Distribuição por Tipo de Imóvel
          </h3>
          <div className="flex items-center justify-center bg-bg-secondary/10 rounded-lg p-4">
            <div ref={chartRef} className="w-full h-[300px]" />
          </div>
        </div>

        {/* Análise Detalhada por Tipo de Imóvel */}
        <div>
          <h3 className="text-sm font-bold text-text-primary mb-3">Análise Detalhada</h3>
          <div className="grid grid-cols-2 gap-3">
            {valueData.tiposData.map((tipo: any) => (
              <div 
                key={tipo.label} 
                className="bg-bg-secondary/20 rounded-lg p-4 border border-gray-700/40 hover:border-gray-600/60 transition-all duration-300"
              >
                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div 
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl shadow-md"
                    style={{ backgroundColor: `${tipo.color}20`, border: `2px solid ${tipo.color}40` }}
                  >
                    {tipo.icon}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-base font-bold text-text-primary">{tipo.label}</h4>
                    <p className="text-xs text-text-secondary">
                      {tipo.totalLeads} leads • {tipo.quentes} quentes
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold" style={{ color: tipo.color }}>
                      {tipo.percentualQuentes.toFixed(0)}%
                    </div>
                    <div className="text-xs text-text-secondary">Interesse</div>
                  </div>
                </div>

                {/* Breakdown por Tipo de Negócio */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 bg-bg-primary/20 rounded">
                    <div className="text-emerald-400 font-bold text-sm">{tipo.compra}</div>
                    <div className="text-xs text-text-secondary">Compra</div>
                  </div>
                  <div className="text-center p-2 bg-bg-primary/20 rounded">
                    <div className="text-blue-400 font-bold text-sm">{tipo.venda}</div>
                    <div className="text-xs text-text-secondary">Venda</div>
                  </div>
                  <div className="text-center p-2 bg-bg-primary/20 rounded">
                    <div className="text-purple-400 font-bold text-sm">{tipo.locacao}</div>
                    <div className="text-xs text-text-secondary">Locação</div>
                  </div>
                </div>

                {/* Métricas de Performance */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 bg-bg-primary/20 rounded">
                    <div className="text-blue-400 font-bold text-sm">{tipo.visitas}</div>
                    <div className="text-xs text-text-secondary">Visitas</div>
                  </div>
                  <div className="text-center p-2 bg-bg-primary/20 rounded">
                    <div className="text-purple-400 font-bold text-sm">{tipo.negociacoes}</div>
                    <div className="text-xs text-text-secondary">Negociação</div>
                  </div>
                  <div className="text-center p-2 bg-bg-primary/20 rounded">
                    <div className="text-green-400 font-bold text-sm">{tipo.taxaConversao.toFixed(0)}%</div>
                    <div className="text-xs text-text-secondary">Conversão</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </CardContent>
    </Card>
  );
};
