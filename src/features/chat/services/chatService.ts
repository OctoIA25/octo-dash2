import { supabase } from '@/lib/supabaseClient';
import type {
  WhatsappConfig,
  WhatsappConversation,
  WhatsappMessage,
} from '../types';

/**
 * Normalização canônica de telefone do módulo WhatsApp — mesmas regras de
 * server/utils/phone.js (com withCountryCode), que é o formato do wa_id da
 * Meta usado nas conversas inbound: só dígitos, remove DDI 55 duplicado,
 * insere o 9º dígito em celulares BR de 10 dígitos e prefixa DDI 55.
 */
export function normalizePhone(value: string | null | undefined): string {
  let digits = String(value ?? '').replace(/\D+/g, '');
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 10) digits = `${digits.slice(0, 2)}9${digits.slice(2)}`;
  return digits.length === 11 ? `55${digits}` : digits;
}

/**
 * Formas equivalentes do mesmo número que podem já existir no banco:
 * wa_id da Meta às vezes vem SEM o 9º dígito, e conversas antigas podem
 * estar sem DDI. Usadas para REUTILIZAR a conversa existente, nunca duplicar.
 */
export function phoneVariants(value: string | null | undefined): string[] {
  const canonical = normalizePhone(value);
  let digitForms = [canonical];
  if (/^55\d{2}9\d{8}$/.test(canonical)) {
    const semDdi = canonical.slice(2); // 11988887777
    const semNove = `${semDdi.slice(0, 2)}${semDdi.slice(3)}`; // 1188887777
    digitForms = [canonical, `55${semNove}`, semDdi, semNove];
  }
  // Integrações podem ter gravado E.164 com '+' — cobrir as duas formas.
  return [...digitForms, ...digitForms.map((d) => `+${d}`)];
}

/** Rota do chat que abre (ou cria) a conversa do número; null se telefone inválido. */
export function chatPathForPhone(
  value: string | null | undefined,
  contactName?: string | null,
): string | null {
  const phone = normalizePhone(value);
  if (phone.length < 10) return null;
  const name = contactName?.trim();
  return `/chat?phone=${phone}${name ? `&name=${encodeURIComponent(name)}` : ''}`;
}

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
  const { tenantId, contactName } = params;
  const contactPhone = normalizePhone(params.contactPhone);

  const findExisting = async () => {
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('contact_phone', phoneVariants(contactPhone))
      // Havendo mais de uma forma do mesmo número, abrir a conversa COM
      // histórico (inbound real) — nunca uma casca vazia criada depois.
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(1);
    return (data?.[0] as unknown as WhatsappConversation) ?? null;
  };

  const existing = await findExisting();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .insert({
      tenant_id: tenantId,
      contact_phone: contactPhone,
      contact_name: contactName ?? null,
    })
    .select('*')
    .single();

  if (error) {
    // Corrida com o trigger do banco ou outra aba: a UNIQUE (tenant_id,
    // contact_phone) venceu — reutilizar a conversa que ganhou.
    if (error.code === '23505') {
      const winner = await findExisting();
      if (winner) return winner;
    }
    throw error;
  }
  return data as unknown as WhatsappConversation;
}
