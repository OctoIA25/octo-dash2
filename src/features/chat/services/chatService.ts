import { supabase } from '@/lib/supabaseClient';
import type {
  WhatsappConfig,
  WhatsappConversation,
  WhatsappMessage,
} from '../types';

export async function listConversations(tenantId: string): Promise<WhatsappConversation[]> {
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('archived_at', null)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as unknown as WhatsappConversation[];
}

export async function listMessages(conversationId: string): Promise<WhatsappMessage[]> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as WhatsappMessage[];
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({ unread_count: 0 })
    .eq('id', conversationId);
  if (error) throw error;
}

export async function getWhatsappConfig(tenantId: string): Promise<WhatsappConfig | null> {
  const { data, error } = await supabase
    .from('whatsapp_config')
    .select('tenant_id, phone_number_id, business_account_id, display_phone_number, is_active')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as WhatsappConfig) ?? null;
}

export async function getOrCreateConversation(params: {
  tenantId: string;
  contactPhone: string;
  contactName?: string;
}): Promise<WhatsappConversation> {
  const { tenantId, contactPhone, contactName } = params;
  const { data: existing } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('contact_phone', contactPhone)
    .maybeSingle();

  if (existing) return existing as unknown as WhatsappConversation;

  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .insert({
      tenant_id: tenantId,
      contact_phone: contactPhone,
      contact_name: contactName ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as unknown as WhatsappConversation;
}
