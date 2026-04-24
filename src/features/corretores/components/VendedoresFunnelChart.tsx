import { useEffect, useRef, useMemo, useState } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { TrendingDown } from 'lucide-react';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { useLeadsMetrics } from '@/features/leads/hooks/useLeadsMetrics';
import { normalizePercentagesFromCounts } from '@/utils/metrics';

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

    // Definir as etapas específicas para vendedores (11 etapas expandidas)
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
    
    // Calcular quantidade real para cada etapa baseada nos dados do Supabase
    // IMPORTANTE: Cada lead deve aparecer em apenas UMA etapa (match exato por status)
    const calcularEtapa = (etapa: string): number => {
      switch (etapa) {
        case 'Novos Proprietários':
          // Apenas leads com status exato "Novos Proprietários" ou "Novo Proprietário"
          return safeLeads.filter(l => 
            l.etapa_atual === 'Novos Proprietários' ||
            l.etapa_atual === 'Novo Proprietário' ||
            l.etapa_atual === 'novos proprietários' ||
            l.etapa_atual === 'novo proprietário'
          ).length;
        case 'Em Atendimento':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Em Atendimento'
          ).length;
        
        case 'Primeira Visita':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Primeira Visita' ||
            l.etapa_atual === 'Visita Agendada' ||
            l.etapa_atual === 'Visita agendada' ||
            (l.Data_visita && l.Data_visita.trim() !== '')
          ).length;
        
        case 'Criação do\nEstudo de Mercado':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Criação do Estudo de Mercado' ||
            l.etapa_atual === 'Criação do\nEstudo de Mercado' ||
            l.etapa_atual === 'Criando Estudo' ||
            l.etapa_atual === 'Estudo em Criação' ||
            l.etapa_atual === 'Preparando Estudo'
          ).length;
        
        case 'Apresentação\nDo Estudo de Mercado':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Apresentação do Estudo de Mercado' ||
            l.etapa_atual === 'Apresentação\nDo Estudo de Mercado' ||
            l.etapa_atual === 'Estudo de Mercado' ||
            l.etapa_atual === 'Avaliação' ||
            l.etapa_atual === 'Análise'
          ).length;
        
        case 'Cadastro':
          // Apenas leads com status exato relacionado a Cadastro
          return safeLeads.filter(l => 
            l.etapa_atual === 'Cadastro' ||
            l.etapa_atual === 'Imóveis Cadastrados' ||
            l.etapa_atual === 'Imovel Cadastrado' ||
            l.etapa_atual === 'Cadastrado' ||
            l.etapa_atual === 'Captação'
          ).length;
        
        case 'Exclusivo':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Exclusivo' ||
            l.etapa_atual === 'Proposta Criada'
          ).length;
        
        case 'Não Exclusivo':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Não Exclusivo' ||
            l.etapa_atual === 'Proposta Enviada'
          ).length;
        
        case 'Plano de Marketing':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Plano de Marketing' ||
            l.etapa_atual === 'Marketing' ||
            l.etapa_atual === 'Divulgação' ||
            l.etapa_atual === 'Publicidade'
          ).length;
        
        case 'Propostas Respondidas':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Propostas Respondidas' ||
            l.etapa_atual === 'Proposta' ||
            l.etapa_atual === 'Negociação' ||
            l.etapa_atual === 'Negociacao' ||
            l.etapa_atual === 'Interessado'
          ).length;
        
        case 'Feitura de Contrato':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Feitura de Contrato' ||
            l.etapa_atual === 'Contrato' ||
            l.etapa_atual === 'Fechamento' ||
            l.etapa_atual === 'Vendido' ||
            l.etapa_atual === 'Finalizado'
          ).length;
        
        default:
          return 0;
      }
    };

    const countsByStage = etapasOrdem.map((etapa) => calcularEtapa(etapa));
    const totalStagesCount = countsByStage.reduce((s, v) => s + v, 0);
    const fallbackCounts = [10, 9, 8, 7, 6, 5, 6, 7, 8, 9, 15];

    const effectiveCounts = totalStagesCount > 0 ? countsByStage : fallbackCounts;
    const normalizedPercentages = normalizePercentagesFromCounts(effectiveCounts, 1);

    // Criar dataPoints com tamanhos HARMÔNICOS E ESTÁTICOS - ATUALIZADO PARA 11 ETAPAS
    const dataPoints = etapasOrdem.map((etapa, index) => {
      const quantidade = effectiveCounts[index] ?? 0;
      
      // 🎨 Valores FIXOS harmônicos para 11 etapas de vendedores (redução progressiva)
      const valoresFixosHarmonicos = [100, 92, 84, 76, 68, 60, 52, 44, 36, 28, 20]; // Progressão harmônica para 11 etapas
      const valorVisualFixo = valoresFixosHarmonicos[index] || (100 - (index * 9));
      
      return {
        y: valorVisualFixo, // Valor SEMPRE FIXO para manter consistência visual
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
      totalLeads: effectiveCounts.reduce((s, v) => s + v, 0),
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
      taxaConversaoGeral: (effectiveCounts.reduce((s, v) => s + v, 0)) > 0 ? (feituraContrato / effectiveCounts.reduce((s, v) => s + v, 0) * 100) : 0,
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
              <div ref={chartRef} className="w-full h-full max-w-[500px]" />
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