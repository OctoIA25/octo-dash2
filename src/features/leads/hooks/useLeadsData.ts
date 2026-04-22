/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * ⚠️ IMPORTANTE: Após QUALQUER alteração neste arquivo, executar:
 * 1. git add .
 * 2. git commit -m "tipo: descrição"
 * 3. git push
 * 
 * Repositório: https://github.com/OctoIA25/Octo-CRM
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { fetchSupabaseLeadsData, getSupabaseFallbackData, fetchAllSupabaseData } from '@/services/supabaseService';
import { getTeamsFromSupabase } from '@/features/corretores/services/teamService';
import { runSupabaseDiagnostic } from '@/services/supabaseDiagnostic';
import { leadsEventEmitter } from '@/lib/leadsEventEmitter';

interface LeadsDataResponse {
  leads: ProcessedLead[];
  isLoading: boolean;
  lastUpdate: Date | null;
  newLeadsCount: number;
  error: string | null;
  refetch: (immediate?: boolean) => Promise<void>;
  isRefetching: boolean;
  isBackgroundUpdate: boolean;
  getAllData: () => Promise<void>;
  isGettingAllData: boolean;
}

interface CacheEntry {
  data: ProcessedLead[];
  timestamp: number;
  expiresAt: number;
  tenantId: string;
}

// Cache em memória para dados do Supabase - aumentado para navegação mais rápida
const CACHE_DURATION = 120000; // 2 minutos (aumentado de 30 segundos)
let dataCache: CacheEntry | null = null;

const TEST_TENANT_ID = 'tenant-area-de-teste';

const getEffectiveTenantId = (): string | null => {
  try {
    const raw = localStorage.getItem('owner-impersonation');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tenantId?: string };
    return parsed?.tenantId || null;
  } catch {
    return null;
  }
};

const buildTestTenantLeads = (): ProcessedLead[] => {
  const base = new Date('2026-02-01T10:00:00.000Z');
  const iso = (d: Date) => d.toISOString().split('T')[0];
  const day = (n: number) => new Date(base.getTime() + n * 24 * 60 * 60 * 1000);

  const etapasInteressado = [
    'Novos Leads',
    'Interação',
    'Visita Agendada',
    'Visita Realizada',
    'Negociação',
    'Proposta Criada',
    'Proposta Enviada',
    'Proposta Assinada',
  ];

  const etapasProprietario = [
    'Novos Proprietários',
    'Em Atendimento',
    'Primeira Visita',
    'Criação do Estudo de Mercado',
    'Apresentação Do Estudo de Mercado',
    'Não Exclusivo',
    'Exclusivo',
    'Cadastro',
    'Plano de Marketing',
    'Propostas Respondidas',
    'Feitura de Contrato',
  ];

  const corretores = ['Ana Giglio', 'Felipe Martins', 'Mariana Mamede', 'André Coelho'];
  const origens = ['Site', 'WhatsApp', 'Google Ads', 'Indicação'];

  const leads: ProcessedLead[] = [];
  let id = 1;

  for (let i = 0; i < 36; i++) {
    const etapa = etapasInteressado[i % etapasInteressado.length];
    const isAssinada = etapa === 'Proposta Assinada';
    const valorImovel = 450000 + (i % 7) * 35000;
    leads.push({
      id_lead: id++,
      nome_lead: `Lead Teste ${String(i + 1).padStart(3, '0')}`,
      telefone: undefined,
      origem_lead: origens[i % origens.length],
      data_entrada: iso(day(i % 28)),
      status_temperatura: i % 5 === 0 ? 'Quente' : i % 3 === 0 ? 'Morno' : 'Frio',
      etapa_atual: etapa,
      codigo_imovel: `IMV-${1000 + i}`,
      valor_imovel: valorImovel,
      tipo_negocio: 'Venda',
      tipo_lead: 'Comprador',
      corretor_responsavel: corretores[i % corretores.length],
      data_finalizacao: isAssinada ? iso(day((i % 28) + 2)) : '',
      valor_final_venda: isAssinada ? valorImovel - 15000 : undefined,
      Data_visita: etapa === 'Visita Agendada' || etapa === 'Visita Realizada' ? iso(day((i % 28) + 1)) : '',
      link_imovel: '',
      Arquivamento: 'Não',
      motivo_arquivamento: '',
      observacoes: '',
      Preferencias_lead: '',
      Imovel_visitado: etapa === 'Visita Realizada' ? 'Sim' : 'Não',
      Conversa: '',
    });
  }

  for (let i = 0; i < 16; i++) {
    const etapa = etapasProprietario[i % etapasProprietario.length];
    const valorImovel = 650000 + (i % 6) * 60000;
    leads.push({
      id_lead: id++,
      nome_lead: `Proprietário Teste ${String(i + 1).padStart(3, '0')}`,
      telefone: undefined,
      origem_lead: i % 3 === 0 ? 'Captação' : 'Indicação',
      data_entrada: iso(day((i % 28) + 1)),
      status_temperatura: i % 6 === 0 ? 'Quente' : 'Morno',
      etapa_atual: etapa,
      codigo_imovel: `CAP-${2000 + i}`,
      valor_imovel: valorImovel,
      tipo_negocio: 'Venda',
      tipo_lead: 'Proprietário',
      corretor_responsavel: corretores[(i + 1) % corretores.length],
      data_finalizacao: '',
      valor_final_venda: undefined,
      Data_visita: etapa === 'Primeira Visita' ? iso(day((i % 28) + 2)) : '',
      link_imovel: '',
      Arquivamento: 'Não',
      motivo_arquivamento: '',
      observacoes: '',
      Preferencias_lead: '',
      Imovel_visitado: 'Não',
      Conversa: '',
    });
  }

  return leads;
};

