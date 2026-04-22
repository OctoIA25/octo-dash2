/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Componente: Meu Resumo - Relatório comportamental do corretor
 * Função: Exibir análise integrada dos 3 testes (DISC, Eneagrama, MBTI)
 * Paleta: Azul (#3b82f6), Branco, Cinza - Design Minimalista e Profissional
 */

import { useState, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Brain, Target, Star, TrendingUp, Lightbulb, AlertCircle, Award, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { buscarIdCorretorPorNome } from '@/features/corretores/services/buscarCorretorIdService';
import { buscarCorretorPorEmail } from '@/features/corretores/services/buscarCorretorPorEmailService';
import { buscarResultadoDISCCorretor } from '@/features/corretores/services/discResultsService';
import { buscarResultadoEneagramaCorretor } from '@/features/corretores/services/eneagramaResultsService';
import { buscarResultadoMBTICorretor } from '@/features/corretores/services/mbtiResultsService';
import { DISC_PROFILES } from '@/data/discQuestions';
import { ENEAGRAMA_TIPOS } from '@/data/eneagramaQuestions';

export const MeuResumoCompleto = () => {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const isDarkMode = currentTheme === 'preto' || currentTheme === 'cinza';
  
  // Paleta de cores minimalista
  const bgPrimary = isDarkMode ? '#0f172a' : '#ffffff';
  const bgCard = isDarkMode ? '#1e293b' : '#f8fafc';
  const border = isDarkMode ? '#334155' : '#e2e8f0';
  const textPrimary = isDarkMode ? '#f1f5f9' : '#0f172a';
  const textSecondary = isDarkMode ? '#94a3b8' : '#64748b';
  const accentBlue = '#3b82f6';
  
  
  const [loading, setLoading] = useState(true);
  const [resultados, setResultados] = useState<{
    disc: any | null;
    eneagrama: any | null;
    mbti: any | null;
  }>({
    disc: null,
    eneagrama: null,
    mbti: null
  });

  // Buscar resultados dos testes
  useEffect(() => {
    const carregarResultados = async () => {
      if (!user?.email) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const identidade = await buscarCorretorPorEmail(user.email, user.name);
        const id = identidade?.id ?? null;
        
        if (!id) {
          setLoading(false);
          return;
        }

        const [discResult, eneagramaResult, mbtiResult] = await Promise.all([
          buscarResultadoDISCCorretor(id).catch(() => null),
          buscarResultadoEneagramaCorretor(id).catch(() => null),
          buscarResultadoMBTICorretor(id).catch(() => null)
        ]);

        setResultados({
          disc: discResult,
          eneagrama: eneagramaResult,
          mbti: mbtiResult
        });

      } catch (error) {
        console.error('❌ Erro ao carregar resultados:', error);
      } finally {
        setLoading(false);
      }
    };

    carregarResultados();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" style={{ color: accentBlue }} />
          <p style={{ color: textSecondary }} className="text-sm">Carregando seu perfil...</p>
        </div>
      </div>
    );
  }

  const testesCompletos = [
    resultados.disc !== null,
    resultados.eneagrama !== null,
    resultados.mbti !== null
  ].filter(Boolean).length;

  if (testesCompletos === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: `${accentBlue}10` }}>
          <AlertCircle className="h-10 w-10" style={{ color: accentBlue }} />
        </div>
        <h3 className="text-xl font-semibold mb-2" style={{ color: textPrimary }}>
          Nenhum teste realizado
        </h3>
        <p style={{ color: textSecondary }} className="text-sm">
          Complete os testes de personalidade para visualizar seu resumo completo
        </p>
      </div>
    );
  }

  const discProfile = resultados.disc ? DISC_PROFILES[resultados.disc.tipo_principal as keyof typeof DISC_PROFILES] : null;
  const eneagramaTipo = resultados.eneagrama ? ENEAGRAMA_TIPOS[resultados.eneagrama.tipo_principal] : null;

  return (
    <div className="space-y-6 p-6" style={{ backgroundColor: bgPrimary }}>
      
      {/* Header com Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border hover:shadow-lg transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Award className="w-6 h-6" style={{ color: accentBlue }} />
              <p style={{ color: textPrimary }} className="text-3xl font-bold">{testesCompletos}</p>
            </div>
            <p style={{ color: textSecondary }} className="text-sm font-medium">Testes Completos</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: `${accentBlue}20` }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(testesCompletos / 3) * 100}%`, backgroundColor: accentBlue }} />
              </div>
              <span style={{ color: textSecondary }} className="text-xs font-medium">{Math.round((testesCompletos / 3) * 100)}%</span>
            </div>
          </CardContent>
        </Card>

        <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border hover:shadow-lg transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Brain className="w-6 h-6" style={{ color: '#8b5cf6' }} />
              <p style={{ color: textPrimary }} className="text-3xl font-bold">360°</p>
            </div>
            <p style={{ color: textSecondary }} className="text-sm font-medium">Análise Integrada</p>
            <p style={{ color: textSecondary }} className="text-xs mt-2">DISC + Eneagrama + MBTI</p>
          </CardContent>
        </Card>

        <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border hover:shadow-lg transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Target className="w-6 h-6" style={{ color: '#10b981' }} />
              <p style={{ color: textPrimary }} className="text-3xl font-bold">✓</p>
            </div>
            <p style={{ color: textSecondary }} className="text-sm font-medium">Perfil Mapeado</p>
            <p style={{ color: textSecondary }} className="text-xs mt-2">Pronto para insights</p>
          </CardContent>
        </Card>
      </div>

      {/* Perfil Integrado 360° */}
      <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${accentBlue}15` }}>
              <Brain className="h-6 w-6" style={{ color: accentBlue }} />
            </div>
            <div>
              <h2 className="text-2xl font-bold" style={{ color: textPrimary }}>Seu Perfil Integrado 360°</h2>
              <p style={{ color: textSecondary }} className="text-sm">Visão completa da sua personalidade</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* DISC */}
            {resultados.disc && discProfile && (
              <div className="rounded-xl p-5 border-2 transition-all duration-200 hover:shadow-md" style={{ 
                backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                borderColor: `${accentBlue}40`
              }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accentBlue}20` }}>
                    <Target className="h-5 w-5" style={{ color: accentBlue }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm" style={{ color: textSecondary }}>DISC - Como Você Age</h3>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="text-center py-3 rounded-lg" style={{ backgroundColor: `${accentBlue}10` }}>
                    <div className="text-4xl font-black mb-1" style={{ color: accentBlue }}>
                      {resultados.disc.tipo_principal}
                    </div>
                    <div className="text-sm font-bold" style={{ color: accentBlue }}>
                      {discProfile.nome}
                    </div>
                    <div className="text-xs mt-1" style={{ color: textSecondary }}>
                      {discProfile.descricao}
                    </div>
                  </div>
                  
                  {/* Percentuais */}
                  {resultados.disc.percentuais && (
                    <div className="space-y-2 pt-2">
                      {['D', 'I', 'S', 'C'].map((letra) => {
                        const valor = resultados.disc.percentuais[letra] || 0;
                        const percentual = Math.round(valor * 100);
                        return (
                          <div key={letra} className="flex items-center gap-2">
                            <span className="text-xs font-semibold w-4" style={{ color: textSecondary }}>{letra}</span>
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: `${accentBlue}15` }}>
                              <div 
                                className="h-full rounded-full transition-all duration-500" 
                                style={{ width: `${percentual}%`, backgroundColor: accentBlue }}
                              />
                            </div>
                            <span className="text-xs font-bold w-10 text-right" style={{ color: textPrimary }}>{percentual}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Eneagrama */}
            {resultados.eneagrama && eneagramaTipo && (
              <div className="rounded-xl p-5 border-2 transition-all duration-200 hover:shadow-md" style={{ 
                backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                borderColor: '#8b5cf640'
              }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#8b5cf620' }}>
                    <Star className="h-5 w-5" style={{ color: '#8b5cf6' }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm" style={{ color: textSecondary }}>Eneagrama - Por Que Você Age</h3>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="text-center py-3 rounded-lg" style={{ backgroundColor: '#8b5cf610' }}>
                    <div className="text-3xl mb-1">{eneagramaTipo.emoji}</div>
                    <div className="text-2xl font-black mb-1" style={{ color: '#8b5cf6' }}>
                      Tipo {resultados.eneagrama.tipo_principal}
                    </div>
                    <div className="text-sm font-bold" style={{ color: '#8b5cf6' }}>
                      {eneagramaTipo.nome}
                    </div>
                  </div>
                  
                  <div className="space-y-2 pt-2">
                    <div className="flex items-start gap-2 p-2 rounded-lg" style={{ backgroundColor: '#10b98110' }}>
                      <span className="text-sm">💪</span>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: '#10b981' }}>Motivação</p>
                        <p className="text-xs" style={{ color: textSecondary }}>{eneagramaTipo.motivacao}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 p-2 rounded-lg" style={{ backgroundColor: '#ef444410' }}>
                      <span className="text-sm">⚠️</span>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: '#ef4444' }}>Medo</p>
                        <p className="text-xs" style={{ color: textSecondary }}>{eneagramaTipo.medo}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MBTI */}
            {resultados.mbti && (
              <div className="rounded-xl p-5 border-2 transition-all duration-200 hover:shadow-md" style={{ 
                backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                borderColor: '#10b98140'
              }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#10b98120' }}>
                    <Lightbulb className="h-5 w-5" style={{ color: '#10b981' }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm" style={{ color: textSecondary }}>MBTI - Como Você Pensa</h3>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="text-center py-3 rounded-lg" style={{ backgroundColor: '#10b98110' }}>
                    <div className="text-3xl font-black mb-1" style={{ color: '#10b981' }}>
                      {resultados.mbti.tipo_mbti}
                    </div>
                    <div className="text-xs font-semibold" style={{ color: '#10b981' }}>
                      {resultados.mbti.descricao}
                    </div>
                  </div>
                  
                  {/* Percentuais */}
                  {resultados.mbti.percentuais && (
                    <div className="space-y-2 pt-2">
                      {Object.entries(resultados.mbti.percentuais).map(([key, value]: [string, any]) => (
                        <div key={key} className="flex items-center justify-between text-xs">
                          <span style={{ color: textSecondary }} className="font-medium">{key}</span>
                          <span style={{ color: textPrimary }} className="font-bold">{value}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Seus Superpoderes */}
      {resultados.disc && discProfile && (
        <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#10b98115' }}>
                <TrendingUp className="h-6 w-6" style={{ color: '#10b981' }} />
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: textPrimary }}>Seus Superpoderes</h2>
                <p style={{ color: textSecondary }} className="text-sm">Pontos fortes naturais</p>
              </div>
            </div>
            <div className="rounded-lg p-5 border" style={{ 
              backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
              borderColor: '#10b98130'
            }}>
              <p style={{ color: textPrimary }} className="leading-relaxed">
                {discProfile.pontos_fortes}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suas Características */}
      {resultados.disc && discProfile && (
        <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${accentBlue}15` }}>
                <Users className="h-6 w-6" style={{ color: accentBlue }} />
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: textPrimary }}>Suas Características</h2>
                <p style={{ color: textSecondary }} className="text-sm">Como você se comporta</p>
              </div>
            </div>
            <div className="rounded-lg p-5 border" style={{ 
              backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
              borderColor: `${accentBlue}30`
            }}>
              <p style={{ color: textPrimary }} className="leading-relaxed">
                {discProfile.caracteristicas}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sobre Seu Perfil */}
      {resultados.disc && discProfile && (
        <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#8b5cf615' }}>
                <Target className="h-6 w-6" style={{ color: '#8b5cf6' }} />
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: textPrimary }}>Sobre Seu Perfil</h2>
                <p style={{ color: textSecondary }} className="text-sm">Resumo da sua personalidade</p>
              </div>
            </div>
            <div className="rounded-lg p-5 border" style={{ 
              backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
              borderColor: '#8b5cf630'
            }}>
              <p style={{ color: textPrimary }} className="leading-relaxed">
                {discProfile.descricao}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
