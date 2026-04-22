/**
 * 🏠 Hook para gerenciar dados de imóveis do Kenlo
 * Usa React Query para cache e atualização automática
 */

import { useQuery } from '@tanstack/react-query';
import { Imovel } from '../services/kenloService';
import { useAuth } from "@/hooks/useAuth";
import { getTenantImoveis, syncTenantImoveisFromXml, loadXmlDataFromSupabase, syncMeusImoveisAssignmentsFromXml } from '../services/imoveisXmlService';
import { useMemo, useEffect, useRef } from 'react';

export interface ImoveisMetrics {
  total: number;
  casas: number;
  apartamentos: number;
  terrenos: number;
  comerciais: number;
  rurais: number;
  venda: number;
  locacao: number;
  vendaLocacao: number;
  valorTotalVenda: number;
  valorTotalLocacao: number;
}

// Chave para controlar sync diário no localStorage
const SYNC_ALL_BROKERS_KEY = 'last_sync_all_brokers_';

export const useImoveisData = () => {
  const { tenantId } = useAuth();
  const hasSyncedRef = useRef(false);

  // 🔥 Buscar imóveis com React Query - Carrega do Supabase primeiro como fallback
  const {
    data: imoveis = [],
    isLoading,
    error,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ['imoveis-xml', tenantId],
    queryFn: async () => {
      if (!tenantId) {
        return [];
      }
      
      // 1. Verificar se já tem dados no localStorage (sessão atual)
      let imoveisLocal = getTenantImoveis(tenantId);
      
      // 2. Se não tem dados locais, carregar do Supabase (backup/fallback)
      if (imoveisLocal.length === 0) {
        await loadXmlDataFromSupabase(tenantId);
        imoveisLocal = getTenantImoveis(tenantId);
      }
      
      return imoveisLocal;
    },
    enabled: !!tenantId, // Só executa quando tenantId estiver disponível
    staleTime: 1000 * 60, // 1 minuto (dados mais estáveis)
    gcTime: 1000 * 60 * 10, // 10 minutos
    refetchOnWindowFocus: false, // Desabilitado para evitar muitas requisições
    retry: 2, // Tentar 2 vezes em caso de erro
    retryDelay: 1000 // 1 segundo entre tentativas
  });

  const sync = async () => {
    if (!tenantId) return;
    await syncTenantImoveisFromXml(tenantId);
    await refetch();
  };

  // 🔄 Auto-sync de TODOS os corretores quando imóveis são carregados
  useEffect(() => {
    if (!tenantId || imoveis.length === 0 || hasSyncedRef.current) return;
    
    const syncKey = `${SYNC_ALL_BROKERS_KEY}${tenantId}`;
    const lastSync = localStorage.getItem(syncKey);
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000; // 1 hora de cooldown
    
    // Só sincroniza se passou mais de 1 hora desde a última sincronização
    if (lastSync && (now - parseInt(lastSync)) < ONE_HOUR) {
      hasSyncedRef.current = true;
      return;
    }
    
    // Executar sync de TODOS os corretores em background
    const runBrokerSync = async () => {
      try {
        const result = await syncMeusImoveisAssignmentsFromXml(tenantId);
        
        if (result.ok) {
          localStorage.setItem(syncKey, now.toString());
        } else {
          console.warn('⚠️ [useImoveisData] Erro na sincronização de corretores:', result.error);
        }
      } catch (err) {
        console.error('❌ [useImoveisData] Erro ao sincronizar corretores:', err);
      }
      hasSyncedRef.current = true;
    };
    
    runBrokerSync();
  }, [tenantId, imoveis.length]);

  // Log DETALHADO do estado e erro
  if (error) {
    console.error('   📝 Mensagem de Erro:', error);
    console.error('   📝 Tipo de Erro:', error.constructor.name);
    console.error('   📝 Stack:', error.stack);
  }

  // Calcular métricas dos imóveis
  const metrics: ImoveisMetrics = useMemo(() => {
    if (!imoveis || imoveis.length === 0) {
      return {
        total: 0,
        casas: 0,
        apartamentos: 0,
        terrenos: 0,
        comerciais: 0,
        rurais: 0,
        venda: 0,
        locacao: 0,
        vendaLocacao: 0,
        valorTotalVenda: 0,
        valorTotalLocacao: 0
      };
    }

    const metrics: ImoveisMetrics = {
      total: imoveis.length,
      casas: imoveis.filter(i => i.tipoSimplificado === 'casa').length,
      apartamentos: imoveis.filter(i => i.tipoSimplificado === 'apartamento').length,
      terrenos: imoveis.filter(i => i.tipoSimplificado === 'terreno').length,
      comerciais: imoveis.filter(i => i.tipoSimplificado === 'comercial').length,
      rurais: imoveis.filter(i => i.tipoSimplificado === 'rural').length,
      venda: imoveis.filter(i => i.finalidade === 'venda' || i.finalidade === 'venda_locacao').length,
      locacao: imoveis.filter(i => i.finalidade === 'locacao' || i.finalidade === 'venda_locacao').length,
      vendaLocacao: imoveis.filter(i => i.finalidade === 'venda_locacao').length,
      valorTotalVenda: imoveis.reduce((sum, i) => sum + i.valor_venda, 0),
      valorTotalLocacao: imoveis.reduce((sum, i) => sum + i.valor_locacao, 0)
    };

    return metrics;
  }, [imoveis]);

  // Filtrar imóveis por tipo
  const filterByTipo = (tipo: Imovel['tipoSimplificado']) => {
    return imoveis.filter(i => i.tipoSimplificado === tipo);
  };

  // Filtrar imóveis por finalidade
  const filterByFinalidade = (finalidade: 'venda' | 'locacao') => {
    if (finalidade === 'venda') {
      return imoveis.filter(i => i.finalidade === 'venda' || i.finalidade === 'venda_locacao');
    } else {
      return imoveis.filter(i => i.finalidade === 'locacao' || i.finalidade === 'venda_locacao');
    }
  };

  // Filtrar por bairro
  const filterByBairro = (bairro: string) => {
    return imoveis.filter(i => 
      i.bairro.toLowerCase().includes(bairro.toLowerCase())
    );
  };

  // Buscar imóvel por referência
  const findByReferencia = (referencia: string): Imovel | undefined => {
    return imoveis.find(i => i.referencia === referencia);
  };

  // Obter todos os bairros únicos
  const bairros = useMemo(() => {
    const bairrosSet = new Set(imoveis.map(i => i.bairro));
    return Array.from(bairrosSet).sort();
  }, [imoveis]);

  return {
    imoveis,
    metrics,
    isLoading,
    error: error?.message,
    refetch,
    isRefetching,
    sync,
    // Funções de filtro
    filterByTipo,
    filterByFinalidade,
    filterByBairro,
    findByReferencia,
    bairros
  };
};

