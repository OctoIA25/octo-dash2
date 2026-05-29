import { supabase } from '@/lib/supabaseClient';

export interface WhatsappConfigRecord {
  tenant_id: string;
  phone_number_id: string;
  business_account_id: string | null;
  display_phone_number: string | null;
  webhook_verify_token: string;
  app_secret: string | null;
  is_active: boolean;
  updated_at: string;
}

export interface WhatsappConfigInput {
  phone_number_id: string;
  business_account_id?: string;
  display_phone_number?: string;
  access_token: string;
  webhook_verify_token: string;
  app_secret?: string;
  is_active?: boolean;
}

/**
 * Lê a configuração (sem o access_token — não devolvemos secret para a UI).
 */
export async function loadWhatsappConfig(tenantId: string): Promise<WhatsappConfigRecord | null> {
  const { data, error } = await supabase
    .from('whatsapp_config')
    .select(
      'tenant_id, phone_number_id, business_account_id, display_phone_number, webhook_verify_token, app_secret, is_active, updated_at',
    )
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as WhatsappConfigRecord) ?? null;
}

/**
 * Cria ou atualiza a configuração WhatsApp do tenant.
 * Campos vazios em access_token mantêm o valor existente (não sobrescreve com vazio).
 */
export async function saveWhatsappConfig(
  tenantId: string,
  input: WhatsappConfigInput,
): Promise<void> {
  const payload: Record<string, unknown> = {
    tenant_id: tenantId,
    phone_number_id: input.phone_number_id,
    business_account_id: input.business_account_id ?? null,
    display_phone_number: input.display_phone_number ?? null,
    webhook_verify_token: input.webhook_verify_token,
    app_secret: input.app_secret ?? null,
    is_active: input.is_active ?? true,
    updated_at: new Date().toISOString(),
  };
  if (input.access_token && input.access_token.trim().length > 0) {
    payload.access_token = input.access_token.trim();
  }

  const { error } = await supabase
    .from('whatsapp_config')
    .upsert(payload, { onConflict: 'tenant_id' });
  if (error) throw error;
}

export async function setWhatsappConfigActive(tenantId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_config')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId);
  if (error) throw error;
}

export async function deleteWhatsappConfig(tenantId: string): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_config')
    .delete()
    .eq('tenant_id', tenantId);
  if (error) throw error;
}
