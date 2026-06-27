/**
 * Cliente do status de sincronização do Kenlo (server: /api/v1/kenlo/sync).
 *
 * O sync roda no SERVIDOR em background; o estado durável fica em
 * kenlo_integrations.sync_state. Este service lê esse snapshot (GET /sync/status)
 * e dispara um sync manual (POST /sync/run). Espelha watermarkService — mesmo
 * padrão de auth (token da sessão) e de polling (no card).
 */
import { supabase } from '@/lib/supabaseClient';

const BASE = '/api/v1/kenlo/sync';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Snapshot do sync_state que o KenloSyncService grava por tenant. */
export interface KenloSyncState {
  status: 'running' | 'done' | 'error';
  mode?: 'BACKFILL' | 'LIVE';
  started_at?: string;
  finished_at?: string;
  fetched?: number;
  new?: number;
  saved?: number;
  errors?: number;
  error_message?: string | null;
  stalled?: boolean; // derivado no backend: running preso há >10min
}

export interface KenloIntegrationStatus {
  tenant_id: string;
  status: string;
  last_sync_at: string | null;
  leads_count: number;
  sync: KenloSyncState | null;
}

/** Lê o status de todas as integrações e devolve a do tenant pedido (ou null). */
export async function getKenloSyncStatus(tenantId: string): Promise<KenloIntegrationStatus | null> {
  const res = await fetch(`${BASE}/status`, { headers: { ...(await authHeader()) } });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  const list: KenloIntegrationStatus[] = body?.integrations || [];
  return list.find((i) => i.tenant_id === tenantId) || null;
}

/** Dispara um sync manual (responde 202 na hora). started=false se já em andamento. */
export async function triggerKenloSync(): Promise<{ started: boolean }> {
  const res = await fetch(`${BASE}/run`, { method: 'POST', headers: { ...(await authHeader()) } });
  const body = await res.json().catch(() => ({}));
  return { started: !!body.started };
}
