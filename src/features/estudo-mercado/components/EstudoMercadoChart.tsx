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
import { FileText, TrendingUp } from 'lucide-react';
import { RANKING_BLUE_GRADIENT } from '@/utils/colors';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface EstudoMercadoChartProps {
  leads: ProcessedLead[];
}

export const EstudoMercadoChart = ({ leads }: EstudoMercadoChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const [isChartReady, setIsChartReady] = useState(false);
  
  const estudosData = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    // Filtrar apenas leads de proprietários (tipo_lead = Vendedor ou Proprietário)
    const leadsProprietarios = leads.filter(lead => {
      const tipoLead = lead.tipo_lead?.toLowerCase() || '';
      return tipoLead.includes('vendedor') || tipoLead.includes('proprietário') || tipoLead.includes('proprietario');
    });

    // Simular dados de estudos de mercado baseado nas etapas e status dos leads
    // Criados = todos os leads de proprietários
    const criados = leadsProprietarios.length;

    // Apresentados = leads que chegaram na etapa "Interação" ou além
    const apresentados = leadsProprietarios.filter(lead => {
      const etapa = lead.etapa_atual?.toLowerCase() || '';
      return etapa !== 'em atendimento';
    }).length;

    // Assinados = leads que chegaram em "Negociação" ou "Fechamento"
    const assinados = leadsProprietarios.filter(lead => {
      const etapa = lead.etapa_atual?.toLowerCase() || '';
      return etapa.includes('negociação') || etapa.includes('negociacao') || etapa.includes('fechamento');
    }).length;

    // Vendidos = leads finalizados com sucesso
    const vendidos = leadsProprietarios.filter(lead => {
      const etapa = lead.etapa_atual?.toLowerCase() || '';
      return etapa.includes('fechamento') || lead.valor_final_venda;
    }).length;

    // Suspensos = leads arquivados ou inativos
    const suspensos = leadsProprietarios.filter(lead => {
      const arquivamento = lead.Arquivamento?.toLowerCase() || '';
      return arquivamento === 'sim' || arquivamento === 'arquivado';
    }).length;

    // Calcular percentuais relativos ao total de criados
    const percentApresentados = criados > 0 ? (apresentados / criados) * 100 : 0;
    const percentAssinados = criados > 0 ? (assinados / criados) * 100 : 0;
    const percentVendidos = criados > 0 ? (vendidos / criados) * 100 : 0;

    // Preparar dados para gráfico de funil vertical (pyramid)
    // Paleta Oficial OctoDash: Gradiente de Azul (claro → escuro)
    const funnelData = [
      {
        label: 'Criados',
        valor: criados,
        percentual: 100,
        color: RANKING_BLUE_GRADIENT[10], // Azul Celeste (topo - mais claro)
        icon: '📝'
      },
      {
        label: 'Apresentados',
        valor: apresentados,
        percentual: percentApresentados,
        color: RANKING_BLUE_GRADIENT[6], // Azul Médio-Escuro
        icon: '👥'
      },
      {
        label: 'Assinados',
        valor: assinados,
        percentual: percentAssinados,
        color: RANKING_BLUE_GRADIENT[3], // Azul Royal
        icon: '✍️'
      },
      {
        label: 'Vendidos',
        valor: vendidos,
        percentual: percentVendidos,
        color: RANKING_BLUE_GRADIENT[0], // Azul Marinho Escuro (base - mais escuro)
        icon: '✅'
      }
    ];

    return {
      criados,
      apresentados,
      percentApresentados,
      assinados,
      percentAssinados,
      vendidos,
      percentVendidos,
      suspensos,
      funnelData
    };
  }, [leads]);

  // Inicializar gráfico CanvasJS - FUNIL VERTICAL tipo Pyramid
  const initializeChart = useCallback(() => {
    if (!chartRef.current || !window.CanvasJS || !estudosData) return;

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
      animationDuration: 1200,
      height: 400,
      toolTip: {
        backgroundColor: "rgba(17, 24, 39, 0.98)",
        fontColor: "#ffffff",
        borderColor: "#1e4d8b",
        borderThickness: 2,
        cornerRadius: 8,
        fontFamily: "Inter, sans-serif",
        fontSize: 14,
        contentFormatter: function (e: any) {
          const data = e.entries[0].dataPoint;
          return `
            <div style="padding: 14px; font-family: Inter, sans-serif;">
              <div style="font-weight: 800; font-size: 16px; color: ${data.color}; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 24px;">${data.icon}</span>
                <span>${data.label}</span>
              </div>
              <div style="font-size: 14px; line-height: 1.8; color: #e5e7eb;">
                <div style="display: flex; justify-content: space-between; gap: 20px; margin-bottom: 6px;">
                  <span style="color: #d1d5db;">Quantidade:</span>
                  <strong style="color: ${data.color}; font-size: 18px;">${data.y}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 20px; padding-top: 8px; border-top: 1px solid #374151;">
                  <span style="color: #d1d5db;">Conversão:</span>
                  <strong style="color: ${data.color}; font-size: 16px;">${data.percentual.toFixed(1)}%</strong>
                </div>
              </div>
            </div>
          `;
        }
      },
      data: [{
        type: "pyramid",
        valueRepresents: "area",
        indexLabel: "{label}: {y} ({percentual}%)",
        indexLabelFontColor: "#ffffff",
        indexLabelFontSize: 13,
        indexLabelFontWeight: "700",
        indexLabelFontFamily: "Inter, sans-serif",
        indexLabelPlacement: "inside",
        neckHeight: 15, // Altura do pescoço para evitar sobreposição
        neckWidth: 35, // Largura do pescoço
        reversed: false,
        exploded: true, // Separar ligeiramente as seções
        dataPoints: estudosData.funnelData.map(item => ({
          label: item.label,
          y: item.valor || 1, // Mínimo de 1 para evitar erro
          color: item.color,
          percentual: item.percentual,
          icon: item.icon
        }))
      }]
    });

    chart.render();
    chartInstance.current = chart;

    // Remover marcas d'água
    requestAnimationFrame(() => {
      const container = chartRef.current;
      if (container) {
        const creditLinks = container.querySelectorAll('a[href*="canvasjs"]');
        creditLinks.forEach(link => link.remove());
      }
    });
  }, [estudosData]);

  useEffect(() => {
    if (window.CanvasJS) {
      initializeChart();
      return;
    }

    const existingScript = document.querySelector('script[src*="canvasjs"]');
    if (existingScript) {
      existingScript.addEventListener('load', initializeChart);
      return () => {
        existingScript.removeEventListener('load', initializeChart);
      };
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
    script.async = true;
    script.onload = initializeChart;
    script.onerror = () => {
      console.warn('⚠️ Falha ao carregar CanvasJS');
      setIsChartReady(true);
    };
    document.head.appendChild(script);

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [initializeChart]);

  if (!estudosData) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full">
        <CardHeader className="pb-3">
          <StandardCardTitle icon={FileText}>
            Estudo de Mercado
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[600px]">
          <p className="text-text-secondary">Nenhum dado disponível</p>
        </CardContent>
      </Card>
    );
  }

  const metricas = [
    {
      label: 'CRIADOS',
      valor: estudosData.criados,
      percentual: '100%',
      descricao: 'TOTAL',
      color: '#4a7ab0', // Azul Médio Escuro (topo - menor valor)
      icon: '📝'
    },
    {
      label: 'APRESENTADOS',
      valor: estudosData.apresentados,
      percentual: `${estudosData.percentApresentados.toFixed(1)}%`,
      descricao: 'TOTAL',
      color: '#385f92', // Azul médio
      icon: '👥'
    },
    {
      label: 'ASSINADOS',
      valor: estudosData.assinados,
      percentual: `${estudosData.percentAssinados.toFixed(1)}%`,
      descricao: 'TOTAL',
      color: '#264474', // Azul escuro
      icon: '✍️'
    },
    {
      label: 'VENDIDOS',
      valor: estudosData.vendidos,
      percentual: `${estudosData.percentVendidos.toFixed(1)}%`,
      descricao: 'CONVERSÃO',
      color: '#2d5f9f', // Azul Intenso (base - maior valor)
      icon: '✅'
    }
  ];

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full flex flex-col">
      <CardHeader className="pb-4 flex-shrink-0">
        <CardTitle className="text-text-primary text-xl neon-text flex items-center gap-2">
          <FileText className="h-6 w-6 text-purple-400" />
          Estudo de Mercado
          <TrendingUp className="h-5 w-5 text-green-400 ml-auto" />
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col overflow-hidden p-4">
        
        {/* Cards de Métricas Resumidas - Linha Superior com Suspensos */}
        <div className="grid grid-cols-5 gap-3 mb-4 animate-in fade-in duration-300">
          {metricas.map((metrica) => (
            <div 
              key={metrica.label}
              className="text-center p-3 rounded-lg border transition-all duration-200 hover:scale-105"
              style={{ 
                backgroundColor: `${metrica.color}10`,
                borderColor: `${metrica.color}30`
              }}
            >
              <div className="text-3xl mb-1">{metrica.icon}</div>
              <div className="text-3xl font-bold mb-1" style={{ color: metrica.color }}>
                {metrica.valor}
              </div>
              <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
                {metrica.label}
              </div>
              {metrica.percentual && (
                <div className="text-sm font-bold" style={{ color: metrica.color }}>
                  {metrica.percentual}
                </div>
              )}
            </div>
          ))}
          {/* Card de Suspensos integrado */}
          <div 
            className="text-center p-3 rounded-lg border transition-all duration-200 hover:scale-105"
            style={{ 
              backgroundColor: '#1e4d8b10',
              borderColor: '#1e4d8b30'
            }}
          >
            <div className="text-3xl mb-1">⏸️</div>
            <div className="text-3xl font-bold mb-1" style={{ color: '#1e4d8b' }}>
              {estudosData.suspensos}
            </div>
            <div className="text-xs text-text-secondary uppercase tracking-wider mb-1">
              SUSPENSOS
            </div>
          </div>
        </div>

        {/* Gráfico de Funil Vertical - Pyramid Chart */}
        <div className="bg-gradient-to-b from-bg-secondary/5 to-bg-secondary/10 rounded-lg p-4 border border-bg-secondary/40 flex-1 relative">
          {!isChartReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-secondary/10 rounded-lg backdrop-blur-sm">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-transparent border-t-purple-500 border-r-blue-500 rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-xs text-text-secondary">Renderizando gráfico...</p>
              </div>
            </div>
          )}
          <div ref={chartRef} className={`w-full h-full transition-opacity duration-300 ${isChartReady ? 'opacity-100' : 'opacity-0'}`} />
        </div>

      </CardContent>
    </Card>
  );
};

