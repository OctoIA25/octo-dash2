/**
 * Cliente do pipeline de marca d'água (server: /api/v1/watermark).
 *
 * Fluxo de UX recomendado no formulário de imóvel:
 *   1. ao escolher as fotos, mostre o PREVIEW LOCAL imediatamente (já existe no
 *      FotosUploader via FileReader) — o usuário não espera nada;
 *   2. em background, chame uploadPhoto() para cada arquivo → recebe { id };
 *   3. guarde os ids; o derivado com marca aparece assim que status = 'ready'.
 *      Para portais/divulgação use sempre a URL do derivado, nunca o master.
 */

export interface UploadedPhoto {
  id: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
}

export interface PhotoStatus extends UploadedPhoto {
  processed_logo_version: number | null;
  derivatives: Record<string, string>;
  urls: Record<string, string>; // { portal: <cdnUrl>, card: ..., thumb: ... }
  error?: string | null;
}

import { supabase } from '@/lib/supabaseClient';

const BASE = '/api/v1/watermark';

/** Header Authorization com o token da sessão (exigido pelas rotas de admin). */
async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Envia o MASTER (binário, multipart). Responde 202 na hora — processa async. */
export async function uploadPhoto(params: {
  tenantId: string;
  file: File | Blob;
  propertyId?: string;
  position?: number;
  caption?: string;
}): Promise<UploadedPhoto> {
  const form = new FormData();
  form.append('tenantId', params.tenantId);
  if (params.propertyId) form.append('propertyId', params.propertyId);
  if (params.position != null) form.append('position', String(params.position));
  if (params.caption) form.append('caption', params.caption);
  form.append('photo', params.file);

  const res = await fetch(`${BASE}/photos`, { method: 'POST', body: form });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `upload falhou (${res.status})`);
  return res.json();
}

/** Consulta status + URLs (CDN) dos derivados. */
export async function getPhotoStatus(id: string): Promise<PhotoStatus> {
  const res = await fetch(`${BASE}/photos/${id}`);
  if (!res.ok) throw new Error(`status falhou (${res.status})`);
  return res.json();
}

/**
 * URL estável do derivado para um tamanho. Aponta para a rota de geração LAZY:
 * gera na hora se ainda não existe (ex.: durante o batch pós-troca de logo) e
 * redireciona para a CDN. Ideal para <img src> — sempre serve a versão atual.
 */
export function photoUrl(id: string, size: 'portal' | 'card' | 'thumb' = 'card'): string {
  return `${BASE}/photos/${id}/${size}`;
}

/** Faz polling até a foto ficar 'ready' (ou 'error'). Útil para feedback de UI. */
export async function waitUntilReady(id: string, { timeoutMs = 60000, intervalMs = 1500 } = {}): Promise<PhotoStatus> {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const s = await getPhotoStatus(id);
    if (s.status === 'ready' || s.status === 'error') return s;
    if (Date.now() > deadline) return s;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Troca o logo do tenant: envia, gera a máscara, faz bump e re-watermark. Requer admin. */
export async function setTenantLogo(tenantId: string, logo: File | Blob): Promise<{
  ok: boolean;
  logoVersion: number;
  logoUrl: string;
  enqueued: number;
}> {
  const form = new FormData();
  form.append('logo', logo);
  const res = await fetch(`${BASE}/tenants/${tenantId}/logo`, {
    method: 'PUT',
    headers: { ...(await authHeader()) },
    body: form,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `troca de logo falhou (${res.status})`);
  return res.json();
}

/** Posições suportadas da marca (5 presets); 'center' é o padrão. */
export type WatermarkPosition = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface WatermarkSettings {
  logo_url: string | null;
  logo_version: number;
  watermark_enabled: boolean;
  watermark_opacity: number;
  watermark_scale: number;
  watermark_position: WatermarkPosition;
}

export interface ReprocessStatus {
  status: 'idle' | 'running' | 'done' | 'error';
  running: boolean;
  stalled?: boolean;
  done: number;
  total: number;
  error: string | null;
  updated_at?: string;
}

/** Progresso do reapontamento (regenerar + atualizar URLs das fotos) em background. */
export async function getReprocessStatus(tenantId: string): Promise<ReprocessStatus> {
  const res = await fetch(`${BASE}/tenants/${tenantId}/reprocess-status`, {
    headers: { ...(await authHeader()) },
  });
  if (!res.ok) return { status: 'idle', running: false, done: 0, total: 0, error: null };
  return res.json();
}

/** Dispara o reprocessamento (regenera derivados + atualiza URLs) sem trocar o logo. */
export async function reprocessTenantPhotos(tenantId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/tenants/${tenantId}/reprocess`, {
    method: 'POST',
    headers: { ...(await authHeader()) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `reprocessar falhou (${res.status})`);
  return res.json();
}

/** Lê a configuração atual de marca d'água do tenant. Requer membro do tenant. */
export async function getWatermarkSettings(tenantId: string): Promise<WatermarkSettings> {
  const res = await fetch(`${BASE}/tenants/${tenantId}/watermark-settings`, {
    headers: { ...(await authHeader()) },
  });
  if (!res.ok) throw new Error(`config falhou (${res.status})`);
  return res.json();
}

/** Atualiza opacidade / escala / posição / on-off (não mexe no logo). Requer admin. */
export async function updateWatermarkSettings(
  tenantId: string,
  patch: { enabled?: boolean; opacity?: number; scale?: number; position?: WatermarkPosition },
): Promise<WatermarkSettings> {
  const res = await fetch(`${BASE}/tenants/${tenantId}/watermark-settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `salvar config falhou (${res.status})`);
  return res.json();
}
