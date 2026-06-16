/**
 * Sincronização do valor realizado das metas automáticas (source = 'crm').
 *
 * Para cada meta automática, busca a fonte de métrica da sua categoria,
 * calcula o valor realizado no período da meta e persiste se houver mudança.
 * Metas manuais e categorias sem fonte são ignoradas — sem condicionais por
 * categoria (tudo resolvido pelo registry de fontes).
 */

import type { Goal } from '../domain/types';
import { getMetricSource } from './metricSources';
import { updateGoalCurrentValue } from './goalsService';

interface SyncContext {
  tenantId: string;
  actorName: string;
}

export interface GoalsSyncResult {
  updated: number;
  failed: number;
}

/** Indica se uma meta é elegível para sincronização automática. */
export function isAutoSyncGoal(goal: Goal): boolean {
  return goal.source === 'crm' && !!getMetricSource(goal.categoryId);
}

/**
 * Sincroniza as metas automáticas. Falhas individuais não interrompem as
 * demais (best-effort). Retorna a contagem de atualizações aplicadas.
 */
export async function syncGoalsFromCrm(goals: Goal[], context: SyncContext): Promise<GoalsSyncResult> {
  const targets = goals.filter(isAutoSyncGoal);
  let updated = 0;
  let failed = 0;

  for (const goal of targets) {
    const source = getMetricSource(goal.categoryId);
    if (!source) continue;

    try {
      const value = await source.compute(context.tenantId, goal.startDate, goal.endDate);
      if (value !== goal.currentValue) {
        await updateGoalCurrentValue(goal.id, value, context);
        updated += 1;
      }
    } catch (error) {
      failed += 1;
      console.warn(`[goalsSync] Falha ao sincronizar meta ${goal.id}:`, error);
    }
  }

  return { updated, failed };
}
