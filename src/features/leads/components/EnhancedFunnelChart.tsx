import { useEffect, useRef, useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { TrendingDown, Users, Target, CheckCircle } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

interface EnhancedFunnelChartProps {
  leads: ProcessedLead[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const EnhancedFunnelChart = ({ leads }: EnhancedFunnelChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const { currentTheme } = useTheme();

  // Calcular dados do funil - PRIMEIRA METADE (até Visita Agendada) - MESMO LAYOUT DO ORIGINAL
  const funnelData = useMemo(() => {
    const safeLeads = leads || [];

    // Definir as etapas do funil na ordem específica (de cima para baixo)
    const etapasOrdem = [
      'Novos Leads',
      'Interação',
      'Visita Agendada',
      'Visita Realizada',
      'Negociação',
      'Proposta Criada',
      'Proposta Assinada'
    ];

    const totalLeads = safeLeads.length;
    
    // Calcular quantidade real para cada etapa - CONTAGEM EXATA (não acumulativa)
    // Cada etapa conta APENAS os leads que estão naquela etapa específica
    const calcularEtapa = (etapa: string): number => {
      switch (etapa) {
        case 'Novos Leads':
          // APENAS leads na etapa "Novos Leads" (não todos!)
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
        
        case 'Visita Realizada':
          return safeLeads.filter(l => {
            const etapaAtual = (l.etapa_atual || '').toLowerCase().trim();
            return etapaAtual === 'visita realizada';
          }).length;
        
        case 'Negociação':
          return safeLeads.filter(l => {
            const etapaAtual = (l.etapa_atual || '').toLowerCase().trim();
            return etapaAtual === 'negociação' || etapaAtual === 'negociacao' || etapaAtual === 'em negociação';
          }).length;
        
        case 'Proposta Criada':
          return safeLeads.filter(l => {
            const etapaAtual = (l.etapa_atual || '').toLowerCase().trim();
            return etapaAtual === 'proposta criada';
          }).length;
        
        case 'Proposta Assinada':
          return safeLeads.filter(l => {
            const etapaAtual = (l.etapa_atual || '').toLowerCase().trim();
            return etapaAtual === 'proposta assinada' || etapaAtual === 'fechamento' || etapaAtual === 'finalizado';
          }).length;
        
        default:
          return 0;
      }
    };

    // Criar dataPoints com tamanhos HARMÔNICOS E ESTÁTICOS - SEMPRE OS MESMOS TAMANHOS
    const dataPoints = etapasOrdem.map((etapa, index) => {
      const quantidade = calcularEtapa(etapa);
      
      // 🎨 Valores FIXOS harmônicos REDUZIDOS - proporção golden ratio para visual perfeito
      // Cada etapa diminui suavemente mantendo a harmonia visual SEMPRE
      const valoresFixosHarmonicos = [100, 88, 76, 64, 52, 40, 28]; // Smooth decrease for 7 stages
      const valorVisualFixo = valoresFixosHarmonicos[index] || (100 - (index * 12));
      
      return {
        y: valorVisualFixo, // Valor SEMPRE FIXO para manter consistência visual
        label: etapa,
        originalKey: etapa,
        description: `${quantidade} leads em ${etapa}`,
        quantidade: quantidade,
        index: index,
        percentual: totalLeads > 0 ? ((quantidade / totalLeads) * 100) : 0
      };
    });

    // Métricas reais calculadas para todas as 7 etapas
    const novosLeads = totalLeads;
    const interacao = calcularEtapa('Interação');
    const visitaAgendada = calcularEtapa('Visita Agendada');
    const visitaRealizada = calcularEtapa('Visita Realizada');
    const negociacao = calcularEtapa('Negociação');
    const propostaCriada = calcularEtapa('Proposta Criada');
    const propostaAssinada = calcularEtapa('Proposta Assinada');
    
    const metrics = {
      totalLeads,
      novosLeads,
      interacao,
      visitaAgendada,
      visitaRealizada,
      negociacao,
      propostaCriada,
      propostaAssinada,
      taxaConversaoGeral: totalLeads > 0 ? (propostaAssinada / totalLeads * 100) : 0,
      taxaInteracao: novosLeads > 0 ? (interacao / novosLeads * 100) : 0,
      taxaVisitaAgendada: interacao > 0 ? (visitaAgendada / interacao * 100) : 0,
      taxaVisitaRealizada: visitaAgendada > 0 ? (visitaRealizada / visitaAgendada * 100) : 0,
      taxaNegociacao: visitaRealizada > 0 ? (negociacao / visitaRealizada * 100) : 0,
      taxaPropostaCriada: negociacao > 0 ? (propostaCriada / negociacao * 100) : 0,
      taxaPropostaAssinada: propostaCriada > 0 ? (propostaAssinada / propostaCriada * 100) : 0
    };

    return { dataPoints, metrics };
  }, [leads]);

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
        width: null, // Largura automática
        margin: { top: 3, right: 12, bottom: 3, left: 12 }, // Margens reduzidas (-8px total)
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
            // Degradê sutil e perceptível: médio → forte (harmonioso de 7 tons)
            const gradientColors = [
              'linear-gradient(135deg, #60A5FA 0%, #5294F8 100%)', // 1.
              'linear-gradient(135deg, #5294F8 0%, #3B82F6 100%)', // 2.
              'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)', // 3.
              'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', // 4.
              'linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)', // 5.
              'linear-gradient(135deg, #1E40AF 0%, #19316C 100%)', // 6.
              'linear-gradient(135deg, #19316C 0%, #14263C 100%)', // 7. Final
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
            if (!document.querySelector('#funnel-glow-animation')) {
              const style = document.createElement('style');
              style.id = 'funnel-glow-animation';
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
          chartInstance.current?.render();
        }, 350); // Aguardar transição da sidebar (300ms) + margem
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
    // 🎨 DEGRADÊ HARMÔNICO (7 Etapas selecionadas da paleta de 11)
    const colors = [
      '#60A5FA', // 1. Azul Médio
      '#5294F8', // 2.
      '#3B82F6', // 3. Azul Vibrante
      '#2563EB', // 4. Azul Forte
      '#1D4ED8', // 5. Azul Muito Forte
      '#1E40AF', // 6. Azul Escuro
      '#14263C'  // 7. Azul Marinho Escuro (Final)
    ];
    
    return colors[index] || colors[colors.length - 1];
  };

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <StandardCardTitle icon={TrendingDown}>
            Funil de Leads
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex overflow-hidden p-2 -mt-5">
          {/* Layout centralizado com elementos mais próximos */}
          <div className="flex-1 flex items-start justify-center relative min-h-[770px] max-w-6xl mx-auto -mt-8">
            
            {/* Funil principal - centralizado */}
            <div className="w-[68%] h-full flex justify-center">
              <div ref={chartRef} className="w-full h-[770px] max-w-[500px]" />
            </div>
            
            {/* Labels muito próximos do funil */}
            <div className="w-[32%] h-full relative py-8 -ml-8">
              {funnelData.dataPoints.map((point, index) => {
                // Posicionamento manual ajustado para corresponder ao formato real do funil
                // Posições calibradas para alinhar com o centro de cada seção do funil (7 etapas)
                const positions = [8, 22, 36, 50, 64, 78, 92]; // Distribuição uniforme para 7 etapas
                const topPercent = positions[index] || (index * 14 + 8);
                
                // Calcular percentual
                const percentual = funnelData.metrics && funnelData.metrics.totalLeads > 0 
                  ? ((point.quantidade / funnelData.metrics.totalLeads) * 100).toFixed(1)
                  : '0.0';
                
                return (
                  <div 
                    key={point.label}
                    className="absolute transition-all duration-300 hover:scale-105"
                    style={{
                      top: `${topPercent}%`,
                      transform: 'translateY(-50%)',
                      left: '4px' // Muito próximo do funil
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
                            className="text-xl font-black"
                            style={{ color: getFunnelColor(point.originalKey, index) }}
                          >
                            {point.quantidade}
                          </span>
                          <span 
                            className="text-sm font-semibold opacity-90"
                            style={{ color: getFunnelColor(point.originalKey, index) }}
                          >
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
        </CardContent>
      </Card>
  );
};

