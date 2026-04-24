/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Gráfico Moderno - Regiões de Maior Interesse
 * 
 * ✅ IMPLEMENTAÇÕES:
 * - Gráfico Chart.js com linhas e gradiente
 * - Top 5 regiões (4 principais + "Outras")
 * - Detecção de regiões do XML Kenlo e leads
 * - Tema dual (dark/light)
 * - Performance otimizada com useMemo
 * - Design harmonioso e profissional
 */

import { useMemo, useState, useEffect } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { MapPin, Eye, X } from 'lucide-react';
import { fetchImoveisFromKenlo, Imovel } from '@/features/imoveis/services/kenloService';
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

interface ModernRegionChartProps {
  leads: ProcessedLead[];
  tipoNegocioFilter?: TipoNegocioFilter;
  onFilterChange?: (tipo: TipoNegocioFilter) => void;
}

interface RegionStats {
  nome: string;
  total: number;
  quentes: number;
  visitas: number;
  negociacoes: number;
  fechamentos: number;
  percentual: number;
  densidade: number;
}

export const ModernRegionChart = ({ leads, tipoNegocioFilter = 'todos', onFilterChange }: ModernRegionChartProps) => {
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

  const regionStats = useMemo(() => {
    if (!leads || leads.length === 0) return { top5: [], all: [] };

    // Filtrar leads pelo tipo de negócio
    const leadsFiltrados = leads.filter(lead => {
      const tipoNegocio = lead.tipo_negocio || 'Venda';
      return tipoNegocioFilter === 'todos' || tipoNegocio === tipoNegocioFilter;
    });

    if (leadsFiltrados.length === 0) return { top5: [], all: [] };

    // Criar mapa de imóveis do XML
    const imoveisMap = new Map<string, Imovel>();
    imoveis.forEach(imovel => {
      imoveisMap.set(imovel.referencia.toUpperCase(), imovel);
    });

    const statsMap = new Map<string, RegionStats>();

    leadsFiltrados.forEach(lead => {
      const codigo = lead.codigo_imovel?.toUpperCase() || '';
      const imovel = imoveisMap.get(codigo);

      let condomio = '';

      // Prioridade 1: Dados do XML (se tiver campo de condomínio ou nome)
      // Nota: A interface Imovel pode não ter 'condominio' explícito, mas às vezes está no bairro ou nome
      if (imovel) {
         // Lógica para tentar extrair condomínio do imóvel XML se existir campo
         // Por enquanto assumimos que pode estar misturado no bairro ou não disponível estruturado
      }

      // Prioridade 2: Extrair de preferências, observações e conversas
      const textoCompleto = [
        lead.Preferencias_lead || '',
        lead.observacoes || '',
        lead.Conversa || '',
        imovel?.bairro || '' // Também procurar no bairro do XML
      ].join(' ').toLowerCase();

      // Detectar condomínios
      const condomioMatch = textoCompleto.match(/(condomínio|condominio|residencial)\s+([a-z0-9\s]+)/);
      if (condomioMatch && condomioMatch[2]) {
        // Limpar nome do condomínio
        let nomeLimpo = condomioMatch[2].trim();
        // Pegar apenas as primeiras 3-4 palavras para evitar pegar texto demais
        const palavras = nomeLimpo.split(' ');
        if (palavras.length > 4) {
          nomeLimpo = palavras.slice(0, 4).join(' ');
        }
        condomio = `Cond. ${nomeLimpo.split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')}`;
      } 
      
      // Se não detectou condomínio, pular este lead
      if (!condomio) return;

      // Adicionar ou atualizar stats da região
      if (!statsMap.has(condomio)) {
        statsMap.set(condomio, {
          nome: condomio,
          total: 0,
          quentes: 0,
          visitas: 0,
          negociacoes: 0,
          fechamentos: 0,
          percentual: 0,
          densidade: 0
        });
      }

      const stats = statsMap.get(condomio)!;
      stats.total++;
      if (lead.status_temperatura === 'Quente') stats.quentes++;
      if (lead.Data_visita || lead.etapa_atual?.includes('Visita')) stats.visitas++;
      if (lead.etapa_atual === 'Negociação' || lead.etapa_atual === 'Proposta Enviada') stats.negociacoes++;
      if (lead.etapa_atual === 'Fechamento' || lead.data_finalizacao) stats.fechamentos++;
    });

    const totalLeads = leadsFiltrados.length;
    let statsArray = Array.from(statsMap.values()).map(stat => ({
      ...stat,
      percentual: (stat.total / totalLeads) * 100,
      densidade: stat.total > 0 ? (stat.quentes / stat.total) : 0
    }));

    // Ordenar por total (descendente)
    const sortedStats = statsArray.sort((a, b) => b.total - a.total);

    // Retornar top 5 e lista completa
    return {
      top5: sortedStats.slice(0, 5),
      all: sortedStats
    };

  }, [leads, imoveis, tipoNegocioFilter]);

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 border shadow-xl shadow-black/20 h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <StandardCardTitle icon={MapPin}>
            Condomínios de Maior Interesse de Venda
          </StandardCardTitle>
          
          <div className="flex items-center gap-3">
            {/* Botão Ver Todos com Dialog */}
            <Dialog>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 px-3 gap-2 text-xs font-medium border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white transition-colors"
                  title="Ver todos os condomínios"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver Todos
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl bg-background border-border text-foreground dark:bg-neutral-900 dark:border-gray-800 dark:text-white">
                <DialogHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-200 dark:border-gray-800">
                  <DialogTitle className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                    <MapPin className="h-5 w-5 text-blue-500" />
                    Todos os Condomínios de Interesse
                  </DialogTitle>
                  <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </DialogClose>
                </DialogHeader>
                
                <div className="py-4">
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-blue-400">{regionStats.all.length}</div>
                      <div className="text-xs text-slate-500 dark:text-gray-400 uppercase">Condomínios Identificados</div>
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-orange-400">
                        {regionStats.all.reduce((acc, curr) => acc + curr.quentes, 0)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-gray-400 uppercase">Total Quentes</div>
                    </div>
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-purple-400">
                        {regionStats.all.reduce((acc, curr) => acc + curr.visitas, 0)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-gray-400 uppercase">Total Visitas</div>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-400">
                        {regionStats.all.reduce((acc, curr) => acc + curr.negociacoes, 0)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-gray-400 uppercase">Total Negociações</div>
                    </div>
                  </div>

                  <ScrollArea className="h-[400px] rounded-md border border-slate-200 dark:border-gray-800">
                    <Table>
                      <TableHeader className="bg-slate-50 dark:bg-black/40 sticky top-0 z-10">
                        <TableRow className="border-slate-200 dark:border-gray-800 hover:bg-transparent">
                          <TableHead className="text-slate-600 dark:text-gray-300 w-[50px] text-center">#</TableHead>
                          <TableHead className="text-slate-600 dark:text-gray-300">Condomínio</TableHead>
                          <TableHead className="text-slate-600 dark:text-gray-300 text-center">Leads</TableHead>
                          <TableHead className="text-slate-600 dark:text-gray-300 text-center">Quentes</TableHead>
                          <TableHead className="text-slate-600 dark:text-gray-300 text-center">Visitas</TableHead>
                          <TableHead className="text-slate-600 dark:text-gray-300 text-center">Negociações</TableHead>
                          <TableHead className="text-slate-600 dark:text-gray-300 text-center">% Leads</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {regionStats.all.map((item, index) => (
                          <TableRow key={index} className="border-slate-200 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-white/5">
                            <TableCell className="text-center font-medium text-slate-500 dark:text-gray-500">{index + 1}</TableCell>
                            <TableCell className="font-medium text-slate-900 dark:text-white">{item.nome}</TableCell>
                            <TableCell className="text-center text-blue-600 dark:text-blue-400 font-bold">{item.total}</TableCell>
                            <TableCell className="text-center text-orange-600 dark:text-orange-400 font-bold">{item.quentes}</TableCell>
                            <TableCell className="text-center text-purple-600 dark:text-purple-400 font-bold">{item.visitas}</TableCell>
                            <TableCell className="text-center text-green-600 dark:text-green-400 font-bold">{item.negociacoes}</TableCell>
                            <TableCell className="text-center">
                              <span className="text-xs font-bold text-slate-500 dark:text-gray-400">
                                {item.percentual.toFixed(1)}%
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
      </CardHeader>

      <CardContent className="p-4 flex-1 flex flex-col">
        {/* Gráfico Chart.js - Top 5 Condomínios */}
        <div className="flex-1 flex items-center justify-center min-h-[300px]">
          {regionStats.top5.length === 0 ? (
            <div className="text-center text-text-secondary py-12">
              <MapPin className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum condomínio encontrado</p>
            </div>
          ) : (
            <div className="w-full h-full">
              <Bar
                data={{
                  labels: regionStats.top5.map(r => r.nome),
                  datasets: [
                    {
                      label: 'Total de Leads',
                      data: regionStats.top5.map(r => r.total),
                      backgroundColor: regionStats.top5.map((p, index) => {
                        // Mesma paleta azul do gráfico da esquerda para harmonia
                        const azulPalette = [
                          '#1B273D', // 0 - Azul Marinho Profundo
                          '#324F74', // 1 - Azul Aço
                          '#234992', // 2 - Azul Royal
                          '#598DC6', // 3 - Azul Médio
                          '#88C0E5', // 4 - Azul Celeste
                        ];
                        return azulPalette[index] || azulPalette[azulPalette.length - 1];
                      }),
                      borderColor: regionStats.top5.map((p, index) => {
                         const azulPalette = [
                          '#1B273D', 
                          '#324F74', 
                          '#234992', 
                          '#598DC6', 
                          '#88C0E5', 
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
                          const region = regionStats.top5[index];
                          return [
                            `Total: ${region.total}`,
                            `Quentes: ${region.quentes}`,
                            `Visitas: ${region.visitas}`,
                            `Negociações: ${region.negociacoes}`,
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
                {regionStats.top5.reduce((sum, r) => sum + r.total, 0)}
              </div>
              <div className="text-[10px] text-text-secondary">Total</div>
            </div>
            <div>
              <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                {regionStats.top5.reduce((sum, r) => sum + r.quentes, 0)}
              </div>
              <div className="text-[10px] text-text-secondary">Quentes</div>
            </div>
            <div>
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {regionStats.top5.reduce((sum, r) => sum + r.visitas, 0)}
              </div>
              <div className="text-[10px] text-text-secondary">Visitas</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">
                {regionStats.top5.reduce((sum, r) => sum + r.negociacoes, 0)}
              </div>
              <div className="text-[10px] text-text-secondary">Negociações</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
