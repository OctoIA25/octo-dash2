/** Serviço de Públicos (audiences). Reusa o authedFetch central (JWT + refresh/retry em 401). */
import { authedFetch } from './authedFetch';
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

export async function listAudiences(tenantId: string): Promise<{ ok: boolean; audiences: Audience[] }> {
  const res = await authedFetch(`${BASE}?tenantId=${encodeURIComponent(tenantId)}`);
  return res.json();
}
export async function createAudience(tenantId: string, body: { name: string; segment: SegmentDsl }): Promise<{ ok: boolean; audience?: Audience; error?: string }> {
  const res = await authedFetch(BASE, { method: 'POST', body: JSON.stringify({ tenantId, ...body }) });
  return res.json();
}
export async function updateAudience(tenantId: string, id: string, patch: { name?: string; segment?: SegmentDsl }): Promise<{ ok: boolean; audience?: Audience; error?: string }> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ tenantId, ...patch }) });
  return res.json();
}
export async function deleteAudience(tenantId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`, { method: 'DELETE' });
  return res.json();
}
export async function getAudienceCount(tenantId: string, id: string): Promise<{ ok: boolean; count: number; truncated?: boolean }> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(id)}/count?tenantId=${encodeURIComponent(tenantId)}`);
  return res.json();
}
