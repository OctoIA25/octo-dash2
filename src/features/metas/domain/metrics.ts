/**
 * Derivações e agregações de domínio (puras).
 *
 * - `buildGoalView`: monta a visão completa de uma meta (progresso +
 *   status derivado + categoria resolvida). A UI consome isto e nunca
 *   recalcula nada — evitando lógica duplicada/espalhada.
 * - `summarizeGoals`: métricas do dashboard.
 * - `filterGoals`: filtragem declarativa.
 */

import type { GoalCategoryDefinition } from './categories';
import { resolveCategory } from './categories';
import { computeGoalProgress, type GoalProgress } from './models';
import type { Goal, GoalModel, GoalProgressStatus } from './types';

export interface GoalView {
  goal: Goal;
  progress: GoalProgress;
  status: GoalProgressStatus;
  category: GoalCategoryDefinition;
}

/**
 * Deriva o status de progresso. `today` é injetável para testabilidade.
 * Regra: inativa > concluída > atrasada > em andamento.
 */
export function deriveProgressStatus(
  goal: Goal,
  progress: GoalProgress,
  today: string,
): GoalProgressStatus {
  if (goal.status === 'inactive') return 'inactive';
  if (progress.percent >= 100) return 'completed';
  if (goal.endDate && today > goal.endDate) return 'late';
  return 'on_track';
}

export function buildGoalView(goal: Goal, today: string): GoalView {
  const progress = computeGoalProgress(goal);
  return {
    goal,
    progress,
    status: deriveProgressStatus(goal, progress, today),
    category: resolveCategory(goal.categoryId),
  };
}

export function buildGoalViews(goals: Goal[], today: string): GoalView[] {
  return goals.map((goal) => buildGoalView(goal, today));
}

export interface GoalsSummary {
  total: number;
  completed: number;
  onTrack: number;
  late: number;
  inactive: number;
  /** Média do atingimento (%) entre as metas ativas. 0 se não houver. */
  averageAttainment: number;
}

export function summarizeGoals(views: GoalView[]): GoalsSummary {
  const summary: GoalsSummary = {
    total: views.length,
    completed: 0,
    onTrack: 0,
    late: 0,
    inactive: 0,
    averageAttainment: 0,
  };

  let attainmentSum = 0;
  let activeCount = 0;

  for (const view of views) {
    switch (view.status) {
      case 'completed':
        summary.completed += 1;
        break;
      case 'on_track':
        summary.onTrack += 1;
        break;
      case 'late':
        summary.late += 1;
        break;
      case 'inactive':
        summary.inactive += 1;
        break;
    }

    if (view.status !== 'inactive') {
      attainmentSum += view.progress.percent;
      activeCount += 1;
    }
  }

  summary.averageAttainment = activeCount > 0 ? Math.round(attainmentSum / activeCount) : 0;

  return summary;
}

export interface GoalFilters {
  search: string;
  categoryId: string | 'all';
  model: GoalModel | 'all';
  status: GoalProgressStatus | 'all';
}

export const EMPTY_GOAL_FILTERS: GoalFilters = {
  search: '',
  categoryId: 'all',
  model: 'all',
  status: 'all',
};

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterGoals(views: GoalView[], filters: GoalFilters): GoalView[] {
  const query = normalize(filters.search);

  return views.filter(({ goal, status }) => {
    if (filters.categoryId !== 'all' && goal.categoryId !== filters.categoryId) return false;
    if (filters.model !== 'all' && goal.model !== filters.model) return false;
    if (filters.status !== 'all' && status !== filters.status) return false;
    if (query) {
      const haystack = normalize(`${goal.name} ${goal.description} ${goal.ownerName}`);
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/**
 * Metas individuais ativas — visão de acompanhamento (somente-leitura) exibida
 * aos corretores. Usa o `status` PERSISTIDO (ativar/desativar), não o status de
 * progresso derivado: uma meta atrasada/concluída ainda é "ativa" e deve aparecer;
 * só metas desativadas (`status === 'inactive'`) ficam de fora.
 */
export function selectActiveIndividualGoals(views: GoalView[]): GoalView[] {
  return views.filter(
    ({ goal }) => goal.scope === 'individual' && goal.status === 'active',
  );
}
