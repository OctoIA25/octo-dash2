import { useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { TrendingDown } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

interface Candidato {
  id: number;
  status: string;
}

interface RecrutamentoFunnelChartProps {
  candidatos: Candidato[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const RecrutamentoFunnelChart = ({ candidatos }: RecrutamentoFunnelChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const { currentTheme } = useTheme();

  // Calcular dados do funil - 4 etapas de recrutamento
  const funnelData = useMemo(() => {
    if (!candidatos || candidatos.length === 0) return { dataPoints: [], metrics: null };

    // Definir as etapas do funil de recrutamento
    const etapasOrdem = [
      'Lead',
      'Interação',
      'Reunião',
      'Onboard'
    ];

    const totalCandidatos = candidatos.length;
    
    // Calcular quantidade real para cada etapa
    const calcularEtapa = (etapa: string): number => {
      switch (etapa) {
        case 'Lead':
          return candidatos.filter(c => c.status === 'Lead').length;
        case 'Interação':
          return candidatos.filter(c => c.status === 'Interação').length;
        case 'Reunião':
          return candidatos.filter(c => c.status === 'Reunião').length;
        case 'Onboard':
          return candidatos.filter(c => c.status === 'Onboard').length;
        default:
          return 0;
      }
    };

    // Criar dataPoints com tamanhos harmônicos e estáticos
    const dataPoints = etapasOrdem.map((etapa, index) => {
      const quantidade = calcularEtapa(etapa);
      
      // Valores FIXOS harmônicos para 4 etapas
      const valoresFixosHarmonicos = [100, 92, 84, 76];
      const valorVisualFixo = valoresFixosHarmonicos[index] || (100 - (index * 8));
      
      return {
        y: valorVisualFixo, // Valor SEMPRE FIXO para manter consistência visual
        label: etapa,
        originalKey: etapa,
        description: `${quantidade} candidatos em ${etapa}`,
        quantidade: quantidade,
        index: index,
        percentual: totalCandidatos > 0 ? ((quantidade / totalCandidatos) * 100) : 0
      };
    });

    // Métricas calculadas para as 4 etapas
    const lead = calcularEtapa('Lead');
    const interacao = calcularEtapa('Interação');
    const reuniao = calcularEtapa('Reunião');
    const onboard = calcularEtapa('Onboard');
    
    const metrics = {
      totalCandidatos,
      lead,
      interacao,
      reuniao,
      onboard,
      taxaConversaoGeral: totalCandidatos > 0 ? (onboard / totalCandidatos * 100) : 0,
      taxaInteracao: lead > 0 ? (interacao / lead * 100) : 0,
      taxaReuniao: interacao > 0 ? (reuniao / interacao * 100) : 0,
      taxaOnboard: reuniao > 0 ? (onboard / reuniao * 100) : 0
    };

    return { dataPoints, metrics };
  }, [candidatos]);

  useEffect(() => {
    // Carregar CanvasJS dinamicamente com tratamento de erro
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
        width: null,
        margin: { top: 3, right: 12, bottom: 3, left: 12 },
        animationEnabled: true,
        animationDuration: 1200,
        interactivityEnabled: false
      });

      chart.render();
      chartInstance.current = chart;
      
      // Adicionar CSS moderno e bonito aos números do funil
      setTimeout(() => {
        const labels = chartRef.current?.querySelectorAll('.canvasjs-chart-text');
        labels?.forEach((label: Element, index: number) => {
          const element = label as HTMLElement;
          if (element.textContent && (element.textContent.includes('(') || /^\d+/.test(element.textContent.trim()) || element.textContent.includes('%'))) {
            // Cores gradientes para cada nível do funil - Harmonia SUAVE para 4 etapas
            const gradientColors = [
              'linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%)', // 1. Azul Médio
              'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)', // 2. Azul Vibrante
              'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', // 3. Azul Forte
              'linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)', // 4. Azul Escuro (Final Harmônico)
            ];
            
            // Design ultra moderno para números
            const colorHex = gradientColors[index % gradientColors.length].match(/#[a-f0-9]{6}/gi)?.[0] || '#ffffff';
            element.style.cssText = `
              background: ${gradientColors[index % gradientColors.length]};
              -webkit-background-clip: text !important;
              -webkit-text-fill-color: transparent !important;
              background-clip: text !important;
              font-weight: 900 !important;
              font-size: 28px !important;
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
              animation: modernPulse 3s ease-in-out infinite alternate, holographicShine 6s linear infinite !important;
              transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            `;
            
            // Adicionar hover effect
            element.addEventListener('mouseenter', () => {
              element.style.transform = 'perspective(1000px) rotateX(0deg) translateZ(0px) translateY(0px) scale(1.05) !important';
              element.style.filter = `
                drop-shadow(0 0 25px ${colorHex}80)
                drop-shadow(0 6px 12px rgba(0, 0, 0, 0.9))
                drop-shadow(0 0 40px rgba(255, 255, 255, 0.4))
                brightness(1.3)
                contrast(1.3) !important`;
            });
            
            element.addEventListener('mouseleave', () => {
              element.style.transform = 'perspective(1000px) rotateX(0deg) translateZ(0px) translateY(0px) !important';
              element.style.filter = `
                drop-shadow(0 0 15px ${colorHex}60)
                drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))
                drop-shadow(0 0 30px rgba(255, 255, 255, 0.2))
                brightness(1.1)
                contrast(1.2) !important`;
            });
            
            // Adicionar animação CSS se não existir
            if (!document.querySelector('#funnel-glow-animation-recrutamento')) {
              const style = document.createElement('style');
              style.id = 'funnel-glow-animation-recrutamento';
              style.textContent = `
                @keyframes modernPulse {
                  0% {
                    filter: 
                      drop-shadow(0 0 15px currentColor)
                      drop-shadow(0 4px 8px rgba(0, 0, 0, 0.8))
                      drop-shadow(0 0 30px rgba(255, 255, 255, 0.2))
                      brightness(1.1)
                      contrast(1.2);
                  }
                  100% {
                    filter: 
                      drop-shadow(0 0 25px currentColor)
                      drop-shadow(0 6px 12px rgba(0, 0, 0, 0.9))
                      drop-shadow(0 0 40px rgba(255, 255, 255, 0.4))
                      brightness(1.3)
                      contrast(1.4);
                  }
                }
                
                @keyframes holographicShine {
                  0% { background-position: -200% 0; }
                  100% { background-position: 200% 0; }
                }
                
                .canvasjs-chart-text {
                  background-size: 200% 100% !important;
                }
              `;
              document.head.appendChild(style);
            }
          }
        });
      }, 150);
      
      // Remover marcas d'água após renderização
      setTimeout(() => {
        const container = chartRef.current;
        if (container) {
          // Remover links de crédito
          const creditLinks = container.querySelectorAll('a[href*="canvasjs"], a[title*="CanvasJS"]');
          creditLinks.forEach(link => link.remove());
          
          // Remover textos de crédito
          const creditTexts = container.querySelectorAll('text[font-size="11"], text[fill="#999999"]');
          creditTexts.forEach(text => {
            if (text.textContent && text.textContent.toLowerCase().includes('canvasjs')) {
              text.remove();
            }
          });
        }
      }, 100);
    };

    loadCanvasJS();

    // Listener para redimensionar o gráfico quando a sidebar muda
    const handleResize = () => {
      if (chartInstance.current) {
        setTimeout(() => {
          try {
            if (chartRef.current && chartInstance.current) {
              chartInstance.current.render();
            }
          } catch {
            // container já desmontado — ignorar
          }
        }, 350);
      }
    };

    window.addEventListener('resize', handleResize);
    
    // Observar mudanças no tamanho do container
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
    // 🎨 DEGRADÊ HARMÔNICO SUAVE (4 Etapas)
    // Termina em um azul escuro (#1E40AF) mas não preto, para manter a vibração em poucas etapas
    const colors = [
      '#60A5FA', // 1. Azul Médio (Blue 400)
      '#3B82F6', // 2. Azul Vibrante (Blue 500)
      '#2563EB', // 3. Azul Forte (Blue 600)
      '#1E40AF'  // 4. Azul Escuro (Blue 800)
    ];
    
    return colors[index] || colors[colors.length - 1];
  };

  if (!funnelData.metrics || funnelData.dataPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-[350px] text-gray-600 dark:text-gray-400">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500/20 to-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingDown className="h-5 w-5 text-blue-400" />
          </div>
          <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Funil de Recrutamento</h4>
          <p className="text-sm">Aguardando dados dos candidatos para construir o funil</p>
        </div>
      </div>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-900 border-gray-200/60 dark:border-gray-700/60 h-full overflow-hidden transition-all duration-300 ease-in-out">
        <CardHeader className="pb-1">
          <StandardCardTitle icon={TrendingDown}>
            Funil de Recrutamento
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="p-4 h-[calc(100%-4rem)] overflow-hidden">
          {/* Layout centralizado com elementos mais próximos */}
          <div className="flex h-full transition-all duration-300 ease-in-out overflow-hidden">
            <div className="flex w-full h-full relative overflow-hidden">
              
              {/* Funil principal - centralizado com transição suave */}
              <div className="w-[68%] h-full flex justify-center transition-all duration-300 ease-in-out overflow-hidden">
                <div ref={chartRef} className="w-full h-[650px] max-w-[500px] transition-all duration-300 ease-in-out" />
              </div>
            
            {/* Labels muito próximos do funil */}
            <div className="w-[32%] h-full relative py-4 -ml-8">
              {funnelData.dataPoints.map((point, index) => {
                // Calcular posição vertical baseada na altura expandida do funil
                const totalSections = funnelData.dataPoints.length;
                const sectionHeight = 650 / totalSections;
                const topPosition = (index * sectionHeight) + (sectionHeight / 2) - 22;
                
                // Calcular percentual
                const percentual = funnelData.metrics && funnelData.metrics.totalCandidatos > 0 
                  ? ((point.quantidade / funnelData.metrics.totalCandidatos) * 100).toFixed(1)
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
                      {/* Bolinha colorida da etapa */}
                      <div 
                        className="w-4 h-4 rounded-full border border-white/40 shadow-lg flex-shrink-0"
                        style={{ 
                          backgroundColor: getFunnelColor(point.originalKey, index),
                          boxShadow: `0 0 8px ${getFunnelColor(point.originalKey, index)}60, 0 0 16px ${getFunnelColor(point.originalKey, index)}30`
                        }}
                      />
                      
                      {/* Texto, números e percentual */}
                      <div className="text-left">
                        <div 
                          className="text-base font-bold leading-tight whitespace-nowrap"
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
                          <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
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
