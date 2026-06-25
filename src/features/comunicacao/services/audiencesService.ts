/** Serviço de Públicos (audiences). Padrão authedFetch (JWT Supabase). */
import { supabase } from '@/lib/supabaseClient';
import type { SegmentDsl } from '../describeSegment';

export interface Audience {
  id: string;
  name: string;
  segment: SegmentDsl;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}

const BASE = '/api/v1/communication/dispatch/audiences';

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}
function headers(t?: string) {
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

export async function listAudiences(tenantId: string): Promise<{ ok: boolean; audiences: Audience[] }> {
  const res = await fetch(`${BASE}?tenantId=${encodeURIComponent(tenantId)}`, { headers: headers(await token()) });
  return res.json();
}
export async function createAudience(tenantId: string, body: { name: string; segment: SegmentDsl }): Promise<{ ok: boolean; audience?: Audience; error?: string }> {
  const res = await fetch(BASE, { method: 'POST', headers: headers(await token()), body: JSON.stringify({ tenantId, ...body }) });
  return res.json();
}
export async function updateAudience(tenantId: string, id: string, patch: { name?: string; segment?: SegmentDsl }): Promise<{ ok: boolean; audience?: Audience; error?: string }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'PUT', headers: headers(await token()), body: JSON.stringify({ tenantId, ...patch }) });
  return res.json();
}
export async function deleteAudience(tenantId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`, { method: 'DELETE', headers: headers(await token()) });
  return res.json();
}
export async function getAudienceCount(tenantId: string, id: string): Promise<{ ok: boolean; count: number }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}/count?tenantId=${encodeURIComponent(tenantId)}`, { headers: headers(await token()) });
  return res.json();
}
