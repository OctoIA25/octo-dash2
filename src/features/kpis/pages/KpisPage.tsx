/**
 * KpisPage — aba "KPIs" da tela Início (/leads?tab=kpis).
 *
 * Composição pura: consome `useKpis` e distribui os DTOs para os componentes
 * de apresentação. Nenhuma regra de cálculo aqui — tudo vem do serviço.
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useKpis } from '../hooks/useKpis';
import { monthPeriod, previousMonthPeriod } from '../period';
import type { KpiPeriod } from '../types';
import { computeCanManageKpis } from '../admin/hooks/useKpiAdmin';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  KpiCommercialCharts,
  KpiFunnelCard,
  KpiGoalsCard,
  KpiPriceRangesCard,
  KpiSourcesCard,
} from '../components/KpiComponents';
import { groupCardsByCategory } from '../groupCardsByCategory';
import { CATEGORY_ORDER, CATEGORY_META } from '../components/kpiCategoryConfig';
import { KpiCategorySection } from '../components/KpiCategorySection';

/** Próximo mês a partir de um período (sem ultrapassar o mês atual). */
function nextMonthPeriod(period: KpiPeriod): KpiPeriod {
  const [y, m] = period.startDate.split('-').map(Number);
  const ref = new Date(y, m - 1, 1);
  ref.setMonth(ref.getMonth() + 1);
  return monthPeriod(ref);
}

function isCurrentMonth(period: KpiPeriod): boolean {
  return period.startDate === monthPeriod().startDate;
}

export function KpisPage() {
  const [period, setPeriod] = useState<KpiPeriod>(() => monthPeriod());
  const { data, isLoading, isError, refetch, tenantReady } = useKpis({ period });
  const { isGestao, isOwner } = useAuthContext();
  const navigate = useNavigate();
  const canManageKpis = computeCanManageKpis({ isGestao, isOwner });

  const cards = useMemo(() => data?.cards ?? [], [data?.cards]);
  const funnel = data?.funnel;
  const sources = data?.sources ?? [];
  const priceRanges = data?.priceRanges ?? [];
  const commercial = data?.commercial ?? [];
  const goals = data?.goals ?? [];

  const atCurrentMonth = useMemo(() => isCurrentMonth(period), [period]);
  const grouped = useMemo(() => groupCardsByCategory(cards, CATEGORY_ORDER), [cards]);

  const comercialExtra = <KpiCommercialCharts commercial={commercial} />;
  const operacaoExtra = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <KpiSourcesCard sources={sources} />
      <KpiPriceRangesCard ranges={priceRanges} />
    </div>
  );
  const equipeExtra = <KpiGoalsCard goals={goals} />;
  const funilExtra = funnel ? <KpiFunnelCard funnel={funnel} /> : null;

  if (!tenantReady) {
    return (
      <div className="px-6 py-10 text-center text-[13px] text-slate-400">
        Selecione uma imobiliária para ver os KPIs.
      </div>
    );
  }

  return (
    <div className="px-6 py-5">
      <div className="max-w-[1400px] mx-auto">
        {/* Cabeçalho + navegação de período */}
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <div>
            <h1 className="text-[22px] font-bold text-slate-900 dark:text-slate-100 leading-tight tracking-tight">
              KPIs
            </h1>
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
              Indicadores do período selecionado, com comparação ao mês anterior.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPeriod(previousMonthPeriod(period))}
              className="w-9 h-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={2} />
            </button>
            <span className="min-w-[120px] text-center text-[13px] font-semibold text-slate-900 dark:text-slate-100">
              {period.label}
            </span>
            <button
              type="button"
              onClick={() => setPeriod(nextMonthPeriod(period))}
              disabled={atCurrentMonth}
              className="w-9 h-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Próximo mês"
            >
              <ChevronRight className="w-4 h-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              className="h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} /> Atualizar
            </button>
            {canManageKpis && (
              <button
                type="button"
                onClick={() => navigate('/kpis-admin')}
                className="h-9 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" strokeWidth={2} /> Gerenciar KPIs
              </button>
            )}
          </div>
        </div>

        {isError && (
          <div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-[12.5px] text-rose-700 dark:text-rose-300">
            Não foi possível carregar os KPIs. Tente atualizar.
          </div>
        )}

        {/* Índice de categorias (navegação rápida) */}
        <nav className="flex items-center gap-2 overflow-x-auto pb-1 mb-5 -mx-1 px-1">
          {CATEGORY_ORDER.filter((id) => (grouped[id]?.length ?? 0) > 0).map((id) => {
            const meta = CATEGORY_META[id];
            const Icon = meta.icon;
            return (
              <a
                key={id}
                href={`#kpi-cat-${id}`}
                className="inline-flex items-center gap-1.5 shrink-0 h-8 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Icon className={`w-3.5 h-3.5 ${meta.color.headerIcon}`} strokeWidth={2.25} /> {meta.title}
              </a>
            );
          })}
        </nav>

        {isLoading && cards.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-slate-400">Carregando indicadores…</div>
        ) : (
          <>
            <KpiCategorySection
              category="comercial" {...CATEGORY_META.comercial}
              cards={grouped.comercial ?? []}
              extra={<div className="space-y-4">{funilExtra}{comercialExtra}</div>}
            />
            <KpiCategorySection
              category="marketing" {...CATEGORY_META.marketing}
              cards={grouped.marketing ?? []}
            />
            <KpiCategorySection
              category="operacao" {...CATEGORY_META.operacao}
              cards={grouped.operacao ?? []}
              extra={operacaoExtra}
            />
            <KpiCategorySection
              category="equipe" {...CATEGORY_META.equipe}
              cards={grouped.equipe ?? []}
              extra={equipeExtra}
            />
            <KpiCategorySection
              category="geral" {...CATEGORY_META.geral}
              cards={grouped.geral ?? []}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default KpisPage;
