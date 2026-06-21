/**
 * 🌐 Cliente do endpoint de recomendações (servidor Express /api/v1/recommendations).
 *
 * O servidor é a autoridade sobre o destinatário final (proteção entre
 * ambientes) e sobre a persistência. Este cliente apenas envia o conteúdo já
 * renderizado (mesma fonte do preview) e os metadados para auditoria.
 */

import { supabase } from '@/lib/supabaseClient';

export type RecommendationChannel = 'email' | 'whatsapp';

export interface SendRecommendationLead {
  id: string | number | null;
  source: 'bolsao' | 'kenlo' | 'crm' | 'manual';
  name: string;
  email: string | null;
  phone?: string | null;
}

export interface SendRecommendationProperty {
  referencia: string;
  titulo: string;
  localizacao?: string;
  preco?: number | null;
  score?: number;
}

export interface SendRecommendationRequest {
  tenantId: string;
  /** Canal do envio. Default: 'email'. Um envio = um canal por requisição. */
  channel?: RecommendationChannel;
  lead: SendRecommendationLead;
  properties: SendRecommendationProperty[];
  /** Conteúdo de e-mail (obrigatório quando channel='email'). */
  subject?: string;
  message?: string;
  html?: string;
  text?: string;
  /** Corpo da mensagem de WhatsApp (obrigatório quando channel='whatsapp'). */
  whatsappBody?: string;
  /** E-mail de teste do tenant (precede env). */
  testEmail?: string;
  /** Envio de teste: e-mail → redireciona ao teste; whatsapp → simula. */
  isTest?: boolean;
}

export interface SendRecommendationResponse {
  ok: boolean;
  status?: 'sent' | 'simulated' | 'failed' | 'test';
  channel?: RecommendationChannel;
  recipient?: string;
  redirected?: boolean;
  isTest?: boolean;
  environment?: string;
  intended?: string | null;
  intendedEmail?: string | null;
  /** true quando a requisição caiu na idempotência (envio já feito). */
  deduplicated?: boolean;
  /**
   * Transporte efetivamente usado: 'smtp' (enviado de verdade), 'whatsapp', ou
   * 'simulated' (NADA saiu — sem SMTP configurado para o tenant).
   */
  transport?: 'smtp' | 'simulated' | 'whatsapp' | string;
  messageId?: string | null;
  historyId?: string | null;
  error?: string;
  message?: string;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/** Limite de espera do envio. Acima disso, abortamos e devolvemos erro tratável
 *  em vez de deixar o botão "Enviar" girando para sempre. */
const SEND_TIMEOUT_MS = 30_000;

export async function sendRecommendation(
  payload: SendRecommendationRequest,
): Promise<SendRecommendationResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch('/api/v1/recommendations/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const json = (await response.json().catch(() => ({}))) as SendRecommendationResponse;
    if (!response.ok) {
      return { ok: false, error: json.error || `HTTP ${response.status}`, message: json.message };
    }
    return json;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        error: 'timeout',
        message:
          'O servidor demorou demais para responder (possível SMTP travado ou inacessível). Verifique a configuração de envio e tente novamente.',
      };
    }
    return {
      ok: false,
      error: 'network_error',
      message: err instanceof Error ? err.message : 'Falha de rede ao enviar.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface RecommendationHistoryItem {
  id: string;
  lead_name: string | null;
  lead_email: string | null;
  recipient_email: string;
  redirected: boolean;
  is_test: boolean;
  environment: string;
  subject: string;
  property_count: number;
  status: string;
  created_at: string;
  sent_by_email: string | null;
}

export async function fetchRecommendationHistory(
  tenantId: string,
  leadId?: string,
): Promise<RecommendationHistoryItem[]> {
  const params = new URLSearchParams({ tenantId });
  if (leadId) params.set('leadId', leadId);
  const response = await fetch(`/api/v1/recommendations/history?${params.toString()}`, {
    headers: { ...(await authHeader()) },
  });
  if (!response.ok) return [];
  const json = await response.json().catch(() => ({ items: [] }));
  return (json.items || []) as RecommendationHistoryItem[];
}
