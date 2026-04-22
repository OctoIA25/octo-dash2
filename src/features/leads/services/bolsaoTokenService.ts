/**
 * Serviço para gerenciar tokens de conexão do Bolsão por imobiliária
 */

import { supabase } from '@/lib/supabaseClient';

export interface BolsaoToken {
  id: number;
  tenant_id: string;
  email: string;
  token: string;
  webhook_url: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  is_active: boolean;
}

/**
 * Salva ou atualiza o token do Bolsão para um tenant
 */
export async function saveBolsaoToken(
  tenantId: string,
  email: string,
  token: string,
  webhookUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Desativar tokens anteriores do mesmo tenant
    await supabase
      .from('bolsao_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    // Inserir novo token ativo
    const { error } = await supabase
      .from('bolsao_tokens')
      .insert({
        tenant_id: tenantId,
        email,
        token,
        webhook_url: webhookUrl,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('❌ Erro ao salvar token do Bolsão:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Erro ao salvar token do Bolsão:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Busca o token ativo do Bolsão para um tenant
 */
export async function getActiveBolsaoToken(
  tenantId: string
): Promise<BolsaoToken | null> {
  try {
    const { data, error } = await supabase
      .from('bolsao_tokens')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        // Nenhum registro encontrado
        return null;
      }
      console.error('❌ Erro ao buscar token do Bolsão:', error);
      return null;
    }

    return data as BolsaoToken;
  } catch (error) {
    console.error('❌ Erro ao buscar token do Bolsão:', error);
    return null;
  }
}

/**
 * Desativa o token do Bolsão para um tenant (desconectar)
 */
export async function deactivateBolsaoToken(
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('bolsao_tokens')
      .update({ 
        is_active: false, 
        updated_at: new Date().toISOString() 
      })
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (error) {
      console.error('❌ Erro ao desativar token do Bolsão:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Erro ao desativar token do Bolsão:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Verifica se existe um token ativo para o tenant
 */
export async function hasBolsaoTokenActive(tenantId: string): Promise<boolean> {
  const token = await getActiveBolsaoToken(tenantId);
  return token !== null;
}
