import { useEffect, useRef, useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { TrendingDown, Users, Target, CheckCircle } from 'lucide-react';

interface FunnelChartProps {
  leads: ProcessedLead[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const FunnelChart = ({ leads }: FunnelChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);

  // Calcular dados do funil com etapas específicas e tamanhos harmônicos FIXOS
  const funnelData = useMemo(() => {
    // Definir as etapas do funil na ordem específica (de cima para baixo)
    const etapasOrdem = [
      'Em Atendimento',
      'Interação',
      'Visita Agendada', 
      'Proposta Enviada',
      'Fechamento'
    ];

    const safeLeads = leads || [];
    const totalLeads = safeLeads.length;
    
    // Calcular quantidade real para cada etapa baseada nos dados do Supabase
    const calcularEtapa = (etapa: string): number => {
      switch (etapa) {
        case 'Em Atendimento':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Em Atendimento'
          ).length;
        
        case 'Interação':
          return safeLeads.filter(l => l.etapa_atual === 'Interação').length;
        
        case 'Visita Agendada':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Visita Agendada' || 
            (l.Data_visita && l.Data_visita.trim() !== '')
          ).length;
        
        case 'Proposta Enviada':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Proposta Enviada' ||
            l.etapa_atual === 'Negociação' ||
            l.etapa_atual === 'Em Negociação'
          ).length;
        
        case 'Fechamento':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Fechamento' ||
            l.etapa_atual === 'Fechado' ||
            l.etapa_atual === 'Finalizado' ||
            (l.data_finalizacao && l.data_finalizacao.trim() !== '') ||
            (l.valor_final_venda && l.valor_final_venda > 0)
          ).length;
        
        default:
          return 0;
      }
    };

    // Criar dataPoints com tamanhos HARMÔNICOS E PROPORCIONAIS FIXOS
    const dataPoints = etapasOrdem.map((etapa, index) => {
      const quantidade = calcularEtapa(etapa);
      
      // 🎨 Valores fixos harmônicos - proporção golden ratio para visual perfeito
      // Cada etapa diminui suavemente mantendo a harmonia visual
      const valoresFixos = [120, 100, 82, 66, 52]; // Proporção harmônica: ~83% redução por etapa
      const valorFixo = valoresFixos[index];
      
      return {
        y: valorFixo, // Valor SEMPRE FIXO para manter consistência visual
        label: etapa,
        originalKey: etapa,
        description: `${quantidade} leads em ${etapa}`,
        quantidade: quantidade, // Quantidade real para tooltip
        index: index,
        percentual: totalLeads > 0 ? ((quantidade / totalLeads) * 100) : 0
      };
    });

    // Métricas reais calculadas
    const emAtendimento = calcularEtapa('Em Atendimento');
    const interacao = calcularEtapa('Interação');
    const visitasAgendadas = calcularEtapa('Visita Agendada');
    const propostasEnviadas = calcularEtapa('Proposta Enviada');
    const fechamentos = calcularEtapa('Fechamento');
    
    const metrics = {
      totalLeads,
      emAtendimento,
      interacao,
      visitasAgendadas,
      propostasEnviadas,
      fechamentos,
      taxaConversaoGeral: totalLeads > 0 ? (fechamentos / totalLeads * 100) : 0,
      taxaAgendamento: interacao > 0 ? (visitasAgendadas / interacao * 100) : 0,
      taxaFechamento: propostasEnviadas > 0 ? (fechamentos / propostasEnviadas * 100) : 0
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
        title: {
          text: "",
          fontColor: "#ffffff"
        },
        data: [{
          type: "funnel",
          indexLabel: "{label}",
          indexLabelFontColor: "#ffffff",
          indexLabelFontSize: 12,
          indexLabelFontWeight: "600",
          indexLabelPlacement: "outside",
          indexLabelWrap: false,
          neckHeight: 15, // Aumentado para maior harmonia
          neckWidth: 25,  // Aumentado para melhor proporção
          valueRepresents: "area",
          reversed: false, // Garantir ordem correta (maior para menor)
          toolTipContent: `
            <div style="background: rgba(17, 24, 39, 0.96); color: white; padding: 16px; border-radius: 12px; border: 1px solid rgba(139, 92, 246, 0.4); max-width: 300px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);">
              <strong style="color: #8b5cf6; font-size: 16px; display: block; margin-bottom: 8px;">📈 {label}</strong>
              <div style="color: #e5e7eb; font-size: 14px; margin-bottom: 10px;">
                <span style="color: #10b981; font-weight: bold; font-size: 18px;">{quantidade}</span> leads nesta etapa
              </div>
              <div style="background: rgba(139, 92, 246, 0.15); padding: 8px 10px; border-radius: 8px; border-left: 3px solid #8b5cf6;">
                <span style="color: #c4b5fd; font-size: 13px;">📊 {percentual}% do total de leads</span>
              </div>
              <div style="margin-top: 8px; color: #9ca3af; font-size: 11px;">
                Etapa do funil de conversão
              </div>
            </div>
          `,
          dataPoints: funnelData.dataPoints.map(point => ({
            y: point.y, // Valor HARMÔNICO FIXO - nunca muda
            label: point.label,
            quantidade: point.quantidade,
            description: point.description,
            percentual: point.percentual.toFixed(1),
            color: getFunnelColor(point.originalKey, point.index)
          }))
        }, {
          type: "funnel",
          showInLegend: false,
          indexLabel: "{internalLabel}",
          indexLabelFontColor: "#ffffff",
          indexLabelFontSize: 16,
          indexLabelFontWeight: "700",
          indexLabelPlacement: "inside",
          indexLabelWrap: false,
          neckHeight: 15,
          neckWidth: 25,
          valueRepresents: "area",
          reversed: false,
          toolTipContent: "", // Sem tooltip para evitar duplicação
          dataPoints: funnelData.dataPoints.map(point => ({
            y: point.y,
            internalLabel: `${point.quantidade} (${point.percentual.toFixed(1)}%)`,
            color: "rgba(255,255,255,0.001)" // Quase transparente mas visível para o CanvasJS
          }))
        }],
        height: 680, // Altura maximizada para visualização completa
        animationEnabled: true,
        animationDuration: 1200,
        interactivityEnabled: true
      });

      chart.render();
      chartInstance.current = chart;
    };

    loadCanvasJS();

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [funnelData.dataPoints]);

  const getFunnelColor = (etapa: string, index: number): string => {
    // 🎨 DEGRADÊ LARANJA → VERMELHO #DC2626 nas etapas finais
    const colorMap: Record<string, string> = {
      'Em Atendimento': '#2563EB',   // 1. AZUL forte
      'Qualificação': '#1D4ED8',     // 2. AZUL médio forte
      'Interação': '#1E3A8A',        // 3. AZUL escuro
      'Apresentação': '#10B981',     // 4. VERDE intenso
      'Proposta Enviada': '#059669', // 5. VERDE forte
      'Negociação': '#047857',       // 6. VERDE escuro
      'Fechamento': '#FB923C',       // 7. LARANJA claro (início degradê)
      'Negócio Fechado': '#F97316',  // 8. LARANJA médio avermelhado
      'Visita Agendada': '#10B981',  // VERDE intenso
      'Finalizado': '#DC2626'        // 9. VERMELHO #DC2626 (tom do funil)
    };
    
    return colorMap[etapa] || `hsl(${200 + index * 25}, 75%, 65%)`;
  };

  return (
    <div className="space-y-8 px-4">

      {/* Gráfico do funil */}
      <div className="max-w-5xl mx-auto">
        <Card className="bg-bg-card/40 card-neon">
          <CardHeader>
            <StandardCardTitle icon={TrendingDown}>
              Funil de Leads
            </StandardCardTitle>
          </CardHeader>
          <CardContent>
            <div ref={chartRef} className="w-full h-[420px]"></div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
};

