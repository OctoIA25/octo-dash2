/**
 * Cliente das rotas server-side da integração Anthropic. A admin API key fica
 * cifrada no servidor; o frontend só envia/consulta metadados (nunca a key).
 */
import { supabase } from '@/lib/supabaseClient';

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export interface AnthropicConfigView {
  tenantId: string;
  status: string;
  hasKey: boolean;
  maskedKey: string | null;
  weeklyLimitUsd: number | null;
}

export async function fetchAnthropicConfig(
  tenantId: string,
): Promise<{ ok: boolean; config: AnthropicConfigView | null; error?: string }> {
  const res = await fetch('/api/v1/anthropic/config/get', {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ tenantId }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: !!json.ok, config: json.config ?? null, error: json.error };
}

export async function saveAnthropicConfig(
  tenantId: string,
  input: { apiKey?: string; weeklyLimitUsd?: number },
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/v1/anthropic/config', {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ tenantId, ...input }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && !!json.ok, error: json.error };
}

export async function testAnthropicConfig(
  tenantId: string, apiKey?: string,
): Promise<{ ok: boolean; error?: string | null }> {
  const res = await fetch('/api/v1/anthropic/test', {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify({ tenantId, ...(apiKey ? { apiKey } : {}) }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: !!json.ok, error: json.error };
}
