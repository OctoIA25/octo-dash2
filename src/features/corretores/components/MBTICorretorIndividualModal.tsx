/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Modal: Estatísticas Individuais MBTI do Corretor
 * Função: Exibir resultado COMPLETO do teste MBTI (reutiliza visualização da página de importação)
 */

import { useEffect, useState } from 'react';
import { X, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';
import { MBTI_TIPOS, MBTITipo } from '@/data/mbtiQuestions';
import { DadosExtraidos16P } from '../services/16personalitiesExtractor';

interface MBTICorretorIndividualModalProps {
  isOpen: boolean;
  onClose: () => void;
  corretorId: number;
  corretorNome: string;
}

export const MBTICorretorIndividualModal = ({
  isOpen,
  onClose,
  corretorId,
  corretorNome
}: MBTICorretorIndividualModalProps) => {
  const [preview, setPreview] = useState<DadosExtraidos16P | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && corretorId) {
      carregarResultadoMBTI();
    } else {
      setPreview(null);
      setLoading(true);
    }
  }, [isOpen, corretorId]);

  const carregarResultadoMBTI = async () => {
    setLoading(true);
    try {
      
      const config = getSupabaseConfig();
      const headers = getAuthenticatedHeaders();
      
      const response = await fetch(
        `${config.url}/rest/v1/Corretores?id=eq.${corretorId}&select=id,nm_corretor,mbti_tipo,mbti_percent_mind,mbti_percent_energy,mbti_percent_nature,mbti_percent_tactics,mbti_percent_identity`,
        {
          method: 'GET',
          headers: headers
        }
      );
      
      if (!response.ok) {
        throw new Error(`Erro ao buscar resultado: ${response.status}`);
      }
      
      const data = await response.json();
      if (!data || data.length === 0 || !data[0].mbti_tipo) {
        setPreview(null);
        return;
      }
      
      const corretor = data[0];
      const tipoCompleto = corretor.mbti_tipo;
      const tipoBase = tipoCompleto.substring(0, 4);
      const dadosTipo = MBTI_TIPOS[tipoBase];
      
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
      
      const energiaInfo = getLadoELetra(corretor.mbti_percent_energy || 50, 'energia');
      const menteInfo = getLadoELetra(corretor.mbti_percent_mind || 50, 'mente');
      const naturezaInfo = getLadoELetra(corretor.mbti_percent_nature || 50, 'natureza');
      const abordagemInfo = getLadoELetra(corretor.mbti_percent_tactics || 50, 'abordagem');
      const identidadeInfo = getLadoELetra(corretor.mbti_percent_identity || 50, 'identidade');
      
      // Montar preview com os dados salvos
      const dadosPreview: DadosExtraidos16P = {
        tipo: tipoCompleto,
        url: '',
        codigoTeste: '',
        tipoCodigo: tipoBase,
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
    } catch (error) {
      console.error('❌ Erro ao carregar resultado MBTI:', error);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal com resultado completo */}
      <div className="relative w-full h-full max-w-7xl max-h-[95vh] overflow-hidden rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-300 bg-white dark:bg-slate-900">
        {/* Header fixo com botão fechar */}
        <div className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b px-6 py-4 flex items-center justify-between shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">
            Resultado MBTI - {corretorNome}
          </h2>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-lg hover:bg-red-100 active:bg-red-200 transition-all relative z-[110] flex items-center justify-center"
            style={{ backgroundColor: 'white', border: '2px solid #fee2e2' }}
            title="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px', minWidth: '20px', flexShrink: 0 }}>
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>

        {/* Conteúdo: Visualização completa do resultado MBTI */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(95vh - 80px)', backgroundColor: '#F8FAFC' }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: '#3b82f630', borderTopColor: '#3b82f6' }}></div>
                <p className="text-sm text-gray-600 dark:text-slate-400">Carregando resultado...</p>
              </div>
            </div>
          ) : preview ? (
            <div className="min-h-screen py-8 px-4">
              <div className="max-w-6xl mx-auto">
                
                {/* Header Minimalista */}
                <div className="mb-8">
                  <Button 
                    variant="ghost" 
                    onClick={onClose} 
                    className="mb-4 text-gray-600 dark:text-slate-400 hover:text-gray-900"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar
                  </Button>
                  
                  <div className="flex items-baseline gap-3 mb-2">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">
                      Análise MBTI
                    </h1>
                    <span className="text-sm text-gray-500 dark:text-slate-400 font-medium">
                      {corretorNome}
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
                      const tipoBase = preview.tipo.substring(0, 4);
                      const dadosTipo: MBTITipo | undefined = MBTI_TIPOS[tipoBase];
                      
                      return (
                        <>
                          <div className="bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-300 rounded-xl p-6 mb-6">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs font-semibold text-blue-600 dark:text-blue-300 uppercase tracking-wider mb-2">
                                  TIPO PRINCIPAL
                                </p>
                                <h2 className="text-4xl font-bold text-blue-900 mb-2">
                                  {preview.tipo}
                                </h2>
                                {dadosTipo && (
                                  <>
                                    <p className="text-xl text-gray-800 dark:text-slate-200 font-semibold mb-1">
                                      {dadosTipo.nome}
                                    </p>
                                    <p className="text-sm text-gray-600 dark:text-slate-400 italic">
                                      "{dadosTipo.apelido}"
                                    </p>
                                    <p className="text-sm text-blue-700 dark:text-blue-300 mt-2 font-medium">
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
                              <div className="mt-6 pt-6 border-t border-blue-200 dark:border-blue-900">
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
                                <div className="p-5 bg-green-50 dark:bg-green-950/40 rounded-lg border border-green-200 dark:border-green-900">
                                  <h4 className="text-sm font-semibold text-green-900 uppercase tracking-wide mb-2 flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4" />
                                    Pontos Fortes
                                  </h4>
                                  <p className="text-sm text-green-800 dark:text-green-200 leading-relaxed">
                                    {dadosTipo.pontosFortes}
                                  </p>
                                </div>

                                <div className="p-5 bg-orange-50 dark:bg-orange-950/40 rounded-lg border border-orange-200 dark:border-orange-900">
                                  <h4 className="text-sm font-semibold text-orange-900 uppercase tracking-wide mb-2 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    Pontos de Atenção
                                  </h4>
                                  <p className="text-sm text-orange-800 dark:text-orange-200 leading-relaxed">
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
              </div>
            </div>
          ) : (
            <div className="text-center py-20">
              <p className="text-gray-600 dark:text-slate-400">Nenhum resultado MBTI encontrado para este corretor.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
