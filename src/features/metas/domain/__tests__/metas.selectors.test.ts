import { describe, expect, it } from 'vitest';
import { buildGoalViews, selectActiveIndividualGoals } from '../metrics';
import type { Goal } from '../types';

const TODAY = '2026-06-15';

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    tenantId: 't1',
    name: 'Meta teste',
    categoryId: 'captacao',
    model: 'simple',
    description: '',
    status: 'active',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    ownerName: 'Maria',
    targetValue: 50,
    currentValue: 25,
    unit: 'count',
    source: 'manual',
    scope: 'individual',
    isFeatured: false,
    config: { kind: 'simple' },
    createdAt: TODAY,
    updatedAt: TODAY,
    ...overrides,
  };
}

describe('selectActiveIndividualGoals', () => {
  it('inclui meta individual ativa', () => {
    const views = buildGoalViews([makeGoal({ scope: 'individual', status: 'active' })], TODAY);
    expect(selectActiveIndividualGoals(views)).toHaveLength(1);
  });

  it('exclui meta individual inativa', () => {
    const views = buildGoalViews([makeGoal({ scope: 'individual', status: 'inactive' })], TODAY);
    expect(selectActiveIndividualGoals(views)).toHaveLength(0);
  });

  it('exclui meta de equipe (mesmo ativa)', () => {
    const views = buildGoalViews([makeGoal({ scope: 'team', status: 'active' })], TODAY);
    expect(selectActiveIndividualGoals(views)).toHaveLength(0);
  });

  it('mantém individual ativa mesmo quando o status de progresso é "atrasada"', () => {
    // Prazo vencido + abaixo do alvo => progresso "late", mas status persistido continua 'active'.
    const views = buildGoalViews(
      [makeGoal({ scope: 'individual', status: 'active', currentValue: 1, endDate: '2026-01-01' })],
      TODAY,
    );
    const selected = selectActiveIndividualGoals(views);
    expect(selected).toHaveLength(1);
    expect(selected[0].status).toBe('late');
  });

  it('filtra uma lista mista preservando apenas individuais ativas', () => {
    const views = buildGoalViews(
      [
        makeGoal({ id: '1', scope: 'individual', status: 'active' }),
        makeGoal({ id: '2', scope: 'individual', status: 'inactive' }),
        makeGoal({ id: '3', scope: 'team', status: 'active' }),
        makeGoal({ id: '4', scope: 'individual', status: 'active' }),
      ],
      TODAY,
    );
    expect(selectActiveIndividualGoals(views).map((v) => v.goal.id)).toEqual(['1', '4']);
  });

  it('lista vazia retorna vazio', () => {
    expect(selectActiveIndividualGoals([])).toEqual([]);
  });
});