// Integração exclusiva com Supabase PostgreSQL - sem webhooks

// Utility function para retry com backoff exponencial
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      const DEBUG_LOGS = import.meta.env?.VITE_DEBUG_LOGS === 'true';
      if (DEBUG_LOGS) console.log(` Tentativa ${attempt + 1} falhou, tentando novamente em ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
};

// Hook personalizado para gerenciar dados de leads
export const useLeadsData = (): LeadsDataResponse => {
  const [leads, setLeads] = useState<ProcessedLead[]>([]);
  const [isLoading, setIsLoading] = useState(true); // Iniciar como loading para primeira carga
  const [isRefetching, setIsRefetching] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [newLeadsCount, setNewLeadsCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Removido - usando useRef ao invés de useState para evitar re-renders
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [hasInitialData, setHasInitialData] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [isBackgroundUpdate, setIsBackgroundUpdate] = useState(false);
  const [isGettingAllData, setIsGettingAllData] = useState(false);

  const DEBUG_LOGS = import.meta.env?.VITE_DEBUG_LOGS === 'true';

  // Função para verificar cache
  const getCachedData = (tenantId: string): ProcessedLead[] | null => {
    if (!dataCache) return null;
    
    const now = Date.now();
    if (now > dataCache.expiresAt) {
      dataCache = null;
      return null;
    }

    if (dataCache.tenantId !== tenantId) {
      return null;
    }
    
    if (DEBUG_LOGS) console.log(' Usando dados do cache');
    return dataCache.data;
  };

  // Função para salvar no cache
  const setCachedData = (data: ProcessedLead[], tenantId: string) => {
    const now = Date.now();
    dataCache = {
      data,
      timestamp: now,
      expiresAt: now + CACHE_DURATION,
      tenantId
    };
  };

  // Usar useRef para valores que não devem causar re-render
  const previousLeadsCountRef = useRef(0);

  // Função para buscar dados do Supabase - Conexão direta com o banco
  const fetchLeadsData = useCallback(async (isManualRefetch: boolean = false, isAutomatic: boolean = false) => {
    // Cancelar requisição anterior se existir
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const effectiveTenantId = getEffectiveTenantId();

    if (effectiveTenantId === TEST_TENANT_ID) {
      const testLeads = buildTestTenantLeads();
      setLeads(testLeads);
      setIsLoading(false);
      setIsRefetching(false);
      setIsBackgroundUpdate(false);
      setHasInitialData(true);
      setIsFirstLoad(false);
      setError(null);
      setLastUpdate(new Date());
      previousLeadsCountRef.current = testLeads.length;
      return;
    }

    // Verificar cache primeiro (exceto para refetch manual)
    if (!isManualRefetch) {
      const tenantKey = effectiveTenantId || 'default';
      const cachedData = getCachedData(tenantKey);
      if (cachedData) {
        // Atualização INSTANTÂNEA sem qualquer loading
        setLeads(cachedData);
        setIsLoading(false);
        setIsRefetching(false);
        setIsBackgroundUpdate(false);
        setHasInitialData(true);
        setIsFirstLoad(false);
        if (DEBUG_LOGS) console.log(' Dados carregados instantaneamente do cache');
        return;
      }
    }

    try {
      setError(null);
      
      // Sistema de loading otimizado
      if (isAutomatic) {
        // Atualizações automáticas silenciosas
        if (DEBUG_LOGS) console.log(' Atualização silenciosa em background...');
        setIsBackgroundUpdate(true);
      } else if (isManualRefetch) {
        // Refresh manual - indicador visual suave
        setIsRefetching(true);
        setIsBackgroundUpdate(false);
        if (DEBUG_LOGS) console.log(' Refresh manual solicitado...');
      } else if (leads.length === 0 && isFirstLoad) {
        // Primeira carga - loading suave
        setIsLoading(true);
        setIsBackgroundUpdate(false);
        if (DEBUG_LOGS) console.log(' Carregamento inicial otimizado...');
      } else {
        // Atualizações subsequentes - sem loading visual
        setIsBackgroundUpdate(true);
        if (DEBUG_LOGS) console.log(' Atualização harmônica...');
      }
      
      abortControllerRef.current = new AbortController();
      
      // Usar retry com backoff exponencial
      const processedLeads = await retryWithBackoff(async () => {
        return await fetchSupabaseLeadsData();
      }, 3, 1000);
      
      // Salvar no cache
      setCachedData(processedLeads, effectiveTenantId || 'default');
      
      // Detectar novos leads apenas para atualizações automáticas
      const currentCount = processedLeads.length;
      if (isAutomatic && previousLeadsCountRef.current > 0 && currentCount > previousLeadsCountRef.current) {
        const newCount = currentCount - previousLeadsCountRef.current;
        setNewLeadsCount(newCount);
        if (DEBUG_LOGS) console.log(` ${newCount} novos leads detectados em background!`);
        
        // Limpar contador de novos leads após 8 segundos para dar tempo de visualizar
        setTimeout(() => setNewLeadsCount(0), 8000);
      }
      
      previousLeadsCountRef.current = currentCount;
      
      // CRÍTICO: Atualização harmônica APENAS do estado React - NUNCA recarregar página
      // Usar requestAnimationFrame para atualização suave
      requestAnimationFrame(() => {
        if (JSON.stringify(leads) !== JSON.stringify(processedLeads)) {
          setLeads(processedLeads);
          
          // Extrair equipes automaticamente dos dados do Supabase
          getTeamsFromSupabase(processedLeads).then(teams => {
            if (DEBUG_LOGS) console.log(' Equipes extraídas dos dados do Supabase:', teams);
          }).catch(error => {
            console.error('Erro ao extrair equipes:', error);
          });
          if (DEBUG_LOGS) console.log(' Estado React atualizado harmonicamente');
        }
        setLastUpdate(new Date());
      });
      
      // Marcar que temos dados iniciais
      if (!hasInitialData) {
        setHasInitialData(true);
      }
      
      // Marcar que primeira carga foi concluída
      if (isFirstLoad) {
        setIsFirstLoad(false);
      }
      
      const updateType = isAutomatic ? 'background' : isManualRefetch ? 'manual' : 'inicial';
      if (DEBUG_LOGS) console.log(` Dados atualizados (${updateType}): ${processedLeads.length} leads`);
      
    } catch (err) {
      // Ignorar erros de cancelamento
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      
      console.error(' Erro ao buscar dados do Supabase:', err);
      
      // CRÍTICO: Em atualizações automáticas, NUNCA mostrar erro que possa causar reload
      if (isAutomatic) {
        if (DEBUG_LOGS) console.warn(' Erro em auto-update - mantendo dados atuais silenciosamente');
        return; // Manter dados atuais, não fazer nada disruptivo
      }
      
      // Apenas para carregamento inicial ou refresh manual usar fallback
      try {
        if (DEBUG_LOGS) console.log(' Tentando usar dados de fallback...');
        const fallbackLeads = getSupabaseFallbackData();
        setLeads(fallbackLeads);
        setLastUpdate(new Date());
        setError(`Supabase temporariamente indisponível. Usando dados de fallback. Erro: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
      } catch (fallbackErr) {
        console.error(' Erro também nos dados de fallback:', fallbackErr);
        setError(`Erro no Supabase e fallback: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
      }
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
      // Resetar flag de background update após um tempo para animar transições
      if (isBackgroundUpdate) {
        setTimeout(() => {
          setIsBackgroundUpdate(false);
        }, 1000);
      }
      abortControllerRef.current = null;
    }
  }, []); // Remover todas as dependências para evitar loops

  // Função para refetch manual
  const refetch = useCallback(async (immediate: boolean = false) => {
    // Se immediate = true, fazer refetch instantâneo e limpar cache
    if (immediate) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      // Limpar cache para forçar busca no Supabase
      dataCache = null;
      await fetchLeadsData(true);
      return;
    }
    
    // Caso contrário, usar debounce para evitar múltiplas chamadas
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchLeadsData(true);
    }, 300);
  }, [fetchLeadsData]);

  // Função para buscar TODOS os dados do banco (get all completo)
  const getAllData = useCallback(async () => {
    if (isGettingAllData) return;

    try {
      setIsGettingAllData(true);
      setError(null);

      if (DEBUG_LOGS) console.log(' Iniciando GET ALL completo do Supabase...');

      // Buscar todos os dados do banco
      const allData = await fetchAllSupabaseData();

      if (DEBUG_LOGS) console.log(' GET ALL concluído:', {
        leads: allData.leads.length,
        teams: allData.teams.length,
        tables: allData.tables.length,
        totalRecords: allData.totalRecords,
        timestamp: allData.timestamp
      });

      // Atualizar estado com os novos dados
      requestAnimationFrame(() => {
        setLeads(allData.leads);
        setLastUpdate(allData.timestamp);
        previousLeadsCountRef.current = allData.leads.length;

        // Limpar cache antigo
        dataCache = null;

        // Notificar sucesso
        if (DEBUG_LOGS) console.log(' Todos os dados do banco foram atualizados com sucesso!');
        if (DEBUG_LOGS) console.log(` ${allData.leads.length} leads carregados de ${allData.totalRecords} registros totais`);
      });

    } catch (err) {
      console.error(' Erro no GET ALL:', err);
      setError(`Erro ao buscar todos os dados: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    } finally {
      setIsGettingAllData(false);
    }
  }, [isGettingAllData]);

  // Buscar dados na inicialização - APENAS SUPABASE VIA API KEY - OTIMIZADO
  useEffect(() => {
    if (DEBUG_LOGS) console.log(' Inicializando dados do Supabase...');
    if (DEBUG_LOGS) console.log(' Conectando diretamente ao banco PostgreSQL via API KEY');
    
    const initializeData = async () => {
      try {
        // OTIMIZAÇÃO: Remover diagnóstico pesado na primeira carga
        // Diagnóstico pode ser executado manualmente se necessário
        if (DEBUG_LOGS) console.log(' Carregando dados do Supabase...');
        await fetchLeadsData(false, false); // Não é manual, não é automático - é inicialização
        if (DEBUG_LOGS) console.log(' Inicialização via Supabase bem-sucedida!');
      } catch (error) {
        console.error(' Erro na inicialização do Supabase:', error);
        if (DEBUG_LOGS) console.warn(' Tentando dados de fallback...');
        
        // Em caso de erro, usar dados de fallback
        try {
          if (DEBUG_LOGS) console.log(' Carregando dados de fallback...');
          const fallbackLeads = getSupabaseFallbackData();
          setLeads(fallbackLeads);
          setLastUpdate(new Date());
          setHasInitialData(true);
          setIsFirstLoad(false);
          setError('Usando dados de demonstração. Supabase temporariamente indisponível.');
          if (DEBUG_LOGS) console.log(` Fallback carregado: ${fallbackLeads.length} leads`);
        } catch (fallbackErr) {
          console.error(' Erro fatal no fallback:', fallbackErr);
          setError('Erro crítico ao carregar dados.');
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    initializeData();
  }, []); // Remover dependência do fetchLeadsData para evitar loops

  // Sincronização com Kanban — re-fetch imediato quando um card é movido
  useEffect(() => {
    const unsubscribe = leadsEventEmitter.subscribe(() => {
      if (DEBUG_LOGS) console.log('🔔 [useLeadsData] Evento de atualização recebido — refetch');
      dataCache = null;
      fetchLeadsData(true);
    });
    return unsubscribe;
  }, [fetchLeadsData]);

  // Atualização automática harmônica a cada 60 segundos - APENAS DADOS, SEM RELOAD
  useEffect(() => {
    let interval: NodeJS.Timeout;

    // Garantir que apenas dados sejam atualizados, NUNCA a página
    const autoUpdate = async () => {
      try {
        const timestamp = new Date().toLocaleTimeString();
        const dateStamp = new Date().toLocaleDateString();
        if (DEBUG_LOGS) console.log(`🔄 [${dateStamp} ${timestamp}] 🗄️ Auto-update iniciado...`);
        if (DEBUG_LOGS) console.log(`📊 Estado atual: ${leads.length} leads na memória`);
        
        await fetchLeadsData(false, true); // isManualRefetch=false, isAutomatic=true
        if (DEBUG_LOGS) console.log(`✅ [${dateStamp} ${timestamp}] 🗄️ Auto-update concluído com sucesso!`);
        if (DEBUG_LOGS) console.log(`⏰ Próxima atualização em: 1 minuto (60 segundos)`);
      } catch (error) {
        if (DEBUG_LOGS) console.warn('⚠️ Auto-update Supabase falhou:', error);
        if (DEBUG_LOGS) console.log('🔄 Tentativa automática na próxima execução (1 minuto)');
        // NUNCA recarregar página em caso de erro
      }
    };

    // Agendar atualizações automáticas apenas depois da primeira carga
    if (hasInitialData) {
      if (DEBUG_LOGS) console.log('⏰ Iniciando sistema de auto-update...');
      if (DEBUG_LOGS) console.log(`📊 Dados iniciais: ${leads.length} leads`);
      
      // Primeira execução em 10 segundos para dar tempo de carregar
      setTimeout(() => {
        if (DEBUG_LOGS) console.log('🚀 Primeira execução do auto-update Supabase...');
        autoUpdate();
      }, 10000);
      
      // ⏰ ATUALIZAÇÃO AUTOMÁTICA: A CADA 1 MINUTO (60 SEGUNDOS)
      interval = setInterval(autoUpdate, 60000); // 60 segundos = 1 minuto exato
      if (DEBUG_LOGS) console.log('⏰ 🗄️ Auto-update do Supabase configurado: CADA 1 MINUTO (60s)');
      if (DEBUG_LOGS) console.log('📊 Dados serão atualizados automaticamente do PostgreSQL');
    } else {
      if (DEBUG_LOGS) console.log('⏰ Auto-update aguardando dados iniciais...');
    }

    // Função de limpeza para quando o componente for desmontado
    return () => {
      if (interval) {
        clearInterval(interval);
        if (DEBUG_LOGS) console.log('🛑 Auto-update cancelado');
      }
      // Limpar debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      // Cancelar requisições pendentes
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [hasInitialData]); // Remover fetchLeadsData das dependências para evitar loops

  return {
    leads,
    isLoading,
    lastUpdate,
    newLeadsCount,
    error,
    refetch,
    isRefetching,
    isBackgroundUpdate, // Usar o estado real para animar transições durante atualizações
    getAllData,
    isGettingAllData
  };
};
