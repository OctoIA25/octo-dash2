/**
 * ⚙️ Configuração de recomendações por tenant (e-mail de teste, branding e SMTP).
 *
 * A leitura/gravação passa pelo servidor Express — nunca pelo Supabase direto —
 * porque a SENHA SMTP precisa ser cifrada server-side e jamais retornar ao
 * browser. O GET devolve `smtp.hasPassword` (booleano), nunca a senha.
 */

import { supabase } from '@/lib/supabaseClient';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  /** Indica se há senha salva (a senha em si nunca é exposta). */
  hasPassword: boolean;
}

export interface WhatsappTemplateConfig {
  templateName: string;
  templateLanguage: string;
}

export interface RecommendationConfig {
  testEmail: string;
  companyName: string;
  smtp: SmtpConfig;
  whatsapp: WhatsappTemplateConfig;
  /** Servidor tem EMAIL_ENCRYPTION_KEY configurada (necessária p/ salvar senha). */
  encryptionAvailable: boolean;
}

export const DEFAULT_RECOMMENDATION_CONFIG: RecommendationConfig = {
  testEmail: '',
  companyName: '',
  smtp: { host: '', port: 587, secure: false, user: '', from: '', hasPassword: false },
  whatsapp: { templateName: '', templateLanguage: 'pt_BR' },
  encryptionAvailable: false,
};

/** Payload de gravação: a senha é opcional (vazia = manter a atual). */
export interface RecommendationConfigInput {
  testEmail: string;
  companyName: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
    /** Só envie quando o usuário digitar uma senha nova. */
    password?: string;
  };
  whatsapp?: WhatsappTemplateConfig;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function fetchRecommendationConfig(
  tenantId: string,
): Promise<RecommendationConfig> {
  if (!tenantId || tenantId === 'owner') return DEFAULT_RECOMMENDATION_CONFIG;

  const response = await fetch(
    `/api/v1/recommendations/config?tenantId=${encodeURIComponent(tenantId)}`,
    { headers: { ...(await authHeader()) } },
  );
  if (!response.ok) return DEFAULT_RECOMMENDATION_CONFIG;
  const json = await response.json().catch(() => null);
  if (!json?.ok || !json.config) return DEFAULT_RECOMMENDATION_CONFIG;

  const c = json.config;
  return {
    testEmail: c.testEmail ?? '',
    companyName: c.companyName ?? '',
    smtp: {
      host: c.smtp?.host ?? '',
      port: c.smtp?.port ?? 587,
      secure: Boolean(c.smtp?.secure),
      user: c.smtp?.user ?? '',
      from: c.smtp?.from ?? '',
      hasPassword: Boolean(c.smtp?.hasPassword),
    },
    whatsapp: {
      templateName: c.whatsapp?.templateName ?? '',
      templateLanguage: c.whatsapp?.templateLanguage ?? 'pt_BR',
    },
    encryptionAvailable: Boolean(c.encryptionAvailable),
  };
}

export interface SaveConfigResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function saveRecommendationConfig(
  tenantId: string,
  input: RecommendationConfigInput,
): Promise<SaveConfigResult> {
  if (!tenantId || tenantId === 'owner') {
    return { ok: false, error: 'no_tenant' };
  }
  const response = await fetch('/api/v1/recommendations/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ tenantId, ...input }),
  });
  const json = (await response.json().catch(() => ({}))) as SaveConfigResult;
  if (!response.ok) {
    return { ok: false, error: json.error || `HTTP ${response.status}`, message: json.message };
  }
  return json;
}
