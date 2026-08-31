import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="line-chart" />,
  Doughnut: () => <div data-testid="doughnut-chart" />,
}));

vi.mock('@/contexts/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAuthContext: () => ({ tenantId: 't1' }),
}));

const svc = vi.hoisted(() => ({
  fetchGaStatus: vi.fn(),
  saveGaConfig: vi.fn(),
  fetchGaReport: vi.fn(),
}));
vi.mock('@/features/relatorios/services/gaService', () => svc);

import { MarketingSiteTab } from '@/features/relatorios/components/MarketingSiteTab';

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MarketingSiteTab /></QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe('MarketingSiteTab', () => {
  it('desconectado + admin → tela de setup com o e-mail da service account', async () => {
    svc.fetchGaStatus.mockResolvedValue({ connected: false, propertyId: null, serviceAccountEmail: 'ga@p.iam', canManage: true });
    renderTab();
    expect(await screen.findByText('ga@p.iam')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /testar e salvar/i })).toBeInTheDocument();
    expect(svc.fetchGaReport).not.toHaveBeenCalled();
  });

  it('desconectado + corretor → aviso para falar com o administrador', async () => {
    svc.fetchGaStatus.mockResolvedValue({ connected: false, propertyId: null, serviceAccountEmail: 'ga@p.iam', canManage: false });
    renderTab();
    expect(await screen.findByText(/administrador/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /testar e salvar/i })).not.toBeInTheDocument();
  });

  it('conectado → busca o report e renderiza os blocos', async () => {
    svc.fetchGaStatus.mockResolvedValue({ connected: true, propertyId: '123', serviceAccountEmail: 'ga@p.iam', canManage: true });
    svc.fetchGaReport.mockResolvedValue({
      timeseries: [{ date: '2026-08-01', sessions: 10, users: 8, pageviews: 25, engagementRate: 0.5 }],
      sources: [{ source: 'google', medium: 'organic', sessions: 7 }],
      pages: [{ path: '/imovel/123', views: 12 }],
      devices: [{ device: 'mobile', sessions: 9 }],
      cities: [{ city: 'Jundiaí', sessions: 5 }],
    });
    renderTab();
    await waitFor(() => expect(svc.fetchGaReport).toHaveBeenCalledWith('28d', 't1'));
    expect(await screen.findByTestId('line-chart')).toBeInTheDocument();
    expect(screen.getByText('/imovel/123')).toBeInTheDocument();
    expect(screen.getByText(/google \/ organic/i)).toBeInTheDocument();
  });
});
