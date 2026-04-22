/**
 * Página de Importação de Resultados do 16Personalities
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "@/hooks/useAuth";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Download, CheckCircle, AlertCircle, Loader2, ExternalLink, ArrowRight, Sparkles } from 'lucide-react';
import { extrairDados16Personalities, validarUrlRapida } from '../services/16personalitiesExtractor';
import { salvarResultado16Personalities, verificarImportacaoExistente } from '../services/16personalitiesSaveService';
import { buscarResultadosAdmin, salvarResultadoMBTIAdmin } from '../services/adminTestsService';
import { DadosExtraidos16P } from '../services/16personalitiesExtractor';
import { MBTI_TIPOS, MBTITipo } from '@/data/mbtiQuestions';
import { toast } from 'sonner';

export default function Importar16PersonalitiesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdminContext = user?.role === 'gestao';
  
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DadosExtraidos16P | null>(null);
  const [error, setError] = useState('');
  const [jaTemImportacao, setJaTemImportacao] = useState(false);

  // Verificar se já tem importação ao carregar
  useEffect(() => {
    const carregarImportacaoExistente = async () => {
      if (!user) return;

      if (isAdminContext) {
        const resultadosAdmin = await buscarResultadosAdmin(user.id);
        setJaTemImportacao(!!resultadosAdmin?.mbti);
        return;
      }

      const corretorIdentificador = user.email || user.name;
      if (corretorIdentificador) {
        verificarImportacaoExistente(corretorIdentificador).then(setJaTemImportacao);
      }
    };

    carregarImportacaoExistente();
  }, [user, isAdminContext]);

  // 🔄 Carregar resultado MBTI salvo se existir
  useEffect(() => {
    const carregarResultadoMBTI = async () => {
      if (!user?.email && !user?.name) return;
      
      try {
        setLoading(true);

        if (isAdminContext && user?.id) {
          const resultadosAdmin = await buscarResultadosAdmin(user.id);

          if (!resultadosAdmin?.mbti) {
            return;
          }

          const tipoCompleto = resultadosAdmin.mbti.tipo;
          const tipoBase = tipoCompleto.substring(0, 4);
          const dadosTipo = MBTI_TIPOS[tipoBase as keyof typeof MBTI_TIPOS];

          const getLadoELetra = (percentual: number, dimensao: string): { lado: string, letra: string } => {
            if (dimensao === 'energia') {
              return percentual >= 50 ? { lado: 'Extroversão', letra: 'E' } : { lado: 'Introversão', letra: 'I' };
            } else if (dimensao === 'mente') {
              return percentual >= 50 ? { lado: 'Intuição', letra: 'N' } : { lado: 'Observação', letra: 'S' };
            } else if (dimensao === 'natureza') {
              return percentual >= 50 ? { lado: 'Pensamento', letra: 'T' } : { lado: 'Sentimento', letra: 'F' };
            } else if (dimensao === 'abordagem') {
              return percentual >= 50 ? { lado: 'Julgamento', letra: 'J' } : { lado: 'Percepção', letra: 'P' };
            }
            return percentual >= 50 ? { lado: 'Assertivo', letra: 'A' } : { lado: 'Turbulento', letra: 'T' };
          };

          const energiaInfo = getLadoELetra(resultadosAdmin.mbti.percentuais.Energy || 50, 'energia');
          const menteInfo = getLadoELetra(resultadosAdmin.mbti.percentuais.Mind || 50, 'mente');
          const naturezaInfo = getLadoELetra(resultadosAdmin.mbti.percentuais.Nature || 50, 'natureza');
          const abordagemInfo = getLadoELetra(resultadosAdmin.mbti.percentuais.Tactics || 50, 'abordagem');
          const identidadeInfo = getLadoELetra(resultadosAdmin.mbti.percentuais.Identity || 50, 'identidade');

          const dadosPreview: DadosExtraidos16P = {
            url: '',
            codigoTeste: '',
            tipoCodigo: tipoCompleto,
            tipoBase,
            tipoNome: dadosTipo?.nome || '',
            tipoGrupo: dadosTipo?.grupo || '',
            tipoDescricao: dadosTipo?.descricaoBreve || '',
            genero: '',
            percentuais: {
              energia: {
                percentual: resultadosAdmin.mbti.percentuais.Energy || 50,
                lado: energiaInfo.lado,
                letra: energiaInfo.letra
              },
              mente: {
                percentual: resultadosAdmin.mbti.percentuais.Mind || 50,
                lado: menteInfo.lado,
                letra: menteInfo.letra
              },
              natureza: {
                percentual: resultadosAdmin.mbti.percentuais.Nature || 50,
                lado: naturezaInfo.lado,
                letra: naturezaInfo.letra
              },
              abordagem: {
                percentual: resultadosAdmin.mbti.percentuais.Tactics || 50,
                lado: abordagemInfo.lado,
                letra: abordagemInfo.letra
              },
              identidade: {
                percentual: resultadosAdmin.mbti.percentuais.Identity || 50,
                lado: identidadeInfo.lado,
                letra: identidadeInfo.letra
              }
            }
          };

          setPreview(dadosPreview);
          setJaTemImportacao(true);
          return;
        }
        
        const config = await import('@/utils/encryption').then(m => m.getSupabaseConfig());
        const headers = await import('@/utils/encryption').then(m => m.getAuthenticatedHeaders());
        
        // Buscar pelo email do corretor (estratégia principal) ou nome (fallback)
        const emailCorretor = user.email;
        let response = await fetch(
          `${config.url}/rest/v1/Corretores?email=ilike.${encodeURIComponent(emailCorretor)}&select=id,nm_corretor,mbti_tipo,mbti_percent_mind,mbti_percent_energy,mbti_percent_nature,mbti_percent_tactics,mbti_percent_identity&limit=1`,
          {
            method: 'GET',
            headers: headers
          }
        );
        
        let data = response.ok ? await response.json() : [];
        
        // Fallback: buscar por nome parcial extraído do email
        if ((!data || data.length === 0 || !data[0].mbti_tipo) && emailCorretor.includes('@')) {
          const nomeFromEmail = emailCorretor.split('@')[0]?.replace(/[._-]/g, ' ');
          if (nomeFromEmail && nomeFromEmail.length > 2) {
            response = await fetch(
              `${config.url}/rest/v1/Corretores?nm_corretor=ilike.*${encodeURIComponent(nomeFromEmail)}*&select=id,nm_corretor,mbti_tipo,mbti_percent_mind,mbti_percent_energy,mbti_percent_nature,mbti_percent_tactics,mbti_percent_identity&limit=1`,
              { method: 'GET', headers }
            );
            data = response.ok ? await response.json() : [];
          }
        }
        
        if (!data || data.length === 0 || !data[0].mbti_tipo) {
          return;
        }
        
        const corretor = data[0];
        
        // Extrair o tipo base (4 primeiras letras) ex: "INTJ-A" -> "INTJ"
        const tipoCompleto = corretor.mbti_tipo;
        const tipoBase = tipoCompleto.substring(0, 4);
        
        // Função auxiliar para determinar o lado baseado no percentual
        const getLadoELetra = (percentual: number, dimensao: string): { lado: string, letra: string } => {
          if (dimensao === 'energia') {
            return percentual >= 50 
              ? { lado: 'Extroversão', letra: 'E' } 
              : { lado: 'Introversão', letra: 'I' };
          } else if (dimensao === 'mente') {
            return percentual >= 50 
              ? { lado: 'Intuição', letra: 'N' } 
              : { lado: 'Observação', letra: 'S' };
          } else if (dimensao === 'natureza') {
            return percentual >= 50 
              ? { lado: 'Pensamento', letra: 'T' } 
              : { lado: 'Sentimento', letra: 'F' };
          } else if (dimensao === 'abordagem') {
            return percentual >= 50 
              ? { lado: 'Julgamento', letra: 'J' } 
              : { lado: 'Percepção', letra: 'P' };
          } else { // identidade
            return percentual >= 50 
              ? { lado: 'Assertivo', letra: 'A' } 
              : { lado: 'Turbulento', letra: 'T' };
          }
        };
        
        // Obter informações do tipo do MBTI_TIPOS
        const dadosTipo = MBTI_TIPOS[tipoBase];
        
        const energiaInfo = getLadoELetra(corretor.mbti_percent_energy || 50, 'energia');
        const menteInfo = getLadoELetra(corretor.mbti_percent_mind || 50, 'mente');
        const naturezaInfo = getLadoELetra(corretor.mbti_percent_nature || 50, 'natureza');
        const abordagemInfo = getLadoELetra(corretor.mbti_percent_tactics || 50, 'abordagem');
        const identidadeInfo = getLadoELetra(corretor.mbti_percent_identity || 50, 'identidade');
        
        // Montar preview com os dados salvos
        const dadosPreview: DadosExtraidos16P = {
          url: '',
          codigoTeste: '',
          tipoCodigo: tipoCompleto,
          tipoBase: tipoBase,
          tipoNome: dadosTipo?.nome || '',
          tipoGrupo: dadosTipo?.grupo || '',
          tipoDescricao: dadosTipo?.descricaoBreve || '',
          genero: '',
          percentuais: {
            energia: {
              percentual: corretor.mbti_percent_energy || 50,
              lado: energiaInfo.lado,
              letra: energiaInfo.letra
            },
            mente: {
              percentual: corretor.mbti_percent_mind || 50,
              lado: menteInfo.lado,
              letra: menteInfo.letra
            },
            natureza: {
              percentual: corretor.mbti_percent_nature || 50,
              lado: naturezaInfo.lado,
              letra: naturezaInfo.letra
            },
            abordagem: {
              percentual: corretor.mbti_percent_tactics || 50,
              lado: abordagemInfo.lado,
              letra: abordagemInfo.letra
            },
            identidade: {
              percentual: corretor.mbti_percent_identity || 50,
              lado: identidadeInfo.lado,
              letra: identidadeInfo.letra
            }
          }
        };
        
        setPreview(dadosPreview);
        setJaTemImportacao(true);
        
      } catch (error) {
        console.error('❌ Erro ao carregar resultado MBTI:', error);
      } finally {
        setLoading(false);
      }
    };
    
    carregarResultadoMBTI();
  }, [user]);

  const handleExtrair = async () => {
    setError('');
    
    // Validar URL
    const validacao = validarUrlRapida(url);
    if (!validacao.valida) {
      setError(validacao.mensagem);
      return;
    }
    
    setLoading(true);
    
    try {
      toast.info('🔍 Analisando URL do resultado...', { duration: 1000 });
      
      // Simular pequeno delay para melhor UX
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const dados = await extrairDados16Personalities(url);
      setPreview(dados);
      
      toast.success('✅ Dados extraídos com sucesso!', { duration: 2000 });
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : 'Erro ao extrair dados. Tente novamente.';
      setError(mensagem);
      toast.error(mensagem);
      console.error('Erro na extração:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSalvar = async () => {
    if (!preview || !user) return;

    setLoading(true);
    
    try {
      toast.info('💾 Salvando resultado no sistema...', { duration: 2000 });

      if (isAdminContext) {
        const sucesso = await salvarResultadoMBTIAdmin(
          user.id,
          user.email || '',
          user.name || 'Gestor',
          {
            tipoFinal: preview.tipoCodigo,
            percentuais: {
              Mind: preview.percentuais.mente.percentual,
              Energy: preview.percentuais.energia.percentual,
              Nature: preview.percentuais.natureza.percentual,
              Tactics: preview.percentuais.abordagem.percentual,
              Identity: preview.percentuais.identidade.percentual
            }
          }
        );

        if (!sucesso) {
          throw new Error('Não foi possível salvar o resultado MBTI do admin.');
        }

        toast.success('✅ Resultado importado com sucesso!', { duration: 1500 });
        setJaTemImportacao(true);
        setTimeout(() => {
          navigate('/agentes-ia/agente-comportamental');
        }, 800);
        return;
      }

      const corretorIdentificador = user.email || user.name;
      
      if (!corretorIdentificador) {
        toast.error('Usuário não identificado. Faça login novamente.');
        return;
      }
      
      const resultado = await salvarResultado16Personalities(corretorIdentificador, preview);
      
      if (resultado.sucesso) {
        
        // Marcar MBTI como completo na tabela de testes (se existir)
        try {
          const config = await import('@/utils/encryption').then(m => m.getSupabaseConfig());
          const headers = await import('@/utils/encryption').then(m => m.getAuthenticatedHeaders());
          
          // Usar o corretorId retornado pelo salvamento
          if (resultado.corretorId) {
            const patchResponse = await fetch(
              `${config.url}/rest/v1/testes_comportamentais?corretor_id=eq.${resultado.corretorId}`,
              {
                method: 'PATCH',
                headers: {
                  ...headers,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                  mbti_completo: true,
                  mbti_data_finalizacao: new Date().toISOString(),
                  todos_completos: true, // Se chegou aqui, é porque DISC e Eneagrama já estão completos
                  data_finalizacao_todos: new Date().toISOString()
                })
              }
            );
            
            if (patchResponse.ok) {
            } else {
              console.warn('⚠️ Tabela testes_comportamentais pode não existir para este corretor (não crítico)');
            }
          }
        } catch (testeErr) {
          console.warn('⚠️ Erro ao marcar MBTI completo na tabela testes_comportamentais (não crítico):', testeErr);
        }
        
        // Sucesso! Mostrar mensagem e redirecionar para Elaine
        toast.success('✅ Resultado importado com sucesso!', { duration: 1500 });
        
        // Aguardar 1.5 segundos e redirecionar para a Agente Elaine
        setTimeout(() => {
          toast.success('🎉 Agente Elaine desbloqueada! Redirecionando...', { duration: 2000 });
          setTimeout(() => {
            navigate('/agentes-ia/agente-comportamental');
          }, 500);
        }, 1500);
      } else {
        throw new Error(resultado.mensagem);
      }
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : 'Erro ao salvar. Tente novamente.';
      setError(mensagem);
      toast.error(mensagem);
      console.error('Erro ao salvar:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelar = () => {
    setPreview(null);
    setError('');
  };


  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/agentes-ia/agente-comportamental')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            Importe seu Resultado do 16Personalities
          </h1>
          <p className="text-text-secondary">
            Cole o link do seu teste e nós importaremos automaticamente todos os dados
          </p>
        </div>

        {/* Instruções para fazer o teste */}
        {!preview && (
          <Card className="mb-6 border-blue-500/30 bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <Sparkles className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    Passo 1: Faça o Teste de Personalidade
                  </h3>
                  <p className="text-sm text-text-secondary max-w-2xl">
                    Primeiro, você precisa realizar o teste MBTI no site oficial do 16 Personalities.
                    O teste leva cerca de 10 minutos e é totalmente gratuito.
                  </p>
                </div>
                {/* Botão minimalista com camadas */}
                <div className="relative group w-full max-w-md">
                  {/* Camada externa - borda sutil */}
                  <div className="p-[1px] bg-gradient-to-r from-gray-300 via-gray-400 to-gray-300 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 rounded-xl">
                    {/* Camada intermediária */}
                    <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-xl">
                      {/* Camada interna - botão */}
                      <Button
                        onClick={() => window.open('https://www.16personalities.com/br/teste-de-personalidade', '_blank')}
                        className="relative w-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 hover:from-gray-300 hover:to-gray-400 dark:hover:from-gray-600 dark:hover:to-gray-700 text-gray-700 dark:text-gray-200 font-semibold py-5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 border border-gray-300 dark:border-gray-600"
                        size="lg"
                      >
                        <Sparkles className="mr-3 h-5 w-5 !text-blue-600 dark:!text-blue-400" />
                        <span className="text-base">Fazer Teste de Personalidade</span>
                        <ArrowRight className="ml-3 h-5 w-5 text-gray-700 dark:text-gray-200 group-hover:translate-x-1 transition-transform duration-300" />
                      </Button>
                    </div>
                  </div>

                </div>
                <p className="text-xs text-text-secondary">
                  Após completar o teste, copie a URL da página de resultados e cole abaixo
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Formulário de entrada */}
        {!preview && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Passo 2: Importe seu Resultado
              </CardTitle>
              <CardDescription>
                Cole abaixo o link da página de resultados que você recebeu após finalizar o teste
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  URL do Resultado
                </label>
                <Input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.16personalities.com/profiles/..."
                  disabled={loading}
                  className="w-full"
                  onKeyPress={(e) => e.key === 'Enter' && handleExtrair()}
                />
                <p className="text-xs text-text-secondary mt-2">
                  Exemplo: https://www.16personalities.com/profiles/intj-a/m/4lzt8dg47
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Botão minimalista com camadas */}
              <div className="relative group w-full">
                {/* Camada externa - borda sutil */}
                <div className="p-[1px] bg-gradient-to-r from-gray-300 via-gray-400 to-gray-300 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 rounded-xl">
                  {/* Camada intermediária */}
                  <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-xl">
                    {/* Camada interna - botão */}
                    <Button
                      onClick={handleExtrair}
                      disabled={loading || !url}
                      className="relative w-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 hover:from-gray-300 hover:to-gray-400 dark:hover:from-gray-600 dark:hover:to-gray-700 text-gray-700 dark:text-gray-200 font-semibold py-5 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      size="lg"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                          <span className="text-base animate-pulse">Analisando resultado...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-3 h-5 w-5 !text-blue-600 dark:!text-blue-400" />
                          <span className="text-base">Importar Resultado</span>
                          <ArrowRight className="ml-3 h-5 w-5 text-gray-700 dark:text-gray-200 group-hover:translate-x-1 transition-transform duration-300" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview dos dados - Design Minimalista */}
        {preview && (
          <div className="min-h-screen py-8 px-4" style={{ backgroundColor: '#F8FAFC' }}>
            <div className="max-w-6xl mx-auto">
              
              {/* Header Minimalista */}
              <div className="mb-8">
                <Button 
                  variant="ghost" 
                  onClick={() => navigate(-1)} 
                  className="mb-4 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar
                </Button>
                
                <div className="flex items-baseline gap-3 mb-2">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">
                    Análise MBTI
                  </h1>
                  <span className="text-sm text-gray-500 dark:text-slate-400 font-medium">
                    {user?.name || 'Corretor'}
                  </span>
                </div>
                <p className="text-gray-600 dark:text-slate-400">
                  Resultado da avaliação de personalidade
                </p>
              </div>

              {/* Card Principal - Tipo MBTI */}
              <Card className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-sm mb-6">
                <CardContent className="p-8">
                  {(() => {
                    // Extrair código base (primeiras 4 letras) para buscar no MBTI_TIPOS
                    const tipoExibir = (preview as any).tipo || preview.tipoCodigo || '';
                    const tipoBase = tipoExibir.substring(0, 4);
                    const dadosTipo: MBTITipo | undefined = MBTI_TIPOS[tipoBase];
                    
                    return (
                      <>
                        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-6 mb-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">
                                TIPO PRINCIPAL
                              </p>
                              <h2 className="text-4xl font-bold text-blue-900 mb-2">
                                {tipoExibir}
                              </h2>
                              {dadosTipo && (
                                <>
                                  <p className="text-xl text-gray-800 dark:text-slate-200 font-semibold mb-1">
                                    {dadosTipo.nome}
                                  </p>
                                  <p className="text-sm text-gray-600 dark:text-slate-400 italic">
                                    "{dadosTipo.apelido}"
                                  </p>
                                  <p className="text-sm text-blue-700 mt-2 font-medium">
                                    Grupo: {dadosTipo.grupo} {dadosTipo.emoji}
                                  </p>
                                </>
                              )}
                            </div>
                            <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-3xl shadow-md">
                              {tipoBase}
                            </div>
                          </div>
                          {dadosTipo && (
                            <div className="mt-6 pt-6 border-t border-blue-200">
                              <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
                                {dadosTipo.descricaoBreve}
                              </p>
                            </div>
                          )}
                        </div>

                        {dadosTipo && (
                          <>
                            {/* Características Principais */}
                            <div className="mb-6">
                              <h3 className="text-base font-bold text-gray-900 dark:text-slate-100 mb-3 uppercase tracking-wide">
                                Características Principais
                              </h3>
                              <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
                                {dadosTipo.caracteristicas}
                              </p>
                            </div>

                            {/* Grid 2x2 - Pontos Fortes e Atenção */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                              <div className="p-5 bg-green-50 rounded-lg border border-green-200">
                                <h4 className="text-sm font-semibold text-green-900 uppercase tracking-wide mb-2 flex items-center gap-2">
                                  <CheckCircle className="w-4 h-4" />
                                  Pontos Fortes
                                </h4>
                                <p className="text-sm text-green-800 leading-relaxed">
                                  {dadosTipo.pontosFortes}
                                </p>
                              </div>

                              <div className="p-5 bg-orange-50 rounded-lg border border-orange-200">
                                <h4 className="text-sm font-semibold text-orange-900 uppercase tracking-wide mb-2 flex items-center gap-2">
                                  <AlertCircle className="w-4 h-4" />
                                  Pontos de Atenção
                                </h4>
                                <p className="text-sm text-orange-800 leading-relaxed">
                                  {dadosTipo.pontosDeAtencao}
                                </p>
                              </div>
                            </div>

                            {/* Aplicações na Carreira */}
                            <div className="p-5 bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-200 dark:border-slate-800">
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 uppercase tracking-wide mb-2">
                                💼 Aplicações na Carreira
                              </h4>
                              <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
                                {dadosTipo.carreira}
                              </p>
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Card Dimensões de Personalidade */}
              <Card className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-sm mb-6">
                <CardContent className="p-8">
                  <div className="mb-8">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Dimensões de Personalidade</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Características comportamentais detalhadas</p>
                  </div>
                  
                  {/* Grid 2x2 - Layout Harmonioso */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {preview.percentuais?.energia && (
                      <div className="bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg p-5 hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-3 mb-4">
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <span className="text-white font-bold text-lg">
                              {preview.percentuais.energia.letra}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between mb-1">
                              <p className="font-semibold text-base text-gray-900 dark:text-slate-100">
                                Energia
                              </p>
                              <p className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex-shrink-0">
                                {preview.percentuais.energia.percentual}%
                              </p>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-slate-400">
                              {preview.percentuais.energia.lado}
                            </p>
                          </div>
                        </div>
                        
                        <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed mb-3">
                          Como você interage com o mundo exterior e recarrega suas energias
                        </p>
                        
                        <div className="w-full h-2.5 rounded-full overflow-hidden bg-gray-100 dark:bg-slate-800">
                          <div 
                            className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{ 
                              width: `${preview.percentuais.energia.percentual}%`,
                              background: 'linear-gradient(to right, #6B7280, #9CA3AF)'
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {preview.percentuais?.mente && (
                      <div className="bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg p-5 hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-3 mb-4">
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <span className="text-white font-bold text-lg">
                              {preview.percentuais.mente.letra}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between mb-1">
                              <p className="font-semibold text-base text-gray-900 dark:text-slate-100">
                                Mente
                              </p>
                              <p className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex-shrink-0">
                                {preview.percentuais.mente.percentual}%
                              </p>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-slate-400">
                              {preview.percentuais.mente.lado}
                            </p>
                          </div>
                        </div>
                        
                        <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed mb-3">
                          Como você processa informações e percebe o mundo ao redor
                        </p>
                        
                        <div className="w-full h-2.5 rounded-full overflow-hidden bg-gray-100 dark:bg-slate-800">
                          <div 
                            className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{ 
                              width: `${preview.percentuais.mente.percentual}%`,
                              background: 'linear-gradient(to right, #6B7280, #9CA3AF)'
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {preview.percentuais?.natureza && (
                      <div className="bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg p-5 hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-3 mb-4">
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <span className="text-white font-bold text-lg">
                              {preview.percentuais.natureza.letra}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between mb-1">
                              <p className="font-semibold text-base text-gray-900 dark:text-slate-100">
                                Natureza
                              </p>
                              <p className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex-shrink-0">
                                {preview.percentuais.natureza.percentual}%
                              </p>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-slate-400">
                              {preview.percentuais.natureza.lado}
                            </p>
                          </div>
                        </div>
                        
                        <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed mb-3">
                          Como você toma decisões e expressa suas emoções
                        </p>
                        
                        <div className="w-full h-2.5 rounded-full overflow-hidden bg-gray-100 dark:bg-slate-800">
                          <div 
                            className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{ 
                              width: `${preview.percentuais.natureza.percentual}%`,
                              background: 'linear-gradient(to right, #6B7280, #9CA3AF)'
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {preview.percentuais?.abordagem && (
                      <div className="bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg p-5 hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-3 mb-4">
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <span className="text-white font-bold text-lg">
                              {preview.percentuais.abordagem.letra}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between mb-1">
                              <p className="font-semibold text-base text-gray-900 dark:text-slate-100">
                                Abordagem
                              </p>
                              <p className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex-shrink-0">
                                {preview.percentuais.abordagem.percentual}%
                              </p>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-slate-400">
                              {preview.percentuais.abordagem.lado}
                            </p>
                          </div>
                        </div>
                        
                        <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed mb-3">
                          Como você organiza sua vida e lida com o mundo exterior
                        </p>
                        
                        <div className="w-full h-2.5 rounded-full overflow-hidden bg-gray-100 dark:bg-slate-800">
                          <div 
                            className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{ 
                              width: `${preview.percentuais.abordagem.percentual}%`,
                              background: 'linear-gradient(to right, #6B7280, #9CA3AF)'
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {preview.percentuais?.identidade && (
                      <div className="bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg p-5 hover:shadow-md transition-shadow md:col-span-2">
                        <div className="flex items-start gap-3 mb-4">
                          <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                            <span className="text-white font-bold text-lg">
                              {preview.percentuais.identidade.letra}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between mb-1">
                              <p className="font-semibold text-base text-gray-900 dark:text-slate-100">
                                Identidade
                              </p>
                              <p className="text-2xl font-bold text-gray-900 dark:text-slate-100 flex-shrink-0">
                                {preview.percentuais.identidade.percentual}%
                              </p>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-slate-400">
                              {preview.percentuais.identidade.lado}
                            </p>
                          </div>
                        </div>
                        
                        <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed mb-3">
                          Sua confiança pessoal e como você lida com suas decisões
                        </p>
                        
                        <div className="w-full h-2.5 rounded-full overflow-hidden bg-gray-100 dark:bg-slate-800">
                          <div 
                            className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{ 
                              width: `${preview.percentuais.identidade.percentual}%`,
                              background: 'linear-gradient(to right, #6B7280, #9CA3AF)'
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Botão Concluir */}
              <div className="flex justify-end gap-4">
                {!jaTemImportacao && (
                  <Button
                    onClick={handleCancelar}
                    variant="outline"
                    disabled={loading}
                    className="px-8 h-11"
                  >
                    Cancelar
                  </Button>
                )}
                <Button 
                  onClick={jaTemImportacao ? () => navigate('/agentes-ia/agente-comportamental') : handleSalvar}
                  disabled={loading}
                  className="px-8 h-11 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-900 dark:text-slate-100 font-medium border border-gray-300 dark:border-slate-700"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : jaTemImportacao ? (
                    <>
                      Voltar para Elaine
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  ) : (
                    <>
                      Concluir Análise
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


