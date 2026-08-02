/**
 * Hook de consumo do eNPS via React Query. Depende só do CONTRATO EnpsService.
 * Clone do useKpis.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { restEnpsService } from '../services/restEnpsService';
import type { EnpsPeriod, EnpsOverview, EnpsService, EnpsPending } from '../types';

let enpsServiceProvider: EnpsService = restEnpsService;
export function getEnpsService(): EnpsService { return enpsServiceProvider; }
export function setEnpsService(service: EnpsService): void { enpsServiceProvider = service; }

function currentMonthPeriod(): EnpsPeriod {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const label = start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return { startDate: iso(start), endDate: iso(now), label: label.charAt(0).toUpperCase() + label.slice(1) };
}

export interface UseEnpsOptions { period?: EnpsPeriod; leader?: string | null; corretor?: string | null }
export interface UseEnpsResult { data: EnpsOverview | undefined; isLoading: boolean; isError: boolean; refetch: () => void; period: EnpsPeriod; tenantReady: boolean }

/**
 * 'owner' (sem impersonation) e o tenant sintético de teste não existem no banco:
 * não há eNPS a buscar, e o id sintético não é uuid (o servidor devolve 404).
 * Mesma constante local de useLeadsData.ts e leadsMetricsService.ts.
 */
const TEST_TENANT_ID = 'tenant-area-de-teste';
const isRealTenant = (tenantId?: string | null) =>
  Boolean(tenantId && tenantId !== 'owner' && tenantId !== TEST_TENANT_ID);

export function useEnps(options: UseEnpsOptions = {}): UseEnpsResult {
  const { tenantId } = useAuthContext();
  const tenantReady = isRealTenant(tenantId);
  const period = useMemo(() => options.period ?? currentMonthPeriod(), [options.period]);
  const leader = options.leader ?? null;
  const corretor = options.corretor ?? null;

  const query = useQuery<EnpsOverview>({
    queryKey: ['enps', 'overview', tenantId, period.startDate, period.endDate, leader, corretor],
    queryFn: () => enpsServiceProvider.getOverview({ tenantId: tenantId as string, period, leader, corretor }),
    enabled: tenantReady,
    staleTime: 5 * 60 * 1000,
  });

  return { data: query.data, isLoading: query.isLoading, isError: query.isError, refetch: () => query.refetch(), period, tenantReady };
}

/**
 * Pendência de eNPS do próprio corretor, para o banner da dash. Leve e cacheado
 * (a pendência não muda a cada minuto). Só roda com tenant real (não owner).
 * O service já trata falha como "sem pendência" — o banner nunca quebra a dash.
 */
export function useEnpsPending(): EnpsPending {
  const { tenantId } = useAuthContext();
  const tenantReady = isRealTenant(tenantId);

  const query = useQuery<EnpsPending>({
    queryKey: ['enps', 'pending', tenantId],
    queryFn: () => enpsServiceProvider.getPending(),
    enabled: tenantReady,
    staleTime: 5 * 60 * 1000,
  });

  return query.data ?? { pending: false };
}
