/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Gráfico Otimizado - Imóveis de Maior Interesse
 * 
 * ✅ OTIMIZAÇÕES IMPLEMENTADAS:
 * - Gráfico Chart.js com barras
 * - Paleta de azuis conforme especificado
 * - KPI Cards com métricas visuais grandes
 * - Ranking ordenado com dados XML
 * - Tema dual (dark/light)
 * - Performance otimizada com useMemo
 * - Design harmonioso e profissional
 */

import { useMemo, useEffect, useState } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Home, Eye, X } from 'lucide-react';
import { fetchImoveisFromKenlo, Imovel } from '../services/kenloService';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { useTheme } from '@/hooks/useTheme';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  BarController
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Registrar componentes do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  BarController
);

type TipoNegocioFilter = 'todos' | 'Venda' | 'Locação';

interface OptimizedPropertyInterestChartProps {
  leads: ProcessedLead[];
  categoriasCards?: {
    casas: number;
    apartamentos: number;
    terrenos: number;
    outros: number;
  };
  tipoNegocioFilter?: TipoNegocioFilter;
  onFilterChange?: (tipo: TipoNegocioFilter) => void;
}

interface PropertyStats {
  codigo: string;
  totalLeads: number;
  quentes: number;
  visitas: number;
  negociacoes: number;
  score: number;
  percentualQuente: number;
  // Dados do XML Kenlo
  tipo?: string;
  bairro?: string;
  cidade?: string;
  valorVenda?: number;
  valorLocacao?: number;
}

