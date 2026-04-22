/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Componente: Meus Resultados - Visualização dos testes do corretor
 * Função: Exibir resultados de DISC, Eneagrama e MBTI do corretor logado
 */

import { useState, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from "@/hooks/useAuth";
import { Loader2, CheckCircle2, XCircle, TrendingUp, Brain, Star, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buscarIdCorretorPorNome } from '../services/buscarCorretorIdService';
import { buscarCorretorPorEmail } from '../services/buscarCorretorPorEmailService';
import { buscarResultadoDISCCorretor } from '../services/discResultsService';
import { buscarResultadoEneagramaCorretor } from '../services/eneagramaResultsService';
import { buscarResultadoMBTICorretor } from '../services/mbtiResultsService';
import { DISC_PROFILES } from '@/data/discQuestions';
import { ENEAGRAMA_TIPOS } from '@/data/eneagramaQuestions';

interface MeusResultadosCorretorProps {
  onVisualizarTeste?: (teste: 'disc' | 'eneagrama' | 'mbti') => void;
  onMeuResumo?: () => void;
}

export const MeusResultadosCorretor = ({ 
  onVisualizarTeste,
  onMeuResumo 
}: MeusResultadosCorretorProps) => {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const isDarkMode = currentTheme === 'preto' || currentTheme === 'cinza';
  
  const [loading, setLoading] = useState(true);
  const [corretorId, setCorretorId] = useState<number | null>(null);
  const [resultados, setResultados] = useState<{
    disc: any | null;
    eneagrama: any | null;
    mbti: any | null;
  }>({
    disc: null,
    eneagrama: null,
    mbti: null
  });

  // Buscar ID do corretor e seus resultados
  useEffect(() => {
    const carregarResultados = async () => {
      if (!user?.email) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Buscar ID do corretor por email (estratégia principal)
        const identidade = await buscarCorretorPorEmail(user.email, user.name);
        const id = identidade?.id ?? null;
        if (!id) {
          console.error('❌ ID do corretor não encontrado para email:', user.email);
          setLoading(false);
          return;
        }

        setCorretorId(id);

        // Buscar resultados dos 3 testes em paralelo
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

  // Calcular progresso
  const testesCompletos = [
    resultados.disc !== null,
    resultados.eneagrama !== null,
    resultados.mbti !== null
  ].filter(Boolean).length;

  const progressoPercentual = (testesCompletos / 3) * 100;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className={`h-8 w-8 animate-spin ${isDarkMode ? 'text-pink-400' : 'text-pink-600 dark:text-pink-300'}`} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com Progresso */}
      <div className={`rounded-2xl p-6 ${
        isDarkMode 
          ? 'bg-gradient-to-br from-neutral-800/60 to-neutral-900/60 border border-neutral-700/50' 
          : 'bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200/50'
      } shadow-xl`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900 dark:text-slate-100'}`}>
              Meus Resultados
            </h3>
            <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400 dark:text-slate-500' : 'text-gray-600 dark:text-slate-400'}`}>
              Seus testes de personalidade e comportamento
            </p>
          </div>
          <div className={`text-right ${isDarkMode ? 'text-pink-400' : 'text-pink-600 dark:text-pink-300'}`}>
            <div className="text-3xl font-bold">{testesCompletos}/3</div>
            <div className="text-xs">Completos</div>
          </div>
        </div>

        {/* Barra de Progresso */}
        <div className={`h-3 rounded-full overflow-hidden ${
          isDarkMode ? 'bg-neutral-700/50' : 'bg-gray-200'
        }`}>
          <div 
            className="h-full bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 transition-all duration-500"
            style={{ width: `${progressoPercentual}%` }}
          />
        </div>
      </div>

      {/* Cards dos Testes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* DISC */}
        <button
          onClick={() => onVisualizarTeste?.('disc')}
          className={`group relative rounded-2xl p-6 text-left transition-all duration-300 ${
            resultados.disc
              ? isDarkMode
                ? 'bg-gradient-to-br from-blue-900/40 to-blue-800/40 border-2 border-blue-500/50 hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-500/20'
                : 'bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-400 hover:border-blue-500 hover:shadow-xl'
              : isDarkMode
                ? 'bg-neutral-800/40 border-2 border-neutral-700/50 hover:border-neutral-600'
                : 'bg-gray-50 dark:bg-slate-950 border-2 border-gray-300 hover:border-gray-400'
          }`}
        >
          {/* Status Badge */}
          <div className="absolute top-4 right-4">
            {resultados.disc ? (
              <CheckCircle2 className={`h-6 w-6 ${isDarkMode ? 'text-blue-400' : 'text-blue-600 dark:text-blue-300'}`} />
            ) : (
              <XCircle className={`h-6 w-6 ${isDarkMode ? 'text-gray-600 dark:text-slate-400' : 'text-gray-400 dark:text-slate-500'}`} />
            )}
          </div>

          {/* Ícone e Título */}
          <div className="mb-4">
            <div className={`text-4xl mb-3 ${resultados.disc ? 'opacity-100' : 'opacity-50'}`}>
              🎯
            </div>
            <h4 className={`text-xl font-bold ${
              resultados.disc
                ? isDarkMode ? 'text-blue-300' : 'text-blue-900'
                : isDarkMode ? 'text-gray-500 dark:text-slate-400' : 'text-gray-600 dark:text-slate-400'
            }`}>
              DISC
            </h4>
            <p className={`text-xs mt-1 ${
              isDarkMode ? 'text-gray-400 dark:text-slate-500' : 'text-gray-600 dark:text-slate-400'
            }`}>
              Perfil Comportamental
            </p>
          </div>

          {/* Resultado */}
          {resultados.disc ? (
            <div className="space-y-2">
              <div className={`text-sm font-semibold ${isDarkMode ? 'text-blue-300' : 'text-blue-700 dark:text-blue-300'}`}>
                Tipo: {resultados.disc.tipo_principal}
              </div>
              <div className={`text-xs ${isDarkMode ? 'text-gray-400 dark:text-slate-500' : 'text-gray-600 dark:text-slate-400'}`}>
                {DISC_PROFILES[resultados.disc.tipo_principal as keyof typeof DISC_PROFILES]?.nome}
              </div>
              <div className="pt-2">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  isDarkMode 
                    ? 'bg-blue-500/20 text-blue-300' 
                    : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                }`}>
                  Clique para ver detalhes
                </span>
              </div>
            </div>
          ) : (
            <div className={`text-sm ${isDarkMode ? 'text-gray-500 dark:text-slate-400' : 'text-gray-500 dark:text-slate-400'}`}>
              Teste não realizado
            </div>
          )}
        </button>

        {/* ENEAGRAMA */}
        <button
          onClick={() => onVisualizarTeste?.('eneagrama')}
          className={`group relative rounded-2xl p-6 text-left transition-all duration-300 ${
            resultados.eneagrama
              ? isDarkMode
                ? 'bg-gradient-to-br from-purple-900/40 to-purple-800/40 border-2 border-purple-500/50 hover:border-purple-400 hover:shadow-2xl hover:shadow-purple-500/20'
                : 'bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-400 hover:border-purple-500 hover:shadow-xl'
              : isDarkMode
                ? 'bg-neutral-800/40 border-2 border-neutral-700/50 hover:border-neutral-600'
                : 'bg-gray-50 dark:bg-slate-950 border-2 border-gray-300 hover:border-gray-400'
          }`}
        >
          {/* Status Badge */}
          <div className="absolute top-4 right-4">
            {resultados.eneagrama ? (
              <CheckCircle2 className={`h-6 w-6 ${isDarkMode ? 'text-purple-400' : 'text-purple-600 dark:text-purple-300'}`} />
            ) : (
              <XCircle className={`h-6 w-6 ${isDarkMode ? 'text-gray-600 dark:text-slate-400' : 'text-gray-400 dark:text-slate-500'}`} />
            )}
          </div>

          {/* Ícone e Título */}
          <div className="mb-4">
            <div className={`text-4xl mb-3 ${resultados.eneagrama ? 'opacity-100' : 'opacity-50'}`}>
              ⭐
            </div>
            <h4 className={`text-xl font-bold ${
              resultados.eneagrama
                ? isDarkMode ? 'text-purple-300' : 'text-purple-900'
                : isDarkMode ? 'text-gray-500 dark:text-slate-400' : 'text-gray-600 dark:text-slate-400'
            }`}>
              ENEAGRAMA
            </h4>
            <p className={`text-xs mt-1 ${
              isDarkMode ? 'text-gray-400 dark:text-slate-500' : 'text-gray-600 dark:text-slate-400'
            }`}>
              Motivações Profundas
            </p>
          </div>

          {/* Resultado */}
          {resultados.eneagrama ? (
            <div className="space-y-2">
              <div className={`text-sm font-semibold ${isDarkMode ? 'text-purple-300' : 'text-purple-700 dark:text-purple-300'}`}>
                Tipo {resultados.eneagrama.tipo_eneagrama}
              </div>
              <div className={`text-xs ${isDarkMode ? 'text-gray-400 dark:text-slate-500' : 'text-gray-600 dark:text-slate-400'}`}>
                {ENEAGRAMA_TIPOS[resultados.eneagrama.tipo_eneagrama]?.nome}
              </div>
              <div className="pt-2">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  isDarkMode 
                    ? 'bg-purple-500/20 text-purple-300' 
                    : 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                }`}>
                  Clique para ver detalhes
                </span>
              </div>
            </div>
          ) : (
            <div className={`text-sm ${isDarkMode ? 'text-gray-500 dark:text-slate-400' : 'text-gray-500 dark:text-slate-400'}`}>
              Teste não realizado
            </div>
          )}
        </button>

        {/* MBTI */}
        <button
          onClick={() => onVisualizarTeste?.('mbti')}
          className={`group relative rounded-2xl p-6 text-left transition-all duration-300 ${
            resultados.mbti
              ? isDarkMode
                ? 'bg-gradient-to-br from-emerald-900/40 to-emerald-800/40 border-2 border-emerald-500/50 hover:border-emerald-400 hover:shadow-2xl hover:shadow-emerald-500/20'
                : 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-400 hover:border-emerald-500 hover:shadow-xl'
              : isDarkMode
                ? 'bg-neutral-800/40 border-2 border-neutral-700/50 hover:border-neutral-600'
                : 'bg-gray-50 dark:bg-slate-950 border-2 border-gray-300 hover:border-gray-400'
          }`}
        >
          {/* Status Badge */}
          <div className="absolute top-4 right-4">
            {resultados.mbti ? (
              <CheckCircle2 className={`h-6 w-6 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600 dark:text-emerald-300'}`} />
            ) : (
              <XCircle className={`h-6 w-6 ${isDarkMode ? 'text-gray-600 dark:text-slate-400' : 'text-gray-400 dark:text-slate-500'}`} />
            )}
          </div>

          {/* Ícone e Título */}
          <div className="mb-4">
            <div className={`text-4xl mb-3 ${resultados.mbti ? 'opacity-100' : 'opacity-50'}`}>
              🧠
            </div>
            <h4 className={`text-xl font-bold ${
              resultados.mbti
                ? isDarkMode ? 'text-emerald-300' : 'text-emerald-900'
                : isDarkMode ? 'text-gray-500 dark:text-slate-400' : 'text-gray-600 dark:text-slate-400'
            }`}>
              MBTI
            </h4>
            <p className={`text-xs mt-1 ${
              isDarkMode ? 'text-gray-400 dark:text-slate-500' : 'text-gray-600 dark:text-slate-400'
            }`}>
              Tipo Psicológico
            </p>
          </div>

          {/* Resultado */}
          {resultados.mbti ? (
            <div className="space-y-2">
              <div className={`text-sm font-semibold ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                {resultados.mbti.tipo_mbti}
              </div>
              <div className={`text-xs ${isDarkMode ? 'text-gray-400 dark:text-slate-500' : 'text-gray-600 dark:text-slate-400'}`}>
                {resultados.mbti.descricao}
              </div>
              <div className="pt-2">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  isDarkMode 
                    ? 'bg-emerald-500/20 text-emerald-300' 
                    : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                }`}>
                  Clique para ver detalhes
                </span>
              </div>
            </div>
          ) : (
            <div className={`text-sm ${isDarkMode ? 'text-gray-500 dark:text-slate-400' : 'text-gray-500 dark:text-slate-400'}`}>
              Teste não realizado
            </div>
          )}
        </button>
      </div>

      {/* Botão Meu Resumo - Só aparece se tiver pelo menos 1 teste */}
      {testesCompletos > 0 && (
        <div className="flex justify-center pt-4">
          <Button
            onClick={onMeuResumo}
            size="lg"
            className={`group relative px-8 py-6 rounded-2xl font-bold text-lg shadow-2xl transition-all duration-300 ${
              isDarkMode
                ? 'bg-gradient-to-r from-pink-600 via-purple-600 to-blue-600 hover:from-pink-500 hover:via-purple-500 hover:to-blue-500 text-white'
                : 'bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 hover:from-pink-600 hover:via-purple-600 hover:to-blue-600 text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <TrendingUp className="h-6 w-6" />
              <span>Meu Resumo</span>
              <Brain className="h-6 w-6" />
            </div>
          </Button>
        </div>
      )}

      {/* Mensagem se não tiver testes */}
      {testesCompletos === 0 && (
        <div className={`text-center py-8 rounded-2xl ${
          isDarkMode 
            ? 'bg-neutral-800/40 border border-neutral-700/50' 
            : 'bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800'
        }`}>
          <div className="text-4xl mb-4">🎯</div>
          <h4 className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700 dark:text-slate-300'}`}>
            Você ainda não realizou nenhum teste
          </h4>
          <p className={`text-sm ${isDarkMode ? 'text-gray-500 dark:text-slate-400' : 'text-gray-600 dark:text-slate-400'}`}>
            Complete os testes para desbloquear insights personalizados sobre seu perfil
          </p>
        </div>
      )}
    </div>
  );
};

