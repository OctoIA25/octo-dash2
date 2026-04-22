/**
 * 🔄 Serviço Global de Polling do Kenlo
 * Roda em background independente da página atual
 * Verifica novos leads a cada 30 segundos e salva automaticamente
 * 
 * LÓGICA SIMPLIFICADA:
 * 1. Busca TODOS os leads do Kenlo via HTTP
 * 2. Compara com os que já existem no banco (por external_id)
 * 3. Salva apenas os que NÃO existem ainda
 */

import { supabase } from '@/lib/supabaseClient';
import { saveKenloLeads, fetchKenloIntegration, updateKenloSyncData } from './kenloLeadsService';

const DEBUG_LOGS = import.meta.env?.VITE_DEBUG_LOGS === 'true';

const POLLING_INTERVAL = 30000; // 30 segundos

const POLLING_DISABLED = true;

declare global {
  interface Window {
    __kenlo_polling_interval_id__?: any;
  }
}

const clearGlobalKenloInterval = () => {
  try {
    if (typeof window !== 'undefined' && window.__kenlo_polling_interval_id__) {
      clearInterval(window.__kenlo_polling_interval_id__);
      window.__kenlo_polling_interval_id__ = undefined;
    }
  } catch {
    // ignore
  }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const retry = async <T>(fn: () => Promise<T>, attempts: number, baseDelayMs: number): Promise<T> => {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await sleep(baseDelayMs * Math.pow(2, i));
      }
    }
  }
  throw lastErr;
};

// Garantir que nenhum interval antigo (HMR) fique rodando
clearGlobalKenloInterval();

interface PollingState {
  isRunning: boolean;
  intervalId: NodeJS.Timeout | null;
  tenantId: string | null;
  token: string | null;
  email: string | null;
  password: string | null;
  isChecking: boolean;
  existingIds: Set<string> | null;
  lastDbSyncAt: number | null;
}

const state: PollingState = {
  isRunning: false,
  intervalId: null,
  tenantId: null,
  token: null,
  email: null,
  password: null,
  isChecking: false,
  existingIds: null,
  lastDbSyncAt: null
};

// Listeners para notificar componentes sobre novos leads
type LeadListener = (count: number) => void;
const listeners: Set<LeadListener> = new Set();

export const addLeadListener = (listener: LeadListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notifyListeners = (count: number) => {
  listeners.forEach(listener => listener(count));
};

const ALL_LEADS_URL = 'https://leads.ingaia.com.br/leads/ingaia/?page=1&perPage=50';
const DB_IDS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const DETAILS_MAX_LEADS = 50;

const ALL_LEADS_URL_FULL = 'https://leads.ingaia.com.br/leads/ingaia/?page=1&perPage=0';

const FULL_SYNC_TTL_MS = 10 * 60 * 1000; // 10 minutos
const lastFullSyncAtByTenant: Record<string, number | undefined> = {};

const loadExistingIds = async (tenantId: string, force = false): Promise<Set<string>> => {
  const now = Date.now();
  const cacheValid =
    !force &&
    state.existingIds &&
    state.lastDbSyncAt &&
    now - state.lastDbSyncAt < DB_IDS_CACHE_TTL_MS;

  if (cacheValid) {
    return state.existingIds as Set<string>;
  }

  if (DEBUG_LOGS) console.log('🗄️ [PollingService] Carregando IDs existentes do Supabase...');
  const { data: existingLeads, error } = await supabase
    .from('kenlo_leads')
    .select('external_id')
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('❌ [PollingService] Erro ao buscar IDs no banco:', error);
    return state.existingIds || new Set();
  }

  const set = new Set(existingLeads?.map(l => l.external_id).filter(Boolean) || []);
  state.existingIds = set;
  state.lastDbSyncAt = now;
  if (DEBUG_LOGS) console.log(`✅ [PollingService] IDs carregados do banco: ${set.size}`);
  return set;
};