export const OptimizedPropertyInterestChart = ({ leads, categoriasCards, tipoNegocioFilter = 'todos', onFilterChange }: OptimizedPropertyInterestChartProps) => {
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const { currentTheme } = useTheme();
  const isDarkMode = currentTheme === 'preto' || currentTheme === 'cinza';

  // Buscar imóveis do XML Kenlo
  useEffect(() => {
    const loadImoveis = async () => {
      try {
        const data = await fetchImoveisFromKenlo();
        setImoveis(data);
      } catch (error) {
        console.error('❌ Erro ao carregar XML:', error);
      }
    };
    loadImoveis();
  }, []);

    // Processar dados dos leads + enriquecer com dados do XML
  const propertyStats = useMemo(() => {
    if (!leads || leads.length === 0) return { top5: [], all: [] };

    // Criar mapa de imóveis do XML
    const imoveisMap = new Map<string, Imovel>();
    imoveis.forEach(imovel => {
      imoveisMap.set(imovel.referencia.toUpperCase(), imovel);
    });

    // Agrupar leads por Bairro
    const statsMap = new Map<string, PropertyStats>();

    leads.forEach(lead => {
      // Tentar obter bairro do imóvel vinculado
      const codigo = lead.codigo_imovel?.trim().toUpperCase();
      const imovelXML = codigo ? imoveisMap.get(codigo) : undefined;
      
      let bairro = 'Não Identificado';
      
      // Prioridade 1: Bairro do XML do imóvel
      if (imovelXML?.bairro && imovelXML.bairro !== 'Sem Bairro') {
        bairro = imovelXML.bairro;
      }
      // Prioridade 2: Bairro das preferências ou observações (extração simples)
      else {
        const textoCompleto = [
          lead.Preferencias_lead || '',
          lead.observacoes || '',
          lead.Conversa || ''
        ].join(' ').toLowerCase();

        // Lista de bairros comuns para tentar identificar se não tiver XML
        const bairrosComuns = [
          'centro', 'jardim', 'vila', 'parque', 'residencial', 
          'moema', 'pinheiros', 'perdizes', 'brooklin', 'morumbi'
        ];
        
        // Tentar encontrar nome de bairro capitalizado após palavras chave
        const bairroMatch = textoCompleto.match(/(?:bairro|no)\s+([A-Z][a-zçãõéáíóú]+(?:\s[A-Z][a-zçãõéáíóú]+)*)/);
        if (bairroMatch) {
          bairro = bairroMatch[1];
        }
      }

      // Normalizar nome do bairro
      bairro = bairro.trim();
      if (!bairro || bairro === '') return;

      if (!statsMap.has(bairro)) {
        statsMap.set(bairro, {
          codigo: bairro, // Usando bairro como identificador
          totalLeads: 0,
          quentes: 0,
          visitas: 0,
          negociacoes: 0,
          score: 0,
          percentualQuente: 0,
          // Dados extras
          tipo: 'Bairro',
          bairro: bairro,
          cidade: imovelXML?.cidade || '',
          valorVenda: 0,
          valorLocacao: 0,
        });
      }

      const stats = statsMap.get(bairro)!;
      stats.totalLeads++;

      // Contar por temperatura
      if (lead.status_temperatura === 'Quente') stats.quentes++;

      // Contar visitas
      if (lead.Data_visita || lead.etapa_atual?.includes('Visita')) {
        stats.visitas++;
      }

      // Contar negociações
      if (
        lead.etapa_atual === 'Em Negociação' ||
        lead.etapa_atual === 'Negociação' ||
        lead.etapa_atual === 'Proposta Enviada'
      ) {
        stats.negociacoes++;
      }
    });

    // Calcular score e percentual de leads quentes
    const statsArray = Array.from(statsMap.values()).map(stat => ({
      ...stat,
      // Score: quentes=5pts, visitas=3pts, negociações=4pts, total=1pt
      score: (stat.quentes * 5) + (stat.visitas * 3) + (stat.negociacoes * 4) + stat.totalLeads,
      percentualQuente: stat.totalLeads > 0 ? (stat.quentes / stat.totalLeads) * 100 : 0,
    }));

    // Ordenar por score
    const sortedStats = statsArray.sort((a, b) => b.score - a.score);

    // Retornar top 5 e lista completa
    return {
      top5: sortedStats.slice(0, 5),
      all: sortedStats
    };
  }, [leads, imoveis]);

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 border shadow-xl shadow-black/20 h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <StandardCardTitle icon={Home}>
            Bairros de Maior Interesse de Venda
          </StandardCardTitle>
          
          <div className="flex items-center gap-3">
            {/* Botão Ver Todos com Dialog */}
            <Dialog>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 px-3 gap-2 text-xs font-medium border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
                  title="Ver todos os bairros"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver Todos
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl bg-neutral-900 border-gray-800 text-white">
                <DialogHeader className="flex flex-row items-center justify-between pb-4 border-b border-gray-800">
                  <DialogTitle className="text-xl font-bold flex items-center gap-2">
                    <Home className="h-5 w-5 text-blue-500" />
                    Todos os Bairros de Interesse
                  </DialogTitle>
                  <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </DialogClose>
                </DialogHeader>
                
                <div className="py-4">
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-400">{propertyStats.all.length}</div>
                      <div className="text-xs text-gray-400 uppercase">Bairros Identificados</div>
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-orange-400">
                        {propertyStats.all.reduce((acc, curr) => acc + curr.quentes, 0)}
                      </div>
                      <div className="text-xs text-gray-400 uppercase">Total Quentes</div>
                    </div>
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-purple-400">
                        {propertyStats.all.reduce((acc, curr) => acc + curr.visitas, 0)}
                      </div>
                      <div className="text-xs text-gray-400 uppercase">Total Visitas</div>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-400">
                        {propertyStats.all.reduce((acc, curr) => acc + curr.negociacoes, 0)}
                      </div>
                      <div className="text-xs text-gray-400 uppercase">Total Negociações</div>
                    </div>
                  </div>

                  <ScrollArea className="h-[400px] rounded-md border border-gray-800">
                    <Table>
                      <TableHeader className="bg-black/40 sticky top-0 z-10">
                        <TableRow className="border-gray-800 hover:bg-transparent">
                          <TableHead className="text-gray-300 w-[50px] text-center">#</TableHead>
                          <TableHead className="text-gray-300">Bairro</TableHead>
                          <TableHead className="text-gray-300 text-center">Score</TableHead>
                          <TableHead className="text-gray-300 text-center">Leads</TableHead>
                          <TableHead className="text-gray-300 text-center">Quentes</TableHead>
                          <TableHead className="text-gray-300 text-center">Visitas</TableHead>
                          <TableHead className="text-gray-300 text-center">Negociações</TableHead>
                          <TableHead className="text-gray-300 text-center">% Quente</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {propertyStats.all.map((item, index) => (
                          <TableRow key={index} className="border-gray-800 hover:bg-white/5">
                            <TableCell className="text-center font-medium text-gray-500">{index + 1}</TableCell>
                            <TableCell className="font-medium text-white">{item.bairro}</TableCell>
                            <TableCell className="text-center">
                              <span className="bg-gray-800 text-gray-300 px-2 py-1 rounded text-xs font-bold">
                                {item.score.toFixed(0)}
                              </span>
                            </TableCell>
                            <TableCell className="text-center text-blue-400 font-bold">{item.totalLeads}</TableCell>
                            <TableCell className="text-center text-orange-400 font-bold">{item.quentes}</TableCell>
                            <TableCell className="text-center text-purple-400 font-bold">{item.visitas}</TableCell>
                            <TableCell className="text-center text-green-400 font-bold">{item.negociacoes}</TableCell>
                            <TableCell className="text-center">
                              <span className={`text-xs font-bold ${item.percentualQuente > 30 ? 'text-green-400' : item.percentualQuente > 15 ? 'text-yellow-400' : 'text-gray-500'}`}>
                                {item.percentualQuente.toFixed(1)}%
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </DialogContent>
            </Dialog>

            {/* Filtros Minimalistas - Canto Superior Direito */}
            {onFilterChange && (
              <div className="flex items-center p-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                {(['todos', 'Venda', 'Locação'] as TipoNegocioFilter[]).map((tipo) => (
                  <button
                    key={tipo}
                    onClick={() => onFilterChange(tipo)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all duration-200 ${
                      tipoNegocioFilter === tipo
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm ring-1 ring-black/5'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200/50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    {tipo === 'todos' ? 'Todos' : tipo}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mini Cards de Categorias - Logo Após o Título */}
        {categoriasCards && (
          <div className="grid grid-cols-4 gap-3">
            {/* Casas - Azul */}
            <div className="text-center p-3 rounded-lg border" style={{ 
              backgroundColor: 'rgba(37, 99, 235, 0.1)', 
              borderColor: 'rgba(37, 99, 235, 0.3)' 
            }}>
              <div className="text-2xl font-bold mb-1" style={{ color: '#2563eb' }}>
                {categoriasCards.casas}
              </div>
              <div className="text-[10px] text-text-secondary uppercase tracking-wider">
                Casas
              </div>
              <div className="text-xs font-bold mt-1" style={{ color: '#2563eb' }}>
                {(() => {
                  const total = categoriasCards.casas + categoriasCards.apartamentos + categoriasCards.terrenos + categoriasCards.outros;
                  return total > 0 ? `${((categoriasCards.casas / total) * 100).toFixed(1)}%` : '0%';
                })()}
              </div>
            </div>

            {/* Apartamentos - Verde */}
            <div className="text-center p-3 rounded-lg border" style={{ 
              backgroundColor: 'rgba(5, 150, 105, 0.1)', 
              borderColor: 'rgba(5, 150, 105, 0.3)' 
            }}>
              <div className="text-2xl font-bold mb-1" style={{ color: '#059669' }}>
                {categoriasCards.apartamentos}
              </div>
              <div className="text-[10px] text-text-secondary uppercase tracking-wider">
                Apartamentos
              </div>
              <div className="text-xs font-bold mt-1" style={{ color: '#059669' }}>
                {(() => {
                  const total = categoriasCards.casas + categoriasCards.apartamentos + categoriasCards.terrenos + categoriasCards.outros;
                  return total > 0 ? `${((categoriasCards.apartamentos / total) * 100).toFixed(1)}%` : '0%';
                })()}
              </div>
            </div>

            {/* Terrenos - Roxo */}
            <div className="text-center p-3 rounded-lg border" style={{ 
              backgroundColor: 'rgba(147, 51, 234, 0.1)', 
              borderColor: 'rgba(147, 51, 234, 0.3)' 
            }}>
              <div className="text-2xl font-bold mb-1" style={{ color: '#9333ea' }}>
                {categoriasCards.terrenos}
              </div>
              <div className="text-[10px] text-text-secondary uppercase tracking-wider">
                Terrenos
              </div>
              <div className="text-xs font-bold mt-1" style={{ color: '#9333ea' }}>
                {(() => {
                  const total = categoriasCards.casas + categoriasCards.apartamentos + categoriasCards.terrenos + categoriasCards.outros;
                  return total > 0 ? `${((categoriasCards.terrenos / total) * 100).toFixed(1)}%` : '0%';
                })()}
              </div>
            </div>

            {/* Outros - Vermelho */}
            <div className="text-center p-3 rounded-lg border" style={{ 
              backgroundColor: 'rgba(220, 38, 38, 0.1)', 
              borderColor: 'rgba(220, 38, 38, 0.3)' 
            }}>
              <div className="text-2xl font-bold mb-1" style={{ color: '#dc2626' }}>
                {categoriasCards.outros}
              </div>
              <div className="text-[10px] text-text-secondary uppercase tracking-wider">
                Outros
              </div>
              <div className="text-xs font-bold mt-1" style={{ color: '#dc2626' }}>
                {(() => {
                  const total = categoriasCards.casas + categoriasCards.apartamentos + categoriasCards.terrenos + categoriasCards.outros;
                  return total > 0 ? `${((categoriasCards.outros / total) * 100).toFixed(1)}%` : '0%';
                })()}
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-4 flex-1 flex flex-col">
        {/* Gráfico Chart.js - Top 5 Imóveis */}
        <div className="flex-1 flex items-center justify-center min-h-[300px]">
          {propertyStats.top5.length === 0 ? (
            <div className="text-center text-text-secondary py-12">
              <Home className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum imóvel encontrado</p>
            </div>
          ) : (
            <div className="w-full h-full">
              <Bar
                data={{
                  labels: propertyStats.top5.map(p => p.codigo),
                  datasets: [
                    {
                      label: 'Score de Interesse',
                      data: propertyStats.top5.map(p => p.score),
                      backgroundColor: propertyStats.top5.map((p, index) => {
                        // Paleta de 12 tons de azul em gradiente
                        // REGRA: Maior score (index 0) = Tom MAIS ESCURO
                        // REGRA: Menor score (index 4) = Tom MAIS CLARO
                        const azulPalette = [
                          '#14263C', // 0 - Azul Marinho Escuro (maior interesse - 1º lugar)
                          '#1B273D', // 1 - Azul Marinho Profundo (2º lugar)
                          '#19316C', // 2 - Azul Escuro Intenso (3º lugar)
                          '#1E40AF', // 3 - Azul Escuro (4º lugar)
                          '#1D4ED8', // 4 - Azul Muito Forte (5º lugar)
                          '#2158DC', // 5 - Azul Forte Plus (6º lugar)
                          '#2563EB', // 6 - Azul Forte (7º lugar)
                          '#3273F0', // 7 - Azul Vibrante Plus (8º lugar)
                          '#3B82F6', // 8 - Azul Vibrante (9º lugar)
                          '#5294F8', // 9 - Azul Médio Plus (10º lugar)
                          '#60A5FA', // 10 - Azul Médio (11º lugar)
                          '#88C0E5', // 11 - Azul Celeste (menor interesse - 12º lugar)
                        ];
                        return azulPalette[index] || azulPalette[azulPalette.length - 1];
                      }),
                      borderColor: propertyStats.top5.map((p, index) => {
                        const azulPalette = [
                          '#14263C', // 0 - Azul Marinho Escuro (maior interesse)
                          '#1B273D', // 1 - Azul Marinho Profundo
                          '#19316C', // 2 - Azul Escuro Intenso
                          '#1E40AF', // 3 - Azul Escuro
                          '#1D4ED8', // 4 - Azul Muito Forte
                          '#2158DC', // 5 - Azul Forte Plus
                          '#2563EB', // 6 - Azul Forte
                          '#3273F0', // 7 - Azul Vibrante Plus
                          '#3B82F6', // 8 - Azul Vibrante
                          '#5294F8', // 9 - Azul Médio Plus
                          '#60A5FA', // 10 - Azul Médio
                          '#88C0E5', // 11 - Azul Celeste (menor interesse)
                        ];
                        return azulPalette[index] || azulPalette[azulPalette.length - 1];
                      }),
                      borderWidth: 2,
                      borderRadius: 8,
                      borderSkipped: false,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false,
                    },
                    tooltip: {
                      backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.95)',
                      padding: 12,
                      titleColor: isDarkMode ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 0, 0, 0.9)',
                      bodyColor: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)',
                      borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                      borderWidth: 1,
                      callbacks: {
                        label: function(context) {
                          const index = context.dataIndex;
                          const property = propertyStats.top5[index];
                          return [
                            `Score: ${property.score.toFixed(0)}`,
                            `Leads: ${property.totalLeads}`,
                            `Quentes: ${property.quentes}`,
                            `Visitas: ${property.visitas}`,
                            `Negociações: ${property.negociacoes}`,
                          ];
                        },
                      },
                    },
                  },
                  scales: {
                    x: {
                      ticks: {
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.9)',
                        font: {
                          size: 12,
                          weight: 'bold',
                          family: "'Inter', sans-serif"
                        },
                        autoSkip: false,
                        maxRotation: 45,
                        minRotation: 0
                      },
                      grid: {
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                      },
                      border: {
                        display: false,
                      },
                    },
                    y: {
                      beginAtZero: true,
                      ticks: {
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
                        font: {
                          size: 11,
                        },
                        stepSize: 5,
                      },
                      grid: {
                        color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                      },
                      border: {
                        display: false,
                      },
                    },
                  },
                }}
              />
            </div>
          )}
        </div>

        {/* Resumo Rápido - Rodapé */}
        <div className="mt-3 pt-2 border-t border-border/30 flex-shrink-0">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-lg font-bold text-cyan-600 dark:text-cyan-400">
                {propertyStats.top5.reduce((sum, p) => sum + p.totalLeads, 0)}
              </div>
              <div className="text-[10px] text-text-secondary">Total</div>
            </div>
            <div>
              <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                {propertyStats.top5.reduce((sum, p) => sum + p.quentes, 0)}
              </div>
              <div className="text-[10px] text-text-secondary">Quentes</div>
            </div>
            <div>
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {propertyStats.top5.reduce((sum, p) => sum + p.visitas, 0)}
              </div>
              <div className="text-[10px] text-text-secondary">Visitas</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                {propertyStats.top5.reduce((sum, p) => sum + p.negociacoes, 0)}
              </div>
              <div className="text-[10px] text-text-secondary">Negociações</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
