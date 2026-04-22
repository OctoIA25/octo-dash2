import { useEffect, useRef, useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
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

interface FunnelStagesBubbleChartProps {
  leads: ProcessedLead[];
  funnelType?: 'comprador' | 'vendedor'; // Tipo de funil
  subSection?: 'pre-atendimento' | 'atendimento' | 'geral'; // Subseção ativa
  proprietarioType?: 'vendedor' | 'locatario'; // Tipo de proprietário (vendedor ou locatário)
}

export const FunnelStagesBubbleChart = ({ leads, funnelType = 'comprador', subSection = 'geral', proprietarioType = 'vendedor' }: FunnelStagesBubbleChartProps) => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<ChartJS | null>(null);

  // 🎨 ETAPAS DO FUNIL - Ajustadas conforme a subseção ativa
  const getEtapasOrdem = () => {
    // Pré-Atendimento: apenas 4 etapas (termina em Visita Agendada)
    if (subSection === 'pre-atendimento') {
      return [
        'Novos Leads',
        'Em Atendimento',
        'Interação',
        'Visita Agendada'
      ];
    }
    
    // Atendimento: 6 etapas (começa em Bolsão, termina em Proposta Assinada)
    if (subSection === 'atendimento') {
      return [
        'Bolsão',
        'Visita Realizada',
        'Negociação',
        'Proposta Criada',
        'Proposta Enviada',
        'Proposta Assinada'
      ];
    }
    
    // Geral: funil completo com 9 etapas
    return [
      'Novos Leads',
      'Em Atendimento',
      'Interação',
      'Visita Agendada',
      'Visita Realizada',
      'Negociação',
      'Proposta Criada',
      'Proposta Enviada',
      'Proposta Assinada'
    ];
  };

  // Calcular dados das etapas
  const chartData = useMemo(() => {
    const etapasOrdem = getEtapasOrdem();
    const safeLeads = leads || [];
    const totalLeads = safeLeads.length;

    // 🎯 CÁLCULO DAS ETAPAS - EXATAMENTE IGUAL AO ENHANCEDFUNNELCHART
    const calcularEtapa = (etapa: string): number => {
      switch (etapa) {
        case 'Novos Leads':
          return totalLeads;
        case 'Em Atendimento':
          return safeLeads.filter(l => l.etapa_atual === 'Em Atendimento').length;
        case 'Interação':
          return safeLeads.filter(l => l.etapa_atual === 'Interação').length;
        case 'Visita Agendada':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Visita Agendada' ||
            l.etapa_atual === 'Visita agendada' ||
            (l.Data_visita && l.Data_visita.trim() !== '' && l.etapa_atual !== 'Visita Realizada')
          ).length;
        case 'Bolsão':
          // Leads no bolsão = leads sem imóvel definido ou aguardando atribuição
          return safeLeads.filter(l => 
            l.etapa_atual === 'Bolsão' ||
            l.etapa_atual === 'Bolsao' ||
            l.etapa_atual === 'Sem Imóvel' ||
            l.etapa_atual === 'Aguardando Imóvel' ||
            (!l.codigo_imovel || l.codigo_imovel.trim() === '')
          ).length;
        case 'Visita Realizada':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Visita Realizada' ||
            l.etapa_atual === 'Visita realizada' ||
            l.Imovel_visitado === 'Sim'
          ).length;
        case 'Negociação':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Negociação' ||
            l.etapa_atual === 'Em Negociação' ||
            l.etapa_atual === 'Negociacao'
          ).length;
        case 'Proposta Criada':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Proposta Criada' ||
            l.etapa_atual === 'Proposta criada'
          ).length;
        case 'Proposta Enviada':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Proposta Enviada' ||
            l.etapa_atual === 'Proposta enviada'
          ).length;
        case 'Proposta Assinada':
          return safeLeads.filter(l => 
            l.etapa_atual === 'Proposta Assinada' ||
            l.etapa_atual === 'Proposta assinada' ||
            l.etapa_atual === 'Fechamento' ||
            l.etapa_atual === 'Fechado' ||
            l.etapa_atual === 'Finalizado' ||
            l.etapa_atual === 'Negócio Fechado' ||
            (l.data_finalizacao && l.data_finalizacao.trim() !== '') ||
            (l.valor_final_venda && l.valor_final_venda > 0)
          ).length;
        default:
          return 0;
      }
    };

    // Preparar dados para o gráfico
    const labels = etapasOrdem.map(e => e.replace('\n', ' '));
    const data = etapasOrdem.map(etapa => calcularEtapa(etapa));
    const percentuais = data.map(valor => totalLeads > 0 ? ((valor / totalLeads) * 100).toFixed(1) : '0.0');

    // Calcular métricas de conversão
    const visitasRealizadas = calcularEtapa('Visita Realizada');
    const propostasAssinadas = calcularEtapa('Proposta Assinada');
    
    // Para Cliente Proprietário (vendedor): calcular Não Exclusivo, Exclusivo e Feitura de Contrato
    const naoExclusivo = safeLeads.filter(l => 
      l.etapa_atual === 'Não Exclusivo' ||
      l.etapa_atual === 'Nao Exclusivo'
    ).length;
    
    const exclusivo = safeLeads.filter(l => 
      l.etapa_atual === 'Exclusivo'
    ).length;
    
    const feituraContrato = safeLeads.filter(l => 
      l.etapa_atual === 'Feitura de Contrato' ||
      l.etapa_atual === 'Feitura do Contrato'
    ).length;
    
    // Taxa de conversão em visitas (total de leads que chegaram até visita realizada)
    const taxaConversaoVisitas = totalLeads > 0 ? ((visitasRealizadas / totalLeads) * 100).toFixed(1) : '0.0';
    
    // Taxa de conversão em proposta assinada (total de leads que fecharam)
    const taxaConversaoProposta = totalLeads > 0 ? ((propostasAssinadas / totalLeads) * 100).toFixed(1) : '0.0';
    
    // Taxa de conversão para Cliente Proprietário (somando Não Exclusivo, Exclusivo e Feitura de Contrato)
    const totalProprietariosConvertidos = naoExclusivo + exclusivo + feituraContrato;
    const taxaConversaoProprietarios = totalLeads > 0 ? ((totalProprietariosConvertidos / totalLeads) * 100).toFixed(1) : '0.0';

    return {
      labels,
      etapasOriginais: etapasOrdem,
      data,
      percentuais,
      totalLeads,
      visitasRealizadas,
      propostasAssinadas,
      taxaConversaoVisitas,
      taxaConversaoProposta,
      // Métricas específicas para Cliente Proprietário
      naoExclusivo,
      exclusivo,
      feituraContrato,
      totalProprietariosConvertidos,
      taxaConversaoProprietarios
    };
  }, [leads, funnelType, subSection]);

  useEffect(() => {
    if (!chartRef.current || !chartData) return;

    // Destruir gráfico anterior
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    // Criar gradiente para a linha
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(35, 72, 144, 0.4)'); // #234890
    gradient.addColorStop(1, 'rgba(115, 166, 211, 0.05)'); // #73A6D3

    // Configurar o gráfico
    chartInstance.current = new ChartJS(ctx, {
      type: 'line',
      data: {
        labels: chartData.labels,
        datasets: [
          {
            label: 'Leads por Etapa',
            data: chartData.data,
            borderColor: '#234890',
            backgroundColor: gradient,
            borderWidth: 3,
            pointRadius: 8,
            pointHoverRadius: 12,
            pointBackgroundColor: chartData.data.map((value, index) => {
              // 🎨 CORES DO FUNIL - Mesmas cores das etapas do funil
              const coresFunil = [
                '#0891B2', // 1. Novos Leads - AZUL ciano intenso
                '#2563EB', // 2. Em Atendimento - AZUL vibrante
                '#1D4ED8', // 3. Interação - AZUL médio forte
                '#10B981', // 4. Visita Agendada - VERDE limão intenso
                '#059669', // 5. Visita Realizada - VERDE vibrante
                '#FB923C', // 6. Negociação - LARANJA claro
                '#F97316', // 7. Proposta Criada - LARANJA médio avermelhado
                '#DC2626', // 8. Proposta Enviada - VERMELHO médio
                '#DC2626'  // 9. Proposta Assinada - VERMELHO
              ];
              return coresFunil[index] || '#6B7280';
            }),
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointHoverBackgroundColor: '#ffffff',
            pointHoverBorderColor: '#234890',
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
            borderColor: 'rgba(139, 92, 246, 0.5)',
            borderWidth: 1,
            padding: 12,
            displayColors: false,
            callbacks: {
              label: function(context) {
                const value = context.parsed.y;
                const percentual = chartData.percentuais[context.dataIndex];
                return [
                  `Leads: ${value}`,
                  `Percentual: ${percentual}%`,
                  `Total: ${chartData.totalLeads}`
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
              maxRotation: 45,
              minRotation: 45
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
  }, [chartData, funnelType]);

  // Calcular taxa de conversão baseada na ÚLTIMA ETAPA do funil específico
  const ultimaEtapaIndex = chartData.data.length - 1;
  const ultimaEtapa = chartData.etapasOriginais[ultimaEtapaIndex]; // Nome da última etapa
  const leadsFinalEtapa = chartData.data[ultimaEtapaIndex]; // Quantidade de leads na última etapa
  const taxaConversaoGeral = chartData.totalLeads > 0 
    ? ((leadsFinalEtapa / chartData.totalLeads) * 100).toFixed(1)
    : '0.0';

  // Identificar etapa com mais leads (ignorando "Novos Leads")
  const maxLeads = Math.max(...chartData.data.slice(1)); // Ignorar "Novos Leads"
  const etapaComMaisLeads = chartData.labels[chartData.data.indexOf(maxLeads)];

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full overflow-hidden">
      <CardHeader className="pb-1">
        <StandardCardTitle icon={Target}>
          Performance de Conversão
        </StandardCardTitle>
      </CardHeader>
      
      <CardContent className="p-4 h-[calc(100%-4rem)]">
        {/* Métricas Principais - Design Minimalista */}
        {funnelType === 'vendedor' ? (
          /* 3 Cards para Cliente Proprietário - Exclusividade + Total */
          <div className="grid grid-cols-3 gap-4 mb-4">
            {/* Taxa de Conversão - Exclusivo */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-purple-600/5 rounded-xl blur-sm group-hover:blur-md transition-all duration-300"></div>
              <div className="relative bg-black/40 backdrop-blur-sm rounded-xl p-3 border border-purple-500/20 hover:border-purple-500/40 transition-all duration-300">
                <div className="flex flex-col items-center justify-center">
                  <div className="text-3xl font-black bg-gradient-to-br from-purple-400 to-purple-600 bg-clip-text text-transparent mb-1">
                    {chartData.totalLeads > 0 ? ((chartData.exclusivo / chartData.totalLeads) * 100).toFixed(1) : '0.0'}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-slate-400 font-semibold">Taxa de Conversão</div>
                  <div className="text-xs text-purple-400/80 mt-1 font-medium">
                    {chartData.exclusivo} Exclusividades Assinadas
                  </div>
                </div>
              </div>
            </div>

            {/* Taxa de Conversão - Não Exclusivo */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-cyan-600/5 rounded-xl blur-sm group-hover:blur-md transition-all duration-300"></div>
              <div className="relative bg-black/40 backdrop-blur-sm rounded-xl p-3 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300">
                <div className="flex flex-col items-center justify-center">
                  <div className="text-3xl font-black bg-gradient-to-br from-blue-400 to-cyan-600 bg-clip-text text-transparent mb-1">
                    {chartData.totalLeads > 0 ? ((chartData.naoExclusivo / chartData.totalLeads) * 100).toFixed(1) : '0.0'}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-slate-400 font-semibold">Taxa de Conversão</div>
                  <div className="text-xs text-blue-400/80 mt-1 font-medium">
                    {chartData.naoExclusivo} Imóveis Sem Exclusividade
                  </div>
                </div>
              </div>
            </div>

            {/* Total de Vendedores/Locatários */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-green-600/5 rounded-xl blur-sm group-hover:blur-md transition-all duration-300"></div>
              <div className="relative bg-black/40 backdrop-blur-sm rounded-xl p-3 border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300">
                <div className="flex flex-col items-center justify-center">
                  <div className="text-3xl font-black bg-gradient-to-br from-emerald-400 to-green-600 bg-clip-text text-transparent mb-1">
                    {chartData.totalLeads}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-slate-400 font-semibold">Total</div>
                  <div className="text-xs text-emerald-400/80 mt-1 font-medium">
                    {proprietarioType === 'vendedor' ? 'Total de Vendedores' : 'Total de Locatários'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* 2 Cards para Cliente Interessado */
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Taxa de Conversão - Visitas */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-purple-600/5 rounded-xl blur-sm group-hover:blur-md transition-all duration-300"></div>
              <div className="relative bg-black/40 backdrop-blur-sm rounded-xl p-3 border border-purple-500/20 hover:border-purple-500/40 transition-all duration-300">
                <div className="flex flex-col items-center justify-center">
                  <div className="text-3xl font-black bg-gradient-to-br from-purple-400 to-purple-600 bg-clip-text text-transparent mb-1">
                    {chartData.taxaConversaoVisitas}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-slate-400 font-semibold">Taxa de Conversão</div>
                  <div className="text-xs text-purple-400/80 mt-1 font-medium">
                    {chartData.visitasRealizadas} Visitas Agendadas
                  </div>
                </div>
              </div>
            </div>

            {/* Taxa de Conversão - Propostas */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-cyan-600/5 rounded-xl blur-sm group-hover:blur-md transition-all duration-300"></div>
              <div className="relative bg-black/40 backdrop-blur-sm rounded-xl p-3 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300">
                <div className="flex flex-col items-center justify-center">
                  <div className="text-3xl font-black bg-gradient-to-br from-blue-400 to-cyan-600 bg-clip-text text-transparent mb-1">
                    {chartData.taxaConversaoProposta}%
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-slate-400 font-semibold">Taxa de Conversão</div>
                  <div className="text-xs text-blue-400/80 mt-1 font-medium truncate max-w-full">
                    {chartData.propostasAssinadas} Propostas Assinadas
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Gráfico de Linha com Bolhas */}
        <div className="h-[calc(100%-140px)] relative">
          <canvas ref={chartRef}></canvas>
        </div>

        {/* Info adicional - Minimalista */}
        <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-gray-500 dark:text-slate-400">
          <TrendingUp className="h-3 w-3 text-purple-400/60" />
          <span className="uppercase tracking-wider">
            Etapa Dominante: <span className="text-purple-400 font-bold">{etapaComMaisLeads}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
