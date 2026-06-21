/**
 * Hook de consumo dos KPIs via React Query.
 *
 * Depende apenas do CONTRATO `KpisService` — não do Supabase. A implementação
 * concreta é injetada por `kpisServiceProvider`. Para apontar para um backend
 * REST no futuro, basta trocar o provider (uma linha), sem mexer na UI nem
 * neste hook.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import { restKpisService } from '../services/restKpisService';
import { monthPeriod } from '../period';
import type { KpiPeriod, KpisOverview, KpisService } from '../types';

/**
 * Provider da implementação do serviço.
 *
 * Produção = `restKpisService` (cálculo no servidor, fonte única de verdade).
 * Alternativa = `supabaseKpisService` (cálculo client-side) permanece disponível
 * para rollback/offline; basta `setKpisService(supabaseKpisService)` no boot.
 */
let kpisServiceProvider: KpisService = restKpisService;

/** Permite sobrescrever a fonte de dados (ex.: testes ou migração para API). */
export function setKpisService(service: KpisService): void {
  kpisServiceProvider = service;
}

export interface UseKpisOptions {
  /** Período a consultar. Padrão: mês atual. */
  period?: KpiPeriod;
  /** Restringe ao corretor (escopo individual). */
  agentId?: string | null;
}

export interface UseKpisResult {
  data: KpisOverview | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  period: KpiPeriod;
  tenantReady: boolean;
}

export function useKpis(options: UseKpisOptions = {}): UseKpisResult {
  const { tenantId } = useAuthContext();
  const tenantReady = Boolean(tenantId && tenantId !== 'owner');

  const period = useMemo(() => options.period ?? monthPeriod(), [options.period]);
  const agentId = options.agentId ?? null;

  const query = useQuery<KpisOverview>({
    queryKey: ['kpis', 'overview', tenantId, period.startDate, period.endDate, agentId],
    queryFn: () =>
      kpisServiceProvider.getOverview({
        tenantId: tenantId as string,
        period,
        agentId,
      }),
    enabled: tenantReady,
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => query.refetch(),
    period,
    tenantReady,
  };
}
