/**
 * Aba "Meta" das Métricas Individuais: visão de ACOMPANHAMENTO (somente-leitura)
 * das Metas Individuais ativas do tenant.
 *
 * Sem filtro por dono — toda meta individual ativa aparece para todos os
 * corretores. A gestão (criar/editar/ativar/destacar/excluir) continua exclusiva
 * da página `/metas`.
 *
 * Reaproveita a feature Metas de ponta a ponta: hook de dados (`useGoals`),
 * derivações de domínio (`buildGoalViews`/`summarizeGoals`/`selectActiveIndividualGoals`)
 * e os componentes de UI (`GoalsSummaryCards`, `GoalCard`).
 */

import { useMemo, useState } from 'react';
import { Maximize2, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import {
  buildGoalViews,
  selectActiveIndividualGoals,
  summarizeGoals,
  type GoalView,
} from '../domain/metrics';
import { useGoals } from '../hooks/useGoals';
import { GoalsSummaryCards } from './GoalsSummaryCards';
import { GoalCard } from './GoalCard';

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Cartão em modo leitura: `canManage={false}` oculta o menu de ações. */
function ReadOnlyGoalCard({
  view,
  variant = 'default',
}: {
  view: GoalView;
  variant?: 'default' | 'expanded';
}) {
  const noop = () => {};
  return (
    <GoalCard
      view={view}
      canManage={false}
      variant={variant}
      onEdit={noop}
      onToggleStatus={noop}
      onToggleFeatured={noop}
      onDelete={noop}
      onViewHistory={noop}
    />
  );
}

/** Cabeçalho da aba, com contagem de metas ativas. */
function PanelHeader({ activeCount }: { activeCount: number }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shrink-0">
          <Target className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            Metas Individuais
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Acompanhe as metas individuais ativas da operação.
          </p>
        </div>
      </div>
      <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-3 py-1 text-sm font-semibold tabular-nums">
        {activeCount} {activeCount === 1 ? 'meta ativa' : 'metas ativas'}
      </span>
    </div>
  );
}

export function IndividualGoalsPanel() {
  const today = useMemo(getToday, []);
  const { goals, isLoading, isError } = useGoals();

  // Meta atualmente ampliada (destaque). `null` => usa a primeira da lista.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const activeIndividualViews = useMemo(
    () => selectActiveIndividualGoals(buildGoalViews(goals, today)),
    [goals, today],
  );
  const summary = useMemo(() => summarizeGoals(activeIndividualViews), [activeIndividualViews]);

  // A primeira fica sempre ampliada por padrão; o usuário pode promover outra.
  // Se a meta ampliada some (ex.: desativada), volta para a primeira.
  const expandedView =
    activeIndividualViews.find((v) => v.goal.id === expandedId) ?? activeIndividualViews[0] ?? null;
  const otherViews = activeIndividualViews.filter((v) => v.goal.id !== expandedView?.goal.id);

  if (isLoading) {
    return (
      <section className="mt-6" aria-label="Metas individuais ativas">
        <div className="rounded-2xl border bg-white dark:bg-slate-900 py-16 flex justify-center">
          <OctoDashLoader message="Carregando metas..." size="md" />
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="mt-6" aria-label="Metas individuais ativas">
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-950/20 p-8 text-center">
          <p className="text-sm text-rose-600 dark:text-rose-400">
            Não foi possível carregar as metas. Tente novamente.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6 space-y-6" aria-label="Metas individuais ativas">
      <PanelHeader activeCount={activeIndividualViews.length} />

      {activeIndividualViews.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-16 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800">
            <Target className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-base font-medium text-gray-700 dark:text-slate-200">
            Nenhuma meta individual ativa.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Quando uma meta individual for criada e ativada, ela aparecerá aqui automaticamente.
          </p>
        </div>
      ) : (
        <>
          {/* Faixa de indicadores (reaproveitada da feature Metas) */}
          <GoalsSummaryCards summary={summary} />

          {/* Meta em destaque (ampliada) */}
          {expandedView && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                Meta em destaque
              </h3>
              <ReadOnlyGoalCard view={expandedView} variant="expanded" />
            </div>
          )}

          {/* Demais metas — cada uma pode ser ampliada (vira o destaque) */}
          {otherViews.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                Outras metas
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {otherViews.map((view) => (
                  <div key={view.goal.id} className="relative">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="absolute top-3 right-3 z-10 h-8 gap-1.5 shadow-sm"
                      onClick={() => setExpandedId(view.goal.id)}
                      aria-label={`Ampliar meta ${view.goal.name}`}
                    >
                      <Maximize2 className="w-3.5 h-3.5" /> Ampliar
                    </Button>
                    <ReadOnlyGoalCard view={view} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
