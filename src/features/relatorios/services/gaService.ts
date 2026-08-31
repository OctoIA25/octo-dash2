/**
 * Transporte das rotas /api/v1/integrations/ga/* (visão "Site" do Marketing).
 * O servidor deriva o tenant do JWT; tenantId só é enviado quando o owner
 * está impersonando (mesma regra do restKpisService).
 */
import { supabase } from '@/lib/supabaseClient';

export type GaRange = '7d' | '28d' | '90d';

export interface GaStatus {
  connected: boolean;
  propertyId: string | null;
  serviceAccountEmail: string | null;
  canManage: boolean;
}

export interface GaReport {
  timeseries: Array<{ date: string; sessions: number; users: number; pageviews: number; engagementRate: number }>;
  sources: Array<{ source: string; medium: string; sessions: number }>;
  pages: Array<{ path: string; views: number }>;
  devices: Array<{ device: string; sessions: number }>;
  cities: Array<{ city: string; sessions: number }>;
}

const REQUEST_TIMEOUT_MS = 20_000;

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function withTenant(params: URLSearchParams, tenantId?: string) {
  if (tenantId && tenantId !== 'owner') params.set('tenantId', tenantId);
  return params;
}

async function gaFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      ...init,
      headers: { ...(await authHeader()), ...(init.headers || {}) },
      signal: controller.signal,
    });
    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
    if (!response.ok || !json.ok) throw new Error(json.error || `HTTP ${response.status}`);
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchGaStatus(tenantId?: string): Promise<GaStatus> {
  const params = withTenant(new URLSearchParams(), tenantId);
  return gaFetch<GaStatus>(`/api/v1/integrations/ga/status?${params}`);
}

export async function saveGaConfig(propertyId: string, tenantId?: string): Promise<void> {
  const params = withTenant(new URLSearchParams(), tenantId);
  await gaFetch(`/api/v1/integrations/ga/config?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propertyId }),
  });
}

export async function fetchGaReport(range: GaRange, tenantId?: string): Promise<GaReport> {
  const params = withTenant(new URLSearchParams({ range }), tenantId);
  const json = await gaFetch<{ report: GaReport }>(`/api/v1/integrations/ga/report?${params}`);
  return json.report;
}
