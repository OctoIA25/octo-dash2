/**
 * Fábricas para criação de rascunhos e itens de config.
 * Mantém os valores-padrão num único lugar.
 */

import { GOAL_CATEGORIES, resolveCategory } from './categories';
import { getModelStrategy } from './models';
import type { Goal, GoalDraft, GoalLevel, GoalMilestone, GoalModel } from './types';

/** Extrai os campos editáveis de uma meta existente. */
export function goalToDraft(goal: Goal): GoalDraft {
  const { id, tenantId, isFeatured, createdAt, updatedAt, ...draft } = goal;
  return draft;
}

function uid(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.round(performance.now())}-${performance.now()}`;
}

/** Cria um rascunho vazio, coerente com o modelo escolhido. */
export function createEmptyDraft(today: string, model: GoalModel = 'simple'): GoalDraft {
  const defaultCategory = GOAL_CATEGORIES[0];
  return {
    name: '',
    categoryId: defaultCategory.id,
    model,
    description: '',
    status: 'active',
    startDate: today,
    endDate: today,
    ownerName: '',
    targetValue: 0,
    currentValue: 0,
    unit: defaultCategory.defaultUnit,
    source: 'manual',
    scope: 'team',
    config: getModelStrategy(model).createDefaultConfig(),
  };
}

/**
 * Troca o modelo de um rascunho preservando os campos comuns e
 * recriando a config específica do novo modelo.
 */
export function changeDraftModel(draft: GoalDraft, model: GoalModel): GoalDraft {
  return { ...draft, model, config: getModelStrategy(model).createDefaultConfig() };
}

/**
 * Aplica os padrões da categoria selecionada: unidade padrão e, caso a nova
 * categoria não suporte auto-atualização, volta a origem para 'manual'.
 */
export function applyCategoryDefaults(draft: GoalDraft, categoryId: string): GoalDraft {
  const category = resolveCategory(categoryId);
  return {
    ...draft,
    categoryId,
    unit: category.defaultUnit,
    source: category.supportsAutoSync ? draft.source : 'manual',
  };
}

export function createEmptyLevel(index: number): GoalLevel {
  return { id: uid('level'), name: `Nível ${index + 1}`, target: 0 };
}

export function createEmptyMilestone(): GoalMilestone {
  return { id: uid('milestone'), label: '', target: 0 };
}
