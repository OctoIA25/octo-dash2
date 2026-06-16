import { describe, expect, it } from 'vitest';
import { computeGoalProgress, getModelStrategy, validateGoalDraft } from '../models';
import {
  buildGoalView,
  deriveProgressStatus,
  filterGoals,
  summarizeGoals,
  buildGoalViews,
} from '../metrics';
import { createEmptyDraft } from '../factory';
import type { Goal, GoalDraft } from '../types';

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
    scope: 'team',
    isFeatured: false,
    config: { kind: 'simple' },
    createdAt: TODAY,
    updatedAt: TODAY,
    ...overrides,
  };
}

describe('computeGoalProgress — simple', () => {
  it('calcula percentual proporcional', () => {
    const progress = computeGoalProgress(makeGoal({ currentValue: 25, targetValue: 50 }));
    expect(progress.percent).toBe(50);
    expect(progress.rawPercent).toBe(50);
  });

  it('clampeia em 100 mas preserva rawPercent acima de 100', () => {
    const progress = computeGoalProgress(makeGoal({ currentValue: 75, targetValue: 50 }));
    expect(progress.percent).toBe(100);
    expect(progress.rawPercent).toBe(150);
  });

  it('não divide por zero quando alvo é 0', () => {
    const progress = computeGoalProgress(makeGoal({ currentValue: 10, targetValue: 0 }));
    expect(progress.percent).toBe(0);
  });
});

describe('computeGoalProgress — scaled (quantidade livre de níveis)', () => {
  const scaled = makeGoal({
    model: 'scaled',
    currentValue: 120,
    targetValue: 150,
    config: {
      kind: 'scaled',
      levels: [
        { id: 'l1', name: 'N1', target: 50 },
        { id: 'l2', name: 'N2', target: 100 },
        { id: 'l3', name: 'N3', target: 150 },
      ],
    },
  });

  it('alvo efetivo é o maior nível', () => {
    expect(computeGoalProgress(scaled).targetValue).toBe(150);
  });

  it('marca níveis atingidos corretamente', () => {
    const { checkpoints, currentCheckpointIndex } = computeGoalProgress(scaled);
    expect(checkpoints.map((c) => c.reached)).toEqual([true, true, false]);
    expect(currentCheckpointIndex).toBe(1);
  });

  it('aponta o próximo nível a atingir', () => {
    expect(computeGoalProgress(scaled).nextCheckpoint?.label).toBe('N3');
  });

  it('funciona com 5 níveis sem alteração de código (extensibilidade)', () => {
    const fiveLevels = makeGoal({
      model: 'scaled',
      currentValue: 30,
      config: {
        kind: 'scaled',
        levels: [
          { id: 'a', name: 'A', target: 10 },
          { id: 'b', name: 'B', target: 20 },
          { id: 'c', name: 'C', target: 30 },
          { id: 'd', name: 'D', target: 40 },
          { id: 'e', name: 'E', target: 50 },
        ],
      },
    });
    const progress = computeGoalProgress(fiveLevels);
    expect(progress.checkpoints).toHaveLength(5);
    expect(progress.targetValue).toBe(50);
    expect(progress.currentCheckpointIndex).toBe(2);
  });
});

describe('deriveProgressStatus', () => {
  it('inativa quando status = inactive', () => {
    const goal = makeGoal({ status: 'inactive' });
    expect(deriveProgressStatus(goal, computeGoalProgress(goal), TODAY)).toBe('inactive');
  });

  it('concluída quando atinge 100%', () => {
    const goal = makeGoal({ currentValue: 50, targetValue: 50 });
    expect(deriveProgressStatus(goal, computeGoalProgress(goal), TODAY)).toBe('completed');
  });

  it('atrasada quando o prazo passou e não concluiu', () => {
    const goal = makeGoal({ currentValue: 10, endDate: '2026-01-01' });
    expect(deriveProgressStatus(goal, computeGoalProgress(goal), TODAY)).toBe('late');
  });

  it('em andamento no caso geral', () => {
    const goal = makeGoal();
    expect(deriveProgressStatus(goal, computeGoalProgress(goal), TODAY)).toBe('on_track');
  });
});

