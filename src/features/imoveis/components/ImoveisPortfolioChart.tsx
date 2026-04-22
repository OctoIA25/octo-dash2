/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * 📊 Portfólio Imobiliário - DADOS 100% DO XML KENLO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

import { useMemo, useRef, useEffect, useState } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { Building2 } from 'lucide-react';
import { useImoveisData } from '../hooks/useImoveisData';

interface ImoveisPortfolioChartProps {
  leads: ProcessedLead[];
}

export const ImoveisPortfolioChart = ({ leads }: ImoveisPortfolioChartProps) => {
  // 🔥 BUSCAR DADOS 100% DO XML KENLO
  const { imoveis, metrics, isLoading: isLoadingImoveis } = useImoveisData();
  
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tipoNegocio, setTipoNegocio] = useState<'todos' | 'venda' | 'locacao'>('todos');
  const [isChartReady, setIsChartReady] = useState(false);

  const portfolioData = useMemo(() => {
    // 🔥 USAR DADOS DO XML KENLO - CONTAGEM EXATA
    if (!imoveis || imoveis.length === 0) {
      return null;
    }


    // 4 CATEGORIAS: Casas, Apartamentos, Terrenos, Outros
    const categorias = {
      venda: { total: 0, casas: 0, apartamentos: 0, terrenos: 0, outros: 0 },
      locacao: { total: 0, casas: 0, apartamentos: 0, terrenos: 0, outros: 0 }
    };

    // 🔥 PROCESSAR IMÓVEIS REAIS DO XML - CONTAGEM EXATA
    imoveis.forEach(imovel => {
      const finalidade = imovel.finalidade;
      const tipo = imovel.tipoSimplificado;
      
      // Classificar por tipo (4 CATEGORIAS)
      const isCasa = tipo === 'casa';
      const isApartamento = tipo === 'apartamento';
      const isTerreno = tipo === 'terreno';
      const isOutro = !isCasa && !isApartamento && !isTerreno; // Comerciais, rurais = OUTROS
      
      // Classificar por finalidade (venda, locacao, venda_locacao)
      const temVenda = finalidade === 'venda' || finalidade === 'venda_locacao';
      const temLocacao = finalidade === 'locacao' || finalidade === 'venda_locacao';
      
      // Contabilizar para VENDA
      if (temVenda) {
        categorias.venda.total++;
        if (isCasa) {
          categorias.venda.casas++;
        } else if (isApartamento) {
          categorias.venda.apartamentos++;
        } else if (isTerreno) {
          categorias.venda.terrenos++;
        } else {
          categorias.venda.outros++;
        }
      }
      
      // Contabilizar para LOCAÇÃO
      if (temLocacao) {
        categorias.locacao.total++;
        if (isCasa) {
          categorias.locacao.casas++;
        } else if (isApartamento) {
          categorias.locacao.apartamentos++;
        } else if (isTerreno) {
          categorias.locacao.terrenos++;
        } else {
          categorias.locacao.outros++;
        }
      }
    });

    // 🔥 IMPORTANTE: totalGeral é o número ÚNICO de imóveis (não soma, pois venda_locacao está em ambos)
    const totalGeral = imoveis.length;

    // Calcular percentuais por tipo de negócio
    const totalVenda = categorias.venda.total;
    const totalLocacao = categorias.locacao.total;
    
    // 🔥 Calcular totais ÚNICOS por tipo de imóvel (não duplicar venda_locacao)
    const todosTotais = {
      casas: imoveis.filter(i => i.tipoSimplificado === 'casa').length,
      apartamentos: imoveis.filter(i => i.tipoSimplificado === 'apartamento').length,
      terrenos: imoveis.filter(i => i.tipoSimplificado === 'terreno').length,
      outros: imoveis.filter(i => !['casa', 'apartamento', 'terreno'].includes(i.tipoSimplificado)).length
    };
    
    const todosPercentuais = {
      casas: totalGeral > 0 ? (todosTotais.casas / totalGeral) * 100 : 0,
      apartamentos: totalGeral > 0 ? (todosTotais.apartamentos / totalGeral) * 100 : 0,
      terrenos: totalGeral > 0 ? (todosTotais.terrenos / totalGeral) * 100 : 0,
      outros: totalGeral > 0 ? (todosTotais.outros / totalGeral) * 100 : 0
    };

    // Estatísticas detalhadas por finalidade EXATA
    const apenasVenda = imoveis.filter(i => i.finalidade === 'venda').length;
    const apenasLocacao = imoveis.filter(i => i.finalidade === 'locacao').length;
    const vendaELocacao = imoveis.filter(i => i.finalidade === 'venda_locacao').length;
    
    // Log dos totais EXATOS

    return {
      ...categorias,
      totalGeral,
      todosTotais,
      percentualVenda: totalGeral > 0 ? (categorias.venda.total / totalGeral) * 100 : 0,
      percentualLocacao: totalGeral > 0 ? (categorias.locacao.total / totalGeral) * 100 : 0,
      // Percentuais específicos por tipo de negócio
      vendaPercentuais: {
        casas: totalVenda > 0 ? (categorias.venda.casas / totalVenda) * 100 : 0,
        apartamentos: totalVenda > 0 ? (categorias.venda.apartamentos / totalVenda) * 100 : 0,
        terrenos: totalVenda > 0 ? (categorias.venda.terrenos / totalVenda) * 100 : 0,
        outros: totalVenda > 0 ? (categorias.venda.outros / totalVenda) * 100 : 0
      },
      locacaoPercentuais: {
        casas: totalLocacao > 0 ? (categorias.locacao.casas / totalLocacao) * 100 : 0,
        apartamentos: totalLocacao > 0 ? (categorias.locacao.apartamentos / totalLocacao) * 100 : 0,
        terrenos: totalLocacao > 0 ? (categorias.locacao.terrenos / totalLocacao) * 100 : 0,
        outros: totalLocacao > 0 ? (categorias.locacao.outros / totalLocacao) * 100 : 0
      },
      todosPercentuais
    };
  }, [imoveis]); // 🔥 DEPENDÊNCIA: IMOVEIS DO XML

  // Efeito para garantir que o container está pronto antes de renderizar
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsChartReady(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!portfolioData || !chartRef.current || !isChartReady) return;

    const loadCanvasJS = () => {
      if (window.CanvasJS) {
        setTimeout(() => createChart(), 150);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
      script.async = true;
      script.onload = () => setTimeout(() => createChart(), 150);
      document.head.appendChild(script);
    };

    const createChart = () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      if (!window.CanvasJS || !chartRef.current) return;

      // Detectar tema
      const isWhiteTheme = document.body.classList.contains('theme-branco');
      const labelColor = isWhiteTheme ? "#171717" : "#ffffff";
      const axisXColor = isWhiteTheme ? "#404040" : "#E5E7EB";
      const axisYColor = isWhiteTheme ? "#737373" : "#9CA3AF";
      const gridColor = isWhiteTheme ? "#e5e7eb" : "#374151";

      try {
        const chart = new window.CanvasJS.Chart(chartRef.current, {
          animationEnabled: true,
          animationDuration: 1200,
          theme: "dark2",
          backgroundColor: "transparent",
          creditText: "",
          creditHref: null,
          
          title: { text: "" },

          axisY: {
            labelFontColor: axisYColor,
            labelFontSize: 13,
            labelFontWeight: "600",
            labelFontFamily: "Inter, system-ui, sans-serif",
            gridColor: gridColor,
            gridThickness: 1,
            lineThickness: 0,
            tickLength: 0,
            margin: 10
          },

          axisX: {
            labelFontColor: axisXColor,
            labelFontSize: 12,
            labelFontWeight: "700",
            labelFontFamily: "Inter, system-ui, sans-serif",
            lineThickness: 0,
            tickLength: 0,
            margin: 15
          },

          toolTip: {
            cornerRadius: 8,
            backgroundColor: "rgba(17, 24, 39, 0.98)",
            borderColor: "rgba(139, 92, 246, 0.5)",
            borderThickness: 2,
            fontColor: "#ffffff",
            fontSize: 14,
            fontWeight: "600",
            contentFormatter: function(e: any) {
              const point = e.entries[0].dataPoint;
              const totalAtual = tipoNegocio === 'todos' ? portfolioData.totalGeral :
                                tipoNegocio === 'venda' ? portfolioData.venda.total : portfolioData.locacao.total;
              const percentual = totalAtual > 0 ? ((point.y / totalAtual) * 100).toFixed(1) : '0.0';
              
              return `
                <div style="padding: 12px; font-family: Inter, sans-serif;">
                  <div style="color: ${point.color}; font-weight: 600; font-size: 16px; margin-bottom: 8px;">
                    ${point.label}
                  </div>
                  <div style="color: #ffffff; font-weight: 600; font-size: 20px;">
                    ${point.y} imóveis (${percentual}%)
                  </div>
                </div>
              `;
            }
          },

          data: [{
            type: "column",
            indexLabel: "{y}",
            indexLabelFontColor: labelColor,
            indexLabelFontSize: 16,
            indexLabelFontWeight: "900",
            indexLabelFontFamily: "Inter, system-ui, sans-serif",
            indexLabelPlacement: "outside",
            cornerRadius: 6,
            
            dataPoints: (() => {
              // 4 CATEGORIAS: Casas, Apartamentos, Terrenos, Outros
              const baseData = tipoNegocio === 'todos' ? [
                {
                  label: "Casas",
                  y: portfolioData.todosTotais.casas,
                  percentual: portfolioData.todosPercentuais.casas
                },
                {
                  label: "Apartamentos",
                  y: portfolioData.todosTotais.apartamentos,
                  percentual: portfolioData.todosPercentuais.apartamentos
                },
                {
                  label: "Terrenos",
                  y: portfolioData.todosTotais.terrenos,
                  percentual: portfolioData.todosPercentuais.terrenos
                },
                {
                  label: "Outros",
                  y: portfolioData.todosTotais.outros,
                  percentual: portfolioData.todosPercentuais.outros
                }
              ] : tipoNegocio === 'venda' ? [
                {
                  label: "Casas",
                  y: portfolioData.venda.casas,
                  percentual: portfolioData.vendaPercentuais.casas
                },
                {
                  label: "Apartamentos",
                  y: portfolioData.venda.apartamentos,
                  percentual: portfolioData.vendaPercentuais.apartamentos
                },
                {
                  label: "Terrenos",
                  y: portfolioData.venda.terrenos,
                  percentual: portfolioData.vendaPercentuais.terrenos
                },
                {
                  label: "Outros",
                  y: portfolioData.venda.outros,
                  percentual: portfolioData.vendaPercentuais.outros
                }
              ] : [
                {
                  label: "Casas",
                  y: portfolioData.locacao.casas,
                  percentual: portfolioData.locacaoPercentuais.casas
                },
                {
                  label: "Apartamentos",
                  y: portfolioData.locacao.apartamentos,
                  percentual: portfolioData.locacaoPercentuais.apartamentos
                },
                {
                  label: "Terrenos",
                  y: portfolioData.locacao.terrenos,
                  percentual: portfolioData.locacaoPercentuais.terrenos
                },
                {
                  label: "Outros",
                  y: portfolioData.locacao.outros,
                  percentual: portfolioData.locacaoPercentuais.outros
                }
              ];
              
              // Filtrar itens com valor 0 para não aparecer no gráfico
              const filteredData = baseData.filter(item => item.y > 0);
              
              // Ordenar por valor (menor para maior) para atribuir cores
              const sorted = [...filteredData].sort((a, b) => a.y - b.y);
              
              // 🎨 NOVO GRADIENTE AZUL: Quanto MAIOR o valor, MAIS ESCURO o tom
              // #8ec8f2 (menor) → #1a233b (maior)
              const gradienteAzul = [
                '#8ec8f2',   // Azul Muito Claro - valores MENORES
                '#6391c5',   // Azul Médio-Claro
                '#2a4a8d',   // Azul Médio-Escuro
                '#1a233b'    // Azul Muito Escuro - valores MAIORES
              ];
              
              return filteredData.map(item => {
                const sortedIndex = sorted.findIndex(s => s.label === item.label);
                // Calcular índice da cor baseado na posição no array ordenado
                const colorIndex = Math.floor((sortedIndex / (sorted.length - 1 || 1)) * (gradienteAzul.length - 1));
                return {
                  ...item,
                  color: gradienteAzul[colorIndex]
                };
              });
            })()
          }]
        });

        chart.render();
        chartInstance.current = chart;
        setIsLoading(false);

        // Forçar re-render após 200ms para corrigir alinhamento
        setTimeout(() => {
          if (chartInstance.current) {
            chartInstance.current.render();
          }
        }, 200);

        // Remover marca d'água
        setTimeout(() => {
          const watermarks = chartRef.current?.querySelectorAll('a[href*="canvasjs"]');
          watermarks?.forEach(mark => mark.remove());
        }, 100);

      } catch (error) {
        console.error('Erro ao criar gráfico de portfólio:', error);
        setIsLoading(false);
      }
    };

    loadCanvasJS();

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [portfolioData, tipoNegocio, isChartReady]);

  // Loading state enquanto busca dados do XML
  if (isLoadingImoveis) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 h-full flex flex-col">
        <CardHeader className="pb-3">
          <StandardCardTitle icon={Building2}>
            Portfólio Imobiliário
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
              <Building2 className="h-8 w-8 text-purple-400" />
            </div>
            <h4 className="text-lg font-semibold text-text-primary mb-2">Carregando Portfólio</h4>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sem dados do XML Kenlo
  if (!portfolioData || !imoveis || imoveis.length === 0) {
    console.error('❌ ImoveisPortfolioChart - Sem dados:', { 
      hasPortfolioData: !!portfolioData, 
      imoveisCount: imoveis?.length || 0 
    });
    
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 h-full flex flex-col">
        <CardHeader className="pb-3">
          <StandardCardTitle icon={Building2}>
            Portfólio Imobiliário
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Building2 className="h-12 w-12 text-red-400/50 mx-auto mb-3" />
            <p className="text-sm text-text-secondary">Nenhum imóvel encontrado no XML Kenlo</p>
            <p className="text-xs text-text-secondary mt-2">Verifique a integração com o XML</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-2 pt-3 flex-shrink-0">
        <StandardCardTitle icon={Building2}>
          Portfólio Imobiliário
        </StandardCardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col overflow-hidden p-4 h-[calc(100%-4.5rem)]">
        
        {/* 3 Cards Minimalistas - Total Venda, Total Locação e Todos */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          
          {/* Card GERAL */}
          <div className="text-center p-2 bg-purple-500/10 rounded-lg border border-purple-500/30">
            <div className="text-3xl font-bold text-purple-400 mb-0.5">
              {portfolioData.totalGeral}
            </div>
            <div className="text-[10px] text-text-secondary uppercase tracking-wider">
              Total Imóveis
            </div>
            <div className="text-xs text-purple-400 font-bold">
              GERAL
            </div>
          </div>

          {/* Card VENDA */}
          <div className="text-center p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
            <div className="text-3xl font-bold text-emerald-400 mb-0.5">
              {portfolioData.venda.total}
            </div>
            <div className="text-[10px] text-text-secondary uppercase tracking-wider">
              Total Imóveis
            </div>
            <div className="text-xs text-emerald-400 font-bold">
              VENDA
            </div>
          </div>

          {/* Card LOCAÇÃO */}
          <div className="text-center p-2 bg-blue-500/10 rounded-lg border border-blue-500/30">
            <div className="text-3xl font-bold text-blue-400 mb-0.5">
              {portfolioData.locacao.total}
            </div>
            <div className="text-[10px] text-text-secondary uppercase tracking-wider">
              Total Imóveis
            </div>
            <div className="text-xs text-blue-400 font-bold">
              LOCAÇÃO
            </div>
          </div>
        </div>

        {/* Botões de Alternância - Ordem: Todos | Venda | Locação */}
        <div className="flex justify-center mb-3">
          <div className="inline-flex gap-2">
            <button
              onClick={() => setTipoNegocio('todos')}
              className={`py-1.5 px-4 rounded-lg text-xs font-semibold transition-all duration-300 ${
                tipoNegocio === 'todos'
                  ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-2xl scale-105 hover:scale-110 hover:shadow-accent-blue/50 ring-2 ring-white/30'
                  : 'bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 text-white/70 shadow-md hover:from-accent-purple/60 hover:to-accent-blue/60 hover:text-white hover:shadow-lg hover:scale-[1.02]'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setTipoNegocio('venda')}
              className={`py-1.5 px-4 rounded-lg text-xs font-semibold transition-all duration-300 ${
                tipoNegocio === 'venda'
                  ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-2xl scale-105 hover:scale-110 hover:shadow-accent-blue/50 ring-2 ring-white/30'
                  : 'bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 text-white/70 shadow-md hover:from-accent-purple/60 hover:to-accent-blue/60 hover:text-white hover:shadow-lg hover:scale-[1.02]'
              }`}
            >
              Venda
            </button>
            <button
              onClick={() => setTipoNegocio('locacao')}
              className={`py-1.5 px-4 rounded-lg text-xs font-semibold transition-all duration-300 ${
                tipoNegocio === 'locacao'
                  ? 'bg-gradient-to-r from-accent-purple to-accent-blue text-white shadow-2xl scale-105 hover:scale-110 hover:shadow-accent-blue/50 ring-2 ring-white/30'
                  : 'bg-gradient-to-r from-accent-purple/40 to-accent-blue/40 text-white/70 shadow-md hover:from-accent-purple/60 hover:to-accent-blue/60 hover:text-white hover:shadow-lg hover:scale-[1.02]'
              }`}
            >
              Locação
            </button>
          </div>
        </div>

        {/* Gráfico de Barras - CanvasJS - OCUPA TODO O ESPAÇO DISPONÍVEL */}
        <div className="flex-1 relative overflow-hidden h-[calc(100%-180px)]">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-transparent border-t-purple-500 border-r-blue-500 rounded-full animate-spin"></div>
            </div>
          )}
          <div ref={chartRef} className="w-full h-full" />
        </div>

      </CardContent>
    </Card>
  );
};
