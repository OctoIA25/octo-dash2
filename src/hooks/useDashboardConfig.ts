/**
 * Hook para gerenciar configurações personalizadas do dashboard
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

export type TabId = 'funil' | 'okrs' | 'kpis' | 'pdi' | 'meus-leads' | 'tarefas-semana' | 'agenda';

export interface DashboardConfig {
  id?: number;
  corretor_email: string;
  abas_visiveis: TabId[];
  ordem_abas: TabId[];
  aba_padrao: TabId;
}

const DEFAULT_CONFIG: Omit<DashboardConfig, 'corretor_email'> = {
  abas_visiveis: ['funil', 'okrs', 'kpis', 'pdi', 'meus-leads', 'tarefas-semana', 'agenda'],
  ordem_abas: ['funil', 'okrs', 'kpis', 'pdi', 'meus-leads', 'tarefas-semana', 'agenda'],
  aba_padrao: 'funil'
};

export const useDashboardConfig = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carregar configuração do Supabase
  const loadConfig = useCallback(async () => {
    if (!user?.email) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      console.warn('⚠️ useDashboardConfig: funcionalidade desativada (sem DB e sem persistência temporária).');
      setConfig({ corretor_email: user.email, ...DEFAULT_CONFIG });
    } catch (err) {
      console.error('Erro ao carregar configuração do dashboard:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsLoading(false);
    }
  }, [user?.email]);

  // Criar configuração padrão
  const createDefaultConfig = async () => {
    if (!user?.email) return;

    setConfig({ corretor_email: user.email, ...DEFAULT_CONFIG });
  };

  // Atualizar configuração
  const updateConfig = async (updates: Partial<DashboardConfig>) => {
    if (!user?.email || !config) return;

    try {
      console.warn('⚠️ useDashboardConfig: atualização desativada.');
    } catch (err) {
      console.error('Erro ao atualizar configuração:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      throw err;
    }
  };

  // Alternar visibilidade de uma aba
  const toggleAbaVisibilidade = async (tabId: TabId) => {
    if (!config) return;

    const abasVisiveis = [...config.abas_visiveis];
    const index = abasVisiveis.indexOf(tabId);

    if (index > -1) {
      // Remover aba (precisa ter pelo menos 1 aba visível)
      if (abasVisiveis.length > 1) {
        abasVisiveis.splice(index, 1);
      } else {
        alert('Você precisa manter pelo menos uma aba visível!');
        return;
      }
    } else {
      // Adicionar aba
      abasVisiveis.push(tabId);
    }

    await updateConfig({ abas_visiveis: abasVisiveis });
  };

  // Reordenar abas
  const reordenarAbas = async (novaOrdem: TabId[]) => {
    await updateConfig({ ordem_abas: novaOrdem });
  };

  // Definir aba padrão
  const setAbaPadrao = async (tabId: TabId) => {
    await updateConfig({ aba_padrao: tabId });
  };

  // Carregar ao montar
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return {
    config,
    isLoading,
    error,
    updateConfig,
    toggleAbaVisibilidade,
    reordenarAbas,
    setAbaPadrao,
    refetch: loadConfig
  };
};


