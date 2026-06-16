/**
 * Hook que carrega o mapa { codigo_imovel -> tipo } a partir de
 * `imoveis_locais`, para classificar leads por tipo de imóvel no relatório de
 * Funil por Unidade.
 *
 * Performance:
 *  - UMA única query por tenant (sem N+1), selecionando apenas as 3 colunas
 *    necessárias (codigo_imovel, tipo, tipo_simplificado).
 *  - O resultado é memoizado num Map para junção O(1) por lead.
 *
 * Multi-tenancy: respeita o `tenant_id` (RLS no Supabase + filtro explícito),
 * com o mesmo fallback de owner-impersonation usado por `useLeadsMetrics`.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import {
  buildImovelTipoMap,
  ImovelLocalRow,
  ImovelTipoInfo,
} from '@/features/relatorios/utils/unidadeClassifier';

interface UseImovelTipoMapReturn {
  tipoMap: Map<string, ImovelTipoInfo>;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function resolveTenantId(tenantId: string | null | undefined): string | null {
  if (tenantId) return tenantId;
  try {
    const impersonation = localStorage.getItem('owner-impersonation');
    if (impersonation) return JSON.parse(impersonation)?.tenantId ?? null;
  } catch {
    /* ignore parse errors */
  }
  return null;
}

export function useImovelTipoMap(): UseImovelTipoMapReturn {
  const { tenantId } = useAuth();
  const [rows, setRows] = useState<ImovelLocalRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async (): Promise<void> => {
    const effectiveTenantId = resolveTenantId(tenantId);
    if (!effectiveTenantId) {
      setRows([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('imoveis_locais')
        .select('codigo_imovel, tipo, tipo_simplificado')
        .eq('tenant_id', effectiveTenantId);

      if (fetchError) throw fetchError;
      setRows((data as ImovelLocalRow[]) ?? []);
    } catch (err) {
      console.error('❌ useImovelTipoMap: erro ao carregar imoveis_locais:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar tipos de imóvel');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const tipoMap = useMemo(() => buildImovelTipoMap(rows), [rows]);

  return { tipoMap, isLoading, error, refetch: fetchRows };
}

export default useImovelTipoMap;
