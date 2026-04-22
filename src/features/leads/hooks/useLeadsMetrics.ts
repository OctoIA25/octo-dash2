/**
 * 🎯 HOOK DE MÉTRICAS DE LEADS (Multi-tenant + Role-based)
 * 
 * Este hook fornece métricas de leads baseadas no papel do usuário:
 * - Admin/Owner: métricas consolidadas de todo o tenant
 * - Corretor: métricas apenas dos próprios leads
 * 
 * Fonte de dados: public.leads (mesma tabela do Kanban)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { 
  fetchLeadsForMetrics, 
  crmLeadsToProcessedLeads,
  calculateFunnelMetrics,
  calculateLeadsMetrics,
  FunnelMetrics,
  LeadsMetrics
} from '../services/leadsMetricsService';
import { 
  CRMLead, 
  LeadType, 
  LEAD_TYPE_INTERESSADO, 
  LEAD_TYPE_PROPRIETARIO 
} from '../services/leadsService';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { leadsEventEmitter } from '@/lib/leadsEventEmitter';

interface UseLeadsMetricsOptions {
  leadType?: LeadType | null;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseLeadsMetricsReturn {
  leads: CRMLead[];
  processedLeads: ProcessedLead[];
  funnelMetricsInteressado: FunnelMetrics | null;
  funnelMetricsProprietario: FunnelMetrics | null;
  generalMetrics: LeadsMetrics | null;
  isLoading: boolean;
  error: string | null;
  isAdmin: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook principal para métricas de leads com suporte a role
 */
// Email do owner para verificação direta
const OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';

export function useLeadsMetrics(options: UseLeadsMetricsOptions = {}): UseLeadsMetricsReturn {
  const { leadType = null, autoRefresh = false, refreshInterval = 60000 } = options;
  
  const { 
    user, 
    tenantId, 
    isOwner, 
    isAdmin: authIsAdmin,
    isGestao
  } = useAuth();

  // Verificação direta se é owner pelo email (fallback para race conditions)
  const isOwnerByEmail = user?.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
  
  // Verificação se tem owner-impersonation no localStorage (owner acessando imobiliária)
  const isOwnerImpersonating = (() => {
    try {
      const impersonation = localStorage.getItem('owner-impersonation');
      return !!impersonation;
    } catch {
      return false;
    }
  })();

  // Admin = owner (por flag, email ou impersonation), admin ou gestão
  const effectiveIsOwner = isOwner || isOwnerByEmail || isOwnerImpersonating;
  const isAdmin = effectiveIsOwner || authIsAdmin || isGestao;
  
  
  // States
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch leads based on role
  const fetchLeads = useCallback(async () => {
    // Fallback para localStorage se tenantId não estiver disponível via useAuth
    let effectiveTenantId = tenantId;
    if (!effectiveTenantId) {
      try {
        const impersonation = localStorage.getItem('owner-impersonation');
        if (impersonation) {
          const parsed = JSON.parse(impersonation);
          effectiveTenantId = parsed.tenantId;
        }
      } catch (e) {
        // Ignorar erros de parse
      }
    }
    
    if (!effectiveTenantId) {
      console.warn('⚠️ useLeadsMetrics: tenantId não disponível');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Admin vê todos, corretor vê só os próprios
      const agentId = isAdmin ? null : user?.id || null;
      
      
      const data = await fetchLeadsForMetrics(effectiveTenantId, agentId, leadType);
      
      setLeads(data);
    } catch (err) {
      console.error('❌ useLeadsMetrics: Erro ao buscar leads:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar métricas');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, isAdmin, user?.id, leadType]);

  // Initial fetch - também re-executa quando tenantId ou isAdmin muda
  // Importante: isAdmin pode mudar de false para true quando o auth state carrega completamente
  useEffect(() => {
    // Sempre tenta buscar - o fallback para localStorage está no fetchLeads
    const hasLocalStorageTenant = (() => {
      try {
        const impersonation = localStorage.getItem('owner-impersonation');
        if (impersonation) {
          const parsed = JSON.parse(impersonation);
          return !!parsed.tenantId;
        }
      } catch (e) {}
      return false;
    })();
    
    if (tenantId || hasLocalStorageTenant) {
      fetchLeads();
    }
  }, [tenantId, isAdmin, fetchLeads]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(fetchLeads, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchLeads]);

  // 🔔 Escutar eventos de atualização de leads (sincronização entre componentes)
  // Quando um lead é atualizado no Kanban, todos os funis são notificados
  const lastFetchRef = useRef<number>(0);
  useEffect(() => {
    const unsubscribe = leadsEventEmitter.subscribe(() => {
      // Debounce: evitar múltiplos refetch em sequência (mínimo 300ms entre cada)
      const now = Date.now();
      if (now - lastFetchRef.current < 300) {
        return;
      }
      lastFetchRef.current = now;
      fetchLeads();
    });

    return unsubscribe;
  }, [fetchLeads]);

  // Convert to ProcessedLead for legacy components
  const processedLeads = useMemo(() => {
    return crmLeadsToProcessedLeads(leads);
  }, [leads]);

  // Calculate funnel metrics for Interessado
  // NOTA: Se lead_type não existe no banco, todos os leads são tratados como Interessado
  const funnelMetricsInteressado = useMemo(() => {
    if (leadType && leadType !== LEAD_TYPE_INTERESSADO) return null;
    
    // Se leadType específico foi passado, usar todos os leads
    // Caso contrário, filtrar por lead_type OU considerar leads sem lead_type como Interessado
    const interessadoLeads = leadType === LEAD_TYPE_INTERESSADO 
      ? leads 
      : leads.filter(l => l.lead_type === LEAD_TYPE_INTERESSADO || l.lead_type === undefined || l.lead_type === null);
    
    return calculateFunnelMetrics(interessadoLeads, LEAD_TYPE_INTERESSADO, isAdmin);
  }, [leads, leadType, isAdmin]);

  // Calculate funnel metrics for Proprietário
  const funnelMetricsProprietario = useMemo(() => {
    if (leadType && leadType !== LEAD_TYPE_PROPRIETARIO) return null;
    
    // Apenas leads explicitamente marcados como Proprietário
    const proprietarioLeads = leadType === LEAD_TYPE_PROPRIETARIO 
      ? leads 
      : leads.filter(l => l.lead_type === LEAD_TYPE_PROPRIETARIO);
    
    return calculateFunnelMetrics(proprietarioLeads, LEAD_TYPE_PROPRIETARIO, isAdmin);
  }, [leads, leadType, isAdmin]);

  // Calculate general metrics
  const generalMetrics = useMemo(() => {
    return calculateLeadsMetrics(leads, leadType || 'all', isAdmin);
  }, [leads, leadType, isAdmin]);

  return {
    leads,
    processedLeads,
    funnelMetricsInteressado,
    funnelMetricsProprietario,
    generalMetrics,
    isLoading,
    error,
    isAdmin,
    refetch: fetchLeads
  };
}

/**
 * Hook simplificado para métricas de Interessados
 */
export function useInteressadoMetrics() {
  return useLeadsMetrics({ leadType: LEAD_TYPE_INTERESSADO });
}

/**
 * Hook simplificado para métricas de Proprietários
 */
export function useProprietarioMetrics() {
  return useLeadsMetrics({ leadType: LEAD_TYPE_PROPRIETARIO });
}

/**
 * Hook para métricas gerais (todos os tipos)
 */
export function useAllLeadsMetrics() {
  return useLeadsMetrics({ leadType: null });
}

export default useLeadsMetrics;
