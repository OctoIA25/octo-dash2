import { useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { Target, TrendingUp } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// Registrar componentes do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface Candidato {
  id: number;
  status: string;
}

interface RecrutamentoPerformanceChartProps {
  candidatos: Candidato[];
}

export const RecrutamentoPerformanceChart = ({ candidatos }: RecrutamentoPerformanceChartProps) => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<ChartJS | null>(null);

  // Calcular dados do gráfico - 4 etapas de recrutamento
  const chartData = useMemo(() => {
    if (!candidatos || candidatos.length === 0) return null;

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
      return candidatos.filter(c => c.status === etapa).length;
    };

    // Preparar dados para o gráfico
    const labels = etapasOrdem;
    const data = etapasOrdem.map(etapa => calcularEtapa(etapa));
    const percentuais = data.map(valor => totalCandidatos > 0 ? ((valor / totalCandidatos) * 100).toFixed(1) : '0.0');

    // Calcular métricas de conversão
    const lead = calcularEtapa('Lead');
    const interacao = calcularEtapa('Interação');
    const reuniao = calcularEtapa('Reunião');
    const onboard = calcularEtapa('Onboard');
    
    // Taxa de conversão em reunião (leads que chegaram até reunião)
    const taxaConversaoReuniao = totalCandidatos > 0 ? ((reuniao / totalCandidatos) * 100).toFixed(1) : '0.0';
    
    // Taxa de conversão em onboard (leads que foram contratados)
    const taxaConversaoOnboard = totalCandidatos > 0 ? ((onboard / totalCandidatos) * 100).toFixed(1) : '0.0';

    return {
      labels,
      etapasOriginais: etapasOrdem,
      data,
      percentuais,
      totalCandidatos,
      lead,
      interacao,
      reuniao,
      onboard,
      taxaConversaoReuniao,
      taxaConversaoOnboard
    };
  }, [candidatos]);

  useEffect(() => {
    if (!chartRef.current || !chartData) return;

    // Destruir gráfico anterior
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    // Criar gradiente para a linha - gradiente azul
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(136, 192, 229, 0.4)'); // #88C0E5
    gradient.addColorStop(1, 'rgba(89, 141, 198, 0.05)'); // #598DC6

    // Configurar o gráfico
    chartInstance.current = new ChartJS(ctx, {
      type: 'line',
      data: {
        labels: chartData.labels,
        datasets: [
          {
            label: 'Candidatos por Etapa',
            data: chartData.data,
            borderColor: '#598DC6',
            backgroundColor: gradient,
            borderWidth: 3,
            pointRadius: 8,
            pointHoverRadius: 12,
            pointBackgroundColor: chartData.data.map((value, index) => {
              // 🎨 CORES DO FUNIL DE RECRUTAMENTO - Gradiente Azul
              const coresFunil = [
                '#88C0E5', // 1. Lead - Azul claro
                '#598DC6', // 2. Interação - Azul médio
                '#234992', // 3. Reunião - Azul escuro
                '#324F74', // 4. Onboard - Azul muito escuro
              ];
              return coresFunil[index] || '#6B7280';
            }),
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointHoverBackgroundColor: '#ffffff',
            pointHoverBorderColor: '#598DC6',
            pointHoverBorderWidth: 3,
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(136, 192, 229, 0.5)',
            borderWidth: 1,
            padding: 12,
            displayColors: false,
            callbacks: {
              label: function(context) {
                const value = context.parsed.y;
                const percentual = chartData.percentuais[context.dataIndex];
                return [
                  `Candidatos: ${value}`,
                  `Percentual: ${percentual}%`,
                  `Total: ${chartData.totalCandidatos}`
                ];
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(255, 255, 255, 0.05)'
            },
            ticks: {
              color: '#9CA3AF',
              font: {
                size: 12,
                weight: 600
              },
              padding: 8,
              callback: function(value) {
                return value;
              }
            },
            border: {
              display: false
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: '#9CA3AF',
              font: {
                size: 11,
                weight: 600
              },
              padding: 8,
              maxRotation: 0,
              minRotation: 0
            },
            border: {
              display: false
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [chartData]);

  if (!chartData) {
    return (
      <Card className="bg-white dark:bg-gray-900 border-gray-200/60 dark:border-gray-700/60 h-full">
        <CardHeader>
          <StandardCardTitle icon={Target}>
            Performance de Conversão
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-transparent border-t-blue-500 border-r-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Aguarde...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Identificar etapa com mais candidatos (ignorando "Lead")
  const maxCandidatos = Math.max(...chartData.data.slice(1)); // Ignorar "Lead"
  const etapaComMaisCandidatos = chartData.labels[chartData.data.indexOf(maxCandidatos)];

  return (
    <Card className="bg-white dark:bg-gray-900 border-gray-200/60 dark:border-gray-700/60 h-full overflow-hidden">
      <CardHeader className="pb-1">
        <StandardCardTitle icon={Target}>
          Performance de Conversão
        </StandardCardTitle>
      </CardHeader>
      
      <CardContent className="p-4 h-[calc(100%-4rem)]">
        {/* Métricas Principais - 2 Cards para Recrutamento */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Taxa de Conversão - Reunião */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl blur-sm group-hover:blur-md transition-all duration-300"></div>
            <div className="relative bg-white dark:bg-black/40 backdrop-blur-sm rounded-xl p-3 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300">
              <div className="flex flex-col items-center justify-center">
                <div className="text-3xl font-black bg-gradient-to-br from-blue-400 to-blue-600 bg-clip-text text-transparent mb-1">
                  {chartData.taxaConversaoReuniao}%
                </div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Taxa de Conversão</div>
                <div className="text-xs text-blue-400/80 mt-1 font-medium">
                  {chartData.reuniao} Reuniões Realizadas
                </div>
              </div>
            </div>
          </div>

          {/* Taxa de Conversão - Onboard */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-green-600/5 rounded-xl blur-sm group-hover:blur-md transition-all duration-300"></div>
            <div className="relative bg-white dark:bg-black/40 backdrop-blur-sm rounded-xl p-3 border border-green-500/20 hover:border-green-500/40 transition-all duration-300">
              <div className="flex flex-col items-center justify-center">
                <div className="text-3xl font-black bg-gradient-to-br from-green-400 to-green-600 bg-clip-text text-transparent mb-1">
                  {chartData.taxaConversaoOnboard}%
                </div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Taxa de Conversão</div>
                <div className="text-xs text-green-400/80 mt-1 font-medium truncate max-w-full">
                  {chartData.onboard} Candidatos Contratados
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Gráfico de Linha com Bolhas */}
        <div className="h-[calc(100%-140px)] relative">
          <canvas ref={chartRef}></canvas>
        </div>

        {/* Info adicional - Minimalista */}
        <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
          <TrendingUp className="h-3 w-3 text-blue-400/60" />
          <span className="uppercase tracking-wider">
            Etapa Dominante: <span className="text-blue-400 font-bold">{etapaComMaisCandidatos}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
