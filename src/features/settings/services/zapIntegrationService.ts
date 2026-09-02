/**
 * Cliente das rotas server-side da integração ZAP Imóveis. Os segredos (feed_secret,
 * resync_token) são cifrados no servidor; o frontend nunca os lê em claro — chama
 * nossa API (não o Supabase direto). O secret só chega ao front uma vez, na resposta
 * de salvar/rotacionar, para o admin colar no painel da ZAP.
 */
import { supabase } from '@/lib/supabaseClient';

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export interface ZapConfigView {
  tenantId: string;
  status: string;
  provider: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  publicationType: string | null;
  detailBaseUrl: string | null;
  resyncUrl: string | null;
  hideComplement: boolean;
  hasSecret: boolean;
  hasResyncToken: boolean;
}

export interface ZapConfigInput {
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  publicationType?: string;
  detailBaseUrl?: string;
  resyncUrl?: string;
  resyncToken?: string;
  /** Owner-only: oculta o complemento do endereço no feed (o servidor rejeita não-owner). */
  hideComplement?: boolean;
  status?: 'active' | 'inactive';
  generateSecret?: boolean;
}

export async function fetchZapConfig(
  tenantId: string,
): Promise<{ ok: boolean; config: ZapConfigView | null; error?: string }> {
  const res = await fetch('/api/v1/zap/config/get', {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ tenantId }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: !!json.ok, config: json.config ?? null, error: json.error };
}

/** Salva a config. Se `generateSecret`, devolve o novo secret uma única vez. */
export async function saveZapConfig(
  tenantId: string, fields: ZapConfigInput,
): Promise<{ ok: boolean; secret?: string; error?: string }> {
  const res = await fetch('/api/v1/zap/config', {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ tenantId, ...fields }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && json.ok, secret: json.secret, error: json.error };
}

/** Gera um novo feed_secret e devolve uma única vez. Invalida o secret anterior. */
export async function rotateZapSecret(
  tenantId: string,
): Promise<{ ok: boolean; secret?: string; error?: string }> {
  const res = await fetch('/api/v1/zap/config/rotate-secret', {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ tenantId }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && json.ok, secret: json.secret, error: json.error };
}

export async function testZapConfig(
  tenantId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/v1/zap/config/test', {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ tenantId }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: !!json.ok, error: json.error };
}

export interface ZapStatusRow {
  tenant_id: string;
  status: string;
  last_feed_at: string | null;
  last_lead_at: string | null;
  last_error: string | null;
}

export async function fetchZapStatus(): Promise<{ integrations: ZapStatusRow[]; error?: string }> {
  const res = await fetch('/api/v1/zap/sync/status', { headers: await authHeaders() });
  const json = await res.json().catch(() => ({}));
  return { integrations: json.integrations || [], error: json.error };
}
