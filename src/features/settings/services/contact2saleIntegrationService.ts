/**
 * Cliente das rotas server-side da integração Contact2Sale. O token fica
 * cifrado no servidor; o frontend só envia/consulta metadados.
 */
import { supabase } from '@/lib/supabaseClient';

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export interface Contact2SaleConfigView {
  tenantId: string;
  status: string;
  hasToken: boolean;
}

export interface Contact2SaleSyncState {
  status: 'running' | 'done' | 'error';
  mode?: 'BACKFILL' | 'LIVE';
  started_at?: string;
  heartbeat_at?: string;
  finished_at?: string;
  fetched?: number;
  new?: number;
  updated?: number;
  saved?: number;
  errors?: number;
  error_message?: string | null;
}

export interface Contact2SaleStatusRow {
  tenant_id: string;
  status: string;
  last_sync_at: string | null;
  last_full_sync_at: string | null;
  backfill_cursor: string | null;
  leads_count: number | null;
  sync_state: Contact2SaleSyncState | null;
  stalled: boolean;
}

export async function fetchContact2SaleConfig(
  tenantId: string,
): Promise<{ ok: boolean; config: Contact2SaleConfigView | null; error?: string }> {
  const res = await fetch('/api/v1/contact2sale/config/get', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ tenantId }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: !!json.ok, config: json.config ?? null, error: json.error };
}

export async function saveContact2SaleConfig(
  tenantId: string,
  apiToken: string,
  status: 'active' | 'inactive' = 'active',
): Promise<{ ok: boolean; company?: string | null; error?: string; status?: number }> {
  const res = await fetch('/api/v1/contact2sale/config', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ tenantId, apiToken, status }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && !!json.ok, company: json.company ?? null, error: json.error, status: json.status };
}

export async function testContact2SaleConfig(
  tenantId: string,
  apiToken?: string,
): Promise<{ ok: boolean; status?: number; company?: string | null; error?: string | null }> {
  const res = await fetch('/api/v1/contact2sale/config/test', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ tenantId, ...(apiToken ? { apiToken } : {}) }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: !!json.ok, status: json.status, company: json.company ?? null, error: json.error };
}

export async function disableContact2SaleConfig(
  tenantId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/v1/contact2sale/config', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ tenantId, status: 'inactive' }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && !!json.ok, error: json.error };
}

export async function runContact2SaleSync(
  tenantId: string,
  full = false,
): Promise<{ ok: boolean; started?: number; skipped?: number; error?: string; message?: string }> {
  const res = await fetch('/api/v1/contact2sale/sync/run', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ tenantId, ...(full ? { full: true } : {}) }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && !!json.ok, started: json.started, skipped: json.skipped, error: json.error, message: json.message };
}

export async function fetchContact2SaleStatus(): Promise<{ integrations: Contact2SaleStatusRow[]; error?: string }> {
  const res = await fetch('/api/v1/contact2sale/sync/status', { headers: await authHeaders() });
  const json = await res.json().catch(() => ({}));
  return { integrations: json.integrations || [], error: json.error };
}
