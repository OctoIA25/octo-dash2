import { useEffect, useRef, useMemo, useState } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { MapPin, TrendingUp } from 'lucide-react';
import { assignColorsByValue } from '@/utils/colors';

interface BairrosChartProps {
  leads: ProcessedLead[];
}

declare global {
  interface Window {
    CanvasJS: any;
  }
}

export const BairrosChart = ({ leads }: BairrosChartProps) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const [tipoNegocio, setTipoNegocio] = useState<'todos' | 'venda' | 'locacao'>('todos');

  // Extrair bairros das preferências, observações e conversas dos leads
  const bairrosData = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    // Filtrar leads baseado no tipo de negócio selecionado
    const leadsFiltrados = leads.filter(lead => {
      if (tipoNegocio === 'todos') return true;
      
      const tipo = (lead.tipo_negocio || '').toLowerCase();
      const leadType = (lead.tipo_lead || '').toLowerCase();
      
      if (tipoNegocio === 'venda') {
        return tipo.includes('venda') || tipo.includes('compra') || 
               leadType.includes('vendedor') || leadType.includes('comprador') ||
               leadType.includes('proprietário');
      }
      
      if (tipoNegocio === 'locacao') {
        return tipo.includes('locação') || tipo.includes('locacao') || 
               leadType.includes('locatário') || leadType.includes('inquilino');
      }
      
      return true;
    });

    if (leadsFiltrados.length === 0) return null;

    const bairrosMap = new Map<string, number>();
    
    // Lista expandida de bairros para identificação
    const bairrosConhecidos = [
      'moema', 'vila madalena', 'pinheiros', 'itaim', 'itaim bibi', 'jardins',
      'perdizes', 'higienópolis', 'tatuapé', 'santana', 'ipiranga', 'mooca',
      'penha', 'vila mariana', 'butantã', 'lapa', 'saúde', 'cursino',
      'jabaquara', 'campo belo', 'brooklin', 'morumbi', 'vila olimpia',
      'vila olímpia', 'berrini', 'chácara santo antonio', 'chacara santo antonio',
      'alphaville', 'granja viana', 'vila andrade', 'panamby', 'real parque',
      'cidade jardim', 'santo amaro', 'socorro', 'interlagos', 'grajaú',
      'campo limpo', 'capão redondo', 'jardim angela', 'vila sônia', 'são paulo',
      'zona sul', 'zona norte', 'zona leste', 'zona oeste', 'centro'
    ];

    leadsFiltrados.forEach(lead => {
      const textoCompleto = [
        lead.Preferencias_lead || '',
        lead.observacoes || '',
        lead.Conversa || ''
      ].join(' ').toLowerCase();

      bairrosConhecidos.forEach(bairro => {
        if (textoCompleto.includes(bairro)) {
          const bairroNormalizado = bairro
            .split(' ')
            .map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1))
            .join(' ');
          
          bairrosMap.set(bairroNormalizado, (bairrosMap.get(bairroNormalizado) || 0) + 1);
        }
      });
    });

    const bairrosArray = Array.from(bairrosMap.entries())
      .map(([bairro, count]) => ({ label: bairro, y: count }))
      .sort((a, b) => b.y - a.y)
      .slice(0, 10);

    if (bairrosArray.length === 0) return null;

    const totalLeads = bairrosArray.reduce((sum, b) => sum + b.y, 0);
    const topBairro = bairrosArray[0];

    return {
      dataPoints: bairrosArray,
      totalLeads,
      topBairro,
      totalBairros: bairrosArray.length
    };
  }, [leads, tipoNegocio]);

  useEffect(() => {
    if (!bairrosData || !chartRef.current) return;

    const loadCanvasJS = () => {
      if (window.CanvasJS) {
        createChart();
      } else {
        const script = document.createElement('script');
        script.src = 'https://cdn.canvasjs.com/canvasjs.min.js';
        script.onload = createChart;
        script.onerror = () => console.error('❌ Erro ao carregar CanvasJS');
        document.head.appendChild(script);
      }
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
          animationDuration: 1500,
          theme: "dark2",
          backgroundColor: "transparent",
          creditText: "",
          creditHref: null,
          
          title: {
            text: "",
          },
          
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
              const percentage = ((point.y / bairrosData.totalLeads) * 100).toFixed(1);
              return `
                <div style="padding: 12px; font-family: Inter, sans-serif;">
                  <div style="color: ${point.color}; font-weight: 600; font-size: 16px; margin-bottom: 8px;">
                    📍 ${point.label}
                  </div>
                  <div style="color: #ffffff; font-weight: 600; font-size: 20px;">
                    ${point.y} leads (${percentage}%)
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
            // 🎨 NOVO GRADIENTE AZUL: Quanto MAIOR o valor, MAIS ESCURO o tom
            dataPoints: bairrosData.dataPoints.map(item => {
              // Encontrar o maior valor para calcular a proporção da cor
              const maxValue = bairrosData.dataPoints[0].y;
              const minValue = bairrosData.dataPoints[bairrosData.dataPoints.length - 1].y;
              
              const gradienteAzul = [
                '#8ec8f2',   // Azul Muito Claro - valores MENORES
                '#6391c5',   // Azul Médio-Claro
                '#2a4a8d',   // Azul Médio-Escuro
                '#1a233b'    // Azul Muito Escuro - valores MAIORES
              ];
              
              // Calcular índice da cor baseado no valor (normalizado entre min e max)
              // Usar range para evitar divisão por zero se todos forem iguais
              const range = maxValue - minValue || 1;
              const normalizedValue = (item.y - minValue) / range;
              
              // Mapear para o índice do array de cores (0 a 3)
              const colorIndex = Math.floor(normalizedValue * (gradienteAzul.length - 1));
              
              return {
                ...item,
                color: gradienteAzul[colorIndex] || gradienteAzul[0]
              };
            })
          }]
        });

        chart.render();
        chartInstance.current = chart;

        // Remover marca d'água
        setTimeout(() => {
          const container = chartRef.current;
          if (container) {
            const creditLinks = container.querySelectorAll('a[href*="canvasjs"]');
            creditLinks.forEach(link => link.remove());
          }
        }, 100);

      } catch (error) {
        console.error('❌ Erro ao criar gráfico de bairros:', error);
      }
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
  }, [bairrosData]);

  if (!bairrosData) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl h-full">
        <CardHeader>
          <StandardCardTitle icon={MapPin}>
            Bairros Mais Procurados
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center text-text-secondary">
            <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Analisando preferências dos leads...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full overflow-hidden transition-all duration-300 ease-in-out">
      <CardHeader className="pb-2">
        <StandardCardTitle icon={MapPin}>
          Bairros Mais Procurados
        </StandardCardTitle>
      </CardHeader>
      
      <CardContent className="p-4 h-[calc(100%-4.5rem)] overflow-hidden flex flex-col">
        {/* Métricas Superiores - Layout Responsivo */}
        <div className="mb-4 pb-4 border-b border-bg-secondary/30 space-y-3 flex-shrink-0">
          {/* Linha 1: Números principais */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                {bairrosData.totalLeads}
              </span>
              <span className="text-xs text-gray-400 font-medium">leads</span>
            </div>
            <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-600 to-transparent" />
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-blue-400">{bairrosData.totalBairros}</span>
              <span className="text-xs text-gray-400 font-medium">bairros</span>
            </div>
          </div>
          
          {/* Linha 2: Destaque com espaço completo - SEM TRUNCATE */}
          <div className="text-center w-full overflow-hidden">
            <div className="text-xs text-gray-400 mb-1">🏆 Mais procurado</div>
            <div className="text-base font-bold text-green-400 leading-snug truncate px-2">
              {bairrosData.topBairro.label}
            </div>
          </div>
        </div>

        {/* Botões de Alternância */}
        <div className="flex justify-center mb-3 flex-shrink-0">
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

        {/* Gráfico CanvasJS */}
        <div className="flex-1 overflow-hidden relative min-h-0">
          <div ref={chartRef} className="w-full h-full transition-all duration-300 ease-in-out" />
        </div>

        {/* Rodapé com info */}
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-400">
          <TrendingUp className="h-3 w-3 text-green-400" />
          <span>Baseado em preferências dos leads</span>
        </div>
      </CardContent>
    </Card>
  );
};