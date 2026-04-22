/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Componente de Onboarding para Testes Comportamentais
 * Exibido para corretores que ainda não completaram os testes
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, Circle, Lock, Unlock, Sparkles, X, Info, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  verificarTestesCompletos, 
  buscarTestesCorretor, 
  iniciarTestes,
  calcularProgresso,
  TestesComportamentais 
} from '../services/testesComportamentaisService';
import { MBTI_TIPOS } from '@/data/mbtiQuestions';

interface TestesOnboardingProps {
  corretorId: string;
  corretorNome: string;
  corretorEmail?: string;
  onIniciarTeste: (teste: 'disc' | 'eneagrama' | 'mbti') => void;
  onTestesCompletos: () => void;
  modoVisualizacao?: boolean; // Se true, apenas visualiza resultados sem fechar automaticamente
}

export const TestesComportamentaisOnboarding = ({
  corretorId,
  corretorNome,
  corretorEmail,
  onIniciarTeste,
  onTestesCompletos,
  modoVisualizacao = false
}: TestesOnboardingProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [testes, setTestes] = useState<TestesComportamentais | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [iniciando, setIniciando] = useState(false);
  const [modalAberto, setModalAberto] = useState<'disc' | 'eneagrama' | 'mbti' | null>(null);
  const [tipoDetalheAberto, setTipoDetalheAberto] = useState<string | null>(null);

  // Debug: Log quando modalAberto mudar
  useEffect(() => {
  }, [modalAberto]);

  useEffect(() => {
    carregarDados();
  }, [corretorId]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const testesData = await buscarTestesCorretor(corretorId);
      setTestes(testesData);
      
      if (testesData) {
        const prog = await calcularProgresso(corretorId);
        setProgresso(prog);
        
        // Se todos completos, notificar (exceto no modo visualização)
        if (testesData.todos_completos && !modoVisualizacao) {
          onTestesCompletos();
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleIniciar = async () => {
    setIniciando(true);
    try {
      if (!testes) {
        // Primeira vez, criar registro
        await iniciarTestes(corretorId, corretorNome, corretorEmail);
        await carregarDados();
      }
      
      // Determinar qual teste iniciar e pular direto para as perguntas
      if (!testes?.disc_completo) {
        onIniciarTeste('disc');
      } else if (!testes?.eneagrama_completo) {
        onIniciarTeste('eneagrama');
      } else if (!testes?.mbti_completo) {
        // MBTI: Redirecionar para página de importação do 16Personalities
        navigate('/importar-16personalities');
      }
    } catch (error) {
      console.error('Erro ao iniciar:', error);
    } finally {
      setIniciando(false);
    }
  };

  // Debug: Log quando o componente renderizar
  useEffect(() => {
  }, [testes, modoVisualizacao]);

  const getProximoTeste = () => {
    if (!testes?.disc_completo) return 'DISC';
    if (!testes?.eneagrama_completo) return 'ENEAGRAMA';
    if (!testes?.mbti_completo) return 'MBTI';
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p style={{ color: 'var(--text-secondary)' }}>Carregando...</p>
        </div>
      </div>
    );
  }

  const proximoTeste = getProximoTeste();

  return (
    <div className="min-h-screen py-12 px-4 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-6xl w-full mx-auto">
        
        {/* Header */}
        <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom duration-700">
          <div className="flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-16 h-16 text-blue-500" />
          </div>
          
          <h1 className="text-4xl font-black mb-3 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
            Desbloqueie a Agente Elaine
          </h1>
          
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--text-primary)' }}>
            Complete os <strong>3 testes comportamentais</strong> e tenha acesso à sua assistente de IA especializada em análise de perfil profissional!
          </p>
        </div>

        {/* Call to Action */}
        <Card className="mb-8 animate-in fade-in slide-in-from-bottom duration-700 delay-150" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', borderWidth: '2px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
          <CardContent className="p-8 text-center">
            {testes?.todos_completos ? (
              <>
                <Unlock className="w-16 h-16 text-green-600 dark:text-green-300 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                  Agente Elaine Desbloqueada!
                </h2>
                <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                  Parabéns! Você completou todos os testes e agora tem acesso total à Agente Elaine.
                </p>
                <Button 
                  size="lg"
                  onClick={onTestesCompletos}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold px-8"
                >
                  Acessar Agente Elaine →
                </Button>
              </>
            ) : (
              <>
                <Lock className="w-16 h-16 text-gray-600 dark:text-slate-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                  {testes ? 'Continue sua jornada' : 'Comece sua jornada'}
                </h2>
                <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                  {testes 
                    ? `Complete o teste ${proximoTeste} para desbloquear a Agente Elaine.`
                    : 'Complete os 3 testes comportamentais e desbloqueie acesso à sua assistente de IA pessoal.'
                  }
                </p>
                <Button 
                  size="lg"
                  onClick={handleIniciar}
                  disabled={iniciando}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-black text-lg px-12 py-6 rounded-xl transition-all duration-300 hover:scale-105 transform border-2 border-blue-700/40 hover:border-blue-600/60"
                  style={{
                    boxShadow: '0 0 12px rgba(29, 78, 216, 0.25), 0 0 24px rgba(29, 78, 216, 0.15)'
                  }}
                >
                  {iniciando ? 'Carregando...' : testes ? `Continuar com ${proximoTeste}` : 'Iniciar Testes'}
                </Button>
                
                {/* Barra de Progresso */}
                {testes && (
                  <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        Progresso
                      </span>
                      <span className="text-sm font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                        {progresso}%
                      </span>
                    </div>
                    <Progress value={progresso} className="h-2" />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Cards dos Testes - MOVIDO PARA BAIXO */}
        <div className="grid md:grid-cols-3 gap-6 items-start">
          
          {/* Teste 1: DISC */}
          <Card 
            className="relative overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom duration-700 delay-300 hover:shadow-xl hover:scale-[1.02] h-full"
            style={{
              backgroundColor: testes?.disc_completo ? '#3B82F615' : 'var(--bg-card)',
              borderColor: testes?.disc_completo ? '#3B82F6' : 'var(--border)',
              borderWidth: '2px',
              boxShadow: testes?.disc_completo ? '0 8px 24px rgba(59, 130, 246, 0.15)' : '0 2px 8px rgba(0,0,0,0.08)'
            }}
          >
            <CardContent className="p-7 flex flex-col h-full">
              <div className="flex items-start justify-between mb-5">
                <div className="w-14 h-14 bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-3xl font-bold text-gray-700 dark:text-slate-300 dark:text-gray-300">D</span>
                </div>
                {testes?.disc_completo ? (
                  <CheckCircle className="w-7 h-7 text-green-600 dark:text-green-300" />
                ) : (
                  <Circle className="w-7 h-7" style={{ color: 'var(--text-secondary)' }} />
                )}
              </div>
              
              <h3 className="font-bold text-xl mb-3" style={{ color: 'var(--text-primary)' }}>DISC</h3>
              <p className="text-base mb-4 leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
                Desenvolvido por William Marston nos anos 1920, o <strong>DISC</strong> é uma das ferramentas mais utilizadas no mundo corporativo para compreender estilos comportamentais. Revela como você responde a desafios, influencia pessoas, mantém o ritmo e segue normas no ambiente profissional.
              </p>
              
              {/* Botões sempre alinhados - Ver Resultado (se concluído) + Saber mais */}
              <div className="space-y-2 mt-auto">
                {testes?.disc_completo ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onIniciarTeste('disc');
                    }}
                    className="w-full text-sm font-bold text-green-600 dark:text-green-300 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20 justify-start pl-3 cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Ver Resultado
                  </Button>
                ) : (
                  <div className="h-8"></div>
                )}
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setModalAberto('disc');
                  }}
                  className="w-full text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-950/20 justify-start pl-3 cursor-pointer"
                  style={{ color: '#3B82F6' }}
                >
                  <Info className="w-4 h-4 mr-2" />
                  Saber mais
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Teste 2: ENEAGRAMA */}
          <Card 
            className="relative overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom duration-700 delay-400 hover:shadow-xl hover:scale-[1.02] h-full"
            style={{
              backgroundColor: testes?.eneagrama_completo ? '#A855F715' : 'var(--bg-card)',
              borderColor: testes?.eneagrama_completo ? '#A855F7' : 'var(--border)',
              borderWidth: '2px',
              boxShadow: testes?.eneagrama_completo ? '0 8px 24px rgba(168, 85, 247, 0.15)' : '0 2px 8px rgba(0,0,0,0.08)'
            }}
          >
            <CardContent className="p-7 flex flex-col h-full">
              <div className="flex items-start justify-between mb-5">
                <div className="w-14 h-14 bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-3xl font-bold text-gray-700 dark:text-slate-300 dark:text-gray-300">E</span>
                </div>
                {testes?.eneagrama_completo ? (
                  <CheckCircle className="w-7 h-7 text-green-600 dark:text-green-300" />
                ) : (
                  <Circle className="w-7 h-7" style={{ color: 'var(--text-secondary)' }} />
                )}
              </div>
              
              <h3 className="font-bold text-xl mb-3" style={{ color: 'var(--text-primary)' }}>ENEAGRAMA</h3>
              <p className="text-base mb-4 leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
                Sistema milenar de compreensão da personalidade humana, o <strong>Eneagrama</strong> vai além do comportamento observável e revela suas <strong>motivações inconscientes</strong>, medos básicos e padrões automáticos de pensamento. Descubra o "porquê" por trás de suas ações.
              </p>
              
              {/* Botões sempre alinhados - Ver Resultado (se concluído) + Saber mais */}
              <div className="space-y-2 mt-auto">
                {testes?.eneagrama_completo ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onIniciarTeste('eneagrama');
                    }}
                    className="w-full text-sm font-bold text-green-600 dark:text-green-300 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20 justify-start pl-3 cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Ver Resultado
                  </Button>
                ) : (
                  <div className="h-8"></div>
                )}
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setModalAberto('eneagrama');
                  }}
                  className="w-full text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-950/20 justify-start pl-3 cursor-pointer"
                  style={{ color: '#3B82F6' }}
                >
                  <Info className="w-4 h-4 mr-2" />
                  Saber mais
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Teste 3: MBTI */}
          <Card 
            className="relative overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom duration-700 delay-500 hover:shadow-xl hover:scale-[1.02] h-full"
            style={{
              backgroundColor: testes?.mbti_completo ? '#10B98115' : 'var(--bg-card)',
              borderColor: testes?.mbti_completo ? '#10B981' : 'var(--border)',
              borderWidth: '2px',
              boxShadow: testes?.mbti_completo ? '0 8px 24px rgba(16, 185, 129, 0.15)' : '0 2px 8px rgba(0,0,0,0.08)'
            }}
          >
            <CardContent className="p-7 flex flex-col h-full">
              <div className="flex items-start justify-between mb-5">
                <div className="w-14 h-14 bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-3xl font-bold text-gray-700 dark:text-slate-300 dark:text-gray-300">M</span>
                </div>
                {testes?.mbti_completo ? (
                  <CheckCircle className="w-7 h-7 text-green-600 dark:text-green-300" />
                ) : (
                  <Circle className="w-7 h-7" style={{ color: 'var(--text-secondary)' }} />
                )}
              </div>
              
              <h3 className="font-bold text-xl mb-3" style={{ color: 'var(--text-primary)' }}>MBTI</h3>
              <p className="text-base mb-4 leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>
                Baseado na teoria de Carl Jung, o <strong>Indicador de Tipos Myers-Briggs</strong> é o teste de personalidade mais aplicado mundialmente. Revela suas <strong>preferências cognitivas</strong> naturais e como você processa informações, toma decisões e interage com o mundo ao seu redor.
              </p>
              
              {/* Botões sempre alinhados - Ver Resultado (se concluído) + Saber mais */}
              <div className="space-y-2 mt-auto">
                {testes?.mbti_completo ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate('/importar-16personalities');
                    }}
                    className="w-full text-sm font-bold text-green-600 dark:text-green-300 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/20 justify-start pl-3 cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Ver Resultado
                  </Button>
                ) : (
                  <div className="h-8"></div>
                )}
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setModalAberto('mbti');
                  }}
                  className="w-full text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-950/20 justify-start pl-3 cursor-pointer"
                  style={{ color: '#3B82F6' }}
                >
                  <Info className="w-4 h-4 mr-2" />
                  Saber mais
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>

      </div>

      {/* Modais Informativos */}
      
      {/* Modal DISC */}
      <Dialog open={modalAberto === 'disc'} onOpenChange={() => setModalAberto(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0" style={{ backgroundColor: 'var(--bg-card)', zIndex: 999999 }}>
          <div className="sticky top-0 z-10 px-6 py-4 border-b" style={{ backgroundColor: 'var(--bg-card)', borderColor: '#e5e7eb' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-2xl font-bold text-gray-700 dark:text-slate-300 dark:text-gray-300">D</span>
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    DISC - Perfil Comportamental
                  </DialogTitle>
                  <DialogDescription style={{ color: 'var(--text-secondary)' }}>
                    Desenvolvido por William Marston nos anos 1920
                  </DialogDescription>
                </div>
              </div>
              <button
                onClick={() => setModalAberto(null)}
                className="p-0 bg-transparent border-0 hover:bg-transparent focus:outline-none cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-5 h-5 text-black" />
              </button>
            </div>
          </div>
          
          <div className="overflow-y-auto px-6 py-6" style={{ maxHeight: 'calc(90vh - 80px)' }}>
          
          <div className="space-y-5">
            {/* Introdução */}
            <div>
              <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                O <strong>DISC</strong> é uma das ferramentas mais utilizadas no mundo corporativo para compreender estilos comportamentais. 
                Revela como você responde a desafios, influencia pessoas, mantém o ritmo e segue normas no ambiente profissional.
              </p>
            </div>

            {/* Tipos DISC */}
            <div>
              <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Tipos DISC
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {['D', 'I', 'S', 'C'].map((tipo) => (
                  <button
                    key={tipo}
                    onClick={() => setTipoDetalheAberto(`disc-${tipo}`)}
                    className="p-5 rounded-lg border-2 transition-all duration-200 hover:shadow-lg hover:scale-105 flex items-center justify-between group"
                    style={{ 
                      backgroundColor: 'var(--bg-card)', 
                      borderColor: 'var(--border)' 
                    }}
                  >
                    <span className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                      {tipo === 'D' ? 'Dominância' : tipo === 'I' ? 'Influência' : tipo === 'S' ? 'Estabilidade' : 'Conformidade'}
                    </span>
                    <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" style={{ color: 'var(--text-secondary)' }} />
                  </button>
                ))}
              </div>
            </div>

            {/* Aplicações Práticas */}
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-primary)', border: '2px solid var(--border)' }}>
              <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                Aplicações Práticas no Dia a Dia
              </h3>
              <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 dark:text-blue-300 dark:text-blue-400 font-bold mt-0.5">•</span>
                  <span><strong>Melhorar comunicação:</strong> Adapte sua forma de falar com clientes e colegas baseado no perfil deles</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 dark:text-blue-300 dark:text-blue-400 font-bold mt-0.5">•</span>
                  <span><strong>Identificar pontos fortes:</strong> Descubra suas habilidades naturais e como usá-las melhor</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 dark:text-blue-300 dark:text-blue-400 font-bold mt-0.5">•</span>
                  <span><strong>Adaptar vendas:</strong> Personalize sua abordagem de vendas ao perfil comportamental do cliente</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 dark:text-blue-300 dark:text-blue-400 font-bold mt-0.5">•</span>
                  <span><strong>Compreender conflitos:</strong> Entenda diferenças comportamentais e melhore relacionamentos</span>
                </li>
              </ul>
            </div>

            {/* Informações Adicionais */}
            <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-2 border-blue-200 dark:border-blue-900/40">
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Duração</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>~10 minutos</p>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Cenário</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>10 situações</p>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Foco</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Comportamento</p>
              </div>
            </div>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal ENEAGRAMA */}
      <Dialog open={modalAberto === 'eneagrama'} onOpenChange={() => setModalAberto(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0" style={{ backgroundColor: 'var(--bg-card)', zIndex: 999999 }}>
          <div className="sticky top-0 z-10 px-6 py-4 border-b" style={{ backgroundColor: 'var(--bg-card)', borderColor: '#e5e7eb' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-2xl font-bold text-gray-700 dark:text-slate-300 dark:text-gray-300">E</span>
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Eneagrama - Motivações Profundas
                  </DialogTitle>
                  <DialogDescription style={{ color: 'var(--text-secondary)' }}>
                    Sistema milenar de compreensão da personalidade humana
                  </DialogDescription>
                </div>
              </div>
              <button
                onClick={() => setModalAberto(null)}
                className="p-0 bg-transparent border-0 hover:bg-transparent focus:outline-none cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-5 h-5 text-black" />
              </button>
            </div>
          </div>
          
          <div className="overflow-y-auto px-6 py-6" style={{ maxHeight: 'calc(90vh - 80px)' }}>
          
          <div className="space-y-5">
            {/* Introdução */}
            <div>
              <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                O <strong>Eneagrama</strong> vai além do comportamento observável e revela suas <strong>motivações inconscientes</strong>, 
                medos básicos e padrões automáticos de pensamento. Descubra o "porquê" por trás de suas ações e como evoluir conscientemente.
              </p>
            </div>

            {/* Tipos Eneagrama */}
            <div>
              <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Os 9 Tipos de Personalidade
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  { num: 1, nome: 'Perfeccionista' },
                  { num: 2, nome: 'Prestativo' },
                  { num: 3, nome: 'Realizador' },
                  { num: 4, nome: 'Individualista' },
                  { num: 5, nome: 'Investigador' },
                  { num: 6, nome: 'Leal' },
                  { num: 7, nome: 'Entusiasta' },
                  { num: 8, nome: 'Desafiador' },
                  { num: 9, nome: 'Pacificador' }
                ].map((tipo) => (
                  <button
                    key={tipo.num}
                    onClick={() => setTipoDetalheAberto(`eneagrama-${tipo.num}`)}
                    className="p-3 rounded-lg border-2 transition-all duration-200 hover:shadow-md hover:scale-105 flex items-center justify-between group"
                    style={{ 
                      backgroundColor: 'var(--bg-card)', 
                      borderColor: 'var(--border)' 
                    }}
                  >
                    <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                      {tipo.nome}
                    </span>
                    <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" style={{ color: 'var(--text-secondary)' }} />
                  </button>
                ))}
              </div>
            </div>

            {/* Diferenciais */}
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-primary)', border: '2px solid var(--border)' }}>
              <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                Diferenciais do Eneagrama
              </h3>
              <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 dark:text-purple-300 dark:text-purple-400 font-bold mt-0.5">•</span>
                  <span><strong>Direções de Crescimento:</strong> Mostra seu caminho de evolução pessoal e como alcançar seu melhor</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 dark:text-purple-300 dark:text-purple-400 font-bold mt-0.5">•</span>
                  <span><strong>Padrões de Estresse:</strong> Revela como você regride sob pressão e o que evitar</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 dark:text-purple-300 dark:text-purple-400 font-bold mt-0.5">•</span>
                  <span><strong>Asas:</strong> Tipos vizinhos que influenciam e matizam sua personalidade principal</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 dark:text-purple-300 dark:text-purple-400 font-bold mt-0.5">•</span>
                  <span><strong>Subtipos:</strong> Variações baseadas em instintos (conservação, social, sexual)</span>
                </li>
              </ul>
            </div>

            {/* Informações Adicionais */}
            <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-2 border-purple-200 dark:border-purple-900/40">
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Duração</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>~15 minutos</p>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Cenário</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Introspectivo</p>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Foco</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Motivações</p>
              </div>
            </div>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal MBTI */}
      <Dialog open={modalAberto === 'mbti'} onOpenChange={() => setModalAberto(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0" style={{ backgroundColor: 'var(--bg-card)', zIndex: 999999 }}>
          <div className="sticky top-0 z-10 px-6 py-4 border-b" style={{ backgroundColor: 'var(--bg-card)', borderColor: '#e5e7eb' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-100 dark:bg-slate-800 dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                  <span className="text-2xl font-bold text-gray-700 dark:text-slate-300 dark:text-gray-300">M</span>
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    MBTI - Indicador de Tipos Myers-Briggs
                  </DialogTitle>
                  <DialogDescription style={{ color: 'var(--text-secondary)' }}>
                    Baseado na teoria de Carl Jung sobre tipos psicológicos
                  </DialogDescription>
                </div>
              </div>
              <button
                onClick={() => setModalAberto(null)}
                className="p-0 bg-transparent border-0 hover:bg-transparent focus:outline-none cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-5 h-5 text-black" />
              </button>
            </div>
          </div>
          
          <div className="overflow-y-auto px-6 py-6" style={{ maxHeight: 'calc(90vh - 80px)' }}>
          
          <div className="space-y-5">
            {/* Introdução */}
            <div>
              <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                O <strong>MBTI</strong> é o teste de personalidade mais aplicado mundialmente. Revela suas <strong>preferências cognitivas</strong> naturais 
                e como você processa informações, toma decisões e interage com o mundo ao seu redor.
              </p>
            </div>

            {/* Como Funciona o Teste MBTI */}
            <div>
              <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Como Funciona o Teste MBTI
              </h3>
              <div className="space-y-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <p>
                  O teste MBTI é composto por <strong>60 a 93 perguntas de escolha forçada</strong>, onde você seleciona entre duas opções que melhor descrevem suas preferências naturais. Não existem respostas certas ou erradas, pois o objetivo não é avaliar competências, mas sim identificar como você naturalmente pensa, processa informações e interage com o mundo. Cada pergunta foi cuidadosamente desenvolvida para revelar padrões consistentes em seu comportamento e estilo cognitivo.
                </p>
                
                <p>
                  Durante o teste, cada pergunta avalia uma das <strong>4 dicotomias fundamentais</strong>: Extroversão/Introversão (E/I), Sensação/Intuição (S/N), Pensamento/Sentimento (T/F) e Julgamento/Percepção (J/P). Suas respostas geram pontuações que indicam a intensidade de cada preferência, formando um perfil único. O resultado final combina suas tendências dominantes em cada par, criando um código de 4 letras (como INTJ, ENFP ou ISTJ) que representa um dos 16 tipos de personalidade possíveis.
                </p>
                
                <p>
                  O MBTI apresenta um <strong>índice de confiabilidade entre 75-90%</strong> quando retestado após 4 semanas, demonstrando sua consistência científica. Mais de <strong>2 milhões de pessoas</strong> realizam o teste anualmente ao redor do mundo. Utilizado por empresas da Fortune 500 em processos seletivos e desenvolvimento de equipes, o teste está disponível em mais de 115 países e foi traduzido para 29 idiomas, consolidando-se como a ferramenta de avaliação de personalidade mais aplicada no ambiente corporativo global.
                </p>
              </div>
            </div>

            {/* Tipos MBTI - Primeiro */}
            <div>
              <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                Os 16 Tipos de Personalidade
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'].map((tipo) => (
                  <button
                    key={tipo}
                    onClick={() => setTipoDetalheAberto(`mbti-${tipo}`)}
                    className="p-3 rounded-lg border-2 transition-all duration-200 hover:shadow-md hover:scale-105 flex items-center justify-between group"
                    style={{ 
                      backgroundColor: 'var(--bg-card)', 
                      borderColor: 'var(--border)' 
                    }}
                  >
                    <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                      {tipo}
                    </span>
                    <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" style={{ color: 'var(--text-secondary)' }} />
                  </button>
                ))}
              </div>
            </div>

            {/* O que o MBTI Revela */}
            <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-primary)', border: '2px solid var(--border)' }}>
              <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                O que o MBTI Revela
              </h3>
              <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-300 dark:text-emerald-400 font-bold mt-0.5">•</span>
                  <span><strong>Funções Cognitivas:</strong> A ordem em que você usa suas 8 funções mentais</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-300 dark:text-emerald-400 font-bold mt-0.5">•</span>
                  <span><strong>Estilo de Comunicação:</strong> Como você prefere se expressar e receber informações</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-300 dark:text-emerald-400 font-bold mt-0.5">•</span>
                  <span><strong>Compatibilidade:</strong> Com quais tipos você trabalha e se relaciona melhor</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-300 dark:text-emerald-400 font-bold mt-0.5">•</span>
                  <span><strong>Carreira Ideal:</strong> Profissões que se alinham com suas preferências naturais</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-300 dark:text-emerald-400 font-bold mt-0.5">•</span>
                  <span><strong>Pontos Cegos:</strong> Áreas de desenvolvimento e crescimento pessoal</span>
                </li>
              </ul>
            </div>

            {/* Informações Adicionais */}
            <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border-2 border-emerald-200 dark:border-emerald-900/40">
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Duração</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>~12 minutos</p>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Cenário</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>60-93 perguntas</p>
              </div>
              <div>
                <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Foco</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Cognição</p>
              </div>
            </div>
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhes dos Tipos */}
      <Dialog open={tipoDetalheAberto !== null} onOpenChange={() => setTipoDetalheAberto(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden p-0" style={{ backgroundColor: 'var(--bg-card)' }}>
          {tipoDetalheAberto && (() => {
            const renderTipoDetalhe = () => {
              // DISC TIPOS
              if (tipoDetalheAberto === 'disc-D') {
                return {
                  titulo: 'Dominância (D)',
                  descricao: 'O tipo Dominância é assertivo, direto e focado em resultados',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Características Principais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Pessoas com alta Dominância são <strong>orientadas a resultados, assertivas e competitivas</strong>. Elas gostam de desafios, tomam decisões rápidas e preferem ter controle sobre situações e pessoas.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Agem rapidamente e tomam decisões firmes</li>
                          <li>• Excelentes em situações de alta pressão</li>
                          <li>• Liderança natural e capacidade de assumir controle</li>
                          <li>• Foco intenso em objetivos e metas</li>
                          <li>• Confiança e coragem para assumir riscos calculados</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Desafios</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Podem ser percebidos como insensíveis ou impacientes</li>
                          <li>• Dificuldade em delegar tarefas</li>
                          <li>• Tendência a ignorar detalhes importantes</li>
                          <li>• Podem ser muito diretos, causando conflitos</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Como Trabalhar com Tipo D</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Seja direto, objetivo e focado em resultados. Apresente soluções, não problemas. Respeite seu tempo e evite conversas longas sem propósito. Dê autonomia e liberdade para agir.
                        </p>
                      </div>
                    </div>
                  )
                };
              }
              
              if (tipoDetalheAberto === 'disc-I') {
                return {
                  titulo: 'Influência (I)',
                  descricao: 'O tipo Influência é comunicativo, entusiasta e sociável',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Características Principais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Pessoas com alta Influência são <strong>comunicativas, entusiastas e criam conexões facilmente</strong>. Elas valorizam relacionamentos, reconhecimento social e ambientes dinâmicos e colaborativos.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Excelentes comunicadores e persuasores</li>
                          <li>• Criam rapport e conexão rapidamente</li>
                          <li>• Energia contagiante e otimismo natural</li>
                          <li>• Capacidade de motivar e inspirar equipes</li>
                          <li>• Criatividade e pensamento fora da caixa</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Desafios</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Podem perder o foco em tarefas repetitivas</li>
                          <li>• Dificuldade com detalhes e processos estruturados</li>
                          <li>• Tendem a prometer demais e entregar de menos</li>
                          <li>• Evitam conflitos e feedback negativo</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Como Trabalhar com Tipo I</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Seja amigável, reconheça suas conquistas publicamente e crie um ambiente colaborativo. Permita liberdade criativa e evite microgerenciamento. Use comunicação aberta e positiva.
                        </p>
                      </div>
                    </div>
                  )
                };
              }
              
              if (tipoDetalheAberto === 'disc-S') {
                return {
                  titulo: 'Estabilidade (S)',
                  descricao: 'O tipo Estabilidade é paciente, leal e cooperativo',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Características Principais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Pessoas com alta Estabilidade são <strong>pacientes, leais e valorizam harmonia e segurança</strong>. Elas preferem ambientes previsíveis, trabalham bem em equipe e são extremamente confiáveis.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Extremamente leais e confiáveis</li>
                          <li>• Excelentes ouvintes e mediadores de conflitos</li>
                          <li>• Consistência e persistência em tarefas</li>
                          <li>• Criam ambientes harmoniosos e estáveis</li>
                          <li>• Pacientes e calmam situações tensas</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Desafios</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Resistência a mudanças e novas situações</li>
                          <li>• Dificuldade em dizer "não" e estabelecer limites</li>
                          <li>• Evitam confrontos, mesmo quando necessário</li>
                          <li>• Podem ser muito lentos na tomada de decisões</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Como Trabalhar com Tipo S</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Ofereça segurança, previsibilidade e tempo para adaptar-se a mudanças. Reconheça sua lealdade e consistência. Comunique-se de forma gentil e evite pressão excessiva ou mudanças bruscas.
                        </p>
                      </div>
                    </div>
                  )
                };
              }
              
              if (tipoDetalheAberto === 'disc-C') {
                return {
                  titulo: 'Conformidade (C)',
                  descricao: 'O tipo Conformidade é analítico, preciso e detalhista',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Características Principais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Pessoas com alta Conformidade são <strong>analíticas, precisas e valorizam qualidade e exatidão</strong>. Elas seguem regras, buscam perfeição e tomam decisões baseadas em dados e fatos.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Atenção excepcional aos detalhes</li>
                          <li>• Pensamento analítico e lógico</li>
                          <li>• Alta qualidade e precisão no trabalho</li>
                          <li>• Sistemáticos e organizados</li>
                          <li>• Excelentes em planejamento e pesquisa</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Desafios</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Perfeccionismo pode gerar paralisia decisória</li>
                          <li>• Dificuldade com ambiguidade e improvisação</li>
                          <li>• Podem ser muito críticos consigo e com outros</li>
                          <li>• Evitam riscos e situações sem dados claros</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Como Trabalhar com Tipo C</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Forneça dados, evidências e tempo para análise. Respeite sua necessidade de precisão e não force decisões rápidas. Ofereça clareza em expectativas e evite mudanças constantes de direção.
                        </p>
                      </div>
                    </div>
                  )
                };
              }
              
              // ENEAGRAMA TIPOS
              const eneagramaTipos: Record<number, any> = {
                1: {
                  titulo: 'Tipo 1 - O Perfeccionista',
                  descricao: 'Íntegro, ético e com forte senso do certo e errado',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Motivação Central</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Busca <strong>integridade, correção e perfeição</strong>. Quer fazer o que é certo e melhorar o mundo ao seu redor. São movidos por um forte senso de propósito e responsabilidade moral.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Medo Básico</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Ser corrupto, mau, imperfeito ou deficiente. Temem cometer erros que possam comprometer sua integridade.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Ética inabalável e senso de justiça aguçado</li>
                          <li>• Excelência em organização e estabelecimento de padrões</li>
                          <li>• Responsabilidade e confiabilidade excepcionais</li>
                          <li>• Atenção meticulosa aos detalhes e qualidade</li>
                          <li>• Capacidade de melhorar processos e sistemas</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>No Trabalho</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Perfeccionistas, responsáveis, organizados e com altos padrões. Excelentes em garantir qualidade e criar processos eficientes. Lideram pelo exemplo e inspiram outros a elevar seus padrões. Podem ser muito autocríticos, rígidos e ter dificuldade em delegar quando sentem que outros não alcançarão seus padrões.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Quando Saudável</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Sabem e discernem, aceitam imperfeições com graça, são tolerantes e inspiram outros através de seu exemplo. Equilibram ideais com realidade prática.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Sob Estresse</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Tornam-se mais críticos, rígidos e controladores. Podem agir impulsivamente ou escapar para distração (como Tipo 7), abandonando temporariamente seus altos padrões.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Como se Relacionar com o Perfeccionista</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Reconheça seus esforços e qualidade do trabalho. Seja claro, organizado e cumpra compromissos. Evite críticas vagas - seja específico e construtivo. Dê tempo para processar mudanças.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Desenvolvimento</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Pratique autocompaixão e aceite imperfeições. Aprenda que "bom o suficiente" às vezes é melhor que perfeito. Relaxe seus padrões internos e permita-se errar. Cultive espontaneidade e leveza. Reconheça que a perfeição é inalcançável e que o progresso importa mais.
                        </p>
                      </div>
                    </div>
                  )
                },
                2: {
                  titulo: 'Tipo 2 - O Prestativo',
                  descricao: 'Generoso, empático e focado em ajudar os outros',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Motivação Central</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Busca <strong>ser amado, necessário e apreciado</strong>. Quer ser indispensável e criar conexões profundas. Encontram seu valor em serem úteis e cuidarem dos outros.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Medo Básico</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Ser rejeitado, não amado ou não necessário. Temem que, se não forem úteis, serão abandonados ou ignorados.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Empatia profunda e capacidade de sentir as necessidades dos outros</li>
                          <li>• Generosidade genuína e espírito de serviço</li>
                          <li>• Habilidade excepcional em criar conexões e relacionamentos</li>
                          <li>• Calor humano e energia positiva contagiante</li>
                          <li>• Excelentes em trabalho em equipe e colaboração</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>No Trabalho</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Empáticos, apoiadores e criam ambientes colaborativos. Excelentes em construir relacionamentos e trabalho em equipe. São o "coração" da equipe e mantêm o moral alto. Podem ter dificuldade em dizer não, estabelecer limites e negligenciar suas próprias necessidades enquanto cuidam dos outros.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Quando Saudável</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          São altruístas genuínos, cuidam de si mesmos também, e dão sem esperar retorno. Sabem estabelecer limites saudáveis e reconhecem seu próprio valor.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Sob Estresse</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Podem se tornar possessivos, manipulativos ou ressentidos quando não são reconhecidos. Adotam comportamentos agressivos (como Tipo 8) ou fazem exigências emocionais.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Como se Relacionar com o Prestativo</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Expresse apreciação genuína e reconheça seus esforços. Incentive-os a cuidar de si mesmos. Seja direto sobre suas necessidades. Ajude-os a entender que são valorizados por quem são, não apenas pelo que fazem.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Desenvolvimento</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Reconheça suas próprias necessidades e cuide de si mesmo. Aprenda a receber sem sempre precisar dar. Estabeleça limites saudáveis. Pratique autocuidado sem culpa. Entenda que seu valor não depende de ser útil aos outros - você é valioso por simplesmente existir.
                        </p>
                      </div>
                    </div>
                  )
                },
                3: {
                  titulo: 'Tipo 3 - O Realizador',
                  descricao: 'Ambicioso, eficiente e orientado ao sucesso',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Motivação Central</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Busca <strong>sucesso, admiração e validação externa</strong>. Quer ser valorizado por suas conquistas e ser visto como vencedor. Identificam-se profundamente com suas realizações.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Medo Básico</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Ser visto como fracassado, sem valor ou insignificante. Temem não ter valor intrínseco além de suas conquistas.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Produtividade excepcional e foco em resultados</li>
                          <li>• Adaptabilidade e capacidade de "ler a sala"</li>
                          <li>• Energia contagiante e capacidade de inspirar outros</li>
                          <li>• Eficiência e otimização de processos naturais</li>
                          <li>• Carisma e habilidades de apresentação impecáveis</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>No Trabalho</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Produtivos, eficientes e orientados a resultados. Excelentes em atingir metas e se adaptar a diferentes situações. Naturalmente carismáticos e sabem "vender" ideias. Podem sacrificar autenticidade pela imagem, trabalhar em excesso e definir seu valor apenas por conquistas externas.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Quando Saudável</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          São autênticos, equilibram fazer com ser, e inspiram outros através do exemplo. Reconhecem valor em si mesmos além das conquistas.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Sob Estresse</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Podem se tornar workaholics, desonestos sobre resultados ou extremamente competitivos. Adotam comportamentos de Tipo 9, tornando-se apáticos e desconectados.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Como se Relacionar com o Realizador</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Reconheça suas conquistas genuinamente. Seja eficiente e objetivo em comunicação. Incentive equilíbrio vida-trabalho. Valorize quem eles são, não apenas o que fazem. Dê feedback específico sobre resultados.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Desenvolvimento</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Conecte-se com sua autenticidade além das conquistas. Valorize quem você é, não apenas o que faz. Permita-se ser vulnerável e "fracassar" sem perder seu valor. Pratique estar presente sem produzir. Desenvolva hobbies sem objetivos de performance.
                        </p>
                      </div>
                    </div>
                  )
                },
                4: {
                  titulo: 'Tipo 4 - O Individualista',
                  descricao: 'Criativo, sensível e busca autenticidade',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Motivação Central</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Busca <strong>autenticidade, individualidade e significado profundo</strong>. Quer ser único e compreendido em sua essência. Procuram criar uma identidade única e expressar seu mundo interior.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Medo Básico</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Não ter identidade ou ser comum/ordinário. Temem ser fundamentalmente defeituosos ou insignificantes.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Criatividade profunda e perspectiva única do mundo</li>
                          <li>• Autenticidade e honestidade emocional</li>
                          <li>• Sensibilidade estética e apreciação pela beleza</li>
                          <li>• Empatia profunda com sofrimento alheio</li>
                          <li>• Capacidade de transformar dor em arte ou significado</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>No Trabalho</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Criativos, expressivos e trazem perspectivas únicas. Valorizam originalidade e profundidade emocional. Excelentes em design, artes e trabalhos que exigem visão única. Podem ser temperamentais, focar demais em si mesmos e ter dificuldade com tarefas rotineiras ou "comuns".
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Quando Saudável</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          São criativos, inspiradores e emocionalmente equilibrados. Usam sua sensibilidade para conectar profundamente com outros e criar beleza autêntica.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Sob Estresse</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Podem se tornar ensimesmados, melancólicos ou dramatizar situações. Adotam comportamentos de Tipo 2, tornando-se carentes e dependentes de outros para validação.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Como se Relacionar com o Individualista</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Reconheça e valorize sua unicidade. Seja autêntico e profundo em conversas. Permita espaço para expressão emocional sem julgamento. Evite banalidades - eles preferem profundidade. Aprecie suas contribuições criativas.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Desenvolvimento</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Pratique gratidão pelo que você tem. Foque no que está presente, não no que falta. Equilibre intensidade emocional com estabilidade prática. Desenvolva disciplina e rotina. Reconheça que você não precisa sofrer para ser autêntico ou criativo.
                        </p>
                      </div>
                    </div>
                  )
                },
                5: {
                  titulo: 'Tipo 5 - O Investigador',
                  descricao: 'Analítico, perceptivo e busca conhecimento',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Motivação Central</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Busca <strong>conhecimento, competência e autonomia</strong>. Quer entender o mundo e ser autossuficiente. Protegem sua energia e recursos como forma de sobrevivência.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Medo Básico</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Ser incompetente, ignorante ou sobrecarregado pelas demandas dos outros. Temem não ter recursos internos suficientes.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Capacidade excepcional de análise e pensamento profundo</li>
                          <li>• Independência e autossuficiência admiráveis</li>
                          <li>• Foco intenso e habilidade de dominar assuntos complexos</li>
                          <li>• Objetividade e visão imparcial de situações</li>
                          <li>• Criatividade intelectual e inovação teórica</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>No Trabalho</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Especialistas, pensadores profundos e excelentes pesquisadores. Valorizam privacidade e precisam de tempo para processar. Trazem insights únicos e soluções inovadoras. Podem se isolar demais, acumular conhecimento sem agir e ter dificuldade com trabalho em equipe ou demandas emocionais.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Quando Saudável</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          São visionários, generosos com seu conhecimento e equilibram intelecto com ação. Engajam-se com o mundo de forma confiante.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Sob Estresse</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Podem se tornar mais isolados, cínicos e mentalmente dispersos. Adotam comportamentos de Tipo 7, tornando-se hiperativos ou escapando para distrações sem foco.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Como se Relacionar com o Investigador</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Respeite sua necessidade de espaço e tempo sozinho. Seja claro e lógico em comunicação. Avise com antecedência sobre demandas de tempo/energia. Valorize sua expertise sem pressionar por interação social. Permita que observem antes de participar.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Desenvolvimento</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Pratique compartilhar seus conhecimentos e se conectar emocionalmente. Equilibre observação com participação. Confie que há recursos suficientes disponíveis. Desenvolva confiança em sua capacidade de lidar com demandas. Reconheça que experiência direta vale tanto quanto conhecimento teórico.
                        </p>
                      </div>
                    </div>
                  )
                },
                6: {
                  titulo: 'Tipo 6 - O Leal',
                  descricao: 'Responsável, comprometido e busca segurança',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Motivação Central</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Busca <strong>segurança, suporte e orientação confiável</strong>. Quer ter certeza e previsibilidade. Procuram construir alianças fortes e sistemas confiáveis.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Medo Básico</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Estar sem suporte ou orientação, ficar sozinho e vulnerável. Temem não ter capacidade de lidar com desafios sozinhos.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Lealdade profunda e comprometimento inabalável</li>
                          <li>• Excelente capacidade de antecipar riscos e problemas</li>
                          <li>• Responsabilidade e confiabilidade excepcionais</li>
                          <li>• Pensamento estratégico de contingência</li>
                          <li>• Capacidade de construir equipes coesas e confiáveis</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>No Trabalho</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Leais, responsáveis e excelentes em antecipar problemas. Constroem sistemas de segurança e são extremamente confiáveis. Valorizam honestidade e consistência. Podem ser ansiosos demais, duvidar excessivamente de si mesmos e ter dificuldade em tomar decisões sem validação externa.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Quando Saudável</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          São corajosos, confiantes e confiam em si mesmos. Equilibram precaução com ação decisiva e inspiram confiança nos outros.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Sob Estresse</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Podem se tornar paranóicos, reativos e excessivamente defensivos. Adotam comportamentos de Tipo 3, tornando-se workaholics competitivos ou preocupados com status.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Como se Relacionar com o Leal</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Seja consistente, honesto e confiável. Forneça segurança através de clareza e previsibilidade. Reconheça suas preocupações sem descartá-las. Seja paciente com processo de tomada de decisão. Demonstre lealdade e comprometimento.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Desenvolvimento</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Desenvolva confiança interna e pratique confiar nos outros. Reconheça sua força e coragem. Reduza ansiedade através de ação, não apenas planejamento. Confie em sua própria autoridade interna. Pratique tomar decisões sem buscar validação externa excessiva.
                        </p>
                      </div>
                    </div>
                  )
                },
                7: {
                  titulo: 'Tipo 7 - O Entusiasta',
                  descricao: 'Espontâneo, versátil e busca experiências',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Motivação Central</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Busca <strong>liberdade, variedade e felicidade</strong>. Quer estar satisfeito, ter experiências estimulantes e evitar dor. Procuram manter a mente ocupada com possibilidades futuras.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Medo Básico</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Ser privado, preso na dor ou perder oportunidades. Temem sofrer ou ficar presos em emoções negativas.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Otimismo contagiante e energia positiva</li>
                          <li>• Criatividade e capacidade de ver possibilidades infinitas</li>
                          <li>• Versatilidade e adaptabilidade excepcionais</li>
                          <li>• Entusiasmo que motiva e inspira outros</li>
                          <li>• Excelentes em brainstorming e inovação</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>No Trabalho</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Inovadores, otimistas e trazem energia vibrante para times. Excelentes em brainstorming e identificar oportunidades. Multitalentosos e versáteis. Podem se dispersar facilmente, evitar compromissos difíceis, ter dificuldade em completar projetos e fugir de emoções ou situações desconfortáveis.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Quando Saudável</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          São focados, gratos e encontram alegria no presente. Equilibram prazer com responsabilidade e compromisso profundo.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Sob Estresse</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Podem se tornar impulsivos, escapistas e excessivamente ocupados para evitar sentimentos. Adotam comportamentos de Tipo 1, tornando-se críticos, perfeccionistas e rígidos.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Como se Relacionar com o Entusiasta</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Mantenha conversas estimulantes e positivas. Dê liberdade e evite microgerenciamento. Seja flexível mas ajude com estrutura e follow-through. Reconheça suas ideias e entusiasmo. Permita que explorem antes de se comprometer.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Desenvolvimento</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Pratique estar presente e complete projetos antes de iniciar novos. Encare emoções difíceis em vez de evitá-las. Profundidade é tão valiosa quanto variedade. Desenvolva disciplina e compromisso. Reconheça que limitar opções pode trazer maior satisfação.
                        </p>
                      </div>
                    </div>
                  )
                },
                8: {
                  titulo: 'Tipo 8 - O Desafiador',
                  descricao: 'Poderoso, assertivo e busca controle',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Motivação Central</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Busca <strong>controle, força e proteção</strong>. Quer ser autossuficiente e determinar seu próprio caminho. Valorizam independência e poder pessoal acima de tudo.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Medo Básico</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Ser controlado, ferido ou manipulado pelos outros. Temem vulnerabilidade e fraqueza.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Liderança natural e capacidade de tomar decisões difíceis</li>
                          <li>• Coragem e disposição para enfrentar conflitos</li>
                          <li>• Proteção leal daqueles que amam</li>
                          <li>• Honestidade direta e autenticidade</li>
                          <li>• Energia e determinação inabaláveis</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>No Trabalho</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Líderes naturais, decisivos e protetores de sua equipe. Enfrentam desafios diretamente e inspiram confiança através de força. Excelentes em situações de crise e tomada de decisões rápidas. Podem ser confrontadores demais, dominantes e ter dificuldade em mostrar vulnerabilidade ou aceitar feedback.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Quando Saudável</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          São magnânimos, protetores e usam sua força para empoderar outros. Equilibram poder com compaixão e vulnerabilidade.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Sob Estresse</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Podem se tornar agressivos, vingativos e excessivamente controladores. Adotam comportamentos de Tipo 5, isolando-se emocionalmente e tornando-se secretos.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Como se Relacionar com o Desafiador</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Seja direto, honesto e não tenha medo de confronto saudável. Respeite sua autonomia e não tente controlá-los. Demonstre força e competência. Seja leal e mantenha confidências. Não leve para o pessoal sua intensidade.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Desenvolvimento</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Pratique vulnerabilidade e aceite ajuda dos outros. Reconheça que força também inclui gentileza e empatia. Use seu poder para empoderar, não dominar. Desenvolva paciência e consideração. Permita-se ser "fraco" sem perder seu poder pessoal.
                        </p>
                      </div>
                    </div>
                  )
                },
                9: {
                  titulo: 'Tipo 9 - O Pacificador',
                  descricao: 'Receptivo, tranquilo e busca harmonia',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Motivação Central</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Busca <strong>paz, harmonia e conexão</strong>. Quer que tudo e todos estejam em equilíbrio. Valorizam estabilidade e evitam perturbações em seu ambiente interno e externo.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Medo Básico</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Perda, separação, conflito ou fragmentação. Temem que expressar necessidades ou opiniões cause desconexão.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Capacidade excepcional de mediação e criar harmonia</li>
                          <li>• Empatia profunda e habilidade de ver múltiplas perspectivas</li>
                          <li>• Paciência e calma mesmo em situações tensas</li>
                          <li>• Presença tranquilizadora e estabilizadora</li>
                          <li>• Aceitação genuína dos outros como são</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>No Trabalho</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Mediadores naturais, pacientes e criam ambientes harmoniosos. Excelentes em ver todos os lados de uma situação e construir consenso. Trabalham bem em equipe e reduzem tensões. Podem evitar conflitos necessários, negligenciar prioridades próprias, ter dificuldade em tomar decisões e procrastinar em tarefas desconfortáveis.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Quando Saudável</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          São assertivos, engajados e trazem paz genuína (não apenas ausência de conflito). Sabem suas prioridades e agem com propósito.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Sob Estresse</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Podem se tornar apáticos, desconectados e excessivamente passivos. Adotam comportamentos de Tipo 6, tornando-se ansiosos, reativos e preocupados com segurança.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Como se Relacionar com o Pacificador</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Peça ativamente suas opiniões e valorize suas perspectivas. Seja paciente mas firme em buscar suas posições. Crie ambiente seguro para expressar discordância. Ajude a priorizar e tomar decisões. Reconheça sua importância e contribuições únicas.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Desenvolvimento</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Reconheça sua importância e priorize suas necessidades. Enfrente conflitos necessários em vez de evitá-los. Sua voz e opinião importam - use-as com confiança. Desenvolva assertividade sem medo de perder conexão. Pratique tomar posições claras e agir decisivamente.
                        </p>
                      </div>
                    </div>
                  )
                }
              };
              
              // Buscar tipo Eneagrama
              for (let i = 1; i <= 9; i++) {
                if (tipoDetalheAberto === `eneagrama-${i}` && eneagramaTipos[i]) {
                  return eneagramaTipos[i];
                }
              }
              
              // MBTI TIPOS - Completo com todos os 16 tipos
              const mbtiTipos: Record<string, any> = {
                'INTJ': {
                  titulo: 'INTJ - O Arquiteto',
                  descricao: 'Pensadores criativos e estratégicos, com um plano para tudo',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Os Arquitetos são um dos tipos de personalidade mais raros e capazes. Racionais e perspicazes, orgulham-se de poderem pensar por si mesmos, com talento especial em detectar falsidade e hipocrisia. Questionam tudo, não hesitando em desafiar regras ou enfrentar desaprovação. Altamente independentes, querem se libertar das expectativas de outras pessoas e abraçar suas próprias ideias. Demonstram uma sede insaciável de conhecimento e dominam qualquer assunto que desperte sua atenção.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Pensamento estratégico e visão de longo prazo</li>
                          <li>• Independência e determinação inabalável</li>
                          <li>• Agilidade mental e capacidade de transformar ideias em realidade</li>
                          <li>• Foco e precisão excepcionais</li>
                          <li>• Capacidade de visualizar o futuro e criar sistemas eficientes</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Podem ser vistos como insensíveis ou rudes quando estão apenas tentando ser honestos</li>
                          <li>• Dificuldade com expressão de sentimentos</li>
                          <li>• Perfeccionismo excessivo</li>
                          <li>• Frustração ao lidar com pessoas que consideram ineficientes ou incompetentes</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Cientistas, engenheiros, estrategistas, analistas de sistemas, desenvolvedores, pesquisadores, arquitetos de software, especialistas em codificação.
                        </p>
                      </div>
                    </div>
                  )
                },
                'INTP': {
                  titulo: 'INTP - O Lógico',
                  descricao: 'Inventores criativos, com uma sede insaciável de conhecimento',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Os Lógicos se orgulham de ter perspectivas únicas e grandes habilidades intelectuais. Suas mentes estão a todo vapor, repletas de ideias, questionamentos e percepções. Imaginativos e curiosos, têm um fascínio sem limites pelo funcionamento da própria mente. Adoram analisar padrões e detectam discrepâncias como Sherlock Holmes. São criativos e originais, com poucas coisas tão energizantes quanto compartilhar ideias ou engajar em debate animado com outra alma curiosa.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Pensamento analítico profundo e criatividade excepcional</li>
                          <li>• Originalidade e flexibilidade mental</li>
                          <li>• Capacidade de detectar padrões e inconsistências rapidamente</li>
                          <li>• Solução de problemas complexos</li>
                          <li>• Mente aberta para explorar pensamentos não convencionais</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Podem pensar demais até sobre decisões menos importantes</li>
                          <li>• Dificuldade em transformar ideias em ações práticas</li>
                          <li>• Paralisia por análise pode deixá-los sentindo-se ineficazes</li>
                          <li>• Desafios em oferecer suporte emocional aos outros</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Pesquisadores, programadores, matemáticos, físicos, filósofos, arquitetos de sistemas, cientistas, inventores.
                        </p>
                      </div>
                    </div>
                  )
                },
                'ENTJ': {
                  titulo: 'ENTJ - O Comandante',
                  descricao: 'Corajosos, criativos e determinados, sempre dando um jeito para tudo',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Os Comandantes são líderes natos com o dom do carisma e da confiança, exercendo autoridade para reunir multidões em prol de um objetivo comum. Destacam-se por um nível rigoroso de racionalidade, canalizando motivação, determinação e agilidade mental para alcançar qualquer meta. Adoram um bom desafio e acreditam que, com tempo e recursos adequados, podem alcançar qualquer objetivo. São dominadores, inflexíveis e implacáveis nas negociações, mas têm habilidade especial para reconhecer os talentos dos outros.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Liderança natural e pensamento estratégico</li>
                          <li>• Decisão rápida e eficiência incomparável</li>
                          <li>• Carisma poderoso e capacidade de inspirar outros</li>
                          <li>• Mantém foco de longo prazo enquanto executa cada etapa com determinação</li>
                          <li>• Habilidade de reconhecer talentos e formar equipes</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Distância emocional particularmente evidente</li>
                          <li>• Podem pisar na sensibilidade dos que consideram ineficientes ou preguiçosos</li>
                          <li>• Demonstrações emocionais são vistas como fraqueza</li>
                          <li>• Precisam lembrar que dependem de uma equipe funcional</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          CEOs, executivos, empreendedores, líderes empresariais, gerentes, consultores estratégicos, advogados, presidentes.
                        </p>
                      </div>
                    </div>
                  )
                },
                'ENTP': {
                  titulo: 'ENTP - O Inovador',
                  descricao: 'Pensadores curiosos e flexíveis, que não resistem a um desafio intelectual',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Inteligentes e audaciosos, os Inovadores não têm medo de discordar dos padrões estabelecidos ou de se opor a quase nada ou ninguém. Conhecedores e curiosos, com senso de humor lúdico, podem ser incrivelmente divertidos. São os melhores advogados do diabo, destacando-se em destruir argumentos e expor ideias. Têm grande inclinação à rebeldia, questionando toda crença, examinando toda ideia e desafiando toda regra. Não conseguem evitar reavaliar conceitos amplamente aceitos.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Criatividade excepcional e pensamento rápido</li>
                          <li>• Habilidade para debate e inovação constante</li>
                          <li>• Adaptabilidade mental e flexibilidade</li>
                          <li>• Capacidade de entender e explorar perspectivas de outras pessoas</li>
                          <li>• Visão e conhecimento amplos</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Podem fechar portas ao questionar abertamente superiores</li>
                          <li>• Dificuldade em seguir rotinas e executar ideias práticas</li>
                          <li>• Necessidade de desenvolver sensibilidade para manter relacionamentos significativos</li>
                          <li>• Tendência padrão de contrariar pode não ser sempre útil</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Empreendedores, inventores, consultores, advogados, cientistas, designers, inovadores, estrategistas.
                        </p>
                      </div>
                    </div>
                  )
                },
                'INFJ': {
                  titulo: 'INFJ - O Apoiador',
                  descricao: 'Visionários discretos, idealistas inspiradores e incansáveis',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Os Apoiadores podem ser o tipo de personalidade mais raro, mas certamente não passam despercebidos. Idealistas e firmes em seus princípios, não basta viver uma vida sem grandes desafios, querem fazer a diferença. Dão importância à integridade e só ficam satisfeitos quando fazem o que julgam ser certo. Têm vida interior ativa e desejo profundo de encontrar sentido para a existência. Se incomodam com a injustiça e sentem que devem usar seus pontos fortes para ajudar os outros e espalhar compaixão. Valorizam relacionamentos profundos e autênticos.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Empatia profunda e visão de futuro excepcional</li>
                          <li>• Criatividade singular e dedicação inabalável</li>
                          <li>• Integridade inegociável</li>
                          <li>• Habilidade de perceber motivações não expressadas pelos outros</li>
                          <li>• Comunicação afetuosa e sensível</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Podem se esgotar por esquecer de si mesmos ao ajudar outros</li>
                          <li>• Sensibilidade a críticas, mesmo construtivas</li>
                          <li>• Frustração quando boas intenções não são reconhecidas</li>
                          <li>• Sensação de serem diferentes ou incompreendidos</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Conselheiros, psicólogos, escritores, professores, coaches, profissionais de RH, terapeutas, profissionais de caridade.
                        </p>
                      </div>
                    </div>
                  )
                },
                'INFP': {
                  titulo: 'INFP - O Mediador',
                  descricao: 'Poéticos, bondosos e altruístas, sempre prontos para apoiar uma boa causa',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Os Mediadores têm uma vida interior ativa e apaixonada. Criativos e imaginativos, perdem-se alegremente em seus pensamentos. São conhecidos pela sensibilidade, tendo respostas emocionais profundas. Genuinamente curiosos sobre as profundezas da natureza humana, estão primorosamente sintonizados com próprios pensamentos e sentimentos. Solidários e não julgam, sempre dispostos a ouvir a história de outra pessoa. Têm talento para se expressar através de metáforas e personagens fictícios.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Empatia excepcional e criatividade profunda</li>
                          <li>• Idealismo autêntico e autenticidade singular</li>
                          <li>• Flexibilidade notável</li>
                          <li>• Dom de fazer outros se sentirem honrados e compreendidos</li>
                          <li>• Habilidade de explorar própria natureza interior</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Sensibilidade excessiva ao absorver problemas do mundo</li>
                          <li>• Dificuldade em estabelecer limites</li>
                          <li>• Tendência a fantasiar mais do que agir</li>
                          <li>• Podem se sentir sem rumo até encontrar propósito significativo</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Escritores, artistas, terapeutas, professores, profissionais de caridade, designers, poetas, atores.
                        </p>
                      </div>
                    </div>
                  )
                },
                'ENFJ': {
                  titulo: 'ENFJ - O Protagonista',
                  descricao: 'Otimistas inspiradores, prontos para agir de acordo com o que consideram correto',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Os Protagonistas sentem que devem servir a um propósito maior na vida. Atenciosos e idealistas, esforçam-se para impactar positivamente os outros e o mundo. Nascidos para ser líderes, inspiram com paixão e carisma. Têm habilidade impressionante para perceber motivações e convicções não expressadas. São comunicadores extremamente persuasivos e inspiradores, motivados por desejo genuíno de fazer a coisa certa. Nada proporciona mais alegria do que incentivar alguém a fazer o que é correto.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Liderança carismática excepcional e empatia aguçada</li>
                          <li>• Comunicação eloquente e inspiração natural</li>
                          <li>• Organização eficaz</li>
                          <li>• Capacidade de guiar pessoas para trabalharem juntas em busca de um bem maior</li>
                          <li>• Habilidade de liderar pelo exemplo</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Envolvimento excessivo nos problemas dos outros pode causar ressentimento</li>
                          <li>• Podem interpretar situações de forma equivocada ou dar conselhos inadequados</li>
                          <li>• Necessidade de equilibrar ajudar outros com cuidar de si mesmos</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Professores, coaches, profissionais de RH, políticos, gerentes, conselheiros, treinadores.
                        </p>
                      </div>
                    </div>
                  )
                },
                'ENFP': {
                  titulo: 'ENFP - O Ativista',
                  descricao: 'Animados, criativos, sociáveis e de espírito livre, sempre encontrando um motivo para sorrir',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Os Ativistas são verdadeiros espíritos livres: extrovertidos e com mente tão aberta quanto o coração. Encaram a vida com entusiasmo e otimismo, destacando-se em qualquer multidão. Mesmo sendo alma da festa, não se preocupam apenas em se divertir. São profundos, com desejo de estabelecer conexões emocionais significativas. Quando algo desperta sua imaginação, seu entusiasmo se torna incrivelmente contagiante. Irradiam energia positiva que atrai os demais. Valorizam conversas genuínas e sinceras.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Entusiasmo contagiante e criatividade vibrante</li>
                          <li>• Empatia natural e comunicação inspiradora</li>
                          <li>• Adaptabilidade impressionante</li>
                          <li>• Capacidade de se transformar de idealistas apaixonados em figuras descontraídas instantaneamente</li>
                          <li>• Habilidade de criar ambientes acolhedores</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Podem perder empolgação em projetos antes importantes</li>
                          <li>• Intuição pode levá-los a interpretar demais ações dos outros</li>
                          <li>• Preocupação com possíveis conflitos</li>
                          <li>• Dificuldade com autodisciplina, consistência e rotinas</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Artistas, jornalistas, consultores, empreendedores, professores, profissionais de marketing, designers.
                        </p>
                      </div>
                    </div>
                  )
                },
                'ISTJ': {
                  titulo: 'ISTJ - O Logístico',
                  descricao: 'Pessoas pragmáticas e focadas em fatos, com uma confiabilidade indiscutível',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Os Práticos orgulham-se de serem íntegros, dizendo o que realmente pensam e cumprindo sempre o que prometem. Representam uma parcela significativa da população e desempenham papel fundamental em sustentar base sólida e estável para a sociedade. A essência do autorrespeito dos Práticos reside em senso de integridade pessoal. Acreditam que existe maneira correta de agir em qualquer situação. Têm profundo respeito pela estrutura e tradição. São rápidos em reconhecer próprios erros, admitindo a realidade.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Confiabilidade incomparável e organização meticulosa</li>
                          <li>• Dedicação total e pragmatismo sólido</li>
                          <li>• Responsabilidade inabalável e ética profissional forte</li>
                          <li>• Clareza, lealdade e confiabilidade excepcionais</li>
                          <li>• Capacidade de manter postura realista e lógica mesmo sob estresse</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Podem julgar injustamente quem não tem mesmo autocontrole rigoroso</li>
                          <li>• Tendência a assumir responsabilidades de outras pessoas, levando à exaustão</li>
                          <li>• Para a ausência de estrutura representa caos, não liberdade</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Contadores, gerentes, administradores, analistas, auditores, engenheiros, inspetores.
                        </p>
                      </div>
                    </div>
                  )
                },
                'ISFJ': {
                  titulo: 'ISFJ - O Defensor',
                  descricao: 'Protetores muito dedicados e acolhedores, sempre prontos para defender quem amam',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          De maneira despretensiosa e discreta, os Defensores são verdadeiros pilares da sociedade. Trabalhadoras e dedicadas, demonstram profundo senso de responsabilidade. Pode-se contar com eles para cumprir prazos, lembrar aniversários e manter tradições. São autênticos altruístas, irradiando bondade e devoção. Lealdade é uma das características mais marcantes. Dificilmente deixam amizade acabar por falta de esforço. É comum largarem tudo para ajudar amigo ou familiar. Têm talento especial para fazer amigos se sentirem vistos, compreendidos e amados.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Dedicação incomparável e empatia profunda</li>
                          <li>• Confiabilidade total e atenção aos detalhes</li>
                          <li>• Lealdade absoluta e humildade genuína</li>
                          <li>• Habilidade de recordar detalhes da vida de outras pessoas</li>
                          <li>• Capacidade de fazer outros se sentirem especiais</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Intensidade do compromisso pode levar a exaustão e sobrecarga</li>
                          <li>• Perfeccionismo excessivo</li>
                          <li>• Dificuldade em expressar necessidades próprias</li>
                          <li>• Podem ficar ressentidos quando esforços passam despercebidos</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Enfermeiros, professores, administradores, assistentes sociais, profissionais de saúde, cuidadores.
                        </p>
                      </div>
                    </div>
                  )
                },
                'ESTJ': {
                  titulo: 'ESTJ - O Executivo',
                  descricao: 'Excelentes organizadores, insuperáveis ao gerenciar tanto coisas quanto pessoas',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Os Executivos representam a tradição e a ordem, usando compreensão do que é certo, errado e socialmente aceitável para fortalecer laços familiares e comunitários. Abraçam valores como honestidade, dedicação e dignidade. Destacam-se por dar conselhos e orientações claras. Têm orgulho de reunir pessoas. Lideram através do exemplo, demonstrando compromisso e honestidade com propósito, bem como rejeição total à preguiça e trapaça. Vivem em mundo de fatos claros e verificáveis. Se mantêm firmes aos princípios mesmo diante de alta resistência.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Organização exemplar e liderança natural</li>
                          <li>• Decisão rápida e eficiência máxima</li>
                          <li>• Responsabilidade total e convicção firme na lei e na autoridade</li>
                          <li>• Capacidade de tornar tarefas complicadas acessíveis</li>
                          <li>• Excelentes em implementar sistemas e gerenciar equipes</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Podem ter reputação de serem inflexíveis</li>
                          <li>• Dificuldade com emoções</li>
                          <li>• Expressam indignação quando parceiros os colocam em risco por incompetência</li>
                          <li>• Necessidade de reconhecer força individual além da coletiva</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Gerentes, executivos, militares, juízes, administradores, consultores empresariais, presidentes.
                        </p>
                      </div>
                    </div>
                  )
                },
                'ESFJ': {
                  titulo: 'ESFJ - O Cônsul',
                  descricao: 'Muito atenciosos, sociáveis e engajados com a comunidade, sempre dispostos a ajudar',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Para os Cônsules, a vida é mais saborosa quando compartilhada. São os pilares de diversas comunidades, acolhendo amigos, familiares e vizinhos não apenas em suas casas, mas também em seus corações. Acreditam no poder da hospitalidade e das boas maneiras. Generosos e confiáveis, assumem responsabilidade de manter família e comunidade unidas. Têm talento de fazer pessoas se sentirem apoiadas, cuidadas e seguras. Raramente esquecem aniversário ou feriado. Guardam na memória até menores detalhes da vida de amigos e familiares.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Empatia excepcional e organização impecável</li>
                          <li>• Sociabilidade natural e lealdade profunda</li>
                          <li>• Senso de dever forte</li>
                          <li>• Habilidade de fazer outros se sentirem especiais e valorizados</li>
                          <li>• Excelentes anfitriões e criadores de harmonia</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Têm bússola moral bem definida, podendo ser perturbador quando ações de outros não coincidem</li>
                          <li>• Dificuldade em aceitar que não podem controlar pensamentos ou comportamento de ninguém</li>
                          <li>• Podem levar para lado pessoal quando esforços não são reconhecidos</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Profissionais de eventos, enfermeiros, professores, vendedores, gerentes de RH, organizadores.
                        </p>
                      </div>
                    </div>
                  )
                },
                'ISTP': {
                  titulo: 'ISTP - O Virtuoso',
                  descricao: 'Experimentadores ousados e práticos, mestres em todos os tipos de ferramentas',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Os Virtuosos adoram explorar através das mãos e dos olhos, tocando e observando o mundo com racionalismo descontraído e curiosidade espirituosa. Têm talento nato para criar, passando de um projeto para outro, construindo tanto o útil quanto o supérfluo por diversão, aprendendo com o ambiente conforme avançam. São enigmáticos: simpáticos mas muito reservados, calmos mas subitamente espontâneos. Baseiam decisões em noção de realismo prático, enraizada em forte senso de justiça direta. Combinam criatividade, senso de humor e abordagem pragmática.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Habilidade técnica excepcional e adaptabilidade notável</li>
                          <li>• Calma sob pressão e praticidade inata</li>
                          <li>• Independência total</li>
                          <li>• Capacidade de aprender fazendo e criar soluções úteis</li>
                          <li>• Excelentes em situações que requerem resposta rápida</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Podem agir precipitadamente, presumindo que demais têm mesma natureza permissiva</li>
                          <li>• Dificuldade particular em antecipar emoções</li>
                          <li>• Desafios com limites e diretrizes</li>
                          <li>• Preferem liberdade de movimento</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Engenheiros, mecânicos, técnicos, pilotos, atletas, profissionais de TI, especialistas práticos.
                        </p>
                      </div>
                    </div>
                  )
                },
                'ISFP': {
                  titulo: 'ISFP - O Aventureiro',
                  descricao: 'Flexíveis e encantadores, sempre prontos para explorar e experimentar algo novo',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Os Aventureiros são verdadeiros artistas, mas não necessariamente da forma convencional. Para eles, a vida em si é uma tela para autoexpressão. Cada Aventureiro é indiscutivelmente único. Impulsionados pela curiosidade e ávidos por experiências novas, têm variedade fascinante de paixões e interesses. Adotam postura flexível e adaptável. Vivem um dia depois do outro, de acordo com o que sentem ser certo no momento. São notoriamente tolerantes e de mente aberta. Amam viver em mundo onde encontram todos os tipos de pessoas. Criativos e de espírito livre.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Criatividade singular e sensibilidade profunda</li>
                          <li>• Flexibilidade excepcional e apreciação estética aguçada</li>
                          <li>• Empatia natural</li>
                          <li>• Habilidade de encontrar alegria nas pequenas coisas</li>
                          <li>• Capacidade de apreciar o lado positivo da vida como ela é</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Dificuldades em estabelecer planos de longo prazo</li>
                          <li>• Sensibilidade excessiva a críticas</li>
                          <li>• Podem se sentir perdidos na correria da vida se não reservarem tempo para si</li>
                          <li>• Atentos ao que outros pensam deles</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Artistas, designers, músicos, fotógrafos, chefs, profissionais de moda, criadores.
                        </p>
                      </div>
                    </div>
                  )
                },
                'ESTP': {
                  titulo: 'ESTP - O Empresário',
                  descricao: 'Pessoas habilidosas, ativas e muito perceptivas, que realmente gostam de se arriscar',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Os Empreendedores sempre impactam o ambiente de alguma forma. Risonhos, animados e com humor afiado e prático, adoram ser centro das atenções. Vivem o momento e se lançam na ação. Gostam de drama, de paixão e de prazer, não por emoção, mas porque esses elementos são estimulantes para suas mentes lógicas. São forçados a tomar decisões importantes com base na realidade imediata e factual. Demonstram habilidade singular para detectar pequenas mudanças. Têm visão perspicaz e menos filtrada do que qualquer tipo.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Ação rápida excepcional e adaptabilidade total</li>
                          <li>• Carisma natural e pensamento prático aguçado</li>
                          <li>• Coragem notável</li>
                          <li>• Capacidade de observar e agir rapidamente com precisão</li>
                          <li>• Excelentes em pensar rapidamente e resolver problemas práticos</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Impulsividade marcante</li>
                          <li>• Podem ultrapassar limites e ignorar indivíduos mais sensíveis</li>
                          <li>• Dificuldade com compromissos de longo prazo</li>
                          <li>• Tendência a se envolver excessivamente no momento presente</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Empreendedores, vendedores, paramédicos, atletas, policiais, consultores, negociadores.
                        </p>
                      </div>
                    </div>
                  )
                },
                'ESFP': {
                  titulo: 'ESFP - O Animador',
                  descricao: 'Espontâneos, ativos e animados, a vida nunca fica entediante perto deles',
                  conteudo: (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Descrição Completa</h4>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                          Os Animadores normalmente se pegam cantarolando e dançando espontaneamente. Deixam-se levar pela emoção do momento e querem que todos os demais também se sintam assim. Nenhum outro tipo é tão generoso com tempo e energia quanto os Animadores, e nenhum outro faz isso de forma tão irresistível. Adoram os holofotes e o mundo inteiro é um palco. Extremamente sociáveis, apreciam as pequenas coisas da vida. Têm senso estético mais apurado do que qualquer tipo. São naturalmente curiosos, explorando novos designs e estilos com facilidade.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos Fortes</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Entusiasmo contagiante e sociabilidade natural</li>
                          <li>• Espontaneidade genuína e praticidade eficaz</li>
                          <li>• Otimismo inspirador</li>
                          <li>• Capacidade de transformar qualquer ocasião em festa</li>
                          <li>• Habilidade de fazer outros rirem e se divertirem</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Pontos de Atenção</h4>
                        <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
                          <li>• Podem se concentrar tanto nos prazeres imediatos que ignoram deveres e responsabilidades</li>
                          <li>• Dificuldade com análises complexas e planejamento de longo prazo</li>
                          <li>• Padrão de vida pode exceder possibilidades</li>
                          <li>• Não há insatisfação maior do que perceber que estão presos às circunstâncias</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Carreiras Ideais</h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          Animadores, atores, vendedores, professores, organizadores de eventos, profissionais de hospitalidade, entertainers.
                        </p>
                      </div>
                    </div>
                  )
                }
              };
              
              // Buscar tipo MBTI
              const mbtiKey = tipoDetalheAberto?.replace('mbti-', '');
              if (mbtiKey && mbtiTipos[mbtiKey]) {
                return mbtiTipos[mbtiKey];
              }
              
              // Fallback para tipos MBTI não mapeados
              if (tipoDetalheAberto?.startsWith('mbti-')) {
                return {
                  titulo: mbtiKey,
                  descricao: 'Tipo de personalidade Myers-Briggs',
                  conteudo: (
                    <div className="space-y-4">
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Informações detalhadas sobre este tipo em breve. Consulte 16personalities.com para análise completa.
                      </p>
                    </div>
                  )
                };
              }
              
              return {
                titulo: 'Informações do Tipo',
                descricao: '',
                conteudo: <p>Conteúdo não disponível</p>
              };
            };
            
            const tipoInfo = renderTipoDetalhe();
            
            return (
              <>
                <div className="sticky top-0 z-10 px-6 py-4 border-b" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {tipoInfo.titulo}
                      </DialogTitle>
                      {tipoInfo.descricao && (
                        <DialogDescription style={{ color: 'var(--text-secondary)' }}>
                          {tipoInfo.descricao}
                        </DialogDescription>
                      )}
                    </div>
                    <button
                      onClick={() => setTipoDetalheAberto(null)}
                      className="p-0 bg-transparent border-0 hover:bg-transparent focus:outline-none cursor-pointer"
                      aria-label="Fechar"
                    >
                      <X className="w-5 h-5 text-black" />
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto px-8 py-8" style={{ maxHeight: 'calc(85vh - 80px)' }}>
                  {tipoInfo.conteudo}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

    </div>
  );
};

