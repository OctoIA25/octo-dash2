/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Componente: Estatísticas Eneagrama para Administradores
 * Função: Exibir métricas gerais e individuais do teste Eneagrama com Charts.css
 * Paleta: Azul, Branco, Cinza - Design Minimalista - SEM EMOJIS
 */

import { useState, useEffect } from 'react';
import { X, TrendingUp, Users, Award, BarChart3, ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { buscarEstatisticasEneagrama, EneagramaStats } from '@/services/testesEstatisticasService';
import { ENEAGRAMA_TIPOS } from '@/data/eneagramaQuestions';
import { EneagramaCorretorIndividualModal } from './EneagramaCorretorIndividualModal';
import { useAuth } from '@/hooks/useAuth';

interface EneagramaStatisticsProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCorretor?: (corretorId: number, corretorNome: string) => void;
  isDarkMode: boolean;
}

export const EneagramaStatistics = ({
  isOpen,
  onClose,
  onSelectCorretor,
  isDarkMode
}: EneagramaStatisticsProps) => {
  const { tenantId } = useAuth();
  const [stats, setStats] = useState<EneagramaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [corretorSelecionado, setCorretorSelecionado] = useState<{ id: number; nome: string } | null>(null);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (isOpen) {
      carregarEstatisticas();
      // Resetar corretor selecionado quando abrir modal de estatísticas
      setCorretorSelecionado(null);
    } else {
      // Resetar estado quando fechar
      setCorretorSelecionado(null);
    }
  }, [isOpen]);

  const carregarEstatisticas = async () => {
    setLoading(true);
    try {
      const data = await buscarEstatisticasEneagrama(tenantId || undefined);
      setStats(data);
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Paleta Minimalista: Azul, Branco, Cinza
  const bgPrimary = '#ffffff';
  const bgCard = '#f8fafc';
  const border = '#e2e8f0';
  const textPrimary = '#0f172a';
  const textSecondary = '#64748b';
  const accentBlue = '#3b82f6';

  return (
    <div className="octo-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop - Não fechar se houver corretor selecionado (modal individual aberto) */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => {
          // Não fechar se o modal individual estiver aberto
          if (!corretorSelecionado) {
            onClose();
          }
        }}
      />
      
      {/* Modal */}
      <div 
        className="relative w-full max-w-7xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-300"
        style={{ backgroundColor: bgPrimary }}
      >
        {/* Header Minimalista */}
        <div 
          className="sticky top-0 z-10 border-b px-8 py-6"
          style={{ backgroundColor: bgPrimary, borderColor: border }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accentBlue}10` }}>
                <BarChart3 className="w-6 h-6" style={{ color: accentBlue }} />
              </div>
              <div>
                <h2 className="text-2xl font-bold" style={{ color: textPrimary }}>
                  Estatísticas Eneagrama
                </h2>
                <p style={{ color: textSecondary }} className="text-sm">
                  Análise de motivações profundas da equipe
                </p>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="h-10 w-10 rounded-lg hover:bg-red-100 active:bg-red-200 transition-all relative z-50 flex items-center justify-center group"
              style={{ 
                border: '2px solid #fee2e2',
                backgroundColor: '#ffffff'
              }}
              title="Fechar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px', minWidth: '20px', flexShrink: 0 }} className="group-hover:opacity-70 transition-opacity">
                <path d="M18 6 6 18"></path>
                <path d="m6 6 12 12"></path>
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-8" style={{ maxHeight: 'calc(90vh - 120px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: `${accentBlue}30`, borderTopColor: accentBlue }}></div>
                <p style={{ color: textSecondary }} className="text-sm">Carregando estatísticas...</p>
              </div>
            </div>
          ) : stats ? (
            <div className="space-y-8">
              
              {/* Cards de Métricas Gerais - Design Minimalista */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border hover:shadow-md transition-all duration-200">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <Users className="w-5 h-5" style={{ color: textSecondary }} />
                      <p style={{ color: textPrimary }} className="text-3xl font-bold">{stats.totalCorretores}</p>
                    </div>
                    <p style={{ color: textSecondary }} className="text-xs font-medium leading-tight">Total de Corretores</p>
                  </CardContent>
                </Card>

                <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border hover:shadow-md transition-all duration-200">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <Award className="w-5 h-5" style={{ color: accentBlue }} />
                      <p style={{ color: textPrimary }} className="text-3xl font-bold">{stats.comTeste}</p>
                    </div>
                    <p style={{ color: textSecondary }} className="text-xs font-medium leading-tight">Testes Completos</p>
                  </CardContent>
                </Card>

                <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border hover:shadow-md transition-all duration-200">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <TrendingUp className="w-5 h-5" style={{ color: accentBlue }} />
                      <p style={{ color: textPrimary }} className="text-3xl font-bold">
                        {stats.percentualCompleto.toFixed(0)}%
                      </p>
                    </div>
                    <p style={{ color: textSecondary }} className="text-xs font-medium leading-tight mb-2">Taxa de Adesão</p>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${accentBlue}20` }}>
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${stats.percentualCompleto}%`, backgroundColor: accentBlue }}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border hover:shadow-md transition-all duration-200">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <BarChart3 className="w-5 h-5" style={{ color: textSecondary }} />
                      <p style={{ color: textPrimary }} className="text-xl font-bold">
                        {ENEAGRAMA_TIPOS[stats.tipoMaisComum].nome}
                      </p>
                    </div>
                    <p style={{ color: textSecondary }} className="text-xs font-medium leading-tight">
                      Tipo Mais Comum
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Gráficos Eneagrama - Alinhados lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gráfico de Distribuição por Tipo de Eneagrama - Barras Horizontais */}
                <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-sm">
                  <CardContent className="p-6">
                    <h3 style={{ color: textPrimary }} className="text-lg font-bold mb-6 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" style={{ color: accentBlue }} />
                      Distribuição por Tipo de Eneagrama
                    </h3>
                    
                    {/* Gráfico de Barras Horizontais */}
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((tipo, index) => {
                        const tipoData = ENEAGRAMA_TIPOS[tipo];
                        const data = stats.distribuicao[tipo] || { count: 0, percentual: 0 };
                        const total = [1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((sum, t) => {
                          const d = stats.distribuicao[t] || { count: 0 };
                          return sum + d.count;
                        }, 0);
                        const percentage = total > 0 ? (data.count / total) * 100 : 0;
                        
                        // Gradiente azul: do mais escuro ao mais claro (9 tons)
                        const blueGradient = [
                          '#1e3a8a', // Azul muito escuro
                          '#1e40af', // Azul escuro
                          '#2563eb', // Azul médio-escuro
                          '#3b82f6', // Azul médio
                          '#60a5fa', // Azul médio-claro
                          '#93c5fd', // Azul claro
                          '#bfdbfe', // Azul muito claro
                          '#dbeafe', // Azul extremamente claro
                          '#e0e7ff'  // Azul quase branco
                        ];
                        const blueColor = blueGradient[index];
                        
                        return (
                          <div key={tipo}>
                            <div className="flex justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-4 h-4 rounded"
                                  style={{ backgroundColor: blueColor }}
                                />
                                <span style={{ color: textPrimary }} className="font-semibold text-sm">
                                  {tipoData.nome}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span style={{ color: accentBlue }} className="font-bold text-lg">{data.count}</span>
                                <span style={{ color: textSecondary }} className="text-xs">
                                  ({percentage.toFixed(1)}%)
                                </span>
                              </div>
                            </div>
                            <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: `${blueColor}20` }}>
                              <div 
                                className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                                style={{ 
                                  width: `${percentage}%`,
                                  backgroundColor: blueColor
                                }}
                              >
                                {percentage > 5 && (
                                  <span className="text-xs font-bold text-white">{percentage.toFixed(1)}%</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Gráfico de Barras Verticais */}
                <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-sm">
                  <CardContent className="p-6">
                    <h3 style={{ color: textPrimary }} className="text-lg font-bold mb-6 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" style={{ color: accentBlue }} />
                      Comparativo por Tipo
                    </h3>
                    
                    <div className="flex justify-between gap-2 pt-8">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((tipo, index) => {
                        const tipoData = ENEAGRAMA_TIPOS[tipo];
                        const data = stats.distribuicao[tipo] || { count: 0, percentual: 0 };
                        const maxValue = Math.max(...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(t => (stats.distribuicao[t] || { count: 0 }).count));
                        const barHeight = maxValue > 0 ? (data.count / maxValue) * 100 : 0;
                        const blueGradient = [
                          '#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', 
                          '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#e0e7ff'
                        ];
                        
                        return (
                          <div key={tipo} className="flex-1 flex flex-col items-center gap-3">
                            {/* Barra - altura fixa de 280px para o container */}
                            <div className="w-full flex items-end justify-center" style={{ height: '280px' }}>
                              <div 
                                className="w-full rounded-t-lg transition-all duration-700 ease-out flex flex-col items-center justify-end pb-2"
                                style={{ 
                                  height: `${barHeight}%`,
                                  backgroundColor: blueGradient[index],
                                  minHeight: data.count > 0 ? '30px' : '0px'
                                }}
                              >
                                {data.count > 0 && (
                                  <span className="text-xs font-bold text-white">
                                    {data.count}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* Label com nome do tipo - altura fixa */}
                            <div className="text-center w-full h-12 flex flex-col justify-start">
                              <p style={{ color: textPrimary }} className="font-bold text-[10px] leading-tight mb-1">
                                {tipoData.nome}
                              </p>
                              <p style={{ color: accentBlue }} className="text-xs font-semibold">
                                {data.percentual.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Lista de Corretores para Visualização Individual */}
              <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 style={{ color: textPrimary }} className="text-lg font-bold flex items-center gap-2">
                      <Users className="w-5 h-5" style={{ color: accentBlue }} />
                      Resultados Individuais
                    </h3>
                    <div className="relative w-72">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: textSecondary }} />
                      <Input
                        type="text"
                        placeholder="Buscar corretor..."
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        className="pl-10 h-10"
                        style={{ 
                          backgroundColor: bgPrimary, 
                          borderColor: border,
                          color: textPrimary
                        }}
                      />
                    </div>
                  </div>

                  {/* Grid de Corretores */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {stats.corretoresPorTipo && Object.values(stats.corretoresPorTipo)
                      .flat()
                      .filter((corretor: any) => 
                        busca === '' || corretor.nome.toLowerCase().includes(busca.toLowerCase())
                      )
                      .map((corretor: any) => {
                        const blueGradient = [
                          '#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', 
                          '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#e0e7ff'
                        ];
                        const blueColor = blueGradient[corretor.tipo - 1];
                        
                        return (
                          <Card
                            key={corretor.id}
                            className="border cursor-pointer hover:shadow-lg transition-all duration-200 group"
                            style={{ 
                              backgroundColor: bgPrimary, 
                              borderColor: accentBlue
                            }}
                            onClick={() => {
                              setCorretorSelecionado({ id: corretor.id, nome: corretor.nome });
                            }}
                          >
                            <CardContent className="p-4">
                              {/* Header do Card */}
                              <div className="flex items-center justify-between mb-3">
                                <p style={{ color: textPrimary }} className="font-bold text-sm">{corretor.nome}</p>
                                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" style={{ color: accentBlue }} />
                              </div>

                              {/* Tipo Eneagrama */}
                              <div className="mb-3">
                                <div 
                                  className="w-full py-3 px-3 rounded-md text-center"
                                  style={{ 
                                    backgroundColor: blueColor,
                                    color: '#ffffff'
                                  }}
                                >
                                  <p className="text-sm font-bold">
                                    {ENEAGRAMA_TIPOS[corretor.tipo].nome}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                  </div>

                  {/* Mensagem se não houver resultados */}
                  {stats.corretoresPorTipo && 
                    Object.values(stats.corretoresPorTipo)
                      .flat()
                      .filter((corretor: any) => 
                        busca === '' || corretor.nome.toLowerCase().includes(busca.toLowerCase())
                      ).length === 0 && (
                    <div className="text-center py-12">
                      <Users className="w-12 h-12 mx-auto mb-3" style={{ color: textSecondary }} />
                      <p style={{ color: textSecondary }} className="text-sm">
                        Nenhum corretor encontrado com "{busca}"
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-20">
              <p style={{ color: textSecondary }}>Nenhuma estatística disponível</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Modal de Estatísticas Individuais */}
      {corretorSelecionado && (
        <EneagramaCorretorIndividualModal
          isOpen={!!corretorSelecionado}
          onClose={() => setCorretorSelecionado(null)}
          corretorId={corretorSelecionado.id}
          corretorNome={corretorSelecionado.nome}
        />
      )}
    </div>
  );
};
