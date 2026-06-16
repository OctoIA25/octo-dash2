/**
 * Hooks de dados das Metas (TanStack Query).
 * Isolam a UI dos detalhes de fetch/cache/invalidations.
 */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/contexts/AuthContext';
import type { Goal, GoalDraft } from '../domain/types';
import { buildGoalView, type GoalView } from '../domain/metrics';
import {
  createGoal,
  deleteGoal,
  fetchFeaturedGoal,
  fetchGoalHistory,
  fetchGoals,
  setFeaturedGoal,
  unsetFeaturedGoal,
  updateGoal,
} from '../services/goalsService';
import { syncGoalsFromCrm } from '../services/goalsSyncService';

const goalsKey = (tenantId?: string) => ['goals', tenantId] as const;
const goalHistoryKey = (goalId: string) => ['goal-history', goalId] as const;
const featuredGoalKey = (tenantId?: string) => ['featured-goal', tenantId] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** True quando há um tenant real selecionado (owner sem tenant não escreve). */
function useTenantContext() {
  const { tenantId, user } = useAuthContext();
  const hasTenant = !!tenantId && tenantId !== 'owner';
  return { tenantId, hasTenant, actorName: user?.name ?? '' };
}

export function useGoals() {
  const { tenantId, hasTenant } = useTenantContext();

  const query = useQuery({
    queryKey: goalsKey(tenantId),
    queryFn: () => fetchGoals(tenantId as string),
    enabled: hasTenant,
  });

  return {
    goals: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    canManage: hasTenant,
  };
}

export function useGoalMutations() {
  const queryClient = useQueryClient();
  const { tenantId, actorName } = useTenantContext();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: goalsKey(tenantId) });
    queryClient.invalidateQueries({ queryKey: featuredGoalKey(tenantId) });
  };
  const actorContext = useMemo(
    () => ({ tenantId: tenantId as string, actorName }),
    [tenantId, actorName],
  );

  const create = useMutation({
    mutationFn: (draft: GoalDraft) => createGoal(draft, actorContext),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, previous, draft }: { id: string; previous: Goal; draft: GoalDraft }) =>
      updateGoal(id, previous, draft, actorContext),
    onSuccess: (updated) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: goalHistoryKey(updated.id) });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteGoal(id, tenantId as string),
    onSuccess: invalidate,
  });

  const feature = useMutation({
    mutationFn: ({ goalId, featured }: { goalId: string; featured: boolean }) =>
      featured
        ? setFeaturedGoal(tenantId as string, goalId)
        : unsetFeaturedGoal(tenantId as string, goalId),
    onSuccess: invalidate,
  });

  const sync = useMutation({
    mutationFn: (goals: Goal[]) => syncGoalsFromCrm(goals, actorContext),
    onSuccess: (result) => {
      if (result.updated > 0) invalidate();
    },
  });

  return { create, update, remove, feature, sync };
}

export function useGoalHistory(goalId: string | null) {
  return useQuery({
    queryKey: goalHistoryKey(goalId ?? ''),
    queryFn: () => fetchGoalHistory(goalId as string),
    enabled: !!goalId,
  });
}

/** Meta destacada do tenant, já com progresso/status calculados. */
export function useFeaturedGoal() {
  const { tenantId, hasTenant } = useTenantContext();
  const referenceDate = useMemo(today, []);

  const query = useQuery({
    queryKey: featuredGoalKey(tenantId),
    queryFn: () => fetchFeaturedGoal(tenantId as string),
    enabled: hasTenant,
  });

  const view: GoalView | null = query.data ? buildGoalView(query.data, referenceDate) : null;

  return { view, isLoading: query.isLoading };
}