const fetchAllKenloLeads = async (token: string): Promise<{ status: number; leads: any[] | null }> => {
  const response = await fetch(ALL_LEADS_URL, {
    method: 'GET',
    headers: { 'authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    return { status: response.status, leads: null };
  }

  const data = await response.json();
  const leads = (data?.data || data?.leads || data) as any;
  if (!Array.isArray(leads)) {
    return { status: response.status, leads: null };
  }
  return { status: response.status, leads };
};

const fetchAllKenloLeadsFull = async (token: string): Promise<{ status: number; leads: any[] | null }> => {
  const response = await fetch(ALL_LEADS_URL_FULL, {
    method: 'GET',
    headers: { 'authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    return { status: response.status, leads: null };
  }

  const data = await response.json();
  const leads = (data?.data || data?.leads || data) as any;
  if (!Array.isArray(leads)) {
    return { status: response.status, leads: null };
  }
  return { status: response.status, leads };
};

// Flag para evitar spam de erros CORS no console
let authFailedRecently = false;
let authFailedTimer: ReturnType<typeof setTimeout> | null = null;

// Autenticar com Kenlo
const authenticateWithKenlo = async (email: string, password: string): Promise<string | null> => {
  if (!email || !password) return null;

  // Se falhou recentemente (ex: CORS), não tentar de novo por 5 minutos
  if (authFailedRecently) {
    if (DEBUG_LOGS) console.log('[PollingService] Autenticação Kenlo em cooldown, pulando...');
    return null;
  }

  try {
    if (DEBUG_LOGS) console.log('[PollingService] Autenticando com Kenlo...');
    const authResponse = await fetch('https://puppeter.octoia.org/webhook/62b2a83e-8ce1-4486-a98b-cb089012ba5e', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha: password })
    });
    
    if (!authResponse.ok) {
      if (DEBUG_LOGS) console.warn('[PollingService] Erro ao autenticar:', authResponse.status);
      return null;
    }
    
    const authData = await authResponse.json();
    const rawData = Array.isArray(authData) ? authData[0] : authData;
    const token = rawData?.token || rawData?.access_token || rawData?.accessToken || rawData;
    
    if (token && typeof token === 'string') {
      if (DEBUG_LOGS) console.log('[PollingService] Token obtido com sucesso!');
      authFailedRecently = false;
      return token;
    }
    return null;
  } catch (error) {
    // CORS ou network error — entrar em cooldown para não ficar spammando
    authFailedRecently = true;
    if (authFailedTimer) clearTimeout(authFailedTimer);
    authFailedTimer = setTimeout(() => { authFailedRecently = false; }, 5 * 60 * 1000);
    if (DEBUG_LOGS) console.warn('[PollingService] Autenticação Kenlo falhou (CORS/rede), cooldown 5min.');
    return null;
  }
};

const loadAllExistingIds = async (tenantId: string): Promise<Set<string>> => {
  if (DEBUG_LOGS) console.log('🗄️ [KenloSync] Carregando TODOS os IDs existentes do Supabase...');
  const all: string[] = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('kenlo_leads')
      .select('external_id')
      .eq('tenant_id', tenantId)
      .range(from, to);

    if (error) {
      console.error('❌ [KenloSync] Erro ao buscar IDs no banco:', error);
      return new Set(all.filter(Boolean));
    }

    const batch = (data || []).map((r: any) => r.external_id).filter(Boolean);
    all.push(...batch);
    hasMore = (data?.length || 0) === pageSize;
    page++;
  }

  if (DEBUG_LOGS) console.log(`✅ [KenloSync] IDs carregados do banco: ${all.length}`);
  return new Set(all);
};

const fetchLeadDetailsWithLimit = async (leads: any[], token: string, maxConcurrency: number): Promise<any[]> => {
  const results: any[] = [];
  let index = 0;

  const worker = async () => {
    while (index < leads.length) {
      const current = leads[index++];
      const enriched = (await fetchLeadDetails([current], token))[0];
      results.push(enriched);
    }
  };

  const workers = Array.from({ length: Math.max(1, maxConcurrency) }, () => worker());
  await Promise.all(workers);
  return results;
};

