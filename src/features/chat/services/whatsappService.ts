import { supabase } from '@/lib/supabaseClient';

export interface SendTextResult {
  ok: boolean;
  waMessageId?: string;
  error?: string;
}

export interface WhatsappTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  text?: string;
  example?: { body_text?: string[][]; header_text?: string[] };
  buttons?: Array<{ type: string; text: string }>;
}

export interface WhatsappTemplate {
  name: string;
  language: string;
  category: string;
  status: string;
  components: WhatsappTemplateComponent[];
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/**
 * Envia texto via Meta Cloud API. O servidor Express recebe esta chamada,
 * busca o token do tenant em whatsapp_config (com service_role) e proxia
 * para graph.facebook.com. Dessa forma o access_token nunca chega ao browser.
 */
export async function sendTextMessage(params: {
  conversationId: string;
  to: string;
  body: string;
}): Promise<SendTextResult> {
  const response = await fetch('/api/v1/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text || `HTTP ${response.status}` };
  }
  const json = await response.json();
  return { ok: true, waMessageId: json.waMessageId };
}

/**
 * Envia uma mensagem de template (HSM) — única forma de iniciar conversa
 * fora da janela de 24h da Meta.
 */
export async function sendTemplateMessage(params: {
  conversationId: string;
  to: string;
  name: string;
  language: string;
  bodyParameters?: string[];
}): Promise<SendTextResult> {
  const { conversationId, to, name, language, bodyParameters } = params;
  const response = await fetch('/api/v1/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      conversationId,
      to,
      template: { name, language, bodyParameters: bodyParameters ?? [] },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text || `HTTP ${response.status}` };
  }
  const json = await response.json();
  return { ok: true, waMessageId: json.waMessageId };
}

/**
 * Envia uma mensagem de mídia (image, audio, video, document).
 * A URL deve ser pública (Supabase Storage bucket whatsapp-media).
 */
export async function sendMediaMessage(params: {
  conversationId: string;
  to: string;
  type: 'image' | 'audio' | 'video' | 'document';
  url: string;
  caption?: string;
  filename?: string;
}): Promise<SendTextResult> {
  const response = await fetch('/api/v1/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      conversationId: params.conversationId,
      to: params.to,
      media: {
        type: params.type,
        url: params.url,
        caption: params.caption,
        filename: params.filename,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: text || `HTTP ${response.status}` };
  }
  const json = await response.json();
  return { ok: true, waMessageId: json.waMessageId };
}

/**
 * Lista templates aprovados da WABA do tenant.
 */
export async function listWhatsappTemplates(tenantId: string): Promise<WhatsappTemplate[]> {
  const response = await fetch(
    `/api/v1/whatsapp/templates?tenantId=${encodeURIComponent(tenantId)}`,
    { headers: { ...(await authHeader()) } },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  const json = await response.json();
  return (json.templates ?? []) as WhatsappTemplate[];
}
