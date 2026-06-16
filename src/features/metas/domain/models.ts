/**
 * Registry de MODELOS de meta (estratégias de cálculo de progresso).
 *
 * Este é o ponto de extensão central da feature. Cada modelo implementa
 * a interface `GoalModelStrategy`, encapsulando TODO o comportamento
 * específico daquele modelo:
 *   - como criar a config padrão;
 *   - qual é o valor-alvo efetivo;
 *   - como calcular o progresso;
 *   - como validar o rascunho.
 *
 * Consumidores (UI, dashboard, filtros) operam sobre a interface — nunca
 * com `if (model === 'scaled')`. Adicionar um modelo novo = adicionar uma
 * estratégia aqui e registrá-la em GOAL_MODEL_STRATEGIES.
 *
 * Domínio puro: sem React e sem Supabase. 100% testável.
 */

import type {
  Goal,
  GoalConfig,
  GoalDraft,
  GoalLevel,
  GoalMilestone,
  GoalModel,
} from './types';

/** Um "checkpoint" genérico (nível ou marco) já avaliado. */
export interface ComputedCheckpoint {
  id: string;
  label: string;
  target: number;
  criterion?: string;
  index: number;
  reached: boolean;
  /** Progresso dentro deste checkpoint, 0–100. */
  percent: number;
}

export interface GoalProgress {
  /** Percentual geral clampeado para exibição (0–100). */
  percent: number;
  /** Percentual bruto (pode passar de 100). Útil para "superação de meta". */
  rawPercent: number;
  currentValue: number;
  /** Valor-alvo efetivo deste modelo (ex: maior nível, na escalonada). */
  targetValue: number;
  /** Checkpoints avaliados (escalonada/personalizada). Vazio na simples. */
  checkpoints: ComputedCheckpoint[];
  /** Índice do checkpoint atingido mais alto (-1 se nenhum). */
  currentCheckpointIndex: number;
  /** Próximo checkpoint a atingir, ou null se todos atingidos. */
  nextCheckpoint: ComputedCheckpoint | null;
}

export interface GoalModelStrategy {
  model: GoalModel;
  label: string;
  description: string;
  /** Config inicial ao escolher este modelo no formulário. */
  createDefaultConfig(): GoalConfig;
  /** Valor-alvo efetivo (usado em conclusão e média do dashboard). */
  resolveTargetValue(goal: Goal): number;
  computeProgress(goal: Goal): GoalProgress;
  /** Retorna mensagens de erro (vazio = válido). */
  validate(draft: GoalDraft): string[];
}

// ---------------------------------------------------------------------------
// Helpers compartilhados
// ---------------------------------------------------------------------------

function toPercent(current: number, target: number): number {
  if (target <= 0) return 0;
  return (current / target) * 100;
}

function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent));
}

/**
 * Avalia progresso por checkpoints (níveis ou marcos). Os checkpoints são
 * ordenados por alvo crescente; o alvo geral é o maior deles.
 */
function computeCheckpointProgress(
  currentValue: number,
  rawCheckpoints: Array<{ id: string; label: string; target: number; criterion?: string }>,
  fallbackTarget: number,
): GoalProgress {
  const ordered = [...rawCheckpoints].sort((a, b) => a.target - b.target);

  const checkpoints: ComputedCheckpoint[] = ordered.map((checkpoint, index) => ({
    id: checkpoint.id,
    label: checkpoint.label,
    target: checkpoint.target,
    criterion: checkpoint.criterion,
    index,
    reached: currentValue >= checkpoint.target,
    percent: clampPercent(toPercent(currentValue, checkpoint.target)),
  }));

  const targetValue = ordered.length > 0 ? ordered[ordered.length - 1].target : fallbackTarget;
  const rawPercent = toPercent(currentValue, targetValue);

  const reachedIndexes = checkpoints.filter((c) => c.reached).map((c) => c.index);
  const currentCheckpointIndex = reachedIndexes.length > 0 ? Math.max(...reachedIndexes) : -1;
  const nextCheckpoint = checkpoints.find((c) => !c.reached) ?? null;

  return {
    percent: clampPercent(rawPercent),
    rawPercent,
    currentValue,
    targetValue,
    checkpoints,
    currentCheckpointIndex,
    nextCheckpoint,
  };
}

