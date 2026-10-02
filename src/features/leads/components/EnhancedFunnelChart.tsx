// Funil cliente interessado

import { useEffect, useRef, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { TrendingDown } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { ETAPAS_DO_FUNIL_DA_VISAO_GERAL, ETAPAS_DA_PROPOSTA } from '@/features/leads/utils/funnelStages';
import { carregarPassaramPorEtapa, type PassaramPorEtapa } from '@/features/leads/services/funilPassaramService';
import { contarVendasDoFunil } from '@/features/leads/services/funilVendasService';
import type { Atuacao } from '@/features/leads/services/funilDeSafraService';
import { useAuthContext } from '@/contexts/AuthContext';

interface EnhancedFunnelChartProps {
  leads: ProcessedLead[];
  /**
   * "Passaram" é contado no banco sobre a base INTEIRA. Com os leads
   * recortados (período, Lançamento/Pronto), ele dividiria pelo total
   * recortado — "Hoje" chegava a passar de 1000%. Falso = só o "agora".
   */
  contarPassaram?: boolean;
  /** O período da etapa Venda, pela data de cada venda. `null` = todas. */
  periodoDasVendas?: { de: string; ate: string } | null;
  atuacao?: Atuacao;
}

/**
 * O que se pergunta ao banco por cada etapa da tela. A "Proposta" junta três,
 * e o servidor conta o lead UMA vez — somar daria 8 na Lotus, para 5 leads.
 */
const chaveNoBanco = (etapa: string): string =>
  etapa === 'Proposta' ? ETAPAS_DA_PROPOSTA.join('+') : etapa;

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const EnhancedFunnelChart = ({
  leads, contarPassaram = true, periodoDasVendas = null, atuacao = 'todos',
}: EnhancedFunnelChartProps) => {
  /*
   * O SEGUNDO NÚMERO: quantos PASSARAM por cada etapa (24/09).
   *
   * Pedido do chefe: "não saber somente quantos temos naquele exato momento
   * naquela etapa, mas sim os que passaram (...) assim saberei exatamente qual
   * a taxa de conversão de cada etapa".
   *
   * Os dois convivem de propósito, e a decisão é de 24/09. Trocar um pelo
   * outro faria os números DESPENCAREM sem explicação — medido na Lotus:
   * "Interação" tem 1039 parados agora e 162 que passaram desde o início do
   * registro, em 10/09. A diferença não é perda: é história anterior ao
   * registro, e só a data ao lado deixa isso legível.
   */
  const [passaram, setPassaram] = useState<PassaramPorEtapa | null>(null);
  const [erroPassaram, setErroPassaram] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const { currentTheme } = useTheme();
  const { tenantId } = useAuthContext();

  /*
   * A VENDA não é etapa de lead (02/10): são as vendas da Conferência, cada
   * uma pela própria data. Nenhuma das 29 da Lotus aponta para lead, então não
   * dá para tirá-las dos leads da tela — vêm do banco, pelo período do filtro.
   */
  const vendas = useQuery({
    queryKey: ['funil-vendas', tenantId, periodoDasVendas?.de ?? null, periodoDasVendas?.ate ?? null, atuacao],
    queryFn: () => contarVendasDoFunil(tenantId!, periodoDasVendas, atuacao),
    enabled: !!tenantId && tenantId !== 'owner',
  });
  const quantasVendas = vendas.data ?? null;

  const funnelData = useMemo(() => {
    const safeLeads = leads || [];


    const etapasOrdem = ETAPAS_DO_FUNIL_DA_VISAO_GERAL;
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
        
        case 'Proposta':
          // Criada, Enviada e Assinada juntas (02/10): a assinada deixou de ser
          // o fim do funil — o fim agora é a Venda.
          return safeLeads.filter(l => {
            const etapaAtual = (l.etapa_atual || '').toLowerCase().trim();
            return etapaAtual === 'proposta enviada' || etapaAtual === 'proposta criada' || etapaAtual === 'propostas respondidas'
              || etapaAtual === 'proposta assinada' || etapaAtual === 'fechamento' || etapaAtual === 'finalizado';
          }).length;

        default:
          return 0;
      }
    };

    // Criar dataPoints com tamanhos HARMÔNICOS E ESTÁTICOS - SEMPRE OS MESMOS TAMANHOS
    const dataPoints = etapasOrdem.map((etapa, index) => {
      // `null` = a contagem de vendas ainda não chegou, ou falhou. Nunca 0.
      const quantidade: number | null = etapa === 'Venda' ? quantasVendas : calcularEtapa(etapa);
      
      // 🎨 Valores FIXOS harmônicos REDUZIDOS - proporção golden ratio para visual perfeito
      // Cada etapa diminui suavemente mantendo a harmonia visual SEMPRE
      // De 100 a 28, repartido pelo número de etapas. Era uma lista de 7
      // valores: a oitava etapa cairia no fallback e quebraria o degradê.
      const ultima = Math.max(1, etapasOrdem.length - 1);
      const valorVisualFixo = 100 - (index * (72 / ultima));
      
      return {
        y: valorVisualFixo, // Valor SEMPRE FIXO para manter consistência visual
        label: etapa,
        originalKey: etapa,
        quantidade: quantidade,
        index: index,
        percentual: totalLeads > 0 && quantidade !== null ? ((quantidade / totalLeads) * 100) : 0
      };
    });

    return { dataPoints, metrics: { totalLeads } };
  }, [leads, quantasVendas]);

  /*
   * Quem manda nas etapas é a lista DESENHADA, e não uma cópia da lista aqui:
   * um número ao lado de uma etapa que o funil não mostra seria pior que
   * nenhum número. String, e não array, porque array novo a cada render
   * reentraria no efeito para sempre. A Venda fica de fora: ela não é etapa
   * de lead, e "passaram" não existe para ela.
   */
  const etapasDoFunil = funnelData.dataPoints
    .filter((p) => p.originalKey !== 'Venda')
    .map((p) => chaveNoBanco(p.originalKey))
    .join('|');

  useEffect(() => {
    let cancelado = false;
    if (!contarPassaram) { setPassaram(null); setErroPassaram(null); return; }

    carregarPassaramPorEtapa(etapasDoFunil.split('|'), undefined, tenantId)
      .then((r) => { if (!cancelado) { setPassaram(r); setErroPassaram(null); } })
      .catch((e: Error) => {
        // Erro NÃO vira zero. "0 passaram" é indistinguível de "ninguém
        // passou", e as duas frases levam a decisões opostas.
        if (!cancelado) { setPassaram(null); setErroPassaram(e.message); }
      });

    return () => { cancelado = true; };
  }, [etapasDoFunil, tenantId, contarPassaram]);

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
            quantidade: point.quantidade ?? '…',
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

    // O redesenho espera a transição da sidebar (300 ms). Guardado para a
    // limpeza cancelar: sem isso, ele disparava DEPOIS de sair da tela, num
    // gráfico já destruído, e o CanvasJS quebrava ("reading 'style'").
    let redesenho: ReturnType<typeof setTimeout> | undefined;
    const handleResize = () => {
      if (!chartInstance.current) return;
      clearTimeout(redesenho);
      redesenho = setTimeout(() => {
        chartInstance.current?.render();
      }, 350);
    };

    window.addEventListener('resize', handleResize);
    
    // Observar mudanças no tamanho do container
    const resizeObserver = new ResizeObserver(handleResize);
    if (chartRef.current) {
      resizeObserver.observe(chartRef.current);
    }

    return () => {
      clearTimeout(redesenho);
      chartInstance.current?.destroy();
      chartInstance.current = null;
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

  /**
   * O percentual de um número sobre o total de leads — o denominador dos DOIS
   * números da etapa, de propósito.
   *
   * "Do total desta métrica", como o chefe escreveu. Usar "quantos entraram no
   * funil" seria o ideal e não é possível: o registro de eventos começou em
   * 12/09, então a entrada da maioria dos leads nunca foi gravada, e Interação
   * daria 247% na Lotus.
   */
  const pctDoTotal = (n: number): string => {
    const total = funnelData.metrics?.totalLeads ?? 0;
    return total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';
  };

  /** `null` = ainda não chegou, ou falhou. Nunca 0 por omissão. */
  const passaramNaEtapa = (etapa: string): number | null => {
    if (!passaram) return null;
    const i = passaram.etapas.indexOf(chaveNoBanco(etapa));
    return i < 0 ? null : passaram.passaram[i] ?? null;
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
              <div ref={chartRef} className="w-full h-[770px] max-w-[500px] mt-10" />
            </div>
            
            {/* Labels muito próximos do funil */}
            <div className="w-[32%] h-full relative py-8 -ml-8">
              {funnelData.dataPoints.map((point, index) => {
                // Posicionamento manual ajustado para corresponder ao formato real do funil
                // Posições calibradas para alinhar com o centro de cada seção do funil (7 etapas)
                // De 8% a 92%, repartido pelo número de etapas. Com a lista
                // fixa de 7, a oitava caía no fallback `index * 14 + 8` = 106%,
                // fora da tela.
                const ultimaEtapa = Math.max(1, funnelData.dataPoints.length - 1);
                const topPercent = 8 + index * (84 / ultimaEtapa);
                
                const percentual = point.percentual.toFixed(1);
                const cor = getFunnelColor(point.originalKey, index);
                const quantosPassaram = passaramNaEtapa(point.originalKey);
                
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
                        {/*
                          O QUE PASSOU EM CIMA, O QUE ESTÁ AGORA EMBAIXO —
                          pedido do chefe em 24/09.

                          O destaque é "quantos passaram por esta etapa": é o
                          número que NÃO cai quando o lead avança, e é dele que
                          sai a taxa de conversão. O "agora" é a fotografia do
                          instante, e vira a linha de baixo.

                          O DENOMINADOR DOS DOIS É O TOTAL DE LEADS, e isso é
                          decisão, não detalhe. O exemplo que ele mandou usa
                          "quantos entraram" como base — o que, com o registro
                          de eventos começando em 12/09, daria 247% em Interação
                          na Lotus: 163 leads passaram por lá, mas só 66 tiveram
                          a ENTRADA registrada. Sobre o total dá 9,5%: baixo, e
                          verdadeiro.

                          A VENDA não tem nenhum dos dois: não é etapa de lead.
                          É quantas vendas a Conferência tem no período.
                        */}
                        {point.originalKey === 'Venda' ? (
                          <div title="Vendas da Conferência de vendas, cada uma pela data da venda, no período do filtro">
                            <div className="flex items-baseline gap-1.5 mt-1">
                              <span className="text-xl font-black" style={{ color: cor }}>
                                {vendas.isError ? '—' : point.quantidade ?? '…'}
                              </span>
                              <span className="text-[11px] font-semibold opacity-60" style={{ color: cor }}>
                                {point.quantidade === 1 ? 'venda' : 'vendas'}
                              </span>
                            </div>
                            <div className="text-[13px] font-semibold whitespace-nowrap opacity-75" style={{ color: cor }}>
                              {vendas.isError ? 'Não deu para contar as vendas' : 'da Conferência de vendas'}
                            </div>
                          </div>
                        ) : (<>
                        <div className="flex items-baseline gap-1.5 mt-1">
                          <span
                            className="text-xl font-black"
                            style={{ color: getFunnelColor(point.originalKey, index) }}
                          >
                            {quantosPassaram ?? point.quantidade}
                          </span>
                          <span
                            className="text-sm font-semibold opacity-90"
                            style={{ color: getFunnelColor(point.originalKey, index) }}
                          >
                            ({quantosPassaram !== null ? pctDoTotal(quantosPassaram) : percentual}%)
                          </span>
                          {quantosPassaram !== null && (
                            <span
                              className="text-[11px] font-semibold opacity-60"
                              style={{ color: getFunnelColor(point.originalKey, index) }}
                            >
                              passaram
                            </span>
                          )}
                        </div>
                        {/* Linha própria: a coluna tem 32% da largura, e em
                            uma linha só o segundo número era cortado. */}
                        {quantosPassaram !== null && (
                          <div
                            className="text-[13px] font-semibold whitespace-nowrap opacity-75"
                            style={{ color: getFunnelColor(point.originalKey, index) }}
                            title="Quantos leads estão nesta etapa neste momento"
                          >
                            {point.quantidade} ({percentual}%) agora
                          </div>
                        )}
                        </>)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/*
                * A data NÃO é decoração: o registro de eventos começou em
                * 10/09/2026, e sem ela "13 passaram" ao lado de "331 agora"
                * parece erro do sistema em vez de histórico curto.
                */}
              {!contarPassaram ? (
                <div className="absolute left-1 bottom-0 max-w-[230px] text-[11px] leading-tight text-text-secondary/70">
                  Com filtro, o funil mostra quem está em cada etapa agora. "Passaram" só sai sem filtro: ele conta a base inteira.
                </div>
              ) : erroPassaram ? (
                <div className="absolute left-1 bottom-0 max-w-[230px] text-[11px] leading-tight text-red-400/80">
                  Não deu para contar quem passou por cada etapa: {erroPassaram}
                </div>
              ) : passaram?.inicioDoHistorico ? (
                <div className="absolute left-1 bottom-0 max-w-[230px] text-[11px] leading-tight text-text-secondary/70">
                  "Passaram" conta desde {new Date(passaram.inicioDoHistorico).toLocaleDateString('pt-BR')}

                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
  );
};

