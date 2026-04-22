/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Componente: Estatísticas MBTI para Administradores - REDESENHADO
 * Função: Exibir métricas gerais e individuais do teste MBTI com design harmonizado
 * Paleta: Azul (#3b82f6), Branco, Cinza - Design Minimalista e Profissional
 * Foco: Insights de gestão para administradores
 */

import { useState, useEffect } from 'react';
import { X, TrendingUp, Users, Award, BarChart3, ChevronRight, Lightbulb, Target, Briefcase, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { buscarEstatisticasMBTI, MBTIStats } from '@/services/testesEstatisticasService';
import { MBTICorretorIndividualModal } from './MBTICorretorIndividualModal';
import { useAuth } from '@/hooks/useAuth';

interface MBTIStatisticsProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCorretor?: (corretorId: number, corretorNome: string) => void;
  isDarkMode: boolean;
}

// Metadados dos tipos MBTI com INSIGHTS DE GESTÃO
const MBTI_METADATA: Record<string, { 
  nome: string; 
  cor: string; 
  gestao: string;
  pontoForte: string;
  cuidado: string;
}> = {
  'INTJ': { 
    nome: 'O Arquiteto', 
    cor: '#1e40af',
    gestao: 'Dê autonomia e desafios estratégicos',
    pontoForte: 'Planejamento e visão de longo prazo',
    cuidado: 'Pode ser excessivamente crítico'
  },
  'INTP': { 
    nome: 'O Lógico', 
    cor: '#2563eb',
    gestao: 'Permita análise profunda antes de decisões',
    pontoForte: 'Resolução de problemas complexos',
    cuidado: 'Pode se perder em análises'
  },
  'ENTJ': { 
    nome: 'O Comandante', 
    cor: '#1e3a8a',
    gestao: 'Delegue liderança de projetos desafiadores',
    pontoForte: 'Liderança natural e execução',
    cuidado: 'Pode ser dominador demais'
  },
  'ENTP': { 
    nome: 'O Debatedor', 
    cor: '#3b82f6',
    gestao: 'Canalizar criatividade com estrutura',
    pontoForte: 'Inovação e pensamento criativo',
    cuidado: 'Pode iniciar sem finalizar'
  },
  'INFJ': { 
    nome: 'O Advogado', 
    cor: '#6366f1',
    gestao: 'Valorize suas ideias e sensibilidade',
    pontoForte: 'Insight humano e empatia',
    cuidado: 'Pode levar críticas pessoalmente'
  },
  'INFP': { 
    nome: 'O Mediador', 
    cor: '#8b5cf6',
    gestao: 'Conecte tarefas a propósito maior',
    pontoForte: 'Criatividade e valores fortes',
    cuidado: 'Pode ser idealista demais'
  },
  'ENFJ': { 
    nome: 'O Protagonista', 
    cor: '#3b82f6',
    gestao: 'Use-o para motivar e desenvolver equipe',
    pontoForte: 'Liderança inspiradora',
    cuidado: 'Pode negligenciar próprias necessidades'
  },
  'ENFP': { 
    nome: 'O Ativista', 
    cor: '#60a5fa',
    gestao: 'Dê variedade e liberdade criativa',
    pontoForte: 'Entusiasmo contagiante',
    cuidado: 'Pode se dispersar facilmente'
  },
  'ISTJ': { 
    nome: 'O Logístico', 
    cor: '#475569',
    gestao: 'Confie processos e responsabilidades claras',
    pontoForte: 'Confiabilidade e organização',
    cuidado: 'Pode resistir a mudanças'
  },
  'ISFJ': { 
    nome: 'O Defensor', 
    cor: '#64748b',
    gestao: 'Reconheça dedicação e cuidado com detalhes',
    pontoForte: 'Lealdade e atenção aos outros',
    cuidado: 'Pode evitar conflitos necessários'
  },
  'ESTJ': { 
    nome: 'O Executivo', 
    cor: '#1e40af',
    gestao: 'Delegue gestão de processos e pessoas',
    pontoForte: 'Organização e praticidade',
    cuidado: 'Pode ser inflexível'
  },
  'ESFJ': { 
    nome: 'O Cônsul', 
    cor: '#2563eb',
    gestao: 'Use para manter harmonia da equipe',
    pontoForte: 'Colaboração e suporte',
    cuidado: 'Pode buscar aprovação em excesso'
  },
  'ISTP': { 
    nome: 'O Virtuoso', 
    cor: '#64748b',
    gestao: 'Dê problemas práticos para resolver',
    pontoForte: 'Habilidades técnicas',
    cuidado: 'Pode ser avesso a regras'
  },
  'ISFP': { 
    nome: 'O Aventureiro', 
    cor: '#94a3b8',
    gestao: 'Permita expressão criativa',
    pontoForte: 'Flexibilidade e sensibilidade',
    cuidado: 'Pode evitar planejamento'
  },
  'ESTP': { 
    nome: 'O Empreendedor', 
    cor: '#60a5fa',
    gestao: 'Dê ação imediata e resultados rápidos',
    pontoForte: 'Energia e pragmatismo',
    cuidado: 'Pode ser impulsivo'
  },
  'ESFP': { 
    nome: 'O Animador', 
    cor: '#93c5fd',
    gestao: 'Use para engajar e motivar clientes',
    pontoForte: 'Carisma e entusiasmo',
    cuidado: 'Pode evitar tarefas burocráticas'
  }
};

export const MBTIStatistics = ({
  isOpen,
  onClose,
  onSelectCorretor,
  isDarkMode
}: MBTIStatisticsProps) => {
  const { tenantId } = useAuth();
  const [stats, setStats] = useState<MBTIStats | null>(null);
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
      const data = await buscarEstatisticasMBTI(tenantId || undefined);
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
                  Estatísticas MBTI
                </h2>
                <p style={{ color: textSecondary }} className="text-sm">
                  Análise de personalidades e estilos cognitivos
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
            <div className="space-y-6">
              
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
                      <p style={{ color: textPrimary }} className="text-2xl font-bold">
                        {stats.tipoMaisComum}
                      </p>
                    </div>
                    <p style={{ color: textSecondary }} className="text-xs font-medium leading-tight">
                      {MBTI_METADATA[stats.tipoMaisComum]?.nome || 'Tipo MBTI'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Insights de Gestão - Destaque */}
              <Card style={{ backgroundColor: '#eff6ff', borderColor: accentBlue }} className="border-2 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <Lightbulb className="w-6 h-6 flex-shrink-0" style={{ color: accentBlue }} />
                    <div>
                      <h3 style={{ color: textPrimary }} className="text-lg font-bold mb-2">
                        Insights de Gestão - Perfil da Equipe MBTI
                      </h3>
                      <p style={{ color: textSecondary }} className="text-sm leading-relaxed">
                        Use esta análise para entender como sua equipe pensa, decide e processa informações. 
                        Cada dimensão representa um aspecto crucial para delegação de tarefas e liderança eficaz.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Gráficos MBTI - Distribuição e Comparativo por Tipo */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Gráfico de Distribuição por Tipo MBTI - Barras Horizontais */}
                <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-sm">
                  <CardContent className="p-6">
                    <h3 style={{ color: textPrimary }} className="text-lg font-bold mb-6 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" style={{ color: accentBlue }} />
                      Distribuição por Tipo
                    </h3>
                    
                    {/* Gráfico de Barras Horizontais */}
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {Object.keys(MBTI_METADATA).sort().map((tipo, index) => {
                        const tipoData = MBTI_METADATA[tipo];
                        const data = stats.distribuicao[tipo] || { count: 0, percentual: 0 };
                        const total = Object.values(stats.distribuicao).reduce((sum: number, d: any) => sum + d.count, 0);
                        const percentage = total > 0 ? (data.count / total) * 100 : 0;
                        
                        // Gradiente azul: 16 tons do mais escuro ao mais claro
                        const blueGradient = [
                          '#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', 
                          '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe',
                          '#e0e7ff', '#e8f0ff', '#f0f5ff', '#f5f9ff',
                          '#fafcff', '#fcfdff', '#fefeff', '#ffffff'
                        ];
                        const blueColor = blueGradient[index % blueGradient.length];
                        
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

                {/* Gráfico de Barras Verticais - Comparativo por Tipo */}
                <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-sm">
                  <CardContent className="p-6">
                    <h3 style={{ color: textPrimary }} className="text-lg font-bold mb-6 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" style={{ color: accentBlue }} />
                      Comparativo por Tipo
                    </h3>
                    
                    <div className="flex justify-between gap-1" style={{ paddingTop: '61px' }}>
                      {Object.keys(MBTI_METADATA)
                        .map(tipo => ({
                          tipo,
                          data: stats.distribuicao[tipo] || { count: 0, percentual: 0 }
                        }))
                        .sort((a, b) => b.data.count - a.data.count)
                        .slice(0, 10)
                        .map(({ tipo }, index) => {
                          const tipoData = MBTI_METADATA[tipo];
                          const data = stats.distribuicao[tipo] || { count: 0, percentual: 0 };
                          const maxValue = Math.max(...Object.values(stats.distribuicao).map((d: any) => d.count));
                          const barHeight = maxValue > 0 ? (data.count / maxValue) * 100 : 0;
                          const blueGradient = [
                            '#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', 
                            '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe',
                            '#e0e7ff', '#e8f0ff'
                          ];
                          
                          return (
                            <div key={tipo} className="flex-1 flex flex-col items-center gap-3">
                              {/* Barra - altura fixa de 280px para o container */}
                              <div className="w-full flex items-end justify-center" style={{ height: '280px' }}>
                                <div 
                                  className="w-full rounded-t-lg transition-all duration-700 ease-out flex flex-col items-center justify-end pb-2"
                                  style={{ 
                                    height: `${barHeight}%`,
                                    backgroundColor: blueGradient[index % blueGradient.length],
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
                                <p style={{ color: textPrimary }} className="font-bold text-[9px] leading-tight mb-1">
                                  {tipo}
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

              {/* Gráficos de Dimensões com Insights de Gestão */}
              <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-sm">
                <CardContent className="p-6">
                  <h3 style={{ color: textPrimary }} className="text-lg font-bold mb-8 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" style={{ color: accentBlue }} />
                    Distribuição por Dimensões MBTI
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Energia: E vs I */}
                    <div className="p-5 rounded-xl border" style={{ backgroundColor: bgPrimary, borderColor: border }}>
                      <div className="flex items-center justify-between mb-6">
                        <h4 style={{ color: textPrimary }} className="font-bold text-lg">Energia</h4>
                        <Target className="w-5 h-5" style={{ color: accentBlue }} />
                      </div>
                      <div className="space-y-6">
                        <div>
                          <div className="flex justify-between mb-3">
                            <span style={{ color: textPrimary }} className="font-semibold text-base">Extroversão (E)</span>
                            <div className="flex items-center gap-2">
                              <span style={{ color: accentBlue }} className="font-bold text-xl">{stats.dimensoes.Extroversion_Introversion.E}</span>
                              <span style={{ color: textSecondary }} className="text-sm">
                                ({((stats.dimensoes.Extroversion_Introversion.E / stats.comTeste) * 100).toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                          <div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: `${accentBlue}20` }}>
                            <div 
                              className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-3"
                              style={{ width: `${(stats.dimensoes.Extroversion_Introversion.E / stats.comTeste) * 100}%`, backgroundColor: accentBlue }}
                            >
                              <span className="text-xs font-bold text-white">{((stats.dimensoes.Extroversion_Introversion.E / stats.comTeste) * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between mb-3">
                            <span style={{ color: textPrimary }} className="font-semibold text-base">Introversão (I)</span>
                            <div className="flex items-center gap-2">
                              <span style={{ color: accentBlue }} className="font-bold text-xl">{stats.dimensoes.Extroversion_Introversion.I}</span>
                              <span style={{ color: textSecondary }} className="text-sm">
                                ({((stats.dimensoes.Extroversion_Introversion.I / stats.comTeste) * 100).toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                          <div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: '#94a3b820' }}>
                            <div 
                              className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-3"
                              style={{ width: `${(stats.dimensoes.Extroversion_Introversion.I / stats.comTeste) * 100}%`, backgroundColor: '#94a3b8' }}
                            >
                              <span className="text-xs font-bold text-white">{((stats.dimensoes.Extroversion_Introversion.I / stats.comTeste) * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Percepção: S vs N */}
                    <div className="p-5 rounded-xl border" style={{ backgroundColor: bgPrimary, borderColor: border }}>
                      <div className="flex items-center justify-between mb-6">
                        <h4 style={{ color: textPrimary }} className="font-bold text-lg">Percepção</h4>
                        <Target className="w-5 h-5" style={{ color: accentBlue }} />
                      </div>
                      <div className="space-y-6">
                        <div>
                          <div className="flex justify-between mb-3">
                            <span style={{ color: textPrimary }} className="font-semibold text-base">Sensação (S)</span>
                            <div className="flex items-center gap-2">
                              <span style={{ color: accentBlue }} className="font-bold text-xl">{stats.dimensoes.Sensing_Intuition.S}</span>
                              <span style={{ color: textSecondary }} className="text-sm">
                                ({((stats.dimensoes.Sensing_Intuition.S / stats.comTeste) * 100).toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                          <div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: `${accentBlue}20` }}>
                            <div 
                              className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-3"
                              style={{ width: `${(stats.dimensoes.Sensing_Intuition.S / stats.comTeste) * 100}%`, backgroundColor: accentBlue }}
                            >
                              <span className="text-xs font-bold text-white">{((stats.dimensoes.Sensing_Intuition.S / stats.comTeste) * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between mb-3">
                            <span style={{ color: textPrimary }} className="font-semibold text-base">Intuição (N)</span>
                            <div className="flex items-center gap-2">
                              <span style={{ color: accentBlue }} className="font-bold text-xl">{stats.dimensoes.Sensing_Intuition.N}</span>
                              <span style={{ color: textSecondary }} className="text-sm">
                                ({((stats.dimensoes.Sensing_Intuition.N / stats.comTeste) * 100).toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                          <div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: '#94a3b820' }}>
                            <div 
                              className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-3"
                              style={{ width: `${(stats.dimensoes.Sensing_Intuition.N / stats.comTeste) * 100}%`, backgroundColor: '#94a3b8' }}
                            >
                              <span className="text-xs font-bold text-white">{((stats.dimensoes.Sensing_Intuition.N / stats.comTeste) * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Decisão: T vs F */}
                    <div className="p-5 rounded-xl border" style={{ backgroundColor: bgPrimary, borderColor: border }}>
                      <div className="flex items-center justify-between mb-6">
                        <h4 style={{ color: textPrimary }} className="font-bold text-lg">Decisão</h4>
                        <Target className="w-5 h-5" style={{ color: accentBlue }} />
                      </div>
                      <div className="space-y-6">
                        <div>
                          <div className="flex justify-between mb-3">
                            <span style={{ color: textPrimary }} className="font-semibold text-base">Pensamento (T)</span>
                            <div className="flex items-center gap-2">
                              <span style={{ color: accentBlue }} className="font-bold text-xl">{stats.dimensoes.Thinking_Feeling.T}</span>
                              <span style={{ color: textSecondary }} className="text-sm">
                                ({((stats.dimensoes.Thinking_Feeling.T / stats.comTeste) * 100).toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                          <div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: `${accentBlue}20` }}>
                            <div 
                              className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-3"
                              style={{ width: `${(stats.dimensoes.Thinking_Feeling.T / stats.comTeste) * 100}%`, backgroundColor: accentBlue }}
                            >
                              <span className="text-xs font-bold text-white">{((stats.dimensoes.Thinking_Feeling.T / stats.comTeste) * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between mb-3">
                            <span style={{ color: textPrimary }} className="font-semibold text-base">Sentimento (F)</span>
                            <div className="flex items-center gap-2">
                              <span style={{ color: accentBlue }} className="font-bold text-xl">{stats.dimensoes.Thinking_Feeling.F}</span>
                              <span style={{ color: textSecondary }} className="text-sm">
                                ({((stats.dimensoes.Thinking_Feeling.F / stats.comTeste) * 100).toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                          <div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: '#94a3b820' }}>
                            <div 
                              className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-3"
                              style={{ width: `${(stats.dimensoes.Thinking_Feeling.F / stats.comTeste) * 100}%`, backgroundColor: '#94a3b8' }}
                            >
                              <span className="text-xs font-bold text-white">{((stats.dimensoes.Thinking_Feeling.F / stats.comTeste) * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Estilo: J vs P */}
                    <div className="p-5 rounded-xl border" style={{ backgroundColor: bgPrimary, borderColor: border }}>
                      <div className="flex items-center justify-between mb-6">
                        <h4 style={{ color: textPrimary }} className="font-bold text-lg">Estilo de Vida</h4>
                        <Target className="w-5 h-5" style={{ color: accentBlue }} />
                      </div>
                      <div className="space-y-6">
                        <div>
                          <div className="flex justify-between mb-3">
                            <span style={{ color: textPrimary }} className="font-semibold text-base">Julgamento (J)</span>
                            <div className="flex items-center gap-2">
                              <span style={{ color: accentBlue }} className="font-bold text-xl">{stats.dimensoes.Judging_Perceiving.J}</span>
                              <span style={{ color: textSecondary }} className="text-sm">
                                ({((stats.dimensoes.Judging_Perceiving.J / stats.comTeste) * 100).toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                          <div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: `${accentBlue}20` }}>
                            <div 
                              className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-3"
                              style={{ width: `${(stats.dimensoes.Judging_Perceiving.J / stats.comTeste) * 100}%`, backgroundColor: accentBlue }}
                            >
                              <span className="text-xs font-bold text-white">{((stats.dimensoes.Judging_Perceiving.J / stats.comTeste) * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between mb-3">
                            <span style={{ color: textPrimary }} className="font-semibold text-base">Percepção (P)</span>
                            <div className="flex items-center gap-2">
                              <span style={{ color: accentBlue }} className="font-bold text-xl">{stats.dimensoes.Judging_Perceiving.P}</span>
                              <span style={{ color: textSecondary }} className="text-sm">
                                ({((stats.dimensoes.Judging_Perceiving.P / stats.comTeste) * 100).toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                          <div className="h-4 rounded-full overflow-hidden" style={{ backgroundColor: '#94a3b820' }}>
                            <div 
                              className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-3"
                              style={{ width: `${(stats.dimensoes.Judging_Perceiving.P / stats.comTeste) * 100}%`, backgroundColor: '#94a3b8' }}
                            >
                              <span className="text-xs font-bold text-white">{((stats.dimensoes.Judging_Perceiving.P / stats.comTeste) * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

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
                        const metadata = MBTI_METADATA[corretor.tipo] || { nome: corretor.tipo, cor: accentBlue };
                        
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

                              {/* Tipo MBTI */}
                              <div className="mb-3">
                                <div 
                                  className="w-full py-3 px-3 rounded-md text-center"
                                  style={{ 
                                    backgroundColor: metadata.cor,
                                    color: '#ffffff'
                                  }}
                                >
                                  <p className="text-base font-bold mb-1">{corretor.tipo}</p>
                                  <p className="text-xs font-semibold">{metadata.nome}</p>
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
        <MBTICorretorIndividualModal
          isOpen={!!corretorSelecionado}
          onClose={() => setCorretorSelecionado(null)}
          corretorId={corretorSelecionado.id}
          corretorNome={corretorSelecionado.nome}
        />
      )}
    </div>
  );
};
