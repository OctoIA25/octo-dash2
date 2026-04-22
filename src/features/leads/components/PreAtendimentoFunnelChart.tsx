import { useEffect, useRef, useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { TrendingDown } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

interface PreAtendimentoFunnelChartProps {
  leads: ProcessedLead[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

/**
 * 🎯 FUNIL PRÉ-ATENDIMENTO
 * Etapas: Novos Leads → Interação → Visita Agendada
 * A última etapa é Visita Agendada (não realizada)
 */
export const PreAtendimentoFunnelChart = ({ leads }: PreAtendimentoFunnelChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const { currentTheme } = useTheme();

  // Calcular dados do funil - PRÉ-ATENDIMENTO (3 etapas até Visita Agendada)
  const funnelData = useMemo(() => {
    const safeLeads = leads || [];

    // Definir etapas do Pré-Atendimento (termina em Visita Agendada)
    const etapasOrdem = [
      'Novos Leads',
      'Interação',
      'Visita Agendada'
    ];

    const totalLeads = safeLeads.length;
    
    // Calcular quantidade real para cada etapa - CONTAGEM EXATA (não acumulativa)
    // Cada etapa conta APENAS os leads que estão naquela etapa específica
    const calcularEtapa = (etapa: string): number => {
      switch (etapa) {
        case 'Novos Leads':
          // APENAS leads na etapa "Novos Leads" ou "Novo Lead" (não todos!)
          return safeLeads.filter(l => {
            const etapaAtual = (l.etapa_atual || '').toLowerCase().trim();
            return etapaAtual === 'novos leads' || 
                   etapaAtual === 'novo lead' ||
                   etapaAtual === 'novo' ||
                   etapaAtual === '';  // Leads sem etapa definida = novos
          }).length;
        
        case 'Interação':
          return safeLeads.filter(l => {
            const etapaAtual = (l.etapa_atual || '').toLowerCase().trim();
            return etapaAtual === 'interação' || etapaAtual === 'interacao';
          }).length;
        
        case 'Visita Agendada':
          return safeLeads.filter(l => {
            const etapaAtual = (l.etapa_atual || '').toLowerCase().trim();
            return etapaAtual === 'visita agendada';
          }).length;
        
        default:
          return 0;
      }
    };

    // Criar dataPoints com tamanhos harmônicos para 3 etapas
    const dataPoints = etapasOrdem.map((etapa, index) => {
      const quantidade = calcularEtapa(etapa);
      
      // 🎨 Valores FIXOS harmônicos para 3 etapas
      const valoresFixosHarmonicos = [100, 70, 40];
      const valorVisualFixo = valoresFixosHarmonicos[index] || (100 - (index * 25));
      
      return {
        y: valorVisualFixo,
        label: etapa,
        originalKey: etapa,
        description: `${quantidade} leads em ${etapa}`,
        quantidade: quantidade,
        index: index,
        percentual: totalLeads > 0 ? ((quantidade / totalLeads) * 100) : 0
      };
    });

    // Métricas calculadas
    const novosLeads = totalLeads;
    const interacao = calcularEtapa('Interação');
    const visitaAgendada = calcularEtapa('Visita Agendada');
    
    const metrics = {
      totalLeads,
      novosLeads,
      interacao,
      visitaAgendada,
      taxaConversaoGeral: totalLeads > 0 ? (visitaAgendada / totalLeads * 100) : 0,
      taxaInteracao: novosLeads > 0 ? (interacao / novosLeads * 100) : 0,
      taxaVisitaAgendada: interacao > 0 ? (visitaAgendada / interacao * 100) : 0
    };

    return { dataPoints, metrics };
  }, [leads]);

  useEffect(() => {
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
        console.warn('⚠️ Falha ao carregar CanvasJS');
      };
      document.head.appendChild(script);
    };

    const initializeChart = () => {
      if (!chartRef.current || !window.CanvasJS) return;

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
          indexLabelFontSize: 32,
          indexLabelFontWeight: "900",
          indexLabelFontFamily: "Inter, system-ui, sans-serif",
          indexLabelPlacement: "inside",
          indexLabelBackgroundColor: "transparent",
          indexLabelWrap: false,
          indexLabelMaxWidth: 300,
          neckHeight: 35,
          neckWidth: 65,
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
        width: null,
        margin: { top: 3, right: 12, bottom: 3, left: 12 },
        animationEnabled: true,
        animationDuration: 1200,
        interactivityEnabled: false
      });

      chart.render();
      chartInstance.current = chart;
      
      // Estilização dos números - AGORA AZUL
      setTimeout(() => {
        const labels = chartRef.current?.querySelectorAll('.canvasjs-chart-text');
        labels?.forEach((label: Element, index: number) => {
          const element = label as HTMLElement;
          if (element.textContent && (element.textContent.includes('(') || /^\d+/.test(element.textContent.trim()) || element.textContent.includes('%'))) {
            const gradientColors = [
              'linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%)', // Azul Claro
              'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)', // Azul Médio
              'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', // Azul Forte
              'linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)', // Azul Escuro
            ];
            
            const colorHex = gradientColors[index % gradientColors.length].match(/#[a-f0-9]{6}/gi)?.[0] || '#ffffff';
            element.style.cssText = `
              background: ${gradientColors[index % gradientColors.length]};
              -webkit-background-clip: text !important;
              -webkit-text-fill-color: transparent !important;
              background-clip: text !important;
              font-weight: 900 !important;
              font-size: 32px !important;
              font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif !important;
              letter-spacing: -1px !important;
              text-align: center !important;
              line-height: 1.1 !important;
              white-space: nowrap !important;
              position: relative !important;
              z-index: 15 !important;
              display: inline-block !important;
              transform: perspective(1000px) rotateX(0deg) translateZ(0px) translateY(0px) !important;
              margin: 0 auto !important;
              padding: 2px 4px !important;
              text-shadow: 
                0 0 20px ${colorHex}80,
                0 0 40px ${colorHex}60,
                0 0 60px ${colorHex}40,
                0 4px 12px rgba(0, 0, 0, 0.9),
                0 8px 20px rgba(0, 0, 0, 0.6),
                0 0 80px rgba(255, 255, 255, 0.3) !important;
              filter: 
                drop-shadow(0 0 15px ${colorHex}60)
                drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))
                drop-shadow(0 0 30px rgba(255, 255, 255, 0.2))
                brightness(1.1)
                contrast(1.2) !important;
              animation: modernPulse 3s ease-in-out infinite alternate !important;
              transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            `;
          }
        });
      }, 150);
      
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

    const handleResize = () => {
      if (chartInstance.current) {
        setTimeout(() => {
          chartInstance.current?.render();
        }, 350);
      }
    };

    window.addEventListener('resize', handleResize);
    
    const resizeObserver = new ResizeObserver(handleResize);
    if (chartRef.current) {
      resizeObserver.observe(chartRef.current);
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [funnelData.dataPoints]);

  const getFunnelColor = (etapa: string, index: number): string => {
    // 🎨 DEGRADÊ AZUL HARMÔNICO (3 Etapas - Pré-Atendimento)
    const colors = [
      '#60A5FA', // 1. Azul Claro
      '#3B82F6', // 2. Azul Médio
      '#1D4ED8'  // 3. Azul Escuro
    ];
    
    return colors[index] || colors[colors.length - 1];
  };

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full overflow-hidden transition-all duration-300 ease-in-out">
        <CardHeader className="pb-1">
          <StandardCardTitle icon={TrendingDown}>
            Funil Pré-Atendimento
          </StandardCardTitle>
          <p className="text-xs text-text-secondary mt-1">Novos Leads → Visita Agendada</p>
        </CardHeader>
        <CardContent className="p-4 h-[calc(100%-5rem)] overflow-hidden">
          <div className="flex h-full transition-all duration-300 ease-in-out overflow-hidden">
            <div className="flex w-full h-full relative overflow-hidden">
              
              {/* Funil principal */}
              <div className="w-[65%] h-full flex justify-center items-center transition-all duration-300 ease-in-out overflow-hidden py-4">
                <div ref={chartRef} className="w-full h-full max-w-[450px] max-h-[500px] transition-all duration-300 ease-in-out" />
              </div>
            
            {/* Labels */}
            <div className="w-[35%] h-full relative py-4 -ml-6 flex items-center">
              <div className="relative w-full" style={{ height: '500px' }}>
              {funnelData.dataPoints.map((point, index) => {
                const totalSections = funnelData.dataPoints.length;
                const sectionHeight = 500 / totalSections;
                const topPosition = (index * sectionHeight) + (sectionHeight / 2) - 28;
                
                const percentual = funnelData.metrics && funnelData.metrics.totalLeads > 0 
                  ? ((point.quantidade / funnelData.metrics.totalLeads) * 100).toFixed(1)
                  : '0.0';
                
                return (
                  <div 
                    key={point.label}
                    className="absolute transition-all duration-300 hover:scale-105"
                    style={{
                      top: `${topPosition}px`,
                      left: '4px'
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full border border-white/40 shadow-lg flex-shrink-0"
                        style={{ 
                          backgroundColor: getFunnelColor(point.originalKey, index),
                          boxShadow: `0 0 8px ${getFunnelColor(point.originalKey, index)}60, 0 0 16px ${getFunnelColor(point.originalKey, index)}30`
                        }}
                      />
                      
                      <div className="text-left">
                        <div 
                          className="text-base font-bold neon-text-subtle leading-tight whitespace-nowrap"
                          style={{
                            color: getFunnelColor(point.originalKey, index),
                            textShadow: currentTheme !== 'branco' ? `0 0 6px ${getFunnelColor(point.originalKey, index)}40` : 'none'
                          }}
                        >
                          {point.label}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span 
                            className="text-2xl font-black leading-none"
                            style={{
                              color: getFunnelColor(point.originalKey, index),
                              textShadow: currentTheme !== 'branco' ? `0 0 8px ${getFunnelColor(point.originalKey, index)}50` : 'none'
                            }}
                          >
                            {point.quantidade}
                          </span>
                          <span className="text-sm text-text-secondary font-medium">
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
          </div>
        </CardContent>
      </Card>
  );
};
