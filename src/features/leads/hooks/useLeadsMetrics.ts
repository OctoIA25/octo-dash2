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
// `useAuthContext`, não o `useAuth` legado. O CLAUDE.md do projeto já manda
// isso ("não use `useAuth()` diretamente"), e a razão aparece no navegador:
// o `useAuth` tem estado PRÓPRIO, semeado por um cache em localStorage. Logo
// depois do login esse cache ainda não existe, então o hook monta sem
// `tenantId`, a busca de leads cai no early-return e NUNCA é refeita — a tela
// Início mostrava "0 leads" e "Sem dados" em todo login, até o usuário
// recarregar a página. Verificado no navegador em 18/09/2026: 0 → 24 leads
// depois do reload.
import { useAuthContext } from '@/contexts/AuthContext';
import { 
  fetchLeadsForMetrics, 
  crmLeadsToProcessedLeads,
  calculateFunnelMetrics,
  calculateLeadsMetrics,
  FunnelMetrics,
  LeadsMetrics
} from '../services/leadsMetricsService';
import { useOrigemRegistry } from '@/features/relatorios/hooks/useOrigemRegistry';
import { 
  CRMLead, 
  LeadType, 
  LEAD_TYPE_INTERESSADO, 
  LEAD_TYPE_PROPRIETARIO 
} from '../services/leadsService';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { leadsEventEmitter } from '@/lib/leadsEventEmitter';
import { isOwnerEmail } from '@/lib/ownerEmails';

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

export function useLeadsMetrics(options: UseLeadsMetricsOptions = {}): UseLeadsMetricsReturn {
  const { leadType = null, autoRefresh = false, refreshInterval = 60000 } = options;
  
  const { 
    user, 
    tenantId, 
    isOwner, 
    isAdmin: authIsAdmin,
    isGestao
  } = useAuthContext();

  // Verificação direta se é owner pelo email (fallback para race conditions)
  const isOwnerByEmail = isOwnerEmail(user?.email);
  
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
  const realIsAdmin = effectiveIsOwner || authIsAdmin || isGestao;

  // "Visualizar como" não precisa de recorte aqui: a sessão já é a do usuário
  // visualizado, então `user` E a RLS já são os dele (ver ViewAsContext).
  const isAdmin = realIsAdmin;
  const scopeUserId = user?.id;

  
  // States
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Coalesce de buscas concorrentes: um único move no kanban dispara o
  // leadsEventEmitter E um refetch() explícito. Sem isto, a base inteira de
  // leads (+ todas as páginas de kenlo_leads) era recarregada duas vezes por
  // move, dobrando a latência percebida.
  const inFlightFetchRef = useRef<Promise<void> | null>(null);

  // Fetch leads based on role
  const fetchLeads = useCallback(async (): Promise<void> => {
    // Se já existe uma busca em andamento, reaproveita a mesma promise em vez
    // de disparar outra requisição idêntica.
    if (inFlightFetchRef.current) {
      return inFlightFetchRef.current;
    }

    // Resolve o tenant efetivo. `tenantId === 'owner'` é o estado transitório do
    // owner logo após entrar num tenant: o AuthContext ainda não reprocessou a
    // impersonation, mas o localStorage já a tem (gravada antes do reload). Tratar
    // 'owner' como "ainda não resolvido" e cair no localStorage evita disparar a
    // query com tenant_id=eq.owner (dado errado no 1º paint) — mesmo comportamento
    // de resolveTenantId, que já prioriza a impersonation.
    let effectiveTenantId = tenantId && tenantId !== 'owner' ? tenantId : null;
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

    // Owner sem impersonação ativa não tem tenant de leads: não busca.
    if (!effectiveTenantId || effectiveTenantId === 'owner') {
      console.warn('⚠️ useLeadsMetrics: tenantId não disponível');
      setIsLoading(false);
      return;
    }

    const run = (async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Admin vê todos, corretor vê só os próprios
        const agentId = isAdmin ? null : scopeUserId || null;

        const data = await fetchLeadsForMetrics(effectiveTenantId, agentId, leadType);

        setLeads(data);
      } catch (err) {
        console.error('❌ useLeadsMetrics: Erro ao buscar leads:', err);
        setError(err instanceof Error ? err.message : 'Erro ao carregar métricas');
      } finally {
        setIsLoading(false);
      }
    })();

    inFlightFetchRef.current = run;
    try {
      await run;
    } finally {
      inFlightFetchRef.current = null;
    }
  }, [tenantId, isAdmin, scopeUserId, leadType]);

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

  // Cadastro de origem do tenant (P0.4). Entra aqui também, e não só nos
  // Relatórios, para a mesma origem não aparecer com dois nomes em duas telas.
  const { resolver: resolverOrigemCadastrada } = useOrigemRegistry();

  // Convert to ProcessedLead for legacy components
  const processedLeads = useMemo(() => {
    return crmLeadsToProcessedLeads(leads, resolverOrigemCadastrada);
  }, [leads, resolverOrigemCadastrada]);

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
