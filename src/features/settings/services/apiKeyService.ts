/**
 * 🔑 API Key Service
 * Gerenciamento de API Keys por imobiliária (multi-tenant)
 * 
 * Tabelas Supabase:
 * - tenant_api_keys: Armazena API keys exclusivas por tenant (provider='crm' para API pública)
 * - api_event_logs: Registra todos os eventos da API
 */

import { supabase } from '@/integrations/supabase/client';

export interface ApiKey {
  id: string;
  tenant_id: string;
  api_key: string;
  status: 'active' | 'revoked';
  created_at: string;
  updated_at: string;
  revoked_at?: string;
}

export interface ApiEventLog {
  id: string;
  tenant_id: string | null;
  event_type: string;
  description: string | null;
  metadata: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/**
 * Gera uma API Key segura no formato: octo_sk_xxxxxxxxxxxxxxxxxxxx
 */
function generateSecureApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `octo_sk_${key}`;
}

/**
 * Busca a API Key ativa de um tenant
 */
export async function fetchApiKey(tenantId: string): Promise<{ apiKey: ApiKey | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('tenant_api_keys')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', 'crm')
      .eq('status', 'active')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Erro ao buscar API Key:', error);
      return { apiKey: null, error: error.message };
    }

    return { apiKey: data as ApiKey | null, error: null };
  } catch (err) {
    console.error('❌ Erro ao buscar API Key:', err);
    return { apiKey: null, error: 'Erro ao buscar API Key' };
  }
}

/**
 * Gera uma nova API Key para o tenant
 * Se já existir uma ativa, revoga a anterior
 */
export async function generateApiKey(tenantId: string): Promise<{ apiKey: ApiKey | null; error: string | null }> {
  try {
    // Usar RPC com SECURITY DEFINER para bypasear RLS
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('generate_crm_api_key', { p_tenant_id: tenantId });

    if (rpcError) {
      console.error('❌ Erro ao gerar API Key (RPC):', rpcError);
      return { apiKey: null, error: rpcError.message };
    }

    if (rpcResult?.error) {
      console.error('❌ Erro ao gerar API Key:', rpcResult.error);
      return { apiKey: null, error: rpcResult.error };
    }

    const data = rpcResult?.data;

    if (!data) {
      return { apiKey: null, error: 'Nenhum dado retornado pela RPC' };
    }

    // Log de criação
    await logApiEvent(tenantId, 'API_KEY_CREATED', 'Nova API Key gerada com sucesso', {
      key_id: data.id
    });

    return { apiKey: data as ApiKey, error: null };
  } catch (err) {
    console.error('❌ Erro ao gerar API Key:', err);
    return { apiKey: null, error: 'Erro ao gerar API Key' };
  }
}

/**
 * Revoga uma API Key específica
 */
export async function revokeApiKey(tenantId: string, keyId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('tenant_api_keys')
      .update({ 
        status: 'revoked', 
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', keyId)
      .eq('tenant_id', tenantId)
      .eq('provider', 'crm');

    if (error) {
      console.error('❌ Erro ao revogar API Key:', error);
      return { success: false, error: error.message };
    }

    // Log de revogação manual
    await logApiEvent(tenantId, 'API_KEY_REVOKED', 'API Key revogada manualmente pelo usuário', {
      key_id: keyId
    });

    return { success: true, error: null };
  } catch (err) {
    console.error('❌ Erro ao revogar API Key:', err);
    return { success: false, error: 'Erro ao revogar API Key' };
  }
}

/**
 * Registra um evento de log na API
 */
export async function logApiEvent(
  tenantId: string | null,
  eventType: string,
  description: string,
  metadata?: Record<string, any>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    await supabase
      .from('api_event_logs')
      .insert({
        tenant_id: tenantId,
        event_type: eventType,
        description,
        metadata: metadata || null,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        created_at: new Date().toISOString()
      });
    
  } catch (err) {
    console.error('❌ Erro ao registrar log:', err);
  }
}

/**
 * Busca os logs de eventos da API para um tenant
 */
export async function fetchApiLogs(
  tenantId: string, 
  limit: number = 50
): Promise<{ logs: ApiEventLog[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('api_event_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('❌ Erro ao buscar logs:', error);
      return { logs: [], error: error.message };
    }

    return { logs: data as ApiEventLog[], error: null };
  } catch (err) {
    console.error('❌ Erro ao buscar logs:', err);
    return { logs: [], error: 'Erro ao buscar logs' };
  }
}

/**
 * Constantes da API - Etapas do Funil e Temperaturas
 */
export const API_CONSTANTS = {
  // Etapas do Funil de Vendas
  FUNNEL_STAGES: [
    'Novos Leads',
    'Em Atendimento',
    'Interação',
    'Visita Agendada',
    'Visita Realizada',
    'Negociação',
    'Proposta Criada',
    'Proposta Enviada',
    'Proposta Assinada',
    'Arquivado'
  ] as const,
  
  // Temperaturas do Lead
  TEMPERATURES: ['Frio', 'Morno', 'Quente'] as const,
  
  // Origens padrão
  SOURCES: [
    'Manual',
    'Site',
    'Facebook',
    'Instagram',
    'Google Ads',
    'WhatsApp',
    'Indicação',
    'Portal Imobiliário',
    'Kenlo',
    'API'
  ] as const,
  
  // URL base da API
  API_BASE_URL: 'https://octodash.octoia.org/api',
  
  // Versão atual da API
  API_VERSION: 'v1'
};

export type FunnelStage = typeof API_CONSTANTS.FUNNEL_STAGES[number];
export type Temperature = typeof API_CONSTANTS.TEMPERATURES[number];
export type LeadSource = typeof API_CONSTANTS.SOURCES[number];