export const syncKenloLeadsOnce = async (
  tenantId: string
): Promise<{ success: boolean; fetched: number; newFound: number; saved: number; error?: string }> => {
  if (!tenantId || tenantId === 'owner') {
    return { success: false, fetched: 0, newFound: 0, saved: 0, error: 'TenantId inválido' };
  }

  try {
    if (DEBUG_LOGS) console.log('🚀 [KenloSync] Iniciando sincronização manual para tenant:', tenantId);
    const { integration } = await fetchKenloIntegration(tenantId);
    if (!integration) {
      return { success: false, fetched: 0, newFound: 0, saved: 0, error: 'Integração Kenlo não configurada' };
    }

    const email = integration.kenlo_email;
    const password = integration.kenlo_password;
    let token = integration.auth_token as string | null;

    const canReauth = !!(email && password);
    if (integration.status !== 'active' && !canReauth) {
      return { success: false, fetched: 0, newFound: 0, saved: 0, error: 'Integração Kenlo não ativa' };
    }

    if (!token) {
      if (canReauth) {
        token = await retry(() => authenticateWithKenlo(email, password), 3, 800);
        if (token) {
          await updateKenloSyncData(tenantId, 0, token);
        }
      }
      if (!token) {
        return { success: false, fetched: 0, newFound: 0, saved: 0, error: 'Sem token Kenlo' };
      }
    }

    const now = Date.now();
    const lastFullSyncAt = lastFullSyncAtByTenant[tenantId];
    const shouldRunFullSync = !lastFullSyncAt || now - lastFullSyncAt > FULL_SYNC_TTL_MS;

    const fetchFn = shouldRunFullSync ? fetchAllKenloLeadsFull : fetchAllKenloLeads;
    let allLeadsResult = await retry(() => fetchFn(token as string), 2, 800);

    if (allLeadsResult.status === 401 || allLeadsResult.status === 403) {
      if (canReauth) {
        const newToken = await retry(() => authenticateWithKenlo(email, password), 3, 800);
        if (newToken) {
          await updateKenloSyncData(tenantId, 0, newToken);
          token = newToken;
          allLeadsResult = await retry(() => fetchFn(token as string), 2, 800);
        }
      }
    }

    if (!allLeadsResult.leads) {
      return {
        success: false,
        fetched: 0,
        newFound: 0,
        saved: 0,
        error: `Erro HTTP ao buscar leads: ${allLeadsResult.status}`
      };
    }

    const kenloLeads = allLeadsResult.leads;
    if (DEBUG_LOGS) {
    }

    if (shouldRunFullSync) {
      lastFullSyncAtByTenant[tenantId] = now;
    }

    if (kenloLeads.length === 0) {
      return { success: true, fetched: 0, newFound: 0, saved: 0 };
    }

    let newLeads: any[] = [];
    let existingIdsCountForStats = 0;

    if (shouldRunFullSync) {
      const existingIds = await loadAllExistingIds(tenantId);
      existingIdsCountForStats = existingIds.size;

      newLeads = kenloLeads.filter((lead: any) => {
        const id = lead?._id || lead?.id;
        return id && !existingIds.has(id);
      });
    } else {
      const sortedByTimestamp = [...kenloLeads].sort((a: any, b: any) => {
        const ta = a?.timestamp ? Date.parse(a.timestamp) : 0;
        const tb = b?.timestamp ? Date.parse(b.timestamp) : 0;
        return tb - ta;
      });

      const latest50 = sortedByTimestamp.slice(0, 50);
      const idsToCheck = latest50
        .map((lead: any) => lead?._id || lead?.id)
        .filter(Boolean);

      const { data: existingLeads, error } = await supabase
        .from('kenlo_leads')
        .select('external_id')
        .eq('tenant_id', tenantId)
        .in('external_id', idsToCheck);

      if (error) {
        return {
          success: false,
          fetched: latest50.length,
          newFound: 0,
          saved: 0,
          error: error.message
        };
      }

      const existingIds = new Set(existingLeads?.map((l: any) => l.external_id).filter(Boolean) || []);
      existingIdsCountForStats = existingIds.size;

      newLeads = latest50.filter((lead: any) => {
        const id = lead?._id || lead?.id;
        return id && !existingIds.has(id);
      });
    }

    if (DEBUG_LOGS) {
    }

    if (newLeads.length === 0) {
      return { success: true, fetched: kenloLeads.length, newFound: 0, saved: 0 };
    }

    const leadsWithDetails =
      newLeads.length > DETAILS_MAX_LEADS
        ? newLeads
        : await fetchLeadDetailsWithLimit(newLeads, token, 10);

    const saveResult = await saveKenloLeads(tenantId, leadsWithDetails);
    if (!saveResult.success) {
      return {
        success: false,
        fetched: kenloLeads.length,
        newFound: newLeads.length,
        saved: 0,
        error: saveResult.error || 'Erro ao salvar leads'
      };
    }

    await updateKenloSyncData(tenantId, existingIdsCountForStats + saveResult.count, token);

    return {
      success: true,
      fetched: kenloLeads.length,
      newFound: newLeads.length,
      saved: saveResult.count
    };
  } catch (error) {
    console.error('❌ [KenloSync] Erro:', error);
    return {
      success: false,
      fetched: 0,
      newFound: 0,
      saved: 0,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
};

// Verificar novos leads - SIMPLES
// 1. Busca token do Supabase
// 2. Busca os 50 últimos leads do Kenlo (1 request)
// 3. Compara com o banco por external_id
// 4. Salva apenas os que NÃO existem
const checkForNewLeads = async () => {
  if (!state.tenantId) {
    if (DEBUG_LOGS) console.log('⚠️ [PollingService] checkForNewLeads chamado sem tenantId');
    return;
  }

  if (state.isChecking) {
    if (DEBUG_LOGS) console.log('⏳ [PollingService] Checagem anterior ainda em execução, pulando este ciclo');
    return;
  }
  state.isChecking = true;
  
  try {
    const now = new Date().toLocaleTimeString('pt-BR');
    if (DEBUG_LOGS) console.log(`🔍 [PollingService] ${now} - Verificando leads para tenant: ${state.tenantId}`);
    
    // 1. Buscar integração do Supabase (token, email, senha)
    const { integration } = await fetchKenloIntegration(state.tenantId);
    
    if (!integration) {
      if (DEBUG_LOGS) console.log('⚠️ [PollingService] Integração não configurada');
      return;
    }
    
    let token = integration.auth_token;
    const email = integration.kenlo_email;
    const password = integration.kenlo_password;

    const canReauth = !!(email && password);
    if (integration.status !== 'active' && !canReauth) {
      if (DEBUG_LOGS) console.log('⚠️ [PollingService] Integração não ativa');
      return;
    }
    
    if (!token) {
      if (DEBUG_LOGS) console.log('⚠️ [PollingService] Sem token, tentando autenticar...');
      if (canReauth) {
        token = await retry(() => authenticateWithKenlo(email, password), 3, 800);
        if (token) {
          await updateKenloSyncData(state.tenantId, 0, token);
          if (DEBUG_LOGS) console.log('[PollingService] Token obtido e salvo!');
        } else {
          console.error('❌ [PollingService] Falha na autenticação');
          return;
        }
      } else {
        return;
      }
    }

    // 2. Buscar TODOS os leads do Kenlo (1 request)
    let allLeadsResult = await retry(() => fetchAllKenloLeads(token), 2, 800);

    // Token expirado - reautenticar e tentar novamente no mesmo ciclo
    if (allLeadsResult.status === 401 || allLeadsResult.status === 403) {
      if (DEBUG_LOGS) console.log('🔐 [PollingService] Token expirado, reautenticando e tentando novamente...');
      if (canReauth) {
        const newToken = await retry(() => authenticateWithKenlo(email, password), 3, 800);
        if (newToken) {
          await updateKenloSyncData(state.tenantId, 0, newToken);
          token = newToken;
          allLeadsResult = await retry(() => fetchAllKenloLeads(token), 2, 800);
        }
      }
    }

    if (!allLeadsResult.leads) {
      console.error('❌ [PollingService] Erro HTTP ao buscar leads:', allLeadsResult.status);
      return;
    }

    const kenloLeads = allLeadsResult.leads;
    if (kenloLeads.length === 0) {
      if (DEBUG_LOGS) console.log('ℹ️ [PollingService] Nenhum lead retornado');
      return;
    }

    // O HTTP pode vir desordenado. Então vamos considerar SEMPRE os 50 leads mais recentes.
    const sortedByTimestamp = [...kenloLeads].sort((a: any, b: any) => {
      const ta = a?.timestamp ? Date.parse(a.timestamp) : 0;
      const tb = b?.timestamp ? Date.parse(b.timestamp) : 0;
      return tb - ta;
    });

    const latest50 = sortedByTimestamp.slice(0, 50);
    const newest = latest50[0];
    if (DEBUG_LOGS) {
    }

    const idsToCheck = latest50
      .map((lead: any) => lead._id || lead.id)
      .filter(Boolean);

    if (DEBUG_LOGS) console.log(`📊 [PollingService] ${latest50.length} leads mais recentes do Kenlo (janela de 50)`);

    // 3. Buscar no Supabase somente os IDs desses 50 (não os 12k)
    const { data: existingLeads, error } = await supabase
      .from('kenlo_leads')
      .select('external_id')
      .eq('tenant_id', state.tenantId)
      .in('external_id', idsToCheck);

    if (error) {
      console.error('❌ [PollingService] Erro ao buscar IDs no banco:', error);
      return;
    }

    const existingIds = new Set(existingLeads?.map(l => l.external_id).filter(Boolean) || []);

    // 4. Filtrar os que NÃO existem no banco (apenas dentro desses 50)
    const newLeads = latest50.filter((lead: any) => {
      const leadId = lead._id || lead.id;
      return leadId && !existingIds.has(leadId);
    });
    
    if (newLeads.length === 0) {
      if (DEBUG_LOGS) console.log('✅ [PollingService] Nenhum lead novo');
      return;
    }
    
    if (DEBUG_LOGS) {
      const sample = newLeads.slice(0, 5);
      sample.forEach((lead: any) => {
      });
      if (newLeads.length > sample.length) {
      }
    }
    
    // 5. Buscar detalhes apenas para poucos leads (evita milhares de requests)
    const leadsToSave = newLeads.length > DETAILS_MAX_LEADS
      ? newLeads
      : await fetchLeadDetails(newLeads, token);

    if (newLeads.length > DETAILS_MAX_LEADS) {
      if (DEBUG_LOGS) console.log(`⚠️ [PollingService] Muitos leads novos (${newLeads.length}). Salvando sem detalhes neste ciclo.`);
    }

    const saveResult = await saveKenloLeads(state.tenantId, leadsToSave);
    
    if (saveResult.success) {
      if (DEBUG_LOGS) console.log(`✅ [PollingService] ${saveResult.count} leads SALVOS!`);
      // Atualizar cache de IDs para não reprocessar no próximo ciclo
      const ids = state.existingIds || new Set<string>();
      leadsToSave.forEach((lead: any) => {
        const leadId = lead._id || lead.id;
        if (leadId) ids.add(leadId);
      });
      state.existingIds = ids;
      notifyListeners(saveResult.count);
    }
    
  } catch (error) {
    console.error('❌ [PollingService] Erro:', error);
  } finally {
    state.isChecking = false;
  }
};

// Buscar detalhes dos leads
const fetchLeadDetails = async (leads: any[], token: string): Promise<any[]> => {
  if (DEBUG_LOGS) console.log(`🔍 [PollingService] Buscando detalhes de ${leads.length} leads...`);
  
  const detailPromises = leads.map(async (lead: any) => {
    const leadId = lead._id || lead.id;
    try {
      const detailResponse = await fetch(
        `https://leads.ingaia.com.br/leads/ingaia/${leadId}?fields=interest%2Cmessage%2CattendedBy`,
        { method: 'GET', headers: { 'authorization': `Bearer ${token}` } }
      );
      if (detailResponse.ok) {
        const detailData = await detailResponse.json();
        if (DEBUG_LOGS) {
        }
        return { ...lead, ...detailData };
      }
      if (DEBUG_LOGS) console.log(`⚠️ [PollingService] Sem detalhes para lead ${leadId}`);
      return lead;
    } catch (err) {
      if (DEBUG_LOGS) console.log(`❌ [PollingService] Erro ao buscar detalhes do lead ${leadId}:`, err);
      return lead;
    }
  });
  
  return Promise.all(detailPromises);
};

// Iniciar polling - SIMPLIFICADO
// Apenas configura o interval, a autenticação é feita dentro de checkForNewLeads
export const startPolling = async (tenantId: string) => {
  if (POLLING_DISABLED) {
    if (DEBUG_LOGS) console.log('🛑 [PollingService] Polling desativado por configuração');
    stopPolling();
    return;
  }
  if (state.isRunning && state.tenantId === tenantId) {
    if (DEBUG_LOGS) console.log('🔄 [PollingService] Já está rodando para este tenant');
    return;
  }
  
  // Parar polling anterior se existir
  if (state.intervalId) {
    clearInterval(state.intervalId);
  }
  
  // Configurar estado
  state.isRunning = true;
  state.tenantId = tenantId;
  
  if (DEBUG_LOGS) {
  }
  
  // Primeira verificação imediata
  await checkForNewLeads();
  
  // Polling a cada 30 segundos
  state.intervalId = setInterval(checkForNewLeads, POLLING_INTERVAL);
  try {
    if (typeof window !== 'undefined') {
      window.__kenlo_polling_interval_id__ = state.intervalId;
    }
  } catch {
    // ignore
  }
};

// Parar polling
export const stopPolling = () => {
  clearGlobalKenloInterval();
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  state.isRunning = false;
  state.token = null;
  state.tenantId = null;
  state.email = null;
  state.password = null;
  state.isChecking = false;
  state.existingIds = null;
  state.lastDbSyncAt = null;
};

// Status do polling
export const isPollingRunning = () => state.isRunning;
export const getPollingTenantId = () => state.tenantId;
