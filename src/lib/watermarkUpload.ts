/**
 * Upload de UMA foto pelo pipeline de marca d'água, com fallback para upload cru.
 * Compartilhado por todos os formulários que sobem fotos de imóveis/condomínios/
 * lançamentos, para que a marca d'água seja aplicada de forma consistente.
 */
import { supabase } from './supabaseClient';

const WM_BASE = '/api/v1/watermark';
const WM_SIZE = 'portal'; // derivado grande, com marca (vai para portais/feeds)

/** Header Authorization com o token da sessão (POST /photos exige membro do tenant). */
async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Sobe o MASTER e devolve a URL ESTÁVEL do endpoint, com `.jpg` no final:
 * `<origin>/api/v1/watermark/photos/:id/portal.jpg`. A extensão é decorativa
 * (importador do Grupo OLX só aceita JPG e olha o fim da URL) — continua
 * sendo o endpoint, não a CDN, e por isso essa URL sempre resolve para a
 * variante ATUAL (marcada ou — se o admin desligar a marca — limpa) e para a
 * versão atual do logo. É o que permite o TOGGLE da marca surtir efeito sem
 * reescrever nada. Absoluta (domínio do app) para funcionar nos feeds.
 * Lança em qualquer falha → o chamador decide o fallback.
 */
export async function uploadViaWatermarkPipeline(
  blob: Blob,
  tenantId: string,
  propertyId: string,
): Promise<{ url: string; id: string }> {
  const form = new FormData();
  form.append('tenantId', tenantId);
  form.append('propertyId', propertyId);
  form.append('photo', blob);

  const up = await fetch(`${WM_BASE}/photos`, { method: 'POST', headers: { ...(await authHeader()) }, body: form });
  if (!up.ok) throw new Error(`watermark upload falhou (${up.status})`);
  const { id } = await up.json();
  if (!id) throw new Error('watermark sem id');

  // Pré-gera o derivado (warm-up) para o primeiro acesso/feed já ser rápido.
  await fetch(`${WM_BASE}/photos/${id}/${WM_SIZE}?redirect=0`).catch(() => {});

  // `.jpg` no fim da URL: o importador do Grupo OLX só aceita JPG e olha a
  // extensão. Continua sendo o endpoint (302 dinâmico), então o toggle da marca
  // segue funcionando — a extensão é ignorada pela rota.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return { url: `${origin}${WM_BASE}/photos/${id}/${WM_SIZE}.jpg`, id };
}

/**
 * Tenta o pipeline; se indisponível/falhar, usa `rawUpload()` (sem marca) para
 * nunca derrubar o save. Devolve a URL final e o id do pipeline (se houver).
 */
export async function uploadFotoComMarca({
  blob,
  tenantId,
  propertyId,
  rawUpload,
}: {
  blob: Blob;
  tenantId?: string | null;
  propertyId: string;
  rawUpload: () => Promise<string | null>;
}): Promise<{ url: string | null; id?: string }> {
  if (tenantId) {
    try {
      const { url, id } = await uploadViaWatermarkPipeline(blob, tenantId, propertyId);
      return { url, id };
    } catch (e) {
      console.warn(`⚠️ Pipeline de marca d'água indisponível, usando upload cru: ${(e as Error).message}`);
    }
  }
  return { url: await rawUpload() };
}
