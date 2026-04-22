/**
 * Card de Métricas Expandido do Corretor
 * Exibe todas as métricas individuais de um corretor
 */

import { memo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  ShoppingCart,
  DollarSign,
  Briefcase,
  Target,
  Users,
  Eye,
  CheckCircle,
  ArrowRight,
  FileText,
  Star,
  GraduationCap,
  TrendingUp,
  ChevronDown,
  Clock,
  Zap
} from 'lucide-react';
import type { CorretorMetricasCompletas } from '@/types/metricsTypes';
import { formatarMoeda, getRankingBadgeColor, getRankingLabel, chartColors } from '@/data/metricsData';
import { Skeleton } from '@/components/ui/skeleton';

interface CorretorMetricCardProps {
  corretor: CorretorMetricasCompletas;
  isLoading?: boolean;
}

// Skeleton do Card
const CardSkeleton = () => (
  <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
    <CardContent className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-24" />
      <Skeleton className="h-32" />
    </CardContent>
  </Card>
);

export const CorretorMetricCard = memo(({ corretor, isLoading = false }: CorretorMetricCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isLoading) {
    return <CardSkeleton />;
  }

  const { nome, ranking, kpis, funil, portfolio, leadsPorFonte, evolucaoLeads, participacaoTreinamentos } = corretor;

  // Iniciais para o avatar
  const initials = nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Card className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300">
      <CardContent className="p-5 space-y-5">
        {/* HEADER: Avatar, Nome e Ranking */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 border-2 border-gray-200 dark:border-gray-700">
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white leading-tight">
                {nome}
              </h3>
              <Badge className={`mt-1 text-[10px] font-medium px-2 py-0.5 ${getRankingBadgeColor(ranking)}`}>
                {getRankingLabel(ranking)}
              </Badge>
            </div>
          </div>
        </div>

        {/* SUB-SEÇÃO 1: KPIs Principais (Grid 2x2) */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Vendas Feitas */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-1.5">
              <ShoppingCart className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">Vendas</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{kpis.vendasFeitas}</p>
          </div>

          {/* Comissão Total */}
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
            <div className="flex items-center gap-2 mb-1.5">
              <DollarSign className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              <span className="text-[10px] font-medium text-green-600 dark:text-green-400">Comissão</span>
            </div>
            <p className="text-base font-bold text-gray-900 dark:text-white">
              {formatarMoeda(kpis.comissaoTotal)}
            </p>
          </div>

          {/* Gestão Ativa */}
          <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-100 dark:border-orange-800">
            <div className="flex items-center gap-2 mb-1.5">
              <Briefcase className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
              <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400">Imóveis Gestão</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{kpis.gestaoAtiva}</p>
          </div>

          {/* % Atingimento Meta */}
          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
            <div className="flex items-center gap-2 mb-1.5">
              <Target className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400">Meta Anual</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{kpis.percentualAtingimentoMeta}%</p>
            <Progress value={kpis.percentualAtingimentoMeta} className="h-1 mt-1.5" />
          </div>
        </div>

        {/* Conteúdo Expandido */}
        {isExpanded && (
          <>
            {/* SUB-SEÇÃO 2: Funil de Vendas */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Funil de Vendas
          </p>
          <div className="flex items-center justify-between gap-2">
            {/* Leads Recebidos */}
            <div className="flex-1 text-center">
              <div className="w-8 h-8 mx-auto mb-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">{funil.leadsRecebidos}</p>
              <p className="text-[9px] text-gray-500 dark:text-gray-400">Leads</p>
            </div>

            <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />

            {/* Visitas Realizadas */}
            <div className="flex-1 text-center">
              <div className="w-8 h-8 mx-auto mb-1.5 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                <Eye className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">{funil.visitasRealizadas}</p>
              <p className="text-[9px] text-gray-500 dark:text-gray-400">Visitas</p>
              <p className="text-[8px] text-yellow-600 dark:text-yellow-400">{funil.taxaConversaoVisitas}%</p>
            </div>

            <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />

            {/* Vendas Realizadas */}
            <div className="flex-1 text-center">
              <div className="w-8 h-8 mx-auto mb-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">{funil.vendasRealizadas}</p>
              <p className="text-[9px] text-gray-500 dark:text-gray-400">Vendas</p>
              <p className="text-[8px] text-green-600 dark:text-green-400">{funil.taxaConversaoVendas}%</p>
            </div>
          </div>
        </div>

        {/* SUB-SEÇÃO 3: Portfólio de Imóveis */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-1.5">
              <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Fichas Ativas</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{portfolio.imoveisFicha}</p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-1.5">
              <Star className="h-3.5 w-3.5 text-yellow-500 dark:text-yellow-400" />
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Exclusivos</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{portfolio.imoveisExclusivos}</p>
          </div>
        </div>

        {/* SUB-SEÇÃO 4: Leads por Fonte e Evolução - GRADIENTE AZUL MARINHO */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Leads por Fonte */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-3.5 w-3.5" style={{ color: '#234992' }} />
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Leads por Fonte</span>
            </div>
            {/* Número principal com gradiente azul marinho */}
            <p 
              className="text-3xl font-bold text-center my-2"
              style={{
                background: 'linear-gradient(135deg, #324F74 0%, #234992 50%, #598DC6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              {leadsPorFonte.reduce((acc, item) => acc + item.quantidade, 0)}
            </p>
            {/* Mini barras de fonte - gradiente azul marinho */}
            <div className="flex items-center justify-center gap-1 mt-2">
              {leadsPorFonte.slice(0, 5).map((item, index) => {
                const maxValue = Math.max(...leadsPorFonte.map(f => f.quantidade));
                const heightPct = Math.max(20, (item.quantidade / maxValue) * 100);
                // Gradiente azul marinho: maior(escuro) → menor(claro)
                const colors = ['#324F74', '#234992', '#598DC6', '#88C0E5', '#598DC6'];
                return (
                  <div 
                    key={item.fonte}
                    className="w-3 rounded-sm transition-all hover:opacity-80"
                    style={{ 
                      height: `${heightPct * 0.3}px`,
                      minHeight: '6px',
                      backgroundColor: colors[index % colors.length]
                    }}
                    title={`${item.fonte}: ${item.quantidade}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Evolução Leads */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-3.5 w-3.5" style={{ color: '#234992' }} />
              <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Evolução Leads</span>
            </div>
            {/* Número principal com gradiente azul marinho + tendência */}
            <div className="flex items-center justify-center gap-2 my-2">
              <p 
                className="text-3xl font-bold"
                style={{
                  background: 'linear-gradient(135deg, #324F74 0%, #234992 50%, #598DC6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}
              >
                {evolucaoLeads.length > 0 ? evolucaoLeads[evolucaoLeads.length - 1].quantidade : 0}
              </p>
              {evolucaoLeads.length >= 2 && (() => {
                const atual = evolucaoLeads[evolucaoLeads.length - 1]?.quantidade || 0;
                const anterior = evolucaoLeads[evolucaoLeads.length - 2]?.quantidade || 0;
                const diff = atual - anterior;
                const isPositive = diff >= 0;
                return (
                  <span className={`text-sm font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                    {isPositive ? '↑' : '↓'}{Math.abs(diff)}
                  </span>
                );
              })()}
            </div>
            {/* Mini barras de evolução - gradiente azul marinho */}
            <div className="flex items-end justify-center gap-1 mt-2 h-8">
              {evolucaoLeads.map((item, index) => {
                const maxValue = Math.max(...evolucaoLeads.map(e => e.quantidade));
                const heightPct = Math.max(20, (item.quantidade / maxValue) * 100);
                // Gradiente azul marinho baseado na posição
                const colors = ['#88C0E5', '#598DC6', '#234992', '#324F74'];
                return (
                  <div 
                    key={item.mes}
                    className="w-4 rounded-t transition-all hover:opacity-80"
                    style={{ 
                      height: `${heightPct}%`,
                      backgroundColor: colors[index % colors.length]
                    }}
                    title={`${item.mes}: ${item.quantidade}`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Tempo Médio de Resposta - Destaque especial */}
        <div className="p-3 bg-gradient-to-r from-cyan-50 to-sky-50 dark:from-cyan-900/20 dark:to-sky-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/40 rounded-lg flex items-center justify-center">
                <Clock className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Tempo Médio de Resposta</p>
                <div className="flex items-center gap-2">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {kpis.tempoMedioResposta}<span className="text-xs font-normal text-gray-500 ml-0.5">min</span>
                  </p>
                  {kpis.tempoMedioResposta <= 10 && (
                    <span className="flex items-center gap-1 text-[9px] font-semibold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full">
                      <Zap className="h-2.5 w-2.5" />
                      Excelente
                    </span>
                  )}
                  {kpis.tempoMedioResposta > 10 && kpis.tempoMedioResposta <= 15 && (
                    <span className="flex items-center gap-1 text-[9px] font-semibold text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded-full">
                      Bom
                    </span>
                  )}
                  {kpis.tempoMedioResposta > 15 && (
                    <span className="flex items-center gap-1 text-[9px] font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">
                      Atenção
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Mini indicador visual */}
            <div className="w-12 h-12 relative">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="transparent"
                  className="text-gray-200 dark:text-gray-700"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="transparent"
                  strokeDasharray={`${Math.max(0, 100 - (kpis.tempoMedioResposta / 30) * 100) * 1.256} 126`}
                  className={kpis.tempoMedioResposta <= 10 ? 'text-green-500' : kpis.tempoMedioResposta <= 15 ? 'text-yellow-500' : 'text-red-500'}
                />
              </svg>
            </div>
          </div>
        </div>

        {/* SUB-SEÇÃO 5: Engajamento */}
        <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center">
                <GraduationCap className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400">Participação em Treinamentos</p>
                <p className="text-lg font-bold text-green-700 dark:text-green-400">{participacaoTreinamentos}%</p>
              </div>
            </div>
            <div className="w-12 h-12 relative">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="transparent"
                  className="text-gray-200 dark:text-gray-700"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="transparent"
                  strokeDasharray={`${participacaoTreinamentos * 1.256} 126`}
                  className="text-green-500 dark:text-green-400"
                />
              </svg>
            </div>
          </div>
        </div>
          </>
        )}

        {/* Seta para expandir/colapsar - sempre no final do card */}
        <div className="flex justify-center pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
            aria-label={isExpanded ? "Colapsar" : "Expandir"}
          >
            <ChevronDown 
              className={`h-5 w-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </CardContent>
    </Card>
  );
});

CorretorMetricCard.displayName = 'CorretorMetricCard';