describe('summarizeGoals', () => {
  it('agrega contagens e média de atingimento (ignora inativas na média)', () => {
    const views = buildGoalViews(
      [
        makeGoal({ id: '1', currentValue: 50, targetValue: 50 }), // completed 100%
        makeGoal({ id: '2', currentValue: 25, targetValue: 50 }), // on_track 50%
        makeGoal({ id: '3', currentValue: 10, endDate: '2026-01-01' }), // late 20%
        makeGoal({ id: '4', status: 'inactive', currentValue: 0 }), // inactive
      ],
      TODAY,
    );
    const summary = summarizeGoals(views);
    expect(summary.total).toBe(4);
    expect(summary.completed).toBe(1);
    expect(summary.onTrack).toBe(1);
    expect(summary.late).toBe(1);
    expect(summary.inactive).toBe(1);
    // média entre ativas: (100 + 50 + 20) / 3 = 56.67 -> 57
    expect(summary.averageAttainment).toBe(57);
  });
});

describe('filterGoals', () => {
  const views = buildGoalViews(
    [
      makeGoal({ id: '1', name: 'Captação SP', categoryId: 'captacao', model: 'simple' }),
      makeGoal({ id: '2', name: 'VGV Anual', categoryId: 'vgv', model: 'scaled', config: { kind: 'scaled', levels: [] } }),
    ],
    TODAY,
  );

  it('filtra por categoria', () => {
    expect(filterGoals(views, { search: '', categoryId: 'vgv', model: 'all', status: 'all' })).toHaveLength(1);
  });

  it('busca ignorando acentos e caixa', () => {
    expect(filterGoals(views, { search: 'captacao', categoryId: 'all', model: 'all', status: 'all' })).toHaveLength(1);
  });

  it('filtra por modelo', () => {
    expect(filterGoals(views, { search: '', categoryId: 'all', model: 'scaled', status: 'all' })).toHaveLength(1);
  });
});

describe('validateGoalDraft', () => {
  function draft(overrides: Partial<GoalDraft> = {}): GoalDraft {
    return { ...createEmptyDraft(TODAY), name: 'X', ...overrides };
  }

  it('simples exige alvo positivo', () => {
    expect(validateGoalDraft(draft({ model: 'simple', targetValue: 0 }))).toContain(
      'O valor alvo deve ser maior que zero.',
    );
  });

  it('escalonada exige ao menos um nível válido', () => {
    const errors = validateGoalDraft(draft({ model: 'scaled', config: { kind: 'scaled', levels: [] } }));
    expect(errors).toContain('Adicione ao menos um nível.');
  });

  it('personalizada exige objetivo e unidade', () => {
    const errors = validateGoalDraft(
      draft({
        model: 'custom',
        targetValue: 10,
        config: { kind: 'custom', objective: '', unitLabel: '', milestones: [], successCriteria: '' },
      }),
    );
    expect(errors).toContain('Descreva o objetivo da meta personalizada.');
    expect(errors).toContain('Informe a unidade de medida.');
  });

  it('rejeita término anterior ao início', () => {
    const errors = validateGoalDraft(draft({ model: 'simple', targetValue: 5, startDate: '2026-05-01', endDate: '2026-01-01' }));
    expect(errors).toContain('A data de término deve ser posterior à data de início.');
  });
});

describe('buildGoalView + getModelStrategy', () => {
  it('resolve categoria conhecida e desconhecida (fallback)', () => {
    expect(buildGoalView(makeGoal({ categoryId: 'captacao' }), TODAY).category.label).toBe('Captação');
    expect(buildGoalView(makeGoal({ categoryId: 'desconhecida' }), TODAY).category.label).toBe('desconhecida');
  });

  it('getModelStrategy retorna estratégia coerente', () => {
    expect(getModelStrategy('scaled').model).toBe('scaled');
  });
});
