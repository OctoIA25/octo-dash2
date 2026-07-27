import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { useEnps, setEnpsService } from './useEnps';
import type { EnpsService, EnpsOverview } from '../types';

let mockTenantId: string | undefined = 'tenant-1';
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ tenantId: mockTenantId, isOwner: false, user: null }) }));

const overview = {
  period: { startDate: '2026-07-01', endDate: '2026-07-31', label: 'Julho/2026' },
  geral: { empresa: { insufficient: true }, gestor: { insufficient: true } },
  evolucao: [], participacao: { sent: 0, responded: 0, pending: 0, rate: 0 },
  ranking: [], distribuicao: { insufficient: true }, comentarios: { insufficient: true },
} as unknown as EnpsOverview;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useEnps', () => {
  beforeEach(() => { mockTenantId = 'tenant-1'; vi.clearAllMocks(); });

  it('busca o overview com tenantId e período', async () => {
    const getOverview = vi.fn().mockResolvedValue(overview);
    setEnpsService({ getOverview } as unknown as EnpsService);
    const { result } = renderHook(() => useEnps(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(getOverview).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1', period: expect.objectContaining({ startDate: expect.any(String) }) }));
    expect(result.current.tenantReady).toBe(true);
  });

  it('não dispara a query sem tenant (tenantReady=false)', async () => {
    mockTenantId = undefined;
    const getOverview = vi.fn().mockResolvedValue(overview);
    setEnpsService({ getOverview } as unknown as EnpsService);
    const { result } = renderHook(() => useEnps(), { wrapper });
    expect(result.current.tenantReady).toBe(false);
    expect(getOverview).not.toHaveBeenCalled();
  });

  it('não dispara para owner sem impersonação (tenantId="owner")', async () => {
    mockTenantId = 'owner';
    const getOverview = vi.fn().mockResolvedValue(overview);
    setEnpsService({ getOverview } as unknown as EnpsService);
    const { result } = renderHook(() => useEnps(), { wrapper });
    expect(result.current.tenantReady).toBe(false);
    expect(getOverview).not.toHaveBeenCalled();
  });
});
