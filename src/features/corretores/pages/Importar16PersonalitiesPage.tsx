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
import { derivarDimensoesMBTI } from '@/utils/16personalitiesMapper';
import { toast } from 'sonner';

/** Rótulo e explicação de cada dimensão MBTI no preview da importação. */
const DIMENSOES_PREVIEW = [
  { chave: 'energia' as const,    rotulo: 'Energia',    descricao: 'Como você interage com o mundo exterior e recarrega suas energias' },
  { chave: 'mente' as const,      rotulo: 'Mente',      descricao: 'Como você processa informações e percebe o mundo ao redor' },
  { chave: 'natureza' as const,   rotulo: 'Natureza',   descricao: 'Como você toma decisões e expressa suas emoções' },
  { chave: 'abordagem' as const,  rotulo: 'Abordagem',  descricao: 'Como você organiza sua vida e lida com o mundo exterior' },
  { chave: 'identidade' as const, rotulo: 'Identidade', descricao: 'Sua confiança pessoal e como você lida com suas decisões' },
];

export default function Importar16PersonalitiesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // O fluxo "admin" grava em admin_test_results (resultado do próprio gestor).
  // Usar systemRole (não o legado role==='gestao', que também engloba
  // team_leader) para que só admin/owner sigam esse caminho — A4.
  const isAdminContext = user?.systemRole === 'admin' || user?.systemRole === 'owner';
  
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

          const dims = derivarDimensoesMBTI(tipoCompleto);

          const dadosPreview: DadosExtraidos16P = {
            url: '',
            codigoTeste: '',
            tipoCodigo: tipoCompleto,
            tipoBase,
            tipoNome: dadosTipo?.nome || '',
            tipoGrupo: dadosTipo?.grupo || '',
            tipoDescricao: dadosTipo?.descricaoBreve || '',
            genero: '',
            dimensoes: dims
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
        
        // Obter informações do tipo do MBTI_TIPOS
        const dadosTipo = MBTI_TIPOS[tipoBase];

        const dims = derivarDimensoesMBTI(corretor.mbti_tipo);

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
          dimensoes: dims
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
      // Esta é uma importação NOVA (extraída agora), ainda não salva. Sem isto,
      // um resíduo antigo poderia manter jaTemImportacao=true e o botão pularia
      // o salvamento ("Voltar para Elaine" em vez de "Concluir Análise") — A1.
      setJaTemImportacao(false);

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
          { tipoFinal: preview.tipoCodigo }
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
                // Marca apenas o MBTI. NÃO gravamos todos_completos aqui: a
                // completude dos 3 testes é sempre re-derivada da tabela
                // Corretores (verificarTestesCompletos). Gravar o flag às cegas
                // criava dado inconsistente — B3.
                body: JSON.stringify({
                  mbti_completo: true,
                  mbti_data_finalizacao: new Date().toISOString()
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
                  
                  {/* Uma dimensão por card. Sem percentual: o 16personalities só
                      entrega o TIPO pela URL, e o número que ficava aqui era
                      constante derivada da letra (55/45) — ver o extractor. */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {DIMENSOES_PREVIEW.map(({ chave, rotulo, descricao }) => {
                      const dim = preview.dimensoes?.[chave];
                      if (!dim) return null;
                      return (
                        <div key={chave} className="bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg p-5 hover:shadow-md transition-shadow">
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                              <span className="text-white font-bold text-lg">{dim.letra}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-base text-gray-900 dark:text-slate-100">{rotulo}</p>
                              <p className="text-sm text-gray-600 dark:text-slate-400">{dim.lado}</p>
                              <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed mt-2">{descricao}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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