function validateCommon(draft: GoalDraft): string[] {
  const errors: string[] = [];
  if (!draft.name.trim()) errors.push('Informe o nome da meta.');
  if (!draft.categoryId.trim()) errors.push('Selecione a categoria da meta.');
  if (!draft.startDate) errors.push('Informe a data de início.');
  if (!draft.endDate) errors.push('Informe a data de término.');
  if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
    errors.push('A data de término deve ser posterior à data de início.');
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Estratégias
// ---------------------------------------------------------------------------

const simpleStrategy: GoalModelStrategy = {
  model: 'simple',
  label: 'Meta Simples',
  description: 'Um único valor alvo e um valor realizado.',
  createDefaultConfig: () => ({ kind: 'simple' }),
  resolveTargetValue: (goal) => goal.targetValue,
  computeProgress: (goal) => {
    const rawPercent = toPercent(goal.currentValue, goal.targetValue);
    return {
      percent: clampPercent(rawPercent),
      rawPercent,
      currentValue: goal.currentValue,
      targetValue: goal.targetValue,
      checkpoints: [],
      currentCheckpointIndex: -1,
      nextCheckpoint: null,
    };
  },
  validate: (draft) => {
    const errors = validateCommon(draft);
    if (draft.targetValue <= 0) errors.push('O valor alvo deve ser maior que zero.');
    return errors;
  },
};

const scaledStrategy: GoalModelStrategy = {
  model: 'scaled',
  label: 'Meta Escalonada',
  description: 'Vários níveis com alvos crescentes (quantidade livre).',
  createDefaultConfig: () => ({
    kind: 'scaled',
    levels: [
      { id: 'level-1', name: 'Nível 1', target: 0 },
      { id: 'level-2', name: 'Nível 2', target: 0 },
      { id: 'level-3', name: 'Nível 3', target: 0 },
    ],
  }),
  resolveTargetValue: (goal) => {
    const levels = goal.config.kind === 'scaled' ? goal.config.levels : [];
    return levels.reduce((max, level) => Math.max(max, level.target), 0);
  },
  computeProgress: (goal) => {
    const levels: GoalLevel[] = goal.config.kind === 'scaled' ? goal.config.levels : [];
    return computeCheckpointProgress(
      goal.currentValue,
      levels.map((level) => ({
        id: level.id,
        label: level.name,
        target: level.target,
        criterion: level.criterion,
      })),
      goal.targetValue,
    );
  },
  validate: (draft) => {
    const errors = validateCommon(draft);
    const levels = draft.config.kind === 'scaled' ? draft.config.levels : [];
    if (levels.length === 0) {
      errors.push('Adicione ao menos um nível.');
    }
    levels.forEach((level, index) => {
      if (!level.name.trim()) errors.push(`Informe o nome do nível ${index + 1}.`);
      if (level.target <= 0) errors.push(`O alvo do nível ${index + 1} deve ser maior que zero.`);
    });
    return errors;
  },
};

const customStrategy: GoalModelStrategy = {
  model: 'custom',
  label: 'Meta Personalizada',
  description: 'Objetivo, unidade e marcos intermediários definidos livremente.',
  createDefaultConfig: () => ({
    kind: 'custom',
    objective: '',
    unitLabel: '',
    milestones: [],
    successCriteria: '',
  }),
  resolveTargetValue: (goal) => {
    const milestones = goal.config.kind === 'custom' ? goal.config.milestones : [];
    const maxMilestone = milestones.reduce((max, milestone) => Math.max(max, milestone.target), 0);
    return maxMilestone > 0 ? maxMilestone : goal.targetValue;
  },
  computeProgress: (goal) => {
    const milestones: GoalMilestone[] = goal.config.kind === 'custom' ? goal.config.milestones : [];
    return computeCheckpointProgress(
      goal.currentValue,
      milestones.map((milestone) => ({
        id: milestone.id,
        label: milestone.label,
        target: milestone.target,
        criterion: milestone.successCriterion,
      })),
      goal.targetValue,
    );
  },
  validate: (draft) => {
    const errors = validateCommon(draft);
    if (draft.config.kind === 'custom') {
      if (!draft.config.objective.trim()) errors.push('Descreva o objetivo da meta personalizada.');
      if (!draft.config.unitLabel.trim()) errors.push('Informe a unidade de medida.');
      const noMilestones = draft.config.milestones.length === 0;
      if (noMilestones && draft.targetValue <= 0) {
        errors.push('Defina um valor alvo ou ao menos um marco.');
      }
      draft.config.milestones.forEach((milestone, index) => {
        if (!milestone.label.trim()) errors.push(`Informe o nome do marco ${index + 1}.`);
        if (milestone.target <= 0) errors.push(`O alvo do marco ${index + 1} deve ser maior que zero.`);
      });
    }
    return errors;
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const GOAL_MODEL_STRATEGIES: Record<GoalModel, GoalModelStrategy> = {
  simple: simpleStrategy,
  scaled: scaledStrategy,
  custom: customStrategy,
};

/** Lista para popular seletores na UI (ordem de exibição). */
export const GOAL_MODELS: GoalModelStrategy[] = [simpleStrategy, scaledStrategy, customStrategy];

export function getModelStrategy(model: GoalModel): GoalModelStrategy {
  return GOAL_MODEL_STRATEGIES[model] ?? simpleStrategy;
}

export function computeGoalProgress(goal: Goal): GoalProgress {
  return getModelStrategy(goal.model).computeProgress(goal);
}

export function validateGoalDraft(draft: GoalDraft): string[] {
  return getModelStrategy(draft.model).validate(draft);
}
