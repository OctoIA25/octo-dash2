import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Goal } from '../../domain/types';

// Mocka o hook de dados: o painel é só composição/leitura, então isolamos a fonte.
const useGoalsMock = vi.fn();
vi.mock('../../hooks/useGoals', () => ({
  useGoals: () => useGoalsMock(),
}));

import { IndividualGoalsPanel } from '../IndividualGoalsPanel';

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

function mockGoals(goals: Goal[], extra: Partial<{ isLoading: boolean; isError: boolean }> = {}) {
  useGoalsMock.mockReturnValue({
    goals,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    canManage: false,
    ...extra,
  });
}

beforeEach(() => {
  useGoalsMock.mockReset();
});

describe('IndividualGoalsPanel', () => {
  it('renderiza apenas metas individuais ativas; oculta inativas e de equipe', () => {
    mockGoals([
      makeGoal({ id: '1', name: 'Individual Ativa', scope: 'individual', status: 'active' }),
      makeGoal({ id: '2', name: 'Individual Inativa', scope: 'individual', status: 'inactive' }),
      makeGoal({ id: '3', name: 'Equipe Ativa', scope: 'team', status: 'active' }),
    ]);

    render(<IndividualGoalsPanel />);

    expect(screen.getByText('Individual Ativa')).toBeInTheDocument();
    expect(screen.queryByText('Individual Inativa')).not.toBeInTheDocument();
    expect(screen.queryByText('Equipe Ativa')).not.toBeInTheDocument();
  });

  it('exibe a faixa de indicadores e a contagem de metas ativas no cabeçalho', () => {
    mockGoals([
      makeGoal({ id: '1', name: 'Meta A', scope: 'individual', status: 'active' }),
      makeGoal({ id: '2', name: 'Meta B', scope: 'individual', status: 'active' }),
    ]);

    render(<IndividualGoalsPanel />);

    expect(screen.getByText('2 metas ativas')).toBeInTheDocument();
    expect(screen.getByText('Atingimento médio')).toBeInTheDocument();
    expect(screen.getByText('Meta em destaque')).toBeInTheDocument();
    expect(screen.getByText('Outras metas')).toBeInTheDocument();
  });

  it('mantém a primeira meta ampliada por padrão e permite ampliar outra', () => {
    mockGoals([
      makeGoal({ id: '1', name: 'Meta A', scope: 'individual', status: 'active' }),
      makeGoal({ id: '2', name: 'Meta B', scope: 'individual', status: 'active' }),
    ]);

    render(<IndividualGoalsPanel />);

    // Por padrão, a primeira (Meta A) é o destaque; a segunda tem botão "Ampliar".
    const ampliarB = screen.getByLabelText('Ampliar meta Meta B');
    expect(ampliarB).toBeInTheDocument();
    expect(screen.queryByLabelText('Ampliar meta Meta A')).not.toBeInTheDocument();

    // Ao ampliar a Meta B, ela vira o destaque e a Meta A passa a ter o botão.
    fireEvent.click(ampliarB);
    expect(screen.getByLabelText('Ampliar meta Meta A')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ampliar meta Meta B')).not.toBeInTheDocument();
  });

  it('usa o singular na contagem quando há apenas uma meta ativa', () => {
    mockGoals([makeGoal({ id: '1', scope: 'individual', status: 'active' })]);

    render(<IndividualGoalsPanel />);

    expect(screen.getByText('1 meta ativa')).toBeInTheDocument();
  });

  it('é somente-leitura: não renderiza o menu de ações da meta', () => {
    mockGoals([makeGoal({ id: '1', name: 'Individual Ativa', scope: 'individual', status: 'active' })]);

    render(<IndividualGoalsPanel />);

    expect(screen.queryByLabelText('Ações da meta')).not.toBeInTheDocument();
  });

  it('mostra estado vazio quando não há metas individuais ativas', () => {
    mockGoals([makeGoal({ id: '3', scope: 'team', status: 'active' })]);

    render(<IndividualGoalsPanel />);

    expect(screen.getByText('Nenhuma meta individual ativa.')).toBeInTheDocument();
  });

  it('mostra estado de carregamento', () => {
    mockGoals([], { isLoading: true });

    render(<IndividualGoalsPanel />);

    expect(screen.getByText('Carregando metas...')).toBeInTheDocument();
  });

  it('mostra mensagem de erro', () => {
    mockGoals([], { isError: true });

    render(<IndividualGoalsPanel />);

    expect(
      screen.getByText('Não foi possível carregar as metas. Tente novamente.'),
    ).toBeInTheDocument();
  });
});
