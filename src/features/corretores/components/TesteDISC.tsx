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
import type { ResultadoDISC } from '../services/personalityTestsService';
import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';

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

          const resultado = {
            D: resultadoAdmin.disc.percentuais.D || 0,
            I: resultadoAdmin.disc.percentuais.I || 0,
            S: resultadoAdmin.disc.percentuais.S || 0,
            C: resultadoAdmin.disc.percentuais.C || 0
          };

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
        
        // Montar resultado para exibição
        const resultado = {
          D: corretor.disc_percentual_d || 0,
          I: corretor.disc_percentual_i || 0,
          S: corretor.disc_percentual_s || 0,
          C: corretor.disc_percentual_c || 0
        };
        
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
                    Ordene as palavras de 1 a 4 (1 = mais se identifica, 4 = menos se identifica)
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
    const { resultado, dominantes } = resultadoFinal;
    const perfilPrincipal = dominantes[0] ? DISC_PROFILES[dominantes[0].perfil] : null;
    
    return (
      <div className="min-h-screen py-8 px-4" style={{ backgroundColor: '#F8FAFC' }}>
        <div className="max-w-6xl mx-auto">
          
          {/* Header Minimalista */}
          <div className="mb-8">
            <Button 
              variant="ghost" 
              onClick={onVoltar} 
              className="mb-4 text-gray-600 dark:text-slate-400 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            
            <div className="flex items-baseline gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">
                Análise DISC
              </h1>
              <span className="text-sm text-gray-500 dark:text-slate-400 font-medium">
                {corretorNome}
              </span>
            </div>
            <p className="text-gray-600 dark:text-slate-400">
              Resultado da avaliação comportamental
            </p>
          </div>

          {/* Grid Principal - Perfil + Estatísticas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Card Grande - Perfil Principal */}
            {perfilPrincipal && (
              <Card className="lg:col-span-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-sm">
                <CardContent className="p-8">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                        Perfil Dominante
                      </p>
                      <h2 className="text-4xl font-bold text-gray-900 dark:text-slate-100 mb-3">
                        {perfilPrincipal.nome}
                      </h2>
                      <p className="text-gray-600 dark:text-slate-400 leading-relaxed mb-4">
                        {perfilPrincipal.descricao}
                      </p>
                    </div>
                    <div className="flex-shrink-0 w-20 h-20 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                      <span className="text-4xl font-bold text-white">
                        {perfilPrincipal.letra}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-100">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">
                        Pontuação
                      </p>
                      <p className="text-3xl font-bold text-blue-600 dark:text-blue-300">
                        {Math.round(dominantes[0].percentual * 100)}%
                      </p>
                    </div>
                    <div className="p-4 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-200 dark:border-slate-800">
                      <p className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide mb-1">
                        Posição
                      </p>
                      <p className="text-3xl font-bold text-gray-900 dark:text-slate-100">
                        1º
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 dark:bg-slate-950 rounded-lg">
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2">Características</p>
                      <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">
                        {perfilPrincipal.caracteristicas}
                      </p>
                    </div>
                    
                    <div className="p-4 bg-gray-50 dark:bg-slate-950 rounded-lg">
                      <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-2">Pontos Fortes</p>
                      <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">
                        {perfilPrincipal.pontos_fortes}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Cards Verticais - Outros Perfis */}
            <div className="space-y-4">
              {dominantes.slice(1, 4).map((dom: any, index: number) => {
                const profile = DISC_PROFILES[dom.perfil];
                return (
                  <Card key={dom.perfil} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-sm">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center shadow-md">
                          <span className="text-2xl font-bold text-white">
                            {profile.letra}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-bold text-gray-900 dark:text-slate-100">
                            {Math.round(dom.percentual * 100)}%
                          </span>
                          <p className="text-xs text-gray-500 dark:text-slate-400">
                            {index + 2}º lugar
                          </p>
                        </div>
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-slate-100 mb-1 text-sm">
                        {profile.nome}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2">
                        {profile.descricao}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Card de Aplicação Prática */}
          {perfilPrincipal && (
            <Card className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-sm mb-6">
              <CardContent className="p-8">
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Aplicação Prática do Perfil {perfilPrincipal.letra}</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Como aplicar este conhecimento no dia a dia</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Comunicação */}
                  <div className="p-5 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-900">
                    <h4 className="text-sm font-semibold text-blue-900 uppercase tracking-wide mb-2">
                      💬 Estilo de Comunicação
                    </h4>
                    <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                      {perfilPrincipal.letra === 'D' && 'Prefere comunicação direta, objetiva e rápida. Foca em resultados e decisões. Evita rodeios e valoriza eficiência.'}
                      {perfilPrincipal.letra === 'I' && 'Comunicativo e expressivo, gosta de interação social. Prefere conversas animadas e ambiente descontraído. Valoriza relacionamentos.'}
                      {perfilPrincipal.letra === 'S' && 'Paciente e bom ouvinte, prefere comunicação calma e harmoniosa. Evita conflitos e busca consenso. Valoriza estabilidade.'}
                      {perfilPrincipal.letra === 'C' && 'Preciso e detalhista, prefere comunicação estruturada e baseada em fatos. Valoriza informações completas e tempo para análise.'}
                    </p>
                  </div>

                  {/* Tomada de Decisão */}
                  <div className="p-5 bg-green-50 dark:bg-green-950/40 rounded-lg border border-green-200 dark:border-green-900">
                    <h4 className="text-sm font-semibold text-green-900 uppercase tracking-wide mb-2">
                      🎯 Tomada de Decisão
                    </h4>
                    <p className="text-sm text-green-800 dark:text-green-200 leading-relaxed">
                      {perfilPrincipal.letra === 'D' && 'Toma decisões rápidas e confiantes. Foca em resultados e não tem medo de riscos. Prefere agir logo e ajustar no caminho.'}
                      {perfilPrincipal.letra === 'I' && 'Decide com base em intuição e impacto nas pessoas. Busca aprovação social e prefere decisões em grupo. Otimista sobre resultados.'}
                      {perfilPrincipal.letra === 'S' && 'Prefere decisões ponderadas e consultadas. Busca consenso e estabilidade. Necessita tempo para processar mudanças.'}
                      {perfilPrincipal.letra === 'C' && 'Analisa todos os dados disponíveis antes de decidir. Busca a solução mais correta e precisa. Prefere seguir processos estabelecidos.'}
                    </p>
                  </div>

                  {/* Ambiente de Trabalho */}
                  <div className="p-5 bg-purple-50 dark:bg-purple-950/40 rounded-lg border border-purple-200 dark:border-purple-900">
                    <h4 className="text-sm font-semibold text-purple-900 uppercase tracking-wide mb-2">
                      🏢 Ambiente Ideal
                    </h4>
                    <p className="text-sm text-purple-800 dark:text-purple-200 leading-relaxed">
                      {perfilPrincipal.letra === 'D' && 'Ambiente desafiador com autonomia e foco em metas. Prefere poder de decisão e liberdade para executar. Valoriza resultados mensuráveis.'}
                      {perfilPrincipal.letra === 'I' && 'Ambiente social e colaborativo com interação constante. Prefere trabalho em equipe e reconhecimento público. Valoriza criatividade.'}
                      {perfilPrincipal.letra === 'S' && 'Ambiente estável e previsível com rotinas claras. Prefere trabalho colaborativo e harmônico. Valoriza lealdade e segurança.'}
                      {perfilPrincipal.letra === 'C' && 'Ambiente organizado e estruturado com processos definidos. Prefere trabalho individual e tempo para análise. Valoriza qualidade e precisão.'}
                    </p>
                  </div>

                  {/* Desenvolvimento */}
                  <div className="p-5 bg-orange-50 dark:bg-orange-950/40 rounded-lg border border-orange-200 dark:border-orange-900">
                    <h4 className="text-sm font-semibold text-orange-900 uppercase tracking-wide mb-2">
                      📈 Áreas de Desenvolvimento
                    </h4>
                    <p className="text-sm text-orange-800 dark:text-orange-200 leading-relaxed">
                      {perfilPrincipal.letra === 'D' && 'Desenvolver paciência, empatia e habilidade de ouvir. Considerar impacto emocional das decisões. Delegar com confiança.'}
                      {perfilPrincipal.letra === 'I' && 'Focar em organização, seguir processos e cumprir prazos. Desenvolver atenção aos detalhes. Equilibrar entusiasmo com análise.'}
                      {perfilPrincipal.letra === 'S' && 'Desenvolver assertividade e lidar com mudanças. Expressar opiniões e necessidades. Aceitar conflitos quando necessário.'}
                      {perfilPrincipal.letra === 'C' && 'Desenvolver flexibilidade e aceitar imperfeição. Tomar decisões com informação incompleta. Valorizar o lado humano.'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gráfico de Distribuição */}
          <Card className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-sm mb-6">
            <CardContent className="p-8">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Distribuição Completa</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">Análise detalhada de todos os perfis</p>
              </div>
              
              <div className="space-y-5">
                {Object.entries(resultado).map(([letra, percentual]: [string, any]) => {
                  const profile = DISC_PROFILES[letra];
                  const percent = (percentual * 100).toFixed(1);
                  
                  return (
                    <div key={letra}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                            <span className="text-white font-bold">
                              {profile.letra}
                            </span>
                          </div>
                          <span className="font-semibold text-gray-900 dark:text-slate-100">
                            {profile.nome}
                          </span>
                        </div>
                        <span className="font-bold text-gray-900 dark:text-slate-100 text-lg">
                          {percent}%
                        </span>
                      </div>
                      <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #D1D5DB, #9CA3AF)' }}>
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-1000 ease-out"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Botão Concluir */}
        </div>
      </div>
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

