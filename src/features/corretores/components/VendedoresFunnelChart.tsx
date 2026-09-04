import { useEffect, useRef, useMemo, useState } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { TrendingDown } from 'lucide-react';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { useLeadsMetrics } from '@/features/leads/hooks/useLeadsMetrics';
import { normalizePercentagesFromCounts } from '@/utils/metrics';
import { PROPRIETARIO_STAGE_ORDER, computeFunnelStages } from '@/features/leads/utils/funnelStages';

interface VendedoresFunnelChartProps {
  leads?: ProcessedLead[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const VendedoresFunnelChart = ({ leads: propsLeads }: VendedoresFunnelChartProps) => {
  // USAR APENAS leads passados via props (já vem filtrado por tipo proprietário)
  // propsLeads pode ser array vazio se não houver proprietários - isso é CORRETO
  // Não usar fallback para metricsLeads pois isso mistura tipos de leads
  const leads = propsLeads || [];


  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Filtrar leads por período
  const filteredLeads = useMemo(() => {
    if (!startDate || !endDate) return leads;
    
    return leads.filter(lead => {
      const leadDate = lead.data_entrada || '';
      return leadDate >= startDate && leadDate <= endDate;
    });
  }, [leads, startDate, endDate]);

  // Calcular dados do funil para vendedores - IGUAL AO FORMATO ORIGINAL
  const funnelData = useMemo(() => {
    const safeLeads = filteredLeads || [];

    // Rótulos de exibição (com quebra de linha para o CanvasJS). A ORDEM é a
    // mesma de PROPRIETARIO_STAGE_ORDER — as contagens vêm de lá.
    const etapasOrdem = [
      'Novos Proprietários',
      'Em Atendimento',
      'Primeira Visita',
      'Criação do\nEstudo de Mercado',
      'Apresentação\nDo Estudo de Mercado',
      'Não Exclusivo',
      'Exclusivo',
      'Cadastro',
      'Plano de Marketing',
      'Propostas Respondidas',
      'Feitura de Contrato'
    ];

    const totalLeads = safeLeads.length;

    // Contagem vem de funnelStages.ts (mesma regra do outro gráfico da aba):
    // etapa exata, cada lead em exatamente uma etapa. Antes daqui saía uma
    // segunda implementação que contava 'Proposta Criada' como Exclusivo e
    // qualquer lead com data de visita como Primeira Visita — o mesmo lead
    // aparecia em duas etapas e o total estourava.
    const effectiveCounts = computeFunnelStages(safeLeads, 'proprietario').data;
    const normalizedPercentages = normalizePercentagesFromCounts(effectiveCounts, 1);

    // Um ponto por etapa: largura = quantidade real.
    const dataPoints = etapasOrdem.map((etapa, index) => {
      const quantidade = effectiveCounts[index] ?? 0;

      return {
        // Largura proporcional ao número real. Antes era uma progressão fixa
        // [100, 92, 84, ...] que desenhava um funil bonito mesmo com os dados
        // dizendo outra coisa.
        y: quantidade,
        label: etapa,
        originalKey: etapa,
        description: `${quantidade} vendedores em ${etapa}`,
        quantidade: quantidade,
        index: index,
        percentual: normalizedPercentages[index] ?? 0
      };
    });

    // Métricas calculadas para as 11 etapas de vendedores
    const novosProprietarios = effectiveCounts[0] ?? 0;
    const emAtendimento = effectiveCounts[1] ?? 0;
    const primeiraVisita = effectiveCounts[2] ?? 0;
    const criacaoEstudoMercado = effectiveCounts[3] ?? 0;
    const apresentacaoEstudoMercado = effectiveCounts[4] ?? 0;
    const naoExclusivo = effectiveCounts[5] ?? 0;
    const exclusivo = effectiveCounts[6] ?? 0;
    const cadastro = effectiveCounts[7] ?? 0;
    const planoMarketing = effectiveCounts[8] ?? 0;
    const propostasRespondidas = effectiveCounts[9] ?? 0;
    const feituraContrato = effectiveCounts[10] ?? 0;
    
    const metrics = {
      // Total = leads de fato, não a soma das etapas (que dobrava quem caía
      // em mais de uma).
      totalLeads,
      novosProprietarios,
      emAtendimento,
      primeiraVisita,
      criacaoEstudoMercado,
      apresentacaoEstudoMercado,
      naoExclusivo,
      exclusivo,
      cadastro,
      planoMarketing,
      propostasRespondidas,
      feituraContrato,
      taxaConversaoGeral: totalLeads > 0 ? (feituraContrato / totalLeads * 100) : 0,
      taxaEmAtendimento: novosProprietarios > 0 ? (emAtendimento / novosProprietarios * 100) : 0,
      taxaPrimeiraVisita: emAtendimento > 0 ? (primeiraVisita / emAtendimento * 100) : 0,
      taxaCriacaoEstudoMercado: primeiraVisita > 0 ? (criacaoEstudoMercado / primeiraVisita * 100) : 0,
      taxaApresentacaoEstudoMercado: criacaoEstudoMercado > 0 ? (apresentacaoEstudoMercado / criacaoEstudoMercado * 100) : 0,
      taxaNaoExclusivo: apresentacaoEstudoMercado > 0 ? (naoExclusivo / apresentacaoEstudoMercado * 100) : 0,
      taxaExclusivo: naoExclusivo > 0 ? (exclusivo / naoExclusivo * 100) : 0,
      taxaCadastro: exclusivo > 0 ? (cadastro / exclusivo * 100) : 0,
      taxaPlanoMarketing: cadastro > 0 ? (planoMarketing / cadastro * 100) : 0,
      taxaPropostasRespondidas: planoMarketing > 0 ? (propostasRespondidas / planoMarketing * 100) : 0,
      taxaFeituraContrato: propostasRespondidas > 0 ? (feituraContrato / propostasRespondidas * 100) : 0
    };

    return { dataPoints, metrics };
  }, [filteredLeads]);

  useEffect(() => {
    // Carregar CanvasJS dinamicamente com tratamento de erro - IGUAL AO ORIGINAL
    const loadCanvasJS = () => {
      if (window.CanvasJS) {
        initializeChart();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
      script.onload = () => {
        initializeChart();
      };
      script.onerror = () => {
        console.warn('⚠️ Falha ao carregar CanvasJS - fallback para gráfico simples');
      };
      document.head.appendChild(script);
    };

    const initializeChart = () => {
      if (!chartRef.current || !window.CanvasJS) return;

      // Destruir chart anterior se existir
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      const chart = new window.CanvasJS.Chart(chartRef.current, {
        theme: "dark2",
        backgroundColor: "transparent",
        creditText: "",
        creditHref: null,
        exportEnabled: false,
        height: null,
        title: {
          text: "",
          fontColor: "#ffffff"
        },
        data: [{
          type: "funnel",
          indexLabel: "{quantidade}",
          indexLabelFontColor: "#ffffff",
          indexLabelFontSize: 28,
          indexLabelFontWeight: "900",
          indexLabelFontFamily: "Inter, system-ui, sans-serif",
          indexLabelPlacement: "inside",
          indexLabelBackgroundColor: "transparent",
          indexLabelWrap: false,
          indexLabelMaxWidth: 300,
          neckHeight: 40,
          neckWidth: 70,
          valueRepresents: "area", 
          reversed: false,
          toolTipContent: null,
          dataPoints: funnelData.dataPoints.map(point => ({
            y: point.y,
            label: point.label,
            quantidade: point.quantidade,
            description: point.description,
            percentual: point.percentual.toFixed(1),
            color: getFunnelColor(point.originalKey, point.index)
          }))
        }],
        width: null, // Largura automática
        margin: { top: 3, right: 12, bottom: 3, left: 12 }, // Margens reduzidas (-8px total)
        animationEnabled: true,
        animationDuration: 1200,
        interactivityEnabled: false
      });

      chart.render();
      chartInstance.current = chart;
      
      // Adicionar CSS moderno e bonito aos números do funil - IGUAL AO ORIGINAL
      setTimeout(() => {
        const labels = chartRef.current?.querySelectorAll('.canvasjs-chart-text');
        const isWhiteTheme = document.body.classList.contains('theme-branco');
        
        labels?.forEach((label: Element, index: number) => {
          const element = label as HTMLElement;
          if (element.textContent && (element.textContent.includes('(') || /^\d+/.test(element.textContent.trim()) || element.textContent.includes('%'))) {
            // Cores gradientes para cada nível do funil
            const gradientColors = [
              'linear-gradient(135deg, #60A5FA 0%, #5294F8 100%)', // 1. Azul Médio
              'linear-gradient(135deg, #5294F8 0%, #3B82F6 100%)', // 2.
              'linear-gradient(135deg, #3B82F6 0%, #3273F0 100%)', // 3. Azul Vibrante
              'linear-gradient(135deg, #3273F0 0%, #2563EB 100%)', // 4.
              'linear-gradient(135deg, #2563EB 0%, #2158DC 100%)', // 5. Azul Forte
              'linear-gradient(135deg, #2158DC 0%, #1D4ED8 100%)', // 6.
              'linear-gradient(135deg, #1D4ED8 0%, #1E45C2 100%)', // 7. Azul Muito Forte
              'linear-gradient(135deg, #1E45C2 0%, #1E40AF 100%)', // 8.
              'linear-gradient(135deg, #1E40AF 0%, #19316C 100%)', // 9. Azul Escuro
              'linear-gradient(135deg, #19316C 0%, #162B55 100%)', // 10.
              'linear-gradient(135deg, #162B55 0%, #14263C 100%)', // 11. Azul Marinho Final
            ];
            const lightThemeColors = [
              '#0891b2', // Cyan escuro
              '#047857', // Green escuro
              '#6d28d9', // Purple escuro
              '#b45309', // Orange escuro
            ];
            
            const colors = isWhiteTheme ? lightThemeColors : gradientColors;
            const colorHex = colors[index % colors.length];
            
            element.style.cssText = `
              background: ${colorHex} !important;
              color: #ffffff !important;
              font-weight: 900 !important;
              font-size: 28px !important;
              font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif !important;
              letter-spacing: -1px !important;
              text-align: center !important;
              transition: all 0.3s ease;
            `;
          }
        });
      }, 200);

      // Remover marcas d'água
      setTimeout(() => {
        const container = chartRef.current;
        if (container) {
          const creditLinks = container.querySelectorAll('a[href*="canvasjs"], a[title*="CanvasJS"]');
          creditLinks.forEach(link => link.remove());
          
          const allTexts = container.querySelectorAll('text');
          allTexts.forEach(text => {
            const content = text.textContent?.toLowerCase() || '';
            if (content.includes('canvasjs') || content.includes('trial')) {
              text.remove();
            }
          });
        }
      }, 100);
    };

    loadCanvasJS();

    // Cleanup
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [funnelData]);

  // DEGRADÊ SUTIL E PROGRESSIVO: Médio → Forte em cada bloco de cor (11 etapas)
  const getFunnelColor = (etapa: string, index: number): string => {
    // DEGRADÊ AZUL MÉDIO (#60A5FA) → AZUL MARINHO ESCURO (#14263C)
    // 11 Etapas
    const colors = [
      '#60A5FA', // 1. Azul Médio (Blue 400)
      '#5294F8', // 2.
      '#3B82F6', // 3. Azul Vibrante (Blue 500)
      '#3273F0', // 4.
      '#2563EB', // 5. Azul Forte (Blue 600)
      '#2158DC', // 6.
      '#1D4ED8', // 7. Azul Muito Forte (Blue 700)
      '#1E45C2', // 8.
      '#1E40AF', // 9. Azul Escuro (Blue 800)
      '#19316C', // 10.
      '#14263C'  // 11. Azul Marinho Escuro (Final)
    ];
    
    return colors[index] || colors[colors.length - 1];
  };

  return (
    <Card className="bg-bg-card border border-border shadow-sm dark:bg-bg-card/40 dark:border-bg-secondary/40 dark:shadow-xl dark:shadow-black/20 h-full overflow-hidden transition-all duration-300 ease-in-out">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <StandardCardTitle icon={TrendingDown}>
          Funil de Proprietários
        </StandardCardTitle>
        <DateRangeFilter 
          onDateRangeChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
        />
      </CardHeader>
      
      <CardContent className="p-4 h-[calc(100%-5rem)] overflow-hidden">
        <div className="flex h-full">
          <div className="flex w-full h-full relative">
            
            {/* Funil principal - centralizado */}
            <div className="w-[68%] h-full flex justify-center">
              {funnelData.metrics.totalLeads === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-center px-6">
                  <p className="text-sm font-medium text-text-primary">Nenhum proprietário no funil</p>
                  <p className="text-xs text-text-secondary mt-1">
                    O funil usa os leads do tipo Proprietário. Cadastre um pelo Kanban para vê-lo aqui.
                  </p>
                </div>
              ) : (
                <div ref={chartRef} className="w-full h-full max-w-[500px]" />
              )}
            </div>
            
            {/* Labels harmônicos e visíveis - OTIMIZADO PARA 11 ETAPAS */}
            <div
              className="w-[32%] h-full py-4 -ml-8 grid"
              style={{
                gridTemplateRows: `repeat(${funnelData.dataPoints.length}, minmax(0, 1fr))`,
              }}
            >
              {funnelData.dataPoints.map((point, index) => {
                const percentual = (point.percentual ?? 0).toFixed(1);

                return (
                  <div
                    key={point.label}
                    className="flex items-center transition-all duration-300 hover:scale-105"
                    style={{
                      paddingLeft: '4px',
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Bolinha colorida da etapa - maior e mais visível */}
                      <div
                        className="w-3 h-3 rounded-full border-2 border-white/60 shadow-lg flex-shrink-0"
                        style={{
                          backgroundColor: getFunnelColor(point.originalKey, index),
                          boxShadow: `0 0 10px ${getFunnelColor(point.originalKey, index)}80, 0 0 20px ${getFunnelColor(point.originalKey, index)}40`,
                        }}
                      />

                      {/* Texto, números e percentual - mais compacto e legível */}
                      <div className="text-left">
                        <div
                          className="text-[13px] font-bold leading-tight"
                          style={{
                            color: getFunnelColor(point.originalKey, index),
                            whiteSpace: 'pre-line',
                            maxWidth: '160px',
                            filter: 'brightness(1.1) contrast(1.15)',
                          }}
                        >
                          {point.label}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className="text-xl font-black leading-none"
                            style={{
                              color: getFunnelColor(point.originalKey, index),
                              filter: 'brightness(1.2) contrast(1.2)',
                            }}
                          >
                            {point.quantidade}
                          </span>
                          <span className="text-xs text-gray-400 font-semibold">
                            ({percentual}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};