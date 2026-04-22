import { useMemo, useEffect, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown, Filter, Target } from 'lucide-react';
import { RANKING_BLUE_GRADIENT } from '@/utils/colors';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';

declare global {
  interface Window {
    CanvasJS: any;
  }
}

interface GeralFunnelAdvancedChartProps {
  leads: ProcessedLead[];
}

export const GeralFunnelAdvancedChart = ({ leads }: GeralFunnelAdvancedChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  const funnelData = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    // Definir etapas do funil de conversão
    const etapas = [
      { nome: 'Leads Captados', leads: [] },
      { nome: 'Em Atendimento', leads: [] },
      { nome: 'Em Interação', leads: [] },
      { nome: 'Visitas Agendadas', leads: [] },
      { nome: 'Em Negociação', leads: [] },
      { nome: 'Fechamentos', leads: [] }
    ];

    // Classificar leads por etapa
    leads.forEach(lead => {
      // 1. Todos os leads são captados
      etapas[0].leads.push(lead);

      // 2. Em atendimento (não são mais "sem contato")
      if (lead.etapa_atual !== 'Em Atendimento' && lead.etapa_atual.trim() !== '') {
        etapas[1].leads.push(lead);
      }

      // 3. Em interação (têm alguma atividade)
      if (lead.etapa_atual === 'Interação' || 
          lead.Conversa && lead.Conversa.trim() !== '' ||
          lead.etapa_atual === 'Contato Realizado') {
        etapas[2].leads.push(lead);
      }

      // 4. Visitas agendadas/realizadas
      if ((lead.Data_visita && lead.Data_visita.trim() !== "") || 
          lead.etapa_atual === 'Visita Agendada' ||
          lead.etapa_atual === 'Visita Realizada') {
        etapas[3].leads.push(lead);
      }

      // 5. Em negociação
      if (lead.etapa_atual === 'Em Negociação' || 
          lead.etapa_atual === 'Negociação' ||
          lead.etapa_atual === 'Proposta Enviada') {
        etapas[4].leads.push(lead);
      }

      // 6. Fechamentos
      if (lead.data_finalizacao && lead.data_finalizacao.trim() !== "") {
        etapas[5].leads.push(lead);
      }
    });

    // Calcular métricas para cada etapa
    const etapasComMetricas = etapas.map((etapa, index) => {
      const quantidade = etapa.leads.length;
      const percentualTotal = leads.length > 0 ? (quantidade / leads.length) * 100 : 0;
      const percentualAnterior = index > 0 && etapas[index - 1].leads.length > 0 ? 
        (quantidade / etapas[index - 1].leads.length) * 100 : 100;
      
      // Calcular valor médio dos imóveis nesta etapa
      const valorTotal = etapa.leads.reduce((sum, lead) => sum + (lead.valor_imovel || 0), 0);
      const valorMedio = quantidade > 0 ? valorTotal / quantidade : 0;
      
      // Calcular distribuição de temperatura
      const quentes = etapa.leads.filter(l => l.status_temperatura === 'Quente').length;
      const mornos = etapa.leads.filter(l => l.status_temperatura === 'Morno').length;
      const frios = etapa.leads.filter(l => l.status_temperatura === 'Frio').length;

      return {
        ...etapa,
        quantidade,
        percentualTotal,
        percentualAnterior,
        valorTotal,
        valorMedio,
        quentes,
        mornos,
        frios,
        taxaAquecimento: quantidade > 0 ? (quentes / quantidade) * 100 : 0
      };
    });

    // Usar paleta oficial de cores do OctoDash (mais fortes e saturadas)
    const cores = RANKING_BLUE_GRADIENT.slice(0, 6); // Usar 6 primeiras cores para 6 etapas

    // Dados para gráfico de funil
    const funnelChartData = etapasComMetricas.map((etapa, index) => ({
      label: etapa.nome,
      y: etapa.quantidade,
      color: cores[index],
      percentualTotal: etapa.percentualTotal,
      percentualAnterior: etapa.percentualAnterior,
      valorMedio: etapa.valorMedio,
      valorTotal: etapa.valorTotal,
      taxaAquecimento: etapa.taxaAquecimento,
      quentes: etapa.quentes,
      mornos: etapa.mornos,
      frios: etapa.frios
    }));

    // Calcular perdas entre etapas
    const perdas = [];
    for (let i = 1; i < etapasComMetricas.length; i++) {
      const anterior = etapasComMetricas[i - 1];
      const atual = etapasComMetricas[i];
      const perda = anterior.quantidade - atual.quantidade;
      const percentualPerda = anterior.quantidade > 0 ? (perda / anterior.quantidade) * 100 : 0;
      
      perdas.push({
        etapaAnterior: anterior.nome,
        etapaAtual: atual.nome,
        perda,
        percentualPerda,
        retencao: 100 - percentualPerda
      });
    }

    return {
      funnelChartData,
      etapasComMetricas,
      perdas,
      stats: {
        taxaConversaoGeral: leads.length > 0 ? 
          (etapasComMetricas[5].quantidade / leads.length) * 100 : 0,
        maiorPerda: perdas.reduce((max, p) => p.perda > max.perda ? p : max, perdas[0] || { perda: 0 }),
        menorRetencao: perdas.reduce((min, p) => p.retencao < min.retencao ? p : min, perdas[0] || { retencao: 100 })
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
      if (!chartRef.current || !window.CanvasJS || !funnelData) return;

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
                  🎯 ${data.label}
                </div>
                <div style="font-size: 12px;">
                  <div><strong>Quantidade:</strong> ${data.y} leads</div>
                  <div><strong>% do Total:</strong> ${data.percentualTotal.toFixed(1)}%</div>
                  <div><strong>% Etapa Anterior:</strong> ${data.percentualAnterior.toFixed(1)}%</div>
                  <hr style="border-color: #374151; margin: 6px 0;">
                  <div><strong>Valor Médio:</strong> R$ ${(data.valorMedio / 1000).toFixed(0)}K</div>
                  <div><strong>Valor Total:</strong> R$ ${(data.valorTotal / 1000000).toFixed(2)}M</div>
                  <hr style="border-color: #374151; margin: 6px 0;">
                  <div><strong>Distribuição:</strong></div>
                  <div>🔥 Quentes: ${data.quentes} (${data.taxaAquecimento.toFixed(1)}%)</div>
                  <div>🔶 Mornos: ${data.mornos}</div>
                  <div>🔵 Frios: ${data.frios}</div>
                </div>
              </div>
            `;
          }
        },
        data: [{
          type: "funnel",
          name: "Funil de Conversão",
          indexLabelFontSize: 15,
          indexLabelFontWeight: "700",
          indexLabelFontColor: "#ffffff",
          indexLabel: "{label}: {y}",
          dataPoints: funnelData.funnelChartData
        }],
        height: 400,
        animationEnabled: true,
        animationDuration: 1500
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
      }
    };
  }, [funnelData]);

  if (!funnelData || !leads || leads.length === 0) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <StandardCardTitle icon={TrendingDown}>
            Funil de Conversão
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingDown className="h-5 w-5 text-orange-400" />
            </div>
            <h4 className="text-lg font-semibold text-text-primary mb-2">Funil de Conversão</h4>
            <p className="text-sm text-text-secondary">Analisando etapas...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 leads-chart-container h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-text-primary text-lg neon-text flex items-center gap-2">
          <div className="w-2 h-2 bg-orange-400 rounded-full glow-accent-orange"></div>
          Funil de Conversão
          <TrendingDown className="h-5 w-5 text-orange-400 ml-2" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-4">
        {/* Stats superiores */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 bg-gradient-to-r from-orange-500/10 to-yellow-500/10 rounded-lg border border-orange-500/30">
            <div className="text-lg font-bold text-orange-400">
              {funnelData.stats.taxaConversaoGeral.toFixed(1)}%
            </div>
            <div className="text-xs text-text-secondary">Conversão Geral</div>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-red-500/10 to-pink-500/10 rounded-lg border border-red-500/30">
            <div className="text-lg font-bold text-red-400">
              {funnelData.stats.maiorPerda.perda}
            </div>
            <div className="text-xs text-text-secondary">Maior Perda</div>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/30">
            <div className="text-lg font-bold text-green-400">
              {funnelData.stats.menorRetencao.retencao.toFixed(1)}%
            </div>
            <div className="text-xs text-text-secondary">Menor Retenção</div>
          </div>
        </div>

        {/* Análise de perdas */}
        <div className="mb-4">
          <div className="text-sm font-semibold text-text-primary mb-2">📉 Principais Perdas:</div>
          <div className="space-y-1">
            {funnelData.perdas
              .sort((a, b) => b.perda - a.perda)
              .slice(0, 3)
              .map((perda, index) => {
                const icons = ['🥇', '🥈', '🥉'];
                return (
                  <div key={`${perda.etapaAnterior}-${perda.etapaAtual}`} className="flex justify-between items-center text-xs p-2 bg-bg-secondary/20 rounded-lg">
                    <span className="flex items-center gap-1">
                      <span>{icons[index]}</span>
                      <span className="text-text-primary">
                        {perda.etapaAnterior} → {perda.etapaAtual}
                      </span>
                    </span>
                    <div className="text-right">
                      <div className="text-red-400 font-bold">-{perda.perda}</div>
                      <div className="text-text-secondary">({perda.percentualPerda.toFixed(1)}%)</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Gráfico */}
        <div className="flex-1 flex items-center justify-center">
          <div ref={chartRef} className="w-full h-[320px]" />
        </div>

        {/* Resumo das etapas */}
        <div className="mt-4 pt-3 border-t border-bg-secondary/40">
          <div className="text-sm font-semibold text-text-primary mb-2">🔍 Resumo do Funil:</div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {funnelData.etapasComMetricas.map((etapa, index) => (
              <div key={etapa.nome} className="flex justify-between items-center">
                <span className="text-text-secondary">{etapa.nome}:</span>
                <span className="text-text-primary font-bold">
                  {etapa.quantidade} ({etapa.percentualTotal.toFixed(1)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
