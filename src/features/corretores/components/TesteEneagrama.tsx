/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO  
 * Componente do Teste de Eneagrama - 10 Perguntas de Escolha Forçada
 * Layout minimalista estilo Notion
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, Sparkles, Star } from 'lucide-react';
import { ENEAGRAMA_QUESTIONS, ENEAGRAMA_TIPOS } from '@/data/eneagramaQuestions';
import { 
  EneagramaResponse, 
  validarRespostaEneagrama,
  calcularResultadoEneagrama
} from '../services/eneagramaService';
import { salvarResultadoEneagrama } from '../services/personalityTestsService';
import { buscarResultadosAdmin, salvarResultadoEneagramaAdmin } from '../services/adminTestsService';
import type { ResultadoEneagrama } from '../services/personalityTestsService';
import { ResultadoEneagrama as ResultadoEneagramaView } from '@/features/personalidade/components/ResultadoEneagrama';
import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

interface TesteEneagramaProps {
  corretorId: string;
  corretorNome: string;
  corretorEmail?: string;
  isAdmin?: boolean;
  onConcluir: (resultado: any) => void;
  onVoltar: () => void;
}

type EstadoTeste = 'landing' | 'teste' | 'processando' | 'resultado';

export const TesteEneagrama = ({
  corretorId,
  corretorNome,
  corretorEmail,
  isAdmin = false,
  onConcluir,
  onVoltar
}: TesteEneagramaProps) => {
  // Iniciar direto no teste (pular landing page)
  const [estado, setEstado] = useState<EstadoTeste>('teste');
  const [perguntaAtual, setPerguntaAtual] = useState(0);
  const [respostas, setRespostas] = useState<EneagramaResponse[]>([]);
  const [respostaAtual, setRespostaAtual] = useState<EneagramaResponse | null>(null);
  const [resultadoFinal, setResultadoFinal] = useState<any>(null);

  const pergunta = ENEAGRAMA_QUESTIONS[perguntaAtual];
  const progresso = ((perguntaAtual + 1) / ENEAGRAMA_QUESTIONS.length) * 100;

  // 🔄 Carregar resultado salvo se existir
  useEffect(() => {
    const carregarResultadoSalvo = async () => {
      try {

        if (isAdmin) {
          const resultadoAdmin = await buscarResultadosAdmin(corretorId);

          if (!resultadoAdmin?.eneagrama) {
            return;
          }

          const scores = resultadoAdmin.eneagrama.scores;
          const topTipos = Object.entries(scores)
            .map(([tipo, score]) => ({ tipo: parseInt(tipo), score: score as number }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

          const resultado = {
            tipoPrincipal: resultadoAdmin.eneagrama.tipoPrincipal,
            scores,
            topTipos
          };

          setResultadoFinal(resultado);
          setEstado('resultado');
          return;
        }
        
        const config = getSupabaseConfig();
        const headers = getAuthenticatedHeaders();
        
        // Buscar na tabela Corretores
        const response = await fetch(
          `${config.url}/rest/v1/Corretores?id=eq.${corretorId}&select=id,nm_corretor,eneagrama_tipo_principal,eneagrama_score_tipo_1,eneagrama_score_tipo_2,eneagrama_score_tipo_3,eneagrama_score_tipo_4,eneagrama_score_tipo_5,eneagrama_score_tipo_6,eneagrama_score_tipo_7,eneagrama_score_tipo_8,eneagrama_score_tipo_9`,
          {
            method: 'GET',
            headers: headers
          }
        );
        
        if (!response.ok) {
          return;
        }
        
        const data = await response.json();
        
        if (!data || data.length === 0 || !data[0].eneagrama_tipo_principal) {
          return;
        }
        
        const corretor = data[0];
        
        // Montar resultado para exibição
        const scores = {
          1: corretor.eneagrama_score_tipo_1 || 0,
          2: corretor.eneagrama_score_tipo_2 || 0,
          3: corretor.eneagrama_score_tipo_3 || 0,
          4: corretor.eneagrama_score_tipo_4 || 0,
          5: corretor.eneagrama_score_tipo_5 || 0,
          6: corretor.eneagrama_score_tipo_6 || 0,
          7: corretor.eneagrama_score_tipo_7 || 0,
          8: corretor.eneagrama_score_tipo_8 || 0,
          9: corretor.eneagrama_score_tipo_9 || 0
        };
        
        // Calcular top tipos (ordenar por score)
        const topTipos = Object.entries(scores)
          .map(([tipo, score]) => ({ tipo: parseInt(tipo), score: score as number }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        
        const resultado = {
          tipoPrincipal: corretor.eneagrama_tipo_principal,
          scores,
          topTipos
        };
        
        // Mostrar direto a tela de resultado
        setResultadoFinal(resultado);
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

  const handleSelectOpcao = (opcao: EneagramaResponse) => {
    setRespostaAtual(opcao);
  };

  const respostaValida = validarRespostaEneagrama(respostaAtual);

  const handleIniciarTeste = () => {
    setEstado('teste');
  };

  const handleProxima = () => {
    if (!respostaValida || !respostaAtual) return;

    const novasRespostas = [...respostas, respostaAtual];
    setRespostas(novasRespostas);

    if (perguntaAtual < ENEAGRAMA_QUESTIONS.length - 1) {
      setPerguntaAtual(prev => prev + 1);
      setRespostaAtual(null);
    } else {
      finalizarTeste(novasRespostas);
    }
  };

  const finalizarTeste = async (todasRespostas: EneagramaResponse[]) => {
    setEstado('processando');
    try {
      
      // Validar que temos exatamente 10 respostas
      if (todasRespostas.length !== 10) {
        throw new Error(`Número inválido de respostas: ${todasRespostas.length}. Esperado: 10`);
      }
      
      // Validar que todas as respostas são 'A' ou 'B'
      const respostasInvalidas = todasRespostas.filter((r, i) => r !== 'A' && r !== 'B');
      if (respostasInvalidas.length > 0) {
        throw new Error(`Respostas inválidas encontradas: ${JSON.stringify(respostasInvalidas)}`);
      }
      
      // 1. Calcular resultado localmente
      const resultado = calcularResultadoEneagrama(todasRespostas);

      // 2. Preparar dados no formato do serviço personalityTestsService
      const resultadoFormatado: ResultadoEneagrama = {
        tipoPrincipal: resultado.tipoPrincipal,
        scores: resultado.scores,
        topTipos: resultado.topTipos
      };

      if (isAdmin) {
        const sucesso = await salvarResultadoEneagramaAdmin(
          corretorId,
          corretorEmail || '',
          corretorNome,
          resultadoFormatado
        );

        if (!sucesso) {
          throw new Error('Não foi possível salvar o resultado Eneagrama do admin');
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


        await salvarResultadoEneagrama(corretorIdNumero, resultadoFormatado);
      }

      
      // 5. Armazenar resultado e mostrar tela
      setResultadoFinal(resultado);
      setEstado('resultado');
    } catch (error) {
      console.error('❌ Erro ao finalizar teste:', error);
      alert(`Erro ao salvar teste: ${error instanceof Error ? error.message : 'Erro desconhecido'}. Tente novamente.`);
      setEstado('teste');
    }
  };

  // LANDING PAGE
  if (estado === 'landing') {
    return (
      <div className="fixed inset-0 z-50 overflow-auto py-12 px-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
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
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 mb-6">
              <Star className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-5xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              Teste de Eneagrama
            </h1>
            <p className="text-xl max-w-2xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Descubra seu tipo de personalidade entre os 9 tipos do Eneagrama e entenda suas motivações profundas.
            </p>
          </div>

          {/* Card Principal */}
          <Card className="shadow-xl" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <CardContent className="p-12">
              
              {/* O que é o Eneagrama */}
              <div className="mb-10">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <Sparkles className="w-6 h-6 text-purple-500" />
                  O que é o Eneagrama?
                </h2>
                <p className="leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
                  O Eneagrama é um sistema de personalidade que identifica 9 tipos distintos, cada um com suas próprias 
                  motivações, medos e padrões de comportamento. É uma ferramenta poderosa para autoconhecimento e crescimento pessoal.
                </p>
                
                {/* Os 9 Tipos em Grid 3x3 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
                  {Object.values(ENEAGRAMA_TIPOS).map((tipo) => (
                    <div 
                      key={tipo.numero}
                      className="p-4 rounded-xl border-2 transition-all hover:shadow-md"
                      style={{ borderColor: tipo.cor + '40', backgroundColor: tipo.cor + '08' }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{tipo.emoji}</span>
                        <div>
                          <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                            Tipo {tipo.numero}
                          </div>
                          <div className="text-xs font-semibold" style={{ color: tipo.cor }}>
                            {tipo.nome}
                          </div>
                        </div>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {tipo.descricaoBreve}
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
                    <span className="text-purple-500 font-bold">1.</span>
                    Você verá 10 perguntas com duas afirmações cada
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-500 font-bold">2.</span>
                    Escolha a opção (A ou B) que melhor descreve você
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-500 font-bold">3.</span>
                    Calculamos automaticamente seu tipo principal
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-500 font-bold">4.</span>
                    Tempo estimado: 3-5 minutos
                  </li>
                </ul>
              </div>

              {/* Nome do Corretor */}
              <div className="mb-8 p-4 rounded-lg border" style={{ backgroundColor: '#8B5CF610', borderColor: '#8B5CF640' }}>
                <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Teste para:</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{corretorNome}</p>
                {corretorEmail && (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{corretorEmail}</p>
                )}
              </div>

              {/* Botão Iniciar */}
              <Button 
                onClick={handleIniciarTeste}
                className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white shadow-lg"
              >
                Descubra seu Tipo
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
      <div className="fixed inset-0 z-50 overflow-auto flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Card className="w-full max-w-md shadow-xl" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Calculando seu tipo...</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Aguarde enquanto analisamos suas respostas</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // RESULTADO — apresentação extraída para ResultadoEneagrama (reutilizada pelo
  // modal admin e pela tela "Meu Perfil"). Cálculo/save permanecem intactos acima.
  if (estado === 'resultado' && resultadoFinal) {
    return (
      <ResultadoEneagramaView
        resultadoFinal={resultadoFinal}
        corretorNome={corretorNome}
        onVoltar={onVoltar}
      />
    );
  }

  // TELA DE TESTE (Perguntas)
  return (
    <div className="fixed inset-0 z-50 overflow-auto py-8 px-4" style={{ backgroundColor: '#f8f9fa' }}>
      <div className="max-w-4xl mx-auto">
        
        {/* Título Eneagrama com Sparkles */}
        <div className="text-center mb-6 animate-in fade-in slide-in-from-top duration-500">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Sparkles className="w-8 h-8" style={{ color: '#598DC6' }} />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 bg-clip-text text-transparent">
              Eneagrama
            </h1>
            <Sparkles className="w-8 h-8" style={{ color: '#598DC6' }} />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Descubra suas motivações profundas
          </p>
        </div>

        {/* Header com Progresso - Estilo Prova */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                {perguntaAtual + 1}
              </div>
              <span className="text-sm font-medium text-gray-600 dark:text-slate-400">
                de {ENEAGRAMA_QUESTIONS.length}
              </span>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                if (perguntaAtual > 0) {
                  // Voltar para pergunta anterior
                  setPerguntaAtual(prev => prev - 1);
                  // Restaurar resposta anterior se existir
                  if (respostas.length > 0) {
                    setRespostaAtual(respostas[respostas.length - 1]);
                    setRespostas(prev => prev.slice(0, -1));
                  } else {
                    setRespostaAtual(null);
                  }
                } else {
                  // Na primeira pergunta, voltar para o onboarding
                  onVoltar();
                }
              }}
              className="text-gray-500 dark:text-slate-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span className="text-sm">Voltar</span>
            </Button>
          </div>
          <Progress value={progresso} className="h-2 rounded-full bg-gray-200 dark:bg-slate-800" />
        </div>

        {/* Card da Pergunta - Estilo Questão de Prova */}
        <Card className="shadow-2xl border-0 overflow-hidden" style={{ 
          backgroundColor: '#ffffff',
          borderRadius: '1rem'
        }}>
          <CardContent className="p-0">
            
            {/* Instrução/Pergunta - DESTAQUE PRINCIPAL */}
            <div className="px-8 py-10 md:px-12 md:py-14 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-b-4 border-cyan-500">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-1 h-12 bg-gradient-to-b from-blue-400 to-cyan-400 rounded-full"></div>
                <div className="flex-1">
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-slate-100 leading-snug">
                    {pergunta.instrucao}
                  </h2>
                </div>
              </div>
            </div>

            {/* Área das Opções */}
            <div className="px-8 py-10 md:px-12 md:py-12 bg-white dark:bg-slate-900">

              {/* Label de Alternativas */}
              <p className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-4">
                Escolha uma alternativa:
              </p>

              {/* Opções A e B */}
              <div className="space-y-4">
                {/* Opção A */}
                <button
                  onClick={() => handleSelectOpcao('A')}
                  className={`group w-full p-6 rounded-xl transition-all duration-300 text-left relative ${
                    respostaAtual === 'A' 
                      ? 'shadow-2xl scale-[1.02]' 
                      : 'bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800/60 border-2 border-gray-200 dark:border-slate-800 hover:border-[#88C0E5] hover:shadow-lg'
                  }`}
                  style={{
                    backgroundColor: respostaAtual === 'A' ? '#88C0E5' : undefined,
                    boxShadow: respostaAtual === 'A' ? '0 25px 50px -12px rgba(136, 192, 229, 0.4)' : undefined
                  }}
                >
                  <div className="flex items-start gap-4">
                    {/* Badge A */}
                    <div 
                      className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg transition-all ${
                        respostaAtual === 'A'
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300'
                      }`}
                      style={{
                        color: respostaAtual === 'A' ? '#88C0E5' : undefined
                      }}
                    >
                      A
                    </div>
                    
                    {/* Texto da Opção */}
                    <div className="flex-1 pt-1">
                      <p 
                        className={`text-base leading-relaxed ${
                          respostaAtual === 'A' 
                            ? 'font-semibold text-white' 
                            : 'font-medium text-gray-800 group-hover:text-gray-900'
                        }`}
                      >
                        {pergunta.opcaoA}
                      </p>
                    </div>

                    {/* Check quando selecionado */}
                    {respostaAtual === 'A' && (
                      <div className="flex-shrink-0 text-white animate-in zoom-in duration-200">
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                          <Sparkles className="w-5 h-5" />
                        </div>
                      </div>
                    )}
                  </div>
                </button>

                {/* Opção B */}
                <button
                  onClick={() => handleSelectOpcao('B')}
                  className={`group w-full p-6 rounded-xl transition-all duration-300 text-left relative ${
                    respostaAtual === 'B' 
                      ? 'shadow-2xl scale-[1.02]' 
                      : 'bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800/60 border-2 border-gray-200 dark:border-slate-800 hover:border-[#88C0E5] hover:shadow-lg'
                  }`}
                  style={{
                    backgroundColor: respostaAtual === 'B' ? '#88C0E5' : undefined,
                    boxShadow: respostaAtual === 'B' ? '0 25px 50px -12px rgba(136, 192, 229, 0.4)' : undefined
                  }}
                >
                  <div className="flex items-start gap-4">
                    {/* Badge B */}
                    <div 
                      className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg transition-all ${
                        respostaAtual === 'B'
                          ? 'bg-white dark:bg-slate-900'
                          : 'bg-white dark:bg-slate-900 border-2 border-gray-300 text-gray-700 dark:text-slate-300'
                      }`}
                      style={{
                        color: respostaAtual === 'B' ? '#88C0E5' : undefined
                      }}
                    >
                      B
                    </div>
                    
                    {/* Texto da Opção */}
                    <div className="flex-1 pt-1">
                      <p 
                        className={`text-base leading-relaxed ${
                          respostaAtual === 'B' 
                            ? 'font-semibold text-white' 
                            : 'font-medium text-gray-800 group-hover:text-gray-900'
                        }`}
                      >
                        {pergunta.opcaoB}
                      </p>
                    </div>

                    {/* Check quando selecionado */}
                    {respostaAtual === 'B' && (
                      <div className="flex-shrink-0 text-white animate-in zoom-in duration-200">
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                          <Sparkles className="w-5 h-5" />
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              </div>

              {/* Botão Próxima/Finalizar */}
              <div className="mt-10">
                <Button 
                  onClick={handleProxima}
                  disabled={!respostaValida}
                  className={`w-full h-14 text-base font-bold transition-all duration-300 rounded-xl ${
                    respostaValida 
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-2xl shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-[1.02]' 
                      : 'bg-gray-200 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {perguntaAtual < ENEAGRAMA_QUESTIONS.length - 1 ? (
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
            </div>

          </CardContent>
        </Card>

      </div>
    </div>
  );
};

