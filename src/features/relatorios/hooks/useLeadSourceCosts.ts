/**
 * Hook para custos de investimento por origem de lead (aba Financeiro).
 * Carrega o mapa { origem -> custo mensal } do tenant e expõe um
 * salvamento otimista por origem.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchLeadSourceCosts,
  saveLeadSourceCost,
} from '../services/leadSourceCostsService';

export interface UseLeadSourceCostsResult {
  /** Mapa origem -> custo mensal (BRL). Origens sem custo não aparecem. */
  costs: Record<string, number>;
  loading: boolean;
  saving: boolean;
  /** Salva (upsert) o custo mensal de uma origem; atualiza o estado local. */
  saveCost: (origem: string, monthlyCost: number) => Promise<boolean>;
  reload: () => void;
}

export function useLeadSourceCosts(): UseLeadSourceCostsResult {
  const { tenantId } = useAuth();
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!tenantId) {
      setCosts({});
      return;
    }
    setLoading(true);
    fetchLeadSourceCosts(tenantId)
      .then((map) => {
        if (!cancelled) setCosts(map);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, reloadKey]);

  const saveCost = useCallback(
    async (origem: string, monthlyCost: number): Promise<boolean> => {
      if (!tenantId || !origem) return false;
      // Arredonda a 2 casas para o valor otimista bater com o persistido (NUMERIC(14,2)).
      const valor =
        Number.isFinite(monthlyCost) && monthlyCost > 0 ? Math.round(monthlyCost * 100) / 100 : 0;
      const previous = costs;
      // Atualização otimista
      setCosts((prev) => ({ ...prev, [origem]: valor }));
      setSaving(true);
      const { success } = await saveLeadSourceCost(tenantId, origem, valor);
      setSaving(false);
      if (!success) {
        setCosts(previous); // rollback
        return false;
      }
      return true;
    },
    [tenantId, costs]
  );

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { costs, loading, saving, saveCost, reload };
}
