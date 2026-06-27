/** Serviço de Templates. Reusa o authedFetch central (JWT + refresh/retry em 401). */
import { authedFetch } from './authedFetch';

export type TemplateStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'error';

export interface Template {
  id: string;
  name: string;
  channel: string;
  category: 'MARKETING' | 'UTILITY';
  language: string;
  body: string;
  variables: string[];
  example_values: string[];
  provider_template_id: string | null;
  approval_status: TemplateStatus;
  rejected_reason: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}

const BASE = '/api/v1/communication/dispatch/templates';

export async function listTemplates(tenantId: string): Promise<{ ok: boolean; templates: Template[] }> {
  const res = await authedFetch(`${BASE}?tenantId=${encodeURIComponent(tenantId)}`);
  return res.json();
}
export async function createTemplate(tenantId: string, body: { name: string; body: string; category: 'MARKETING' | 'UTILITY'; exampleValues: string[] }): Promise<{ ok: boolean; template?: Template; error?: string }> {
  const res = await authedFetch(BASE, { method: 'POST', body: JSON.stringify({ tenantId, ...body }) });
  return res.json();
}
export async function updateTemplate(tenantId: string, id: string, patch: { name?: string; body?: string; category?: 'MARKETING' | 'UTILITY'; exampleValues?: string[] }): Promise<{ ok: boolean; template?: Template; error?: string }> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ tenantId, ...patch }) });
  return res.json();
}
export async function deleteTemplate(tenantId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(id)}?tenantId=${encodeURIComponent(tenantId)}`, { method: 'DELETE' });
  return res.json();
}
export async function submitTemplate(tenantId: string, id: string): Promise<{ ok: boolean; template?: Template; error?: string; detail?: string }> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(id)}/submit`, { method: 'POST', body: JSON.stringify({ tenantId }) });
  return res.json();
}
export async function refreshStatus(tenantId: string, id: string): Promise<{ ok: boolean; template?: Template; error?: string }> {
  const res = await authedFetch(`${BASE}/${encodeURIComponent(id)}/refresh-status`, { method: 'POST', body: JSON.stringify({ tenantId }) });
  return res.json();
}
export async function importFromMeta(tenantId: string): Promise<{ ok: boolean; imported?: number; updated?: number; total?: number; error?: string }> {
  const res = await authedFetch(`${BASE}/import-from-meta`, { method: 'POST', body: JSON.stringify({ tenantId }) });
  return res.json();
}
