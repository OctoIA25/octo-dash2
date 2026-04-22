/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Componente: Dashboard de Resultados Gerais dos Testes
 * Função: Visão consolidada dos 3 testes (DISC, Eneagrama, MBTI) para administradores
 * Paleta: Azul (#3b82f6), Branco, Cinza - Design Minimalista e Profissional
 * Foco: Insights estratégicos de gestão
 */

import { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Award,
  Lightbulb,
  Target,
  Briefcase,
  ChevronRight,
  Search,
  Filter,
  X
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  buscarEstatisticasDISC, 
  buscarEstatisticasEneagrama, 
  buscarEstatisticasMBTI,
  DISCStats,
  EneagramaStats,
  MBTIStats
} from '@/services/testesEstatisticasService';
import { DISC_PROFILES } from '@/data/discQuestions';
import { ENEAGRAMA_TIPOS } from '@/data/eneagramaQuestions';
import { DISCCorretorIndividualModal } from './DISCCorretorIndividualModal';
import { EneagramaCorretorIndividualModal } from './EneagramaCorretorIndividualModal';
import { MBTICorretorIndividualModal } from './MBTICorretorIndividualModal';
import { useAuth } from '@/hooks/useAuth';

interface AdminResultadosGeraisProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const AdminResultadosGerais = ({ isOpen = true, onClose }: AdminResultadosGeraisProps) => {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [discStats, setDiscStats] = useState<DISCStats | null>(null);
  const [eneagramaStats, setEneagramaStats] = useState<EneagramaStats | null>(null);
  const [mbtiStats, setMbtiStats] = useState<MBTIStats | null>(null);
  const [busca, setBusca] = useState('');
  const [testeFilter, setTesteFilter] = useState<'todos' | 'disc' | 'eneagrama' | 'mbti'>('todos');
  const [corretorSelecionado, setCorretorSelecionado] = useState<{
    id: number;
    nome: string;
    tipo: 'disc' | 'eneagrama' | 'mbti';
  } | null>(null);
  const [corretorResumo, setCorretorResumo] = useState<{
    id: number;
    nome: string;
  } | null>(null);

  // Paleta de cores
  const bgPrimary = '#ffffff';
  const bgCard = '#f8fafc';
  const border = '#e2e8f0';
  const textPrimary = '#0f172a';
  const textSecondary = '#64748b';
  const accentBlue = '#3b82f6';

  useEffect(() => {
    if (isOpen) {
      carregarEstatisticas();
    }
  }, [isOpen]);

  const carregarEstatisticas = async () => {
    setLoading(true);
    try {
      const [disc, enea, mbti] = await Promise.all([
        buscarEstatisticasDISC(tenantId || undefined),
        buscarEstatisticasEneagrama(tenantId || undefined),
        buscarEstatisticasMBTI(tenantId || undefined)
      ]);
      setDiscStats(disc);
      setEneagramaStats(enea);
      setMbtiStats(mbti);
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  if (loading) {
    return (
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div 
          className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" 
              style={{ borderColor: `${accentBlue}30`, borderTopColor: accentBlue }}
            />
            <p style={{ color: textSecondary }} className="text-sm">Carregando estatísticas gerais...</p>
          </div>
        </div>
      </div>
    );
  }

  const totalCorretores = discStats?.totalCorretores || 0;
  const comTodosTestes = Math.min(
    discStats?.comTeste || 0,
    eneagramaStats?.comTeste || 0,
    mbtiStats?.comTeste || 0
  );
  const percentualCompleto = totalCorretores > 0 ? (comTodosTestes / totalCorretores) * 100 : 0;

  return (
    <>
      <style>{`
        .results-modal-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .results-modal-scrollbar::-webkit-scrollbar-track {
          background: ${bgCard};
          border-radius: 4px;
        }
        .results-modal-scrollbar::-webkit-scrollbar-thumb {
          background: ${accentBlue};
          border-radius: 4px;
        }
        .results-modal-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #2563eb;
        }
      `}</style>
      
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div 
          className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
          style={{ 
            backgroundColor: bgCard,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)'
          }}
        >
          {/* Header com Botão de Fechar */}
          <div className="flex justify-between items-center px-6 py-4 border-b bg-gradient-to-b from-gray-50 to-transparent" style={{ borderColor: border }}>
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-3" style={{ color: textPrimary }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${accentBlue}10` }}>
                  <BarChart3 className="w-6 h-6" style={{ color: accentBlue }} />
                </div>
                Resultados Gerais - Testes de Personalidade
              </h2>
              <p style={{ color: textSecondary }} className="mt-1 text-sm ml-13">
                Visão consolidada de DISC, Eneagrama e MBTI para gestão estratégica da equipe
              </p>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-400 dark:text-slate-500 hover:text-gray-600 text-2xl w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-all duration-200 hover:rotate-90"
                aria-label="Fechar"
                style={{ color: textSecondary }}
              >
                ×
              </button>
            )}
          </div>

          {/* Content com Scroll */}
          <div className="overflow-y-auto results-modal-scrollbar" style={{ maxHeight: 'calc(90vh - 100px)' }}>
            <div className="p-6 space-y-6">

              {/* Cards de Métricas Principais */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total de Corretores */}
        <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border hover:shadow-lg transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <Users className="w-6 h-6" style={{ color: textSecondary }} />
              <p style={{ color: textPrimary }} className="text-4xl font-bold">{totalCorretores}</p>
            </div>
            <p style={{ color: textSecondary }} className="text-sm font-medium">Total de Corretores</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: `${accentBlue}20` }}>
                <div className="h-full rounded-full" style={{ width: '100%', backgroundColor: accentBlue }} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Testes DISC */}
        <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border hover:shadow-lg transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ backgroundColor: '#1e3a8a', color: '#ffffff' }}>
                D
              </div>
              <p style={{ color: textPrimary }} className="text-4xl font-bold">{discStats?.comTeste || 0}</p>
            </div>
            <p style={{ color: textSecondary }} className="text-sm font-medium">DISC Completos</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: '#dbeafe' }}>
                <div 
                  className="h-full rounded-full transition-all duration-500" 
                  style={{ width: `${discStats?.percentualCompleto || 0}%`, backgroundColor: '#1e3a8a' }} 
                />
              </div>
              <span style={{ color: '#1e3a8a' }} className="text-xs font-bold">{discStats?.percentualCompleto.toFixed(0) || 0}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Testes Eneagrama */}
        <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border hover:shadow-lg transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ backgroundColor: '#2563eb', color: '#ffffff' }}>
                E
              </div>
              <p style={{ color: textPrimary }} className="text-4xl font-bold">{eneagramaStats?.comTeste || 0}</p>
            </div>
            <p style={{ color: textSecondary }} className="text-sm font-medium">Eneagrama Completos</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: '#dbeafe' }}>
                <div 
                  className="h-full rounded-full transition-all duration-500" 
                  style={{ width: `${eneagramaStats?.percentualCompleto || 0}%`, backgroundColor: '#2563eb' }} 
                />
              </div>
              <span style={{ color: '#2563eb' }} className="text-xs font-bold">{eneagramaStats?.percentualCompleto.toFixed(0) || 0}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Testes MBTI */}
        <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border hover:shadow-lg transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ backgroundColor: '#60a5fa', color: '#ffffff' }}>
                M
              </div>
              <p style={{ color: textPrimary }} className="text-4xl font-bold">{mbtiStats?.comTeste || 0}</p>
            </div>
            <p style={{ color: textSecondary }} className="text-sm font-medium">MBTI Completos</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: '#dbeafe' }}>
                <div 
                  className="h-full rounded-full transition-all duration-500" 
                  style={{ width: `${mbtiStats?.percentualCompleto || 0}%`, backgroundColor: '#60a5fa' }} 
                />
              </div>
              <span style={{ color: '#60a5fa' }} className="text-xs font-bold">{mbtiStats?.percentualCompleto.toFixed(0) || 0}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Insights Estratégicos de Gestão */}
      <Card style={{ backgroundColor: '#eff6ff', borderColor: accentBlue }} className="border-2 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Lightbulb className="w-8 h-8 flex-shrink-0" style={{ color: accentBlue }} />
            <div className="flex-1">
              <h3 style={{ color: textPrimary }} className="text-xl font-bold mb-3">
                Insights Estratégicos de Gestão
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg" style={{ backgroundColor: bgPrimary }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-5 h-5" style={{ color: '#1e40af' }} />
                    <h4 style={{ color: textPrimary }} className="font-bold text-sm">DISC - Como Agem</h4>
                  </div>
                  <p style={{ color: textSecondary }} className="text-xs leading-relaxed">
                    Use o DISC para <strong>delegação de tarefas</strong> baseada em estilo comportamental. 
                    Perfis D lideram, I vendem, S apoiam, C analisam.
                  </p>
                </div>
                
                <div className="p-4 rounded-lg" style={{ backgroundColor: bgPrimary }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-5 h-5" style={{ color: '#2563eb' }} />
                    <h4 style={{ color: textPrimary }} className="font-bold text-sm">Eneagrama - Por Que Agem</h4>
                  </div>
                  <p style={{ color: textSecondary }} className="text-xs leading-relaxed">
                    Use o Eneagrama para <strong>motivação profunda</strong>. Entenda medos e desejos centrais 
                    para engajamento genuíno e retenção de talentos.
                  </p>
                </div>
                
                <div className="p-4 rounded-lg" style={{ backgroundColor: bgPrimary }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-5 h-5" style={{ color: '#3b82f6' }} />
                    <h4 style={{ color: textPrimary }} className="font-bold text-sm">MBTI - Como Pensam</h4>
                  </div>
                  <p style={{ color: textSecondary }} className="text-xs leading-relaxed">
                    Use o MBTI para <strong>comunicação eficaz</strong>. Adapte sua mensagem ao estilo 
                    cognitivo: analíticos, intuitivos, lógicos ou empáticos.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Distribuições Lado a Lado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* DISC */}
        {discStats && (
          <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-md">
            <CardContent className="p-6">
              <h3 style={{ color: textPrimary }} className="text-lg font-bold mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ backgroundColor: '#1e40af', color: '#ffffff' }}>
                  D
                </div>
                Distribuição DISC
              </h3>
              <div className="space-y-2" style={{ minHeight: '240px', paddingBottom: '120px' }}>
                {(['D', 'I', 'S', 'C'] as const).map((tipo, index) => {
                  const profile = DISC_PROFILES[tipo];
                  const data = discStats.distribuicao[tipo];
                  const blueGradient = ['#1e40af', '#2563eb', '#3b82f6', '#60a5fa'];
                  
                  return (
                    <div key={tipo}>
                      <div className="flex justify-between mb-1">
                        <span style={{ color: textPrimary }} className="text-xs font-semibold">{tipo} - {profile.nome}</span>
                        <span style={{ color: blueGradient[index] }} className="text-xs font-bold">{data.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${blueGradient[index]}20` }}>
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${data.percentual}%`, backgroundColor: blueGradient[index] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Insight de Gestão DISC */}
              <div className="mt-4 p-4 rounded-lg flex items-start gap-3" style={{ backgroundColor: '#1e40af', borderLeft: '3px solid #1e3a8a' }}>
                <span className="text-lg leading-none">💡</span>
                <div className="flex-1">
                  <p style={{ color: '#ffffff' }} className="text-xs font-semibold leading-relaxed">
                    <strong>Mais Comum:</strong> Perfil {Object.entries(discStats.distribuicao)
                      .sort((a, b) => b[1].count - a[1].count)[0][0]} - {DISC_PROFILES[Object.entries(discStats.distribuicao).sort((a, b) => b[1].count - a[1].count)[0][0]].nome}
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#e0e7ff' }}>
                    {DISC_PROFILES[Object.entries(discStats.distribuicao).sort((a, b) => b[1].count - a[1].count)[0][0]].descricao}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Eneagrama */}
        {eneagramaStats && (
          <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-md">
            <CardContent className="p-6">
              <h3 style={{ color: textPrimary }} className="text-lg font-bold mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ backgroundColor: '#2563eb', color: '#ffffff' }}>
                  E
                </div>
                Distribuição Eneagrama
              </h3>
              <div className="space-y-2 min-h-[240px] max-h-64 overflow-y-auto">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((tipo, index) => {
                  const tipoData = ENEAGRAMA_TIPOS[tipo];
                  const data = eneagramaStats.distribuicao[tipo] || { count: 0, percentual: 0 };
                  const blueGradient = [
                    '#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', 
                    '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff'
                  ];
                  
                  return (
                    <div key={tipo}>
                      <div className="flex justify-between mb-1">
                        <span style={{ color: textPrimary }} className="text-xs font-semibold">{tipoData.nome}</span>
                        <span style={{ color: blueGradient[index] }} className="text-xs font-bold">{data.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${blueGradient[index]}20` }}>
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${data.percentual}%`, backgroundColor: blueGradient[index] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Insight de Gestão Eneagrama */}
              <div className="mt-4 p-4 rounded-lg flex items-start gap-3" style={{ backgroundColor: '#2563eb', borderLeft: '3px solid #1e40af' }}>
                <span className="text-lg leading-none">💡</span>
                <div className="flex-1">
                  <p style={{ color: '#ffffff' }} className="text-xs font-semibold leading-relaxed">
                    <strong>Mais Comum:</strong> Tipo {eneagramaStats.tipoMaisComum} - {ENEAGRAMA_TIPOS[eneagramaStats.tipoMaisComum].nome}
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#e0e7ff' }}>
                    {ENEAGRAMA_TIPOS[eneagramaStats.tipoMaisComum].motivacaoCentral}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* MBTI */}
        {mbtiStats && (
          <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-md">
            <CardContent className="p-6">
              <h3 style={{ color: textPrimary }} className="text-lg font-bold mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ backgroundColor: '#60a5fa', color: '#ffffff' }}>
                  M
                </div>
                Distribuição MBTI
              </h3>
              <div className="space-y-2 min-h-[240px] max-h-64 overflow-y-auto">
                {['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'].map((tipo, index) => {
                    const data = mbtiStats.distribuicao[tipo] || { count: 0, percentual: 0 };
                    const blueGradient = [
                      '#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', 
                      '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe',
                      '#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', 
                      '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'
                    ];
                    
                    return (
                      <div key={tipo}>
                        <div className="flex justify-between mb-1">
                          <span style={{ color: textPrimary }} className="text-xs font-semibold">{tipo}</span>
                          <span style={{ color: blueGradient[index] }} className="text-xs font-bold">{data.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${blueGradient[index]}20` }}>
                          <div 
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${data.percentual}%`, backgroundColor: blueGradient[index] }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
              
              {/* Insight de Gestão MBTI */}
              <div className="mt-4 p-4 rounded-lg flex items-start gap-3" style={{ backgroundColor: '#3b82f6', borderLeft: `3px solid #2563eb` }}>
                <span className="text-lg leading-none">💡</span>
                <div className="flex-1">
                  <p style={{ color: '#ffffff' }} className="text-xs font-semibold leading-relaxed">
                    <strong>Mais Comum:</strong> Tipo {mbtiStats.tipoMaisComum}
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#e0e7ff' }}>
                    Diversidade de {Object.keys(mbtiStats.distribuicao).length} tipos diferentes na equipe.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Comparativo Geral */}
      <Card style={{ backgroundColor: bgCard, borderColor: border }} className="border shadow-md">
        <CardContent className="p-6">
          <h3 style={{ color: textPrimary }} className="text-lg font-bold mb-6 flex items-center gap-2">
            <Briefcase className="w-5 h-5" style={{ color: accentBlue }} />
            Comparativo de Adesão aos Testes
          </h3>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold" style={{ backgroundColor: '#1e40af', color: '#ffffff' }}>
                    D
                  </div>
                  <div>
                    <p style={{ color: textPrimary }} className="font-bold text-sm">Teste DISC</p>
                    <p style={{ color: textSecondary }} className="text-xs">Análise comportamental</p>
                  </div>
                </div>
                <div className="text-right">
                  <p style={{ color: textPrimary }} className="font-bold text-xl">{discStats?.comTeste || 0}</p>
                  <p style={{ color: textSecondary }} className="text-xs">{discStats?.percentualCompleto.toFixed(1) || 0}% completo</p>
                </div>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#dbeafe' }}>
                <div 
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${discStats?.percentualCompleto || 0}%`, backgroundColor: '#1e40af' }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold" style={{ backgroundColor: '#2563eb', color: '#ffffff' }}>
                    E
                  </div>
                  <div>
                    <p style={{ color: textPrimary }} className="font-bold text-sm">Teste Eneagrama</p>
                    <p style={{ color: textSecondary }} className="text-xs">Motivações profundas</p>
                  </div>
                </div>
                <div className="text-right">
                  <p style={{ color: textPrimary }} className="font-bold text-xl">{eneagramaStats?.comTeste || 0}</p>
                  <p style={{ color: textSecondary }} className="text-xs">{eneagramaStats?.percentualCompleto.toFixed(1) || 0}% completo</p>
                </div>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#dbeafe' }}>
                <div 
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${eneagramaStats?.percentualCompleto || 0}%`, backgroundColor: '#2563eb' }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold" style={{ backgroundColor: '#60a5fa', color: '#ffffff' }}>
                    M
                  </div>
                  <div>
                    <p style={{ color: textPrimary }} className="font-bold text-sm">Teste MBTI</p>
                    <p style={{ color: textSecondary }} className="text-xs">Estilo cognitivo</p>
                  </div>
                </div>
                <div className="text-right">
                  <p style={{ color: textPrimary }} className="font-bold text-xl">{mbtiStats?.comTeste || 0}</p>
                  <p style={{ color: textSecondary }} className="text-xs">{mbtiStats?.percentualCompleto.toFixed(1) || 0}% completo</p>
                </div>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#dbeafe' }}>
                <div 
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${mbtiStats?.percentualCompleto || 0}%`, backgroundColor: '#60a5fa' }}
                />
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
              Corretores - Resultados Individuais
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
            {discStats?.corretoresPorTipo && Object.values(discStats.corretoresPorTipo)
              .flat()
              .filter((corretor: any) => 
                busca === '' || corretor.nome.toLowerCase().includes(busca.toLowerCase())
              )
              .map((corretor: any) => {
                // Buscar dados do corretor nos 3 testes
                const temDISC = discStats?.corretoresPorTipo && 
                  Object.values(discStats.corretoresPorTipo).flat().some((c: any) => c.id === corretor.id);
                const temEneagrama = eneagramaStats?.corretoresPorTipo && 
                  Object.values(eneagramaStats.corretoresPorTipo).flat().some((c: any) => c.id === corretor.id);
                const temMBTI = mbtiStats?.corretoresPorTipo && 
                  Object.values(mbtiStats.corretoresPorTipo).flat().some((c: any) => c.id === corretor.id);

                const testesCompletos = [temDISC, temEneagrama, temMBTI].filter(Boolean).length;

                return (
                  <Card
                    key={corretor.id}
                    className="border cursor-pointer hover:shadow-lg transition-all duration-200 group"
                    style={{ 
                      backgroundColor: bgPrimary, 
                      borderColor: testesCompletos === 3 ? accentBlue : border 
                    }}
                    onClick={() => {
                      // Abrir modal resumido com os 3 testes
                      setCorretorResumo({ id: corretor.id, nome: corretor.nome });
                    }}
                  >
                    <CardContent className="p-4">
                      {/* Header do Card */}
                      <div className="flex items-center justify-between mb-3">
                        <p style={{ color: textPrimary }} className="font-bold text-sm">{corretor.nome}</p>
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" style={{ color: accentBlue }} />
                      </div>

                      {/* Status dos Testes */}
                      <div className="flex items-center gap-2 mb-3">
                        {/* DISC */}
                        <div 
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md transition-all"
                          style={{ 
                            backgroundColor: temDISC ? '#1e40af' : '#f1f5f9',
                            color: temDISC ? '#ffffff' : textSecondary
                          }}
                        >
                          <span className="text-xs font-bold">D</span>
                        </div>

                        {/* Eneagrama */}
                        <div 
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md transition-all"
                          style={{ 
                            backgroundColor: temEneagrama ? '#2563eb' : '#f1f5f9',
                            color: temEneagrama ? '#ffffff' : textSecondary
                          }}
                        >
                          <span className="text-xs font-bold">E</span>
                        </div>

                        {/* MBTI */}
                        <div 
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md transition-all"
                          style={{ 
                            backgroundColor: temMBTI ? '#60a5fa' : '#f1f5f9',
                            color: temMBTI ? '#ffffff' : textSecondary
                          }}
                        >
                          <span className="text-xs font-bold">M</span>
                        </div>
                      </div>

                      {/* Progresso */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span style={{ color: textSecondary }} className="text-xs">Testes completos</span>
                          <span style={{ color: accentBlue }} className="text-xs font-bold">{testesCompletos}/3</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#dbeafe' }}>
                          <div 
                            className="h-full rounded-full transition-all duration-500"
                            style={{ 
                              width: `${(testesCompletos / 3) * 100}%`, 
                              backgroundColor: accentBlue 
                            }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>

          {/* Mensagem se não houver resultados */}
          {discStats?.corretoresPorTipo && 
            Object.values(discStats.corretoresPorTipo)
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

      {/* Modal Resumido - 3 Testes Juntos */}
      {corretorResumo && (
        <div 
          className="octo-modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onClick={() => setCorretorResumo(null)}
        >
          <div 
            className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-300"
            style={{ backgroundColor: bgPrimary }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div 
              className="sticky top-0 z-10 border-b px-8 py-6"
              style={{ backgroundColor: bgPrimary, borderColor: border }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold" style={{ color: textPrimary }}>
                    {corretorResumo.nome}
                  </h2>
                  <p style={{ color: textSecondary }} className="text-sm mt-1">
                    Resumo dos Testes de Personalidade
                  </p>
                </div>
                
                <button
                  onClick={() => setCorretorResumo(null)}
                  className="h-9 w-9 rounded-lg hover:bg-red-100 active:bg-red-200 transition-all flex items-center justify-center"
                  style={{ 
                    backgroundColor: 'white', 
                    border: '2px solid #fee2e2' 
                  }}
                  title="Fechar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px', minWidth: '20px', flexShrink: 0 }}>
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path>
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="overflow-y-auto p-8" style={{ maxHeight: 'calc(90vh - 120px)' }}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                {/* DISC */}
                <Card style={{ backgroundColor: bgCard, borderColor: '#1e40af' }} className="border-2 hover:shadow-lg transition-all flex flex-col">
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg" style={{ backgroundColor: '#1e40af', color: '#ffffff' }}>
                        D
                      </div>
                      <div>
                        <h3 style={{ color: textPrimary }} className="font-bold text-base">DISC</h3>
                        <p style={{ color: textSecondary }} className="text-xs">Comportamento</p>
                      </div>
                    </div>
                    
                    {(() => {
                      const corretor = discStats?.corretoresPorTipo && 
                        Object.values(discStats.corretoresPorTipo).flat().find((c: any) => c.id === corretorResumo.id);
                      
                      if (!corretor) {
                        return (
                          <div className="text-center py-8">
                            <p style={{ color: textSecondary }} className="text-sm">Teste não realizado</p>
                          </div>
                        );
                      }

                      // Informações de gestão por perfil DISC
                      const discGestao: Record<string, { motivacao: string; medo: string; gestao: string }> = {
                        'D': {
                          motivacao: 'Resultados, desafios e controle sobre o ambiente',
                          medo: 'Ser aproveitado, perder o controle ou parecer fraco',
                          gestao: 'Dê autonomia, desafios e seja direto. Evite microgerenciamento'
                        },
                        'I': {
                          motivacao: 'Reconhecimento social, aprovação e interações positivas',
                          medo: 'Rejeição social, ser ignorado ou desaprovado',
                          gestao: 'Reconheça publicamente, mantenha ambiente positivo e colaborativo'
                        },
                        'S': {
                          motivacao: 'Estabilidade, harmonia e apoio à equipe',
                          medo: 'Mudanças bruscas, conflitos e perda de segurança',
                          gestao: 'Dê tempo para adaptação, seja consistente e valorize lealdade'
                        },
                        'C': {
                          motivacao: 'Precisão, qualidade e fazer as coisas corretamente',
                          medo: 'Erros, críticas ao trabalho e ambiguidade',
                          gestao: 'Forneça dados claros, padrões definidos e tempo para análise'
                        }
                      };

                      const perfilInfo = discGestao[corretor.tipo] || discGestao['D'];

                      return (
                        <div className="flex flex-col h-full">
                          <div className="space-y-3 flex-grow">
                            <div className="p-3 rounded-lg" style={{ backgroundColor: '#1e40af' }}>
                              <p style={{ color: '#ffffff' }} className="text-sm font-bold mb-1">Perfil Principal</p>
                              <p style={{ color: '#e0e7ff' }} className="text-lg font-bold">{corretor.tipo}</p>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="p-3 rounded-lg" style={{ backgroundColor: bgCard, border: `1px solid ${border}` }}>
                                <p style={{ color: textSecondary }} className="text-xs mb-1 font-semibold">Motivação Central:</p>
                                <p style={{ color: textPrimary }} className="text-xs leading-relaxed">
                                  {perfilInfo.motivacao}
                                </p>
                              </div>
                              
                              <div className="p-3 rounded-lg" style={{ backgroundColor: bgCard, border: `1px solid ${border}` }}>
                                <p style={{ color: textSecondary }} className="text-xs mb-1 font-semibold">Medo Básico:</p>
                                <p style={{ color: textPrimary }} className="text-xs leading-relaxed">
                                  {perfilInfo.medo}
                                </p>
                              </div>
                              
                              <div className="p-3 rounded-lg" style={{ backgroundColor: bgCard, border: `1px solid ${border}` }}>
                                <p style={{ color: textSecondary }} className="text-xs mb-1 font-semibold">Como Gerir:</p>
                                <p style={{ color: textPrimary }} className="text-xs leading-relaxed">
                                  {perfilInfo.gestao}
                                </p>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setCorretorResumo(null);
                              setTimeout(() => setCorretorSelecionado({ id: corretor.id, nome: corretor.nome, tipo: 'disc' }), 100);
                            }}
                            className="w-full mt-4 py-2 rounded-lg font-semibold text-sm transition-all hover:shadow-md"
                            style={{ backgroundColor: '#1e40af', color: '#ffffff' }}
                          >
                            Ver Detalhes Completos
                          </button>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Eneagrama */}
                <Card style={{ backgroundColor: bgCard, borderColor: '#2563eb' }} className="border-2 hover:shadow-lg transition-all flex flex-col">
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg" style={{ backgroundColor: '#2563eb', color: '#ffffff' }}>
                        E
                      </div>
                      <div>
                        <h3 style={{ color: textPrimary }} className="font-bold text-base">Eneagrama</h3>
                        <p style={{ color: textSecondary }} className="text-xs">Motivação</p>
                      </div>
                    </div>
                    
                    {(() => {
                      const corretor = eneagramaStats?.corretoresPorTipo && 
                        Object.values(eneagramaStats.corretoresPorTipo).flat().find((c: any) => c.id === corretorResumo.id);
                      
                      if (!corretor) {
                        return (
                          <div className="text-center py-8">
                            <p style={{ color: textSecondary }} className="text-sm">Teste não realizado</p>
                          </div>
                        );
                      }

                      const tipoData = ENEAGRAMA_TIPOS[corretor.tipo];
                      
                      // Dicas de gestão por tipo de Eneagrama
                      const gestaoEneagrama: Record<number, string> = {
                        1: 'Dê feedback construtivo com foco em soluções, não apenas problemas',
                        2: 'Reconheça contribuições e estabeleça limites claros de responsabilidade',
                        3: 'Defina metas desafiadoras e celebre conquistas tangíveis',
                        4: 'Valorize sua criatividade e ofereça projetos com significado',
                        5: 'Respeite sua necessidade de tempo para processar e analisar',
                        6: 'Forneça segurança, clareza e seja consistente nas decisões',
                        7: 'Ofereça variedade, evite microgerenciamento e mantenha o trabalho estimulante',
                        8: 'Seja direto, respeite sua autonomia e não tente controlá-lo',
                        9: 'Ajude a priorizar, dê estrutura e valorize suas contribuições para harmonia'
                      };
                      
                      return (
                        <div className="flex flex-col h-full">
                          <div className="space-y-3 flex-grow">
                            <div className="p-3 rounded-lg" style={{ backgroundColor: '#2563eb' }}>
                              <p style={{ color: '#ffffff' }} className="text-sm font-bold mb-1">Tipo Principal</p>
                              <p style={{ color: '#e0e7ff' }} className="text-lg font-bold">{tipoData?.nome || `Tipo ${corretor.tipo}`}</p>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="p-3 rounded-lg" style={{ backgroundColor: bgCard, border: `1px solid ${border}` }}>
                                <p style={{ color: textSecondary }} className="text-xs mb-1 font-semibold">Motivação Central:</p>
                                <p style={{ color: textPrimary }} className="text-xs leading-relaxed">
                                  {tipoData?.motivacaoCentral || 'Busca por realização pessoal'}
                                </p>
                              </div>
                              
                              <div className="p-3 rounded-lg" style={{ backgroundColor: bgCard, border: `1px solid ${border}` }}>
                                <p style={{ color: textSecondary }} className="text-xs mb-1 font-semibold">Medo Básico:</p>
                                <p style={{ color: textPrimary }} className="text-xs leading-relaxed">
                                  {tipoData?.medoBasico || 'Ser inadequado ou incompetente'}
                                </p>
                              </div>
                              
                              <div className="p-3 rounded-lg" style={{ backgroundColor: bgCard, border: `1px solid ${border}` }}>
                                <p style={{ color: textSecondary }} className="text-xs mb-1 font-semibold">Como Gerir:</p>
                                <p style={{ color: textPrimary }} className="text-xs leading-relaxed">
                                  {gestaoEneagrama[corretor.tipo] || 'Abordagem individualizada conforme necessidades'}
                                </p>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setCorretorResumo(null);
                              setTimeout(() => setCorretorSelecionado({ id: corretor.id, nome: corretor.nome, tipo: 'eneagrama' }), 100);
                            }}
                            className="w-full mt-4 py-2 rounded-lg font-semibold text-sm transition-all hover:shadow-md"
                            style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                          >
                            Ver Detalhes Completos
                          </button>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* MBTI */}
                <Card style={{ backgroundColor: bgCard, borderColor: '#60a5fa' }} className="border-2 hover:shadow-lg transition-all flex flex-col">
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center font-bold text-lg" style={{ backgroundColor: '#60a5fa', color: '#ffffff' }}>
                        M
                      </div>
                      <div>
                        <h3 style={{ color: textPrimary }} className="font-bold text-base">MBTI</h3>
                        <p style={{ color: textSecondary }} className="text-xs">Cognição</p>
                      </div>
                    </div>
                    
                    {(() => {
                      const corretor = mbtiStats?.corretoresPorTipo && 
                        Object.values(mbtiStats.corretoresPorTipo).flat().find((c: any) => c.id === corretorResumo.id);
                      
                      if (!corretor) {
                        return (
                          <div className="text-center py-8">
                            <p style={{ color: textSecondary }} className="text-sm">Teste não realizado</p>
                          </div>
                        );
                      }

                      // Dados resumidos por tipo MBTI
                      const mbtiDescricoes: Record<string, { nome: string; foco: string; comunicacao: string; gestao: string }> = {
                        'INTJ': { nome: 'Arquiteto', foco: 'Estratégia e visão de longo prazo', comunicacao: 'Direto e focado em eficiência', gestao: 'Autonomia com objetivos claros' },
                        'INTP': { nome: 'Lógico', foco: 'Análise e resolução de problemas', comunicacao: 'Conceitual e questionador', gestao: 'Liberdade para explorar ideias' },
                        'ENTJ': { nome: 'Comandante', foco: 'Liderança e execução', comunicacao: 'Assertivo e orientado a resultados', gestao: 'Desafios e metas ambiciosas' },
                        'ENTP': { nome: 'Inovador', foco: 'Criatividade e debate', comunicacao: 'Energético e persuasivo', gestao: 'Variedade e estímulo intelectual' },
                        'INFJ': { nome: 'Conselheiro', foco: 'Propósito e desenvolvimento humano', comunicacao: 'Empático e inspirador', gestao: 'Significado e impacto positivo' },
                        'INFP': { nome: 'Mediador', foco: 'Valores e autenticidade', comunicacao: 'Sensível e idealista', gestao: 'Alinhamento com valores pessoais' },
                        'ENFJ': { nome: 'Protagonista', foco: 'Inspirar e desenvolver pessoas', comunicacao: 'Caloroso e motivador', gestao: 'Reconhecimento e crescimento da equipe' },
                        'ENFP': { nome: 'Ativista', foco: 'Possibilidades e conexões', comunicacao: 'Entusiasta e criativo', gestao: 'Flexibilidade e novos projetos' },
                        'ISTJ': { nome: 'Logístico', foco: 'Organização e confiabilidade', comunicacao: 'Claro e factual', gestao: 'Processos estruturados e previsíveis' },
                        'ISFJ': { nome: 'Defensor', foco: 'Apoio e estabilidade', comunicacao: 'Atencioso e prático', gestao: 'Ambiente harmonioso e seguro' },
                        'ESTJ': { nome: 'Executivo', foco: 'Ordem e eficiência', comunicacao: 'Direto e tradicional', gestao: 'Regras claras e responsabilidade' },
                        'ESFJ': { nome: 'Cônsul', foco: 'Harmonia e cooperação', comunicacao: 'Sociável e prestativo', gestao: 'Trabalho em equipe e apreciação' },
                        'ISTP': { nome: 'Virtuoso', foco: 'Ação e solução prática', comunicacao: 'Conciso e objetivo', gestao: 'Liberdade operacional e desafios técnicos' },
                        'ISFP': { nome: 'Aventureiro', foco: 'Experiência e expressão', comunicacao: 'Gentil e flexível', gestao: 'Espaço criativo e baixa pressão' },
                        'ESTP': { nome: 'Empreendedor', foco: 'Oportunidades imediatas', comunicacao: 'Energético e pragmático', gestao: 'Ação rápida e resultados tangíveis' },
                        'ESFP': { nome: 'Animador', foco: 'Entusiasmo e engajamento', comunicacao: 'Espontâneo e positivo', gestao: 'Ambiente dinâmico e colaborativo' }
                      };
                      
                      const mbtiData = mbtiDescricoes[corretor.tipo] || { 
                        nome: corretor.tipo, 
                        foco: 'Características únicas', 
                        comunicacao: 'Estilo próprio de comunicação',
                        gestao: 'Abordagem individualizada'
                      };
                      
                      return (
                        <div className="flex flex-col h-full">
                          <div className="space-y-3 flex-grow">
                            <div className="p-3 rounded-lg" style={{ backgroundColor: '#60a5fa' }}>
                              <p style={{ color: '#ffffff' }} className="text-sm font-bold mb-1">Tipo MBTI</p>
                              <p style={{ color: '#ffffff' }} className="text-lg font-bold">{corretor.tipo}</p>
                              <p style={{ color: '#e0e7ff' }} className="text-xs mt-1">{mbtiData.nome}</p>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="p-3 rounded-lg" style={{ backgroundColor: bgCard, border: `1px solid ${border}` }}>
                                <p style={{ color: textSecondary }} className="text-xs mb-1 font-semibold">Foco Principal:</p>
                                <p style={{ color: textPrimary }} className="text-xs leading-relaxed">
                                  {mbtiData.foco}
                                </p>
                              </div>
                              
                              <div className="p-3 rounded-lg" style={{ backgroundColor: bgCard, border: `1px solid ${border}` }}>
                                <p style={{ color: textSecondary }} className="text-xs mb-1 font-semibold">Estilo de Comunicação:</p>
                                <p style={{ color: textPrimary }} className="text-xs leading-relaxed">
                                  {mbtiData.comunicacao}
                                </p>
                              </div>
                              
                              <div className="p-3 rounded-lg" style={{ backgroundColor: bgCard, border: `1px solid ${border}` }}>
                                <p style={{ color: textSecondary }} className="text-xs mb-1 font-semibold">Como Gerir:</p>
                                <p style={{ color: textPrimary }} className="text-xs leading-relaxed">
                                  {mbtiData.gestao}
                                </p>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              setCorretorResumo(null);
                              setTimeout(() => setCorretorSelecionado({ id: corretor.id, nome: corretor.nome, tipo: 'mbti' }), 100);
                            }}
                            className="w-full mt-4 py-2 rounded-lg font-semibold text-sm transition-all hover:shadow-md"
                            style={{ backgroundColor: '#60a5fa', color: '#ffffff' }}
                          >
                            Ver Detalhes Completos
                          </button>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modais Individuais */}
      {corretorSelecionado && corretorSelecionado.tipo === 'disc' && (
        <DISCCorretorIndividualModal
          isOpen={true}
          onClose={() => setCorretorSelecionado(null)}
          corretorId={corretorSelecionado.id}
          corretorNome={corretorSelecionado.nome}
        />
      )}
      {corretorSelecionado && corretorSelecionado.tipo === 'eneagrama' && (
        <EneagramaCorretorIndividualModal
          isOpen={true}
          onClose={() => setCorretorSelecionado(null)}
          corretorId={corretorSelecionado.id}
          corretorNome={corretorSelecionado.nome}
        />
      )}
      {corretorSelecionado && corretorSelecionado.tipo === 'mbti' && (
        <MBTICorretorIndividualModal
          isOpen={true}
          onClose={() => setCorretorSelecionado(null)}
          corretorId={corretorSelecionado.id}
          corretorNome={corretorSelecionado.nome}
        />
      )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

