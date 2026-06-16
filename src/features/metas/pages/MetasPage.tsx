/**
 * Página principal da aba "Metas".
 * Orquestra dados (hooks) + domínio (views/summary/filtros) + UI.
 * Não contém regra de cálculo — apenas composição.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Target, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import {
  buildGoalViews,
  filterGoals,
  summarizeGoals,
  EMPTY_GOAL_FILTERS,
  type GoalFilters,
  type GoalView,
} from '../domain/metrics';
import { goalToDraft } from '../domain/factory';
import type { GoalDraft } from '../domain/types';
import { useGoals, useGoalMutations } from '../hooks/useGoals';
import { GoalsSummaryCards } from '../components/GoalsSummaryCards';
import { GoalsFilters } from '../components/GoalsFilters';
import { GoalCard } from '../components/GoalCard';
import { GoalFormDialog } from '../components/GoalFormDialog';
import { GoalHistoryDialog } from '../components/GoalHistoryDialog';

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export const MetasPage = () => {
  const today = useMemo(getToday, []);
  const { goals, isLoading, isError, canManage } = useGoals();
  const { create, update, remove, feature, sync } = useGoalMutations();
  const hasAutoSyncedRef = useRef(false);

  const [filters, setFilters] = useState<GoalFilters>(EMPTY_GOAL_FILTERS);
  const [formOpen, setFormOpen] = useState(false);
  const [editingView, setEditingView] = useState<GoalView | null>(null);
  const [historyView, setHistoryView] = useState<GoalView | null>(null);
  const [deletingView, setDeletingView] = useState<GoalView | null>(null);

  const views = useMemo(() => buildGoalViews(goals, today), [goals, today]);
  const summary = useMemo(() => summarizeGoals(views), [views]);
  const filteredViews = useMemo(() => filterGoals(views, filters), [views, filters]);

  const updateFilters = (patch: Partial<GoalFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));

  // Sincroniza metas automáticas (source = 'crm') uma vez ao abrir a página.
  useEffect(() => {
    if (!canManage || isLoading || goals.length === 0 || hasAutoSyncedRef.current) return;
    hasAutoSyncedRef.current = true;
    sync.mutate(goals);
    // `sync` é estável (mutation do React Query); rodamos apenas uma vez por montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, isLoading, goals]);

  const openCreate = () => {
    setEditingView(null);
    setFormOpen(true);
  };

  const openEdit = (view: GoalView) => {
    setEditingView(view);
    setFormOpen(true);
  };

  const handleSubmit = async (draft: GoalDraft) => {
    try {
      if (editingView) {
        await update.mutateAsync({ id: editingView.goal.id, previous: editingView.goal, draft });
        toast.success('Meta atualizada.');
      } else {
        await create.mutateAsync(draft);
        toast.success('Meta criada.');
      }
      setFormOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar a meta.');
    }
  };

  const handleToggleStatus = async (view: GoalView) => {
    const nextStatus = view.goal.status === 'active' ? 'inactive' : 'active';
    const draft: GoalDraft = { ...goalToDraft(view.goal), status: nextStatus };
    try {
      await update.mutateAsync({ id: view.goal.id, previous: view.goal, draft });
      toast.success(nextStatus === 'active' ? 'Meta ativada.' : 'Meta desativada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao alterar o status.');
    }
  };

  const handleToggleFeatured = async (view: GoalView) => {
    try {
      await feature.mutateAsync({ goalId: view.goal.id, featured: !view.goal.isFeatured });
      toast.success(view.goal.isFeatured ? 'Destaque removido.' : 'Meta destacada na tela inicial.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar o destaque.');
    }
  };

  const handleSync = async () => {
    try {
      const result = await sync.mutateAsync(goals);
      toast.success(
        result.updated > 0
          ? `${result.updated} meta(s) sincronizada(s) com o CRM.`
          : 'Metas já estão atualizadas.',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao sincronizar.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingView) return;
    try {
      await remove.mutateAsync(deletingView.goal.id);
      toast.success('Meta excluída.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir a meta.');
    } finally {
      setDeletingView(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <OctoDashLoader message="Carregando metas..." size="md" />
      </div>
    );
  }

  return (
    <div className="w-full h-full p-6 space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Target className="w-5 h-5" /> Metas
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie e acompanhe as metas comerciais da operação.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSync} disabled={sync.isPending}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${sync.isPending ? 'animate-spin' : ''}`} />
              Sincronizar
            </Button>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" /> Nova meta
            </Button>
          </div>
        )}
      </div>

      {!canManage && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Selecione uma imobiliária para gerenciar metas.
        </p>
      )}

      {isError && (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          Não foi possível carregar as metas. Tente novamente.
        </p>
      )}

      {/* Dashboard */}
      <GoalsSummaryCards summary={summary} />

      {/* Filtros */}
      <GoalsFilters filters={filters} onChange={updateFilters} />

      {/* Listagem */}
      {filteredViews.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Target className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {views.length === 0 ? 'Nenhuma meta cadastrada ainda.' : 'Nenhuma meta corresponde aos filtros.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredViews.map((view) => (
            <GoalCard
              key={view.goal.id}
              view={view}
              canManage={canManage}
              onEdit={openEdit}
              onToggleStatus={handleToggleStatus}
              onToggleFeatured={handleToggleFeatured}
              onDelete={setDeletingView}
              onViewHistory={setHistoryView}
            />
          ))}
        </div>
      )}

      {/* Diálogos */}
      <GoalFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        goal={editingView?.goal ?? null}
        today={today}
        isSubmitting={create.isPending || update.isPending}
        onSubmit={handleSubmit}
      />

      <GoalHistoryDialog
        view={historyView}
        open={!!historyView}
        onOpenChange={(open) => !open && setHistoryView(null)}
      />

      <AlertDialog open={!!deletingView} onOpenChange={(open) => !open && setDeletingView(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir meta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deletingView?.goal.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={remove.isPending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {remove.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
