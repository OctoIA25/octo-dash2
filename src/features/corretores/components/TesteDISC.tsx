/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO  
 * Componente do Teste DISC - 10 Perguntas
 * Layout minimalista estilo Notion
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { DISC_QUESTIONS, DISC_PROFILES } from '@/data/discQuestions';
import { 
  DISCResponse, 
  validarResposta,
  calcularResultadoDISC
} from '../services/discTestService';
import { salvarResultadoDISC as salvarNaTabelaCorretores } from '../services/personalityTestsService';
import { buscarResultadosAdmin, salvarResultadoDISCAdmin } from '../services/adminTestsService';
import { normalizarPercentuaisDISC } from '../services/personalityAnalysisService';
import type { ResultadoDISC } from '../services/personalityTestsService';
import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';
import { ResultadoDisc } from '@/features/personalidade/components/ResultadoDisc';

interface TesteDISCProps {
  corretorId: string;
  corretorNome: string;
  corretorEmail?: string;
  isAdmin?: boolean;
  onConcluir: (resultado: any) => void;
  onVoltar: () => void;
}

type EstadoTeste = 'landing' | 'teste' | 'processando' | 'resultado';

export const TesteDISC = ({
  corretorId,
  corretorNome,
  corretorEmail,
  isAdmin = false,
  onConcluir,
  onVoltar
}: TesteDISCProps) => {
  // Iniciar direto no teste (pular landing page)
  const [estado, setEstado] = useState<EstadoTeste>('teste');
  const [perguntaAtual, setPerguntaAtual] = useState(0);
  const [respostas, setRespostas] = useState<DISCResponse[]>([]);
  const [respostaAtual, setRespostaAtual] = useState<DISCResponse>({ D: 0, I: 0, S: 0, C: 0 });
  const [resultadoFinal, setResultadoFinal] = useState<any>(null);

  const pergunta = DISC_QUESTIONS[perguntaAtual];
  const progresso = ((perguntaAtual + 1) / DISC_QUESTIONS.length) * 100;

  // 🔄 Carregar resultado salvo se existir
  useEffect(() => {
    const carregarResultadoSalvo = async () => {
      try {

        if (isAdmin) {
          const resultadoAdmin = await buscarResultadosAdmin(corretorId);

          if (!resultadoAdmin?.disc) {
            return;
          }

          // Normalizar — dados salvos antes do fix de divisor dinâmico
          // podem ter sido gravados com escala incoerente.
          const resultado = normalizarPercentuaisDISC({
            D: resultadoAdmin.disc.percentuais.D || 0,
            I: resultadoAdmin.disc.percentuais.I || 0,
            S: resultadoAdmin.disc.percentuais.S || 0,
            C: resultadoAdmin.disc.percentuais.C || 0
          });

          const dominantes = Object.entries(resultado)
            .filter(([_, percentual]) => percentual >= 0.25)
            .map(([perfil, percentual]) => ({ perfil, percentual }))
            .sort((a, b) => b.percentual - a.percentual);

          setResultadoFinal({ resultado, dominantes });
          setEstado('resultado');
          return;
        }
        
        const config = getSupabaseConfig();
        const headers = getAuthenticatedHeaders();
        
        // Buscar na tabela Corretores
        const response = await fetch(
          `${config.url}/rest/v1/Corretores?id=eq.${corretorId}&select=id,nm_corretor,disc_tipo_principal,disc_percentual_d,disc_percentual_i,disc_percentual_s,disc_percentual_c,disc_perfis_dominantes`,
          {
            method: 'GET',
            headers: headers
          }
        );
        
        if (!response.ok) {
          return;
        }
        
        const data = await response.json();
        
        if (!data || data.length === 0 || !data[0].disc_tipo_principal) {
          return;
        }
        
        const corretor = data[0];

        // Montar resultado normalizado (dados antigos podem não somar 1.0)
        const resultado = normalizarPercentuaisDISC({
          D: corretor.disc_percentual_d || 0,
          I: corretor.disc_percentual_i || 0,
          S: corretor.disc_percentual_s || 0,
          C: corretor.disc_percentual_c || 0
        });

        // Calcular dominantes (perfis >= 25%)
        const dominantes = Object.entries(resultado)
          .filter(([_, percentual]) => percentual >= 0.25)
          .map(([perfil, percentual]) => ({ perfil, percentual }))
          .sort((a, b) => b.percentual - a.percentual);
        
        // Mostrar direto a tela de resultado
        setResultadoFinal({ resultado, dominantes });
        setEstado('resultado');
        
      } catch (error) {
        console.error('❌ Erro ao carregar resultado salvo:', error);
      }
    };
    
    carregarResultadoSalvo();
  }, [corretorId, isAdmin]);

  // 🎯 Scroll para o topo sempre que mudar de pergunta
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [perguntaAtual]);

  const handleInputChange = (perfil: keyof DISCResponse, valor: string) => {
    const num = parseInt(valor) || 0;
    if (num >= 1 && num <= 4) {
      setRespostaAtual(prev => ({ ...prev, [perfil]: num }));
    }
  };

  const respostaValida = validarResposta(respostaAtual);

  const handleIniciarTeste = () => {
    setEstado('teste');
  };

  const handleProxima = () => {
    if (!respostaValida) return;

    const novasRespostas = [...respostas, respostaAtual];
    setRespostas(novasRespostas);

    if (perguntaAtual < DISC_QUESTIONS.length - 1) {
      setPerguntaAtual(prev => prev + 1);
      setRespostaAtual({ D: 0, I: 0, S: 0, C: 0 });
    } else {
      finalizarTeste(novasRespostas);
    }
  };

  const finalizarTeste = async (todasRespostas: DISCResponse[]) => {
    setEstado('processando');
    try {
      
      // 1. Calcular resultado localmente
      const { resultado, dominantes } = calcularResultadoDISC(todasRespostas);

      // 2. Preparar dados no formato do serviço personalityTestsService
      const resultadoFormatado: ResultadoDISC = {
        tipoPrincipal: dominantes[0]?.perfil || 'D',
        percentuais: {
          D: resultado.D,
          I: resultado.I,
          S: resultado.S,
          C: resultado.C
        },
        perfisDominantes: dominantes.map(d => ({
          perfil: d.perfil,
          percentual: d.percentual
        }))
      };

      if (isAdmin) {
        const sucesso = await salvarResultadoDISCAdmin(
          corretorId,
          corretorEmail || '',
          corretorNome,
          resultadoFormatado
        );

        if (!sucesso) {
          throw new Error('Não foi possível salvar o resultado DISC do admin');
        }

      } else {
        let corretorIdNumero: number;

        if (typeof corretorId === 'string') {
          corretorIdNumero = parseInt(corretorId, 10);
          if (isNaN(corretorIdNumero)) {
            throw new Error(`ID do corretor inválido (string): "${corretorId}"`);
          }
        } else if (typeof corretorId === 'number') {
          corretorIdNumero = corretorId;
        } else {
          throw new Error(`ID do corretor tem tipo inválido: ${typeof corretorId}`);
        }


        await salvarNaTabelaCorretores(
          corretorIdNumero, 
          resultadoFormatado,
          corretorNome,
          corretorEmail
        );
      }

      // 5. Armazenar resultado e mostrar tela
      setResultadoFinal({ resultado, dominantes });
      setEstado('resultado');
      
    } catch (error: any) {
      console.error('❌ Erro ao finalizar teste:', error);
      const mensagem = error.message || 'Tente novamente.';
      alert(`Erro ao salvar teste: ${mensagem}`);
      setEstado('teste');
    }
  };

  // LANDING PAGE
  if (estado === 'landing') {
    return (
      <div className="min-h-screen py-12 px-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="max-w-4xl mx-auto">
          
          {/* Botão Voltar */}
          <Button 
            variant="ghost" 
            onClick={onVoltar} 
            className="mb-8"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>

          {/* Hero Section */}
          <div className="text-center mb-16 animate-in fade-in slide-in-from-top duration-500">
            <div className="flex items-center justify-center gap-4 mb-4">
              <Sparkles className="w-10 h-10" style={{ color: '#3B82F6' }} />
              <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 bg-clip-text text-transparent">
                Teste DISC
              </h1>
              <Sparkles className="w-10 h-10" style={{ color: '#3B82F6' }} />
            </div>
            <p className="text-xl max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Descubra seu perfil comportamental e entenda como você age, comunica e toma decisões.
            </p>
          </div>

          {/* Card Principal */}
          <Card className="shadow-xl" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <CardContent className="p-12">
              
              {/* O que é o DISC */}
              <div className="mb-10">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Sparkles className="w-6 h-6 text-blue-500" />
                  O que é o DISC?
                </h2>
                <p className="leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
                  O DISC é uma ferramenta de análise comportamental que identifica 4 perfis principais:
                </p>
                
                {/* Perfis em Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {Object.values(DISC_PROFILES).map((profile) => (
                    <div 
                      key={profile.letra}
                      className="p-5 rounded-xl border-2 transition-all hover:shadow-md"
                      style={{ borderColor: profile.cor + '40', backgroundColor: profile.cor + '08' }}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                          style={{ backgroundColor: profile.cor }}
                        >
                          {profile.letra}
                        </div>
                        <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                          {profile.nome}
                        </h3>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {profile.descricao}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Como funciona */}
              <div className="mb-10 p-6 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <h3 className="font-bold text-lg mb-3" style={{ color: 'var(--text-primary)' }}>
                  Como funciona o teste?
                </h3>
                <ul className="space-y-2" style={{ color: 'var(--text-secondary)' }}>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold">1.</span>
                    Você verá 10 perguntas, cada uma com 4 palavras
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold">2.</span>
                    Avalie cada palavra de 1 a 4 (1 = pouco se identifica, 4 = muito se identifica)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold">3.</span>
                    Calculamos automaticamente seu perfil dominante
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold">4.</span>
                    Tempo estimado: 5-7 minutos
                  </li>
                </ul>
              </div>

              {/* Nome do Corretor */}
              <div className="mb-8 p-4 rounded-lg border" style={{ backgroundColor: '#3B82F610', borderColor: '#3B82F640' }}>
                <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Teste para:</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{corretorNome}</p>
                {corretorEmail && (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{corretorEmail}</p>
                )}
              </div>

              {/* Botão Iniciar */}
              <Button 
                onClick={handleIniciarTeste}
                className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg"
              >
                Descubra seu Perfil
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // PROCESSANDO
  if (estado === 'processando') {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Card className="w-full max-w-md shadow-xl" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Calculando seu perfil...</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Aguarde enquanto analisamos suas respostas</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // RESULTADO
  if (estado === 'resultado' && resultadoFinal) {
    // Apresentação extraída para ResultadoDisc (reutilizada pelo modal admin e pela
    // tela "Meu Perfil"). Cálculo/save permanecem em finalizarTeste(), intactos.
    return (
      <ResultadoDisc
        resultadoFinal={resultadoFinal}
        corretorNome={corretorNome}
        onVoltar={onVoltar}
      />
    );
  }


  // TELA DE TESTE (Perguntas)
  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-3xl mx-auto">
        
        {/* Título do Teste com Sparkles */}
        <div className="text-center mb-6 animate-in fade-in slide-in-from-top duration-500">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Sparkles className="w-8 h-8" style={{ color: '#598DC6' }} />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 bg-clip-text text-transparent">
              DISC
            </h1>
            <Sparkles className="w-8 h-8" style={{ color: '#598DC6' }} />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Descubra seu perfil comportamental
          </p>
        </div>
        
        {/* Header com Progresso */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Pergunta {perguntaAtual + 1} de {DISC_QUESTIONS.length}
            </span>
            <button
              type="button"
              onClick={() => {
                if (perguntaAtual > 0) {
                  // Voltar para pergunta anterior
                  setPerguntaAtual(prev => prev - 1);
                  // Restaurar resposta anterior se existir
                  if (respostas.length > 0) {
                    setRespostaAtual(respostas[respostas.length - 1]);
                    setRespostas(prev => prev.slice(0, -1));
                  }
                } else {
                  // Na primeira pergunta, voltar para o onboarding
                  onVoltar();
                }
              }}
              className="disc-btn-pouco-muito bg-gray-300 text-sm font-extrabold transition-all hover:scale-105 hover:shadow-lg cursor-pointer px-5 py-2.5 rounded-xl flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
          </div>
          <Progress value={progresso} className="h-2" />
        </div>

        {/* Card da Pergunta - Estilo Notion */}
        <Card className="shadow-lg" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)', borderWidth: '1px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <CardContent className="p-12">
            
            {/* Instrução */}
            <div className="mb-8 p-6 rounded-2xl" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)', borderWidth: '1px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <p className="text-lg text-center" style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>
                <strong>Como você se identifica com cada característica?</strong>
              </p>
            </div>

            {/* Opções - Layout Visual com Bolinhas */}
            <div className="space-y-6">
              {Object.entries(pergunta.opcoes).map(([perfil, palavra]) => {
                const profile = DISC_PROFILES[perfil];
                const valorSelecionado = respostaAtual[perfil as keyof DISCResponse];
                
                // 🎨 Gradiente de azul (quanto maior o número, mais escuro)
                const blueGradient = {
                  1: '#88C0E5',  // Azul Celeste (mais claro)
                  2: '#598DC6',  // Azul Médio
                  3: '#234992',  // Azul Royal
                  4: '#324F74'   // Azul Aço (mais escuro)
                };
                const corSelecionada = valorSelecionado > 0 ? blueGradient[valorSelecionado as 1 | 2 | 3 | 4] : 'var(--border)';
                
                return (
                  <div 
                    key={perfil}
                    className="group"
                  >
                    <div 
                      className="p-8 rounded-3xl transition-all duration-300"
                      style={{ 
                        borderColor: corSelecionada,
                        backgroundColor: valorSelecionado > 0 ? `${corSelecionada}15` : 'var(--bg-card)',
                        borderWidth: '2px',
                        borderStyle: 'solid',
                        boxShadow: valorSelecionado > 0 ? `0 8px 28px ${corSelecionada}25` : '0 3px 12px rgba(0,0,0,0.06)'
                      }}
                    >
                      {/* Palavra */}
                      <div className="mb-6">
                        <p className="font-bold text-2xl text-center" style={{ color: valorSelecionado > 0 ? corSelecionada : 'var(--text-primary)' }}>
                          {palavra}
                        </p>
                      </div>
                      
                      {/* Escala Visual com Bolinhas */}
                      <div className="flex items-center justify-center gap-4 mt-2">
                        <div className="flex items-center justify-center gap-6 flex-1 py-4">
                          {[1, 2, 3, 4].map((num) => {
                            const isSelected = valorSelecionado === num;
                            const baseSize = 24 + (num * 8);
                            
                            const corAtual = blueGradient[num as 1 | 2 | 3 | 4];
                            
                            // Espessura da borda aumenta com o número: 1=4px, 2=6px, 3=8px, 4=10px
                            const borderWidth = isSelected ? 4 + ((num - 1) * 2) : 4;
                            
                            return (
                              <div key={num} className="flex flex-col items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleInputChange(perfil as keyof DISCResponse, num.toString())}
                                  className="relative transition-all duration-300 hover:scale-110 focus:outline-none"
                                  style={{
                                    width: `${baseSize}px`,
                                    height: `${baseSize}px`,
                                    padding: 0
                                  }}
                                >
                                  <div
                                    className="absolute inset-0 rounded-full transition-all duration-300"
                                    style={{
                                      background: isSelected 
                                        ? `linear-gradient(135deg, ${corAtual}, ${corAtual}DD)` 
                                        : 'var(--bg-hover)',
                                      boxShadow: isSelected 
                                        ? `0 0 0 ${borderWidth}px ${corAtual}30, 0 8px 24px ${corAtual}60` 
                                        : '0 3px 10px rgba(0,0,0,0.15)',
                                      border: isSelected ? 'none' : '4px solid rgba(0, 0, 0, 0.15)',
                                      transform: isSelected ? 'scale(1.1)' : 'scale(1)'
                                    }}
                                  />
                                  
                                  {isSelected && (
                                    <div
                                      className="absolute inset-0 rounded-full flex items-center justify-center animate-in zoom-in duration-200"
                                    >
                                      <div 
                                        className="rounded-full bg-white dark:bg-slate-900" 
                                        style={{
                                          width: `${baseSize * 0.4}px`,
                                          height: `${baseSize * 0.4}px`,
                                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                                        }}
                                      ></div>
                                    </div>
                                  )}
                                  
                                  <div 
                                    className="absolute inset-0 rounded-full opacity-0 group-hover/button:opacity-20 transition-opacity duration-300"
                                    style={{ 
                                      background: 'radial-gradient(circle, white 0%, transparent 70%)' 
                                    }}
                                  />
                                </button>
                                
                                <span 
                                  className="text-sm font-bold"
                                  style={{ 
                                    color: isSelected ? corAtual : 'var(--text-secondary)',
                                    transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                                    transition: 'all 0.3s'
                                  }}
                                >
                                  {num}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      
                      {/* Labels Pouco e Muito - Abaixo (Clicáveis - Incremento/Decremento) */}
                      <div className="flex justify-between mt-3 px-4">
                        <style>{`
                          .disc-btn-pouco-muito {
                            color: #000000 !important;
                            border: 1.5px solid #E5E7EB !important;
                            background-color: #F9FAFB !important;
                            background: #F9FAFB !important;
                            box-shadow: 0 4px 12px rgba(156, 163, 175, 0.4) !important;
                          }
                          .disc-btn-pouco-muito:hover {
                            background-color: #F3F4F6 !important;
                            background: #F3F4F6 !important;
                            border-color: #D1D5DB !important;
                            box-shadow: 0 6px 16px rgba(156, 163, 175, 0.5) !important;
                          }
                        `}</style>
                        <button
                          type="button"
                          onClick={() => {
                            const valorAtual = respostaAtual[perfil as keyof DISCResponse];
                            const novoValor = Math.max(1, valorAtual - 1); // Diminui 1, mínimo 1
                            handleInputChange(perfil as keyof DISCResponse, novoValor.toString());
                          }}
                          className="disc-btn-pouco-muito bg-gray-300 text-sm font-extrabold transition-all hover:scale-105 hover:shadow-lg cursor-pointer px-5 py-2.5 rounded-xl"
                        >
                          ← Pouco
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const valorAtual = respostaAtual[perfil as keyof DISCResponse];
                            const novoValor = Math.min(4, valorAtual + 1); // Aumenta 1, máximo 4
                            handleInputChange(perfil as keyof DISCResponse, novoValor.toString());
                          }}
                          className="disc-btn-pouco-muito bg-gray-300 text-sm font-extrabold transition-all hover:scale-105 hover:shadow-lg cursor-pointer px-5 py-2.5 rounded-xl"
                        >
                          Muito →
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Botão Próxima/Finalizar */}
            <div className="mt-10">
              <Button 
                onClick={handleProxima}
                disabled={!respostaValida}
                className="w-full h-16 text-lg font-bold transition-all rounded-2xl"
                style={{
                  background: respostaValida ? '#598DC6' : 'var(--bg-hover)',
                  color: respostaValida ? '#ffffff' : 'var(--text-secondary)',
                  cursor: respostaValida ? 'pointer' : 'not-allowed',
                  opacity: respostaValida ? 1 : 0.4,
                  boxShadow: respostaValida ? '0 8px 24px rgba(89, 141, 198, 0.3)' : 'none'
                }}
              >
                {perguntaAtual < DISC_QUESTIONS.length - 1 ? (
                  <>
                    Próxima Pergunta
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                ) : (
                  <>
                    Finalizar Teste
                    <Sparkles className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            </div>

          </CardContent>
        </Card>

      </div>
    </div>
  );
};

