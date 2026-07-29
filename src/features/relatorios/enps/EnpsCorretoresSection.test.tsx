import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { EnpsCorretoresSection } from './EnpsCorretoresSection';
import type { EnpsOverview } from '@/features/enps/types';

// jsdom não implementa ResizeObserver, usado pelo ResponsiveContainer do Recharts
// (mesmo stub de PropostaPage.dialogs.test.tsx).
beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

const hookState: { current: ReturnType<typeof baseResult> } = { current: baseResult() };
vi.mock('@/features/enps/hooks/useEnps', () => ({ useEnps: () => hookState.current }));

function baseResult() {
  const data = {
    period: { startDate: '2026-07-01', endDate: '2026-07-31', label: 'Julho/2026' },
    geral: {
      empresa: { score: 40, promoters: 6, passives: 2, detractors: 2, count: 10, enps: 40 },
      gestor: { score: 20, promoters: 5, passives: 3, detractors: 2, count: 10, enps: 20 },
    },
    evolucao: [{ label: 'Jun', empresa: 30, gestor: 10 }, { label: 'Jul', empresa: 40, gestor: 20 }],
    participacao: { sent: 12, responded: 10, pending: 2, rate: 83 },
    ranking: [{ leaderUserId: 'l1', leaderName: 'Ana', enps: 50, count: 6 }],
    distribuicao: { empresa: [{ label: 'Promotores', count: 6 }], gestor: [{ label: 'Promotores', count: 5 }] },
    comentarios: [{ text: 'Ótimo ambiente' }],
    scope: { locked: false, teamId: null, teamName: null, teams: [] },
  } as unknown as EnpsOverview;
  return { data, isLoading: false, isError: false, refetch: vi.fn(), period: data.period, tenantReady: true };
}
function makeState(over: Partial<ReturnType<typeof baseResult>> = {}) { return { ...baseResult(), ...over }; }

describe('EnpsCorretoresSection', () => {
  it('mostra os DOIS eNPS (empresa e gestor) com score e N', () => {
    hookState.current = makeState();
    render(<EnpsCorretoresSection tenantId="t1" />);
    // getAllBy: "eNPS Empresa"/"eNPS Gestor" aparecem em 3 nós legítimos (label
    // sr-only, label do KpiHeroCard, título "Evolução — eNPS Empresa/Gestor").
    expect(screen.getAllByText(/eNPS Empresa/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/eNPS Gestor/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getAllByText(/10 respostas/i).length).toBeGreaterThanOrEqual(1);
  });

  it('mostra "respostas insuficientes" quando o bloco geral vem insufficient', () => {
    const data = { ...baseResult().data, geral: { empresa: { insufficient: true }, gestor: { insufficient: true } } } as unknown as EnpsOverview;
    hookState.current = makeState({ data });
    render(<EnpsCorretoresSection tenantId="t1" />);
    expect(screen.getAllByText(/respostas insuficientes/i).length).toBeGreaterThanOrEqual(1);
  });

  it('mostra empty state no ranking quando vazio', () => {
    const data = { ...baseResult().data, ranking: [] } as unknown as EnpsOverview;
    hookState.current = makeState({ data });
    render(<EnpsCorretoresSection tenantId="t1" />);
    expect(screen.getByText(/nenhum gestor com respostas suficientes/i)).toBeInTheDocument();
  });

  it('mostra skeleton enquanto carrega', () => {
    hookState.current = makeState({ isLoading: true, data: undefined });
    const { container } = render(<EnpsCorretoresSection tenantId="t1" />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('mostra dropdown de equipes para admin (scope.locked=false)', () => {
    const data = { ...baseResult().data, scope: { locked: false, teamId: null, teamName: null, teams: [{ id: 'te-red', name: 'Vermelha', color: 'red' }] } } as unknown as EnpsOverview;
    hookState.current = makeState({ data });
    render(<EnpsCorretoresSection tenantId="t1" />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Vermelha')).toBeInTheDocument();
    expect(screen.getByText(/todas as equipes/i)).toBeInTheDocument();
  });

  it('mostra chip travado (sem dropdown) para team_leader', () => {
    const data = { ...baseResult().data, scope: { locked: true, teamId: 'te-red', teamName: 'Vermelha', teams: [] } } as unknown as EnpsOverview;
    hookState.current = makeState({ data });
    render(<EnpsCorretoresSection tenantId="t1" />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/vermelha/i)).toBeInTheDocument();
  });
});
