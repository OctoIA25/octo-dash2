/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import { assignColorsByValue } from '@/utils/colors';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface ImoveisMarketAnalysisProps {
  leads: ProcessedLead[];
}

type TipoNegocioFilter = 'todos' | 'venda' | 'locacao';

export const ImoveisMarketAnalysis = ({ leads }: ImoveisMarketAnalysisProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const [tipoNegocioFilter, setTipoNegocioFilter] = useState<TipoNegocioFilter>('todos');
  const [isChartReady, setIsChartReady] = useState(false);

  // Filtrar leads por tipo de negócio
  const filteredLeads = useMemo(() => {
    if (tipoNegocioFilter === 'todos') return leads;
    
    return leads.filter(lead => {
      const tipoNegocio = lead.tipo_negocio?.toLowerCase() || '';
      if (tipoNegocioFilter === 'venda') {
        return tipoNegocio.includes('venda');
      } else {
        return tipoNegocio.includes('locação') || tipoNegocio.includes('locacao') || tipoNegocio.includes('aluguel');
      }
    });
  }, [leads, tipoNegocioFilter]);

  const marketData = useMemo(() => {
    if (!filteredLeads || filteredLeads.length === 0) {
      // Retornar dados vazios em vez de null para sempre mostrar o gráfico
      return {
        categorias: {
          casas: { label: 'Casas', total: 0, quentes: 0, visitas: 0, negociacao: 0 },
          apartamentos: { label: 'Apartamentos', total: 0, quentes: 0, visitas: 0, negociacao: 0 },
          terrenos: { label: 'Terrenos', total: 0, quentes: 0, visitas: 0, negociacao: 0 },
          outros: { label: 'Outros', total: 0, quentes: 0, visitas: 0, negociacao: 0 }
        },
        chartDataPoints: [],
        totalGeral: 0,
        totalQuentes: 0,
        totalVisitas: 0,
        totalNegociacao: 0
      };
    }

    // Categorias de imóveis com métricas detalhadas
    const categorias = {
      casas: { 
        label: 'Casas',
        total: 0,
        quentes: 0,
        visitas: 0,
        negociacao: 0
      },
      apartamentos: { 
        label: 'Apartamentos',
        total: 0,
        quentes: 0,
        visitas: 0,
        negociacao: 0
      },
      terrenos: {
        label: 'Terrenos',
        total: 0,
        quentes: 0,
        visitas: 0,
        negociacao: 0
      },
      outros: { 
        label: 'Outros',
        total: 0,
        quentes: 0,
        visitas: 0,
        negociacao: 0
      }
    };

    // Processar cada lead
    filteredLeads.forEach(lead => {
      const codigoImovel = lead.codigo_imovel?.toLowerCase() || '';
      const preferencias = lead.Preferencias_lead?.toLowerCase() || '';
      const observacoes = lead.observacoes?.toLowerCase() || '';
      
      // Detectar categoria do imóvel - ordem específica para melhor detecção
      let categoria: keyof typeof categorias = 'outros';
      
      // 1. Verificar TERRENOS primeiro (mais específico)
      if (codigoImovel.includes('terreno') || 
          codigoImovel.includes('lote') || 
          codigoImovel.startsWith('tr') || 
          codigoImovel.startsWith('lt') ||
          preferencias.includes('terreno') || 
          preferencias.includes('lote') ||
          observacoes.includes('terreno') ||
          observacoes.includes('lote')) {
        categoria = 'terrenos';
      }
      // 2. CASAS
      else if (codigoImovel.includes('casa') || 
               codigoImovel.startsWith('ca') || 
               codigoImovel.startsWith('cs') ||
               preferencias.includes('casa')) {
        categoria = 'casas';
      }
      // 3. APARTAMENTOS
      else if (codigoImovel.includes('apartamento') || 
               codigoImovel.includes('ap') || 
               codigoImovel.includes('apto') || 
               preferencias.includes('apartamento') ||
               preferencias.includes('apto')) {
        categoria = 'apartamentos';
      }
      
      categorias[categoria].total++;
      
      // Analisar temperatura
      if (lead.status_temperatura?.toLowerCase() === 'quente') {
        categorias[categoria].quentes++;
      }
      
      // Analisar etapa do funil
      const etapa = lead.etapa_atual?.toLowerCase() || '';
      if (etapa.includes('visita')) {
        categorias[categoria].visitas++;
      }
      if (etapa.includes('negociação') || etapa.includes('negociacao') || etapa.includes('proposta')) {
        categorias[categoria].negociacao++;
      }
    });

    const totalGeral = filteredLeads.length;
    const totalQuentes = Object.values(categorias).reduce((sum, cat) => sum + cat.quentes, 0);
    const totalVisitas = Object.values(categorias).reduce((sum, cat) => sum + cat.visitas, 0);
    const totalNegociacao = Object.values(categorias).reduce((sum, cat) => sum + cat.negociacao, 0);

    // Preparar dados para o gráfico com ordem fixa: Casas, Apartamentos, Terrenos, Outros (da esquerda para direita)
    const ordemFixa = ['Casas', 'Apartamentos', 'Terrenos', 'Outros'];
    const baseDataPoints = ordemFixa
      .map(label => {
        const categoria = Object.values(categorias).find(cat => cat.label === label);
        return categoria && categoria.total > 0 ? {
          label: categoria.label,
          y: categoria.total,
          percentual: (categoria.total / totalGeral) * 100
        } : null;
      })
      .filter(Boolean) as Array<{label: string, y: number, percentual: number}>;
    
    // 🎨 Restaurar cores originais para gráficos de imóveis
    const chartDataPoints = baseDataPoints.map((point, index) => ({
      ...point,
      color: [
        '#1D4ED8',    // Azul médio forte
        '#047857',    // Verde médio muito forte
        '#DC2626',    // Vermelho médio
        '#7C3AED',    // Roxo médio muito forte
        '#CA8A04',    // Amarelo médio muito forte
        '#0891B2',    // Azul ciano muito intenso
        '#10B981',    // Verde limão muito intenso
        '#F59E0B'     // Laranja vibrante
      ][index % 8]
    }));

    return {
      categorias,
      chartDataPoints,
      totalGeral,
      totalQuentes,
      totalVisitas,
      totalNegociacao
    };
  }, [filteredLeads]);

  // Função otimizada de inicialização do gráfico
  const initializeChart = useCallback(() => {
    if (!chartRef.current || !window.CanvasJS || !marketData) return;

    // Marcar como pronto imediatamente
    setIsChartReady(true);

    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    const chart = new window.CanvasJS.Chart(chartRef.current, {
      theme: "dark2",
      backgroundColor: "transparent",
      creditText: "",
      creditHref: null,
      exportEnabled: false,
      animationEnabled: true,
      animationDuration: 600, // Reduzido de 1200 para 600ms
        title: {
          text: "",
        },
        axisY: {
          title: "Total de Leads",
          titleFontColor: "#6b7280",
          titleFontSize: 11,
          titleFontWeight: "600",
          titleFontFamily: "Inter, sans-serif",
          labelFontColor: "#9ca3af",
          labelFontSize: 12,
          labelFontWeight: "600",
          labelFontFamily: "Inter, sans-serif",
          gridColor: "#374151",
          gridThickness: 0.5,
          gridDashType: "dot",
          minimum: 0,
          lineThickness: 1,
          lineColor: "#4b5563"
        },
        axisX: {
          labelFontColor: "#d1d5db",
          labelFontSize: 13,
          labelFontWeight: "700",
          labelFontFamily: "Inter, sans-serif",
          lineColor: "#4b5563",
          lineThickness: 1,
          tickThickness: 0,
          labelMaxWidth: 100
        },
        toolTip: {
          backgroundColor: "rgba(17, 24, 39, 0.95)",
          fontColor: "#ffffff",
          borderColor: "#4b5563",
          borderThickness: 1,
          cornerRadius: 6,
          fontFamily: "Inter, sans-serif",
          fontSize: 13,
          contentFormatter: function (e: any) {
            const data = e.entries[0].dataPoint;
            
            return `
              <div style="padding: 12px; font-family: Inter, sans-serif;">
                <div style="font-weight: 800; font-size: 15px; color: ${data.color}; margin-bottom: 8px; text-shadow: 0 0 10px ${data.color}60;">
                  ${data.label.toUpperCase()}
                </div>
                <div style="font-size: 13px; line-height: 1.6; color: #e5e7eb;">
                  <div style="display: flex; justify-content: space-between; gap: 16px;">
                    <span style="color: #9ca3af;">Total:</span>
                    <strong style="color: ${data.color};">${data.y} leads</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; gap: 16px; margin-top: 6px; padding-top: 6px; border-top: 1px solid #374151;">
                    <span style="color: #9ca3af;">Percentual:</span>
                    <strong style="color: ${data.color}; font-size: 14px;">${data.percentual.toFixed(1)}%</strong>
                  </div>
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
          indexLabelFontSize: 15,
          indexLabelFontWeight: "900",
          indexLabelFontFamily: "Inter, sans-serif",
          indexLabelPlacement: "outside",
          bevelEnabled: false,
          dataPoints: marketData.chartDataPoints
        }]
      });

      chart.render();
      chartInstance.current = chart;

      // Remover marcas d'água - otimizado
      requestAnimationFrame(() => {
        const container = chartRef.current;
        if (container) {
          const creditLinks = container.querySelectorAll('a[href*="canvasjs"]');
          creditLinks.forEach(link => link.remove());
        }
      });
  }, [marketData]);

  // Effect otimizado para carregar CanvasJS
  useEffect(() => {
    // Verificar se CanvasJS já está carregado
    if (window.CanvasJS) {
      initializeChart();
      return;
    }

    // Verificar se script já está sendo carregado
    const existingScript = document.querySelector('script[src*="canvasjs"]');
    if (existingScript) {
      existingScript.addEventListener('load', initializeChart);
      return () => {
        existingScript.removeEventListener('load', initializeChart);
      };
    }

    // Carregar script apenas uma vez
    const script = document.createElement('script');
    script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
    script.async = true;
    script.onload = initializeChart;
    script.onerror = () => {
      console.warn('⚠️ Falha ao carregar CanvasJS');
      setIsChartReady(true); // Mostrar conteúdo mesmo sem gráfico
    };
    document.head.appendChild(script);

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [initializeChart]);

  // Sempre mostrar o gráfico, mesmo com dados vazios
  if (!marketData || marketData.chartDataPoints.length === 0) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full flex flex-col">
        <CardHeader className="pb-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <StandardCardTitle icon={TrendingUp}>
              Análise de Mercado Imobiliário
            </StandardCardTitle>
            
            {/* Filtro Minimalista */}
            <div className="flex gap-2">
              <button
                onClick={() => setTipoNegocioFilter('todos')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${
                  tipoNegocioFilter === 'todos'
                    ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-2xl scale-105 hover:scale-110 hover:shadow-accent-blue/50 ring-2 ring-white/30'
                    : 'bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 text-white/70 shadow-md hover:from-accent-purple/60 hover:to-accent-blue/60 hover:text-white hover:shadow-lg hover:scale-[1.02]'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setTipoNegocioFilter('venda')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${
                  tipoNegocioFilter === 'venda'
                    ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-2xl scale-105 hover:scale-110 hover:shadow-accent-blue/50 ring-2 ring-white/30'
                    : 'bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 text-white/70 shadow-md hover:from-accent-purple/60 hover:to-accent-blue/60 hover:text-white hover:shadow-lg hover:scale-[1.02]'
                }`}
              >
                Venda
              </button>
              <button
                onClick={() => setTipoNegocioFilter('locacao')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${
                  tipoNegocioFilter === 'locacao'
                    ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-2xl scale-105 hover:scale-110 hover:shadow-accent-blue/50 ring-2 ring-white/30'
                    : 'bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 text-white/70 shadow-md hover:from-accent-purple/60 hover:to-accent-blue/60 hover:text-white hover:shadow-lg hover:scale-[1.02]'
                }`}
              >
                Locação
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="h-5 w-5 text-blue-400" />
            </div>
            <h4 className="text-lg font-semibold text-text-primary mb-2">Nenhum Dado Disponível</h4>
            <p className="text-sm text-text-secondary">
              {tipoNegocioFilter === 'venda' 
                ? 'Não há leads de venda para este período' 
                : tipoNegocioFilter === 'locacao'
                ? 'Não há leads de locação para este período'
                : 'Não há dados para este filtro'
              }
            </p>
            <div className="mt-4">
              <button
                onClick={() => setTipoNegocioFilter('todos')}
                className="px-4 py-2 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition-colors text-sm"
              >
                Ver Todos os Dados
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full flex flex-col">
      <CardHeader className="pb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <StandardCardTitle icon={TrendingUp}>
            Análise de Mercado Imobiliário
          </StandardCardTitle>
          
          {/* Filtro Minimalista */}
          <div className="flex gap-2">
            <button
              onClick={() => setTipoNegocioFilter('todos')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${
                tipoNegocioFilter === 'todos'
                  ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-2xl scale-105 hover:scale-110 hover:shadow-accent-blue/50 ring-2 ring-white/30'
                  : 'bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 text-white/70 shadow-md hover:from-accent-purple/60 hover:to-accent-blue/60 hover:text-white hover:shadow-lg hover:scale-[1.02]'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setTipoNegocioFilter('venda')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${
                tipoNegocioFilter === 'venda'
                  ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-2xl scale-105 hover:scale-110 hover:shadow-accent-blue/50 ring-2 ring-white/30'
                  : 'bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 text-white/70 shadow-md hover:from-accent-purple/60 hover:to-accent-blue/60 hover:text-white hover:shadow-lg hover:scale-[1.02]'
              }`}
            >
              Venda
            </button>
            <button
              onClick={() => setTipoNegocioFilter('locacao')}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-300 ${
                tipoNegocioFilter === 'locacao'
                  ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-2xl scale-105 hover:scale-110 hover:shadow-accent-blue/50 ring-2 ring-white/30'
                  : 'bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 text-white/70 shadow-md hover:from-accent-purple/60 hover:to-accent-blue/60 hover:text-white hover:shadow-lg hover:scale-[1.02]'
              }`}
            >
              Locação
            </button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col overflow-hidden p-4">
        
        {/* TOPO - Métricas Globais Compactas */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="text-center p-2 rounded-lg border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-600/5">
            <div className="text-3xl font-black text-blue-400">{marketData.totalGeral}</div>
            <div className="text-[10px] text-blue-300/90 uppercase tracking-wider font-semibold">Total</div>
            <div className="text-[8px] text-blue-200/60">Imóveis totais</div>
          </div>
          
          <div className="text-center p-2 rounded-lg border border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-600/5">
            <div className="text-3xl font-black text-red-400">{marketData.totalQuentes}</div>
            <div className="text-[10px] text-red-300/90 uppercase tracking-wider font-semibold">Quentes</div>
            <div className="text-[8px] text-red-200/60">Alta prioridade</div>
          </div>
          
          <div className="text-center p-2 rounded-lg border border-green-500/30 bg-gradient-to-br from-green-500/10 to-green-600/5">
            <div className="text-3xl font-black text-green-400">{marketData.totalVisitas}</div>
            <div className="text-[10px] text-green-300/90 uppercase tracking-wider font-semibold">Visitas</div>
            <div className="text-[8px] text-green-200/60">Agendadas/Feitas</div>
          </div>
          
          <div className="text-center p-2 rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-purple-600/5">
            <div className="text-3xl font-black text-purple-400">{marketData.totalNegociacao}</div>
            <div className="text-[10px] text-purple-300/90 uppercase tracking-wider font-semibold">Negociação</div>
            <div className="text-[8px] text-purple-200/60">Em fechamento</div>
          </div>
        </div>

        {/* LAYOUT COMPACTO - 3 COLUNAS OTIMIZADAS */}
        <div className="grid grid-cols-[1fr_200px_280px] gap-2 flex-1 min-h-0">
          
          {/* COLUNA ESQUERDA - Gráfico de Barras */}
          <div className="bg-gradient-to-br from-bg-secondary/10 via-bg-secondary/5 to-transparent rounded-lg p-2 border border-bg-secondary/40 relative shadow-inner">
            {!isChartReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-bg-secondary/10 rounded-lg backdrop-blur-sm z-10">
                <div className="text-center">
                  <div className="w-4 h-4 border-2 border-transparent border-t-purple-500 border-r-blue-500 rounded-full animate-spin mx-auto mb-1"></div>
                  <p className="text-[8px] text-text-secondary font-medium">Carregando...</p>
                </div>
              </div>
            )}
            <div ref={chartRef} className={`w-full h-full transition-opacity duration-500 ${isChartReady ? 'opacity-100' : 'opacity-0'}`} />
          </div>

          {/* COLUNA CENTRO - Pizza Chart Compacto */}
          <div className="bg-gradient-to-br from-bg-secondary/10 to-transparent rounded-lg p-2 border border-bg-secondary/40 flex flex-col">
            <div className="text-[10px] font-bold text-text-primary mb-1 text-center uppercase tracking-wider">
              Distribuição
            </div>
            
            <div className="flex-1 flex items-center justify-center">
              <div className="relative w-32 h-32">
                <svg viewBox="0 0 200 200" className="transform -rotate-90">
                  {(() => {
                    let currentAngle = 0;
                    return marketData.chartDataPoints.map((tipo) => {
                      const percentage = tipo.percentual / 100;
                      const angle = percentage * 360;
                      const startAngle = currentAngle;
                      const endAngle = currentAngle + angle;
                      
                      const startRad = (startAngle * Math.PI) / 180;
                      const endRad = (endAngle * Math.PI) / 180;
                      const x1 = 100 + 80 * Math.cos(startRad);
                      const y1 = 100 + 80 * Math.sin(startRad);
                      const x2 = 100 + 80 * Math.cos(endRad);
                      const y2 = 100 + 80 * Math.sin(endRad);
                      const largeArc = angle > 180 ? 1 : 0;
                      
                      currentAngle = endAngle;
                      
                      return (
                        <path
                          key={tipo.label}
                          d={`M 100 100 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`}
                          fill={tipo.color}
                          opacity="0.85"
                          className="transition-all duration-300 hover:opacity-100"
                          stroke="rgba(0,0,0,0.2)"
                          strokeWidth="1"
                        />
                      );
                    });
                  })()}
                  
                  <circle cx="100" cy="100" r="50" fill="var(--bg-card)" opacity="0.9" />
                </svg>
                
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-black text-text-primary">{marketData.totalGeral}</div>
                    <div className="text-[8px] text-text-secondary uppercase tracking-wider font-semibold">Total</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* COLUNA DIREITA - Métricas Compactas */}
          <div className="bg-gradient-to-br from-bg-secondary/10 to-transparent rounded-lg p-2 border border-bg-secondary/40 flex flex-col justify-center gap-1.5">
            {marketData.chartDataPoints.map((tipo, index) => {
              const categoria = marketData.categorias[tipo.label.toLowerCase() as keyof typeof marketData.categorias];
              
              return (
                <div 
                  key={tipo.label}
                  className="group relative"
                >
                  <div 
                    className="relative rounded-lg overflow-hidden border transition-all duration-300 hover:scale-[1.01]"
                    style={{ 
                      borderColor: `${tipo.color}40`,
                      backgroundColor: `${tipo.color}08`
                    }}
                  >
                    <div 
                      className="h-12 transition-all duration-700 ease-out"
                      style={{
                        background: `linear-gradient(to right, ${tipo.color}30, ${tipo.color}10)`,
                        width: `${tipo.percentual}%`,
                        minWidth: '40%'
                      }}
                    />
                    
                    <div className="absolute inset-0 flex items-center justify-between px-2">
                      <div className="flex items-center gap-2">
                        <div className="text-xl font-black" style={{ color: tipo.color }}>
                          {tipo.y}
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-text-primary uppercase tracking-wide">
                            {tipo.label}
                          </div>
                          <div className="text-[8px] font-bold" style={{ color: tipo.color }}>
                            {tipo.percentual.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 text-center">
                        <div>
                          <div className="text-sm font-black text-red-400">{categoria?.quentes || 0}</div>
                          <div className="text-[6px] text-text-secondary/70 uppercase">Q</div>
                        </div>
                        <div>
                          <div className="text-sm font-black text-green-400">{categoria?.visitas || 0}</div>
                          <div className="text-[6px] text-text-secondary/70 uppercase">V</div>
                        </div>
                        <div>
                          <div className="text-sm font-black text-purple-400">{categoria?.negociacao || 0}</div>
                          <div className="text-[6px] text-text-secondary/70 uppercase">N</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {index < marketData.chartDataPoints.length - 1 && (
                    <div className="h-0.5 w-px bg-gradient-to-b from-text-secondary/30 to-transparent mx-auto" />
                  )}
                </div>
              );
            })}
          </div>

        </div>

      </CardContent>
    </Card>
  );
};

