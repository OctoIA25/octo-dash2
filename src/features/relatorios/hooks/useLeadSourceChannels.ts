/**
 * Hook para o canal de cada origem de lead (gráficos "por Canal").
 * Carrega o mapa { origem -> canal } com as escolhas manuais do tenant
 * e expõe um resolvedor que aplica: escolha salva > sugestão automática.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchLeadSourceChannels,
  saveLeadSourceChannel,
  deleteLeadSourceChannel,
} from '../services/leadSourceChannelsService';
import { origemChannelKey, resolveCanal } from '../utils/canalClassifier';

export interface UseLeadSourceChannelsResult {
  /** Mapa chave da origem (trim+lowercase) -> canal escolhido manualmente. */
  channels: Record<string, string>;
  loading: boolean;
  saving: boolean;
  /** Canal efetivo de uma origem (escolha salva > sugestão automática). */
  getCanal: (origem: string | undefined) => string;
  /** Salva (upsert) o canal de uma origem; atualiza o estado local. */
  saveChannel: (origem: string, canal: string) => Promise<boolean>;
  /** Remove a escolha manual; a origem volta para a sugestão automática. */
  resetChannel: (origem: string) => Promise<boolean>;
  reload: () => void;
}

export function useLeadSourceChannels(): UseLeadSourceChannelsResult {
  const { tenantId } = useAuth();
  const [channels, setChannels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!tenantId) {
      setChannels({});
      return;
    }
    setLoading(true);
    fetchLeadSourceChannels(tenantId)
      .then((map) => {
        if (!cancelled) setChannels(map);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, reloadKey]);

  const getCanal = useCallback(
    (origem: string | undefined) => resolveCanal(origem, channels),
    [channels]
  );

  const saveChannel = useCallback(
    async (origem: string, canal: string): Promise<boolean> => {
      const key = origemChannelKey(origem);
      const canalLimpo = (canal || '').trim();
      if (!tenantId || !key || !canalLimpo) return false;
      const previous = channels;
      // Atualização otimista
      setChannels((prev) => ({ ...prev, [key]: canalLimpo }));
      setSaving(true);
      const { success } = await saveLeadSourceChannel(tenantId, origem, canalLimpo);
      setSaving(false);
      if (!success) setChannels(previous);
      return success;
    },
    [tenantId, channels]
  );

  const resetChannel = useCallback(
    async (origem: string): Promise<boolean> => {
      const key = origemChannelKey(origem);
      if (!tenantId || !key) return false;
      const previous = channels;
      // Atualização otimista
      setChannels((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setSaving(true);
      const { success } = await deleteLeadSourceChannel(tenantId, origem);
      setSaving(false);
      if (!success) setChannels(previous);
      return success;
    },
    [tenantId, channels]
  );

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { channels, loading, saving, getCanal, saveChannel, resetChannel, reload };
}
