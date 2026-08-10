import { supabase } from './supabaseClient';
import type { Foto } from '@/components/imoveis/fotos-helpers';
import { uploadFotoComMarca } from './watermarkUpload';

const BUCKET = 'imoveis-fotos';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const isDataUrl = (url: string) => /^data:image\//i.test(url);

const parseDataUrl = (dataUrl: string): { blob: Blob; ext: string } | null => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const ext = EXT_BY_MIME[mime] ?? 'jpg';
  try {
    const binary = atob(match[2]);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return { blob: new Blob([bytes], { type: mime }), ext };
  } catch {
    return null;
  }
};

const randomId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const sanitizePathSegment = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'sem-codigo';

export interface UploadImoveisFotosParams {
  fotos: Foto[];
  tenantId: string;
  codigoImovel: string;
}

/** Upload CRU (sem marca) direto no bucket — fallback se o pipeline estiver indisponível. */
async function uploadRaw(blob: Blob, ext: string, tenantSeg: string, codigoSeg: string): Promise<string | null> {
  const path = `${tenantSeg}/${codigoSeg}/${randomId()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) {
    console.error(`❌ Falha no upload cru (${path}):`, error.message);
    return null;
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl ?? null;
}

// Espelha SIZES.portal em server/watermark/config.js: o pipeline real nunca
// produz um derivado maior que esse bounding box. Sem o limite aqui, uma foto
// de câmera/drone (8000x6000) viraria um canvas RGBA de ~192MB neste caminho
// de fallback, que já está degradado.
const MAX_DIMENSION = 1280;

/**
 * Escala width/height para caber num bounding box de maxDim x maxDim mantendo
 * a proporção, sem nunca ampliar — mesma semântica do `fit: inside,
 * withoutEnlargement: true` do pipeline real (server/watermark/watermarkEngine.js).
 * Extraída à parte para poder testar a conta sem depender de canvas/DOM.
 */
export const scaleToFit = (width: number, height: number, maxDim: number): { width: number; height: number } => {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

/**
 * Converte para JPEG antes do upload cru. O feed da ZAP só aceita JPG, e este é
 * o único caminho que ainda poderia publicar png/webp/gif. Fundo branco porque
 * JPEG não tem alpha — sem isso, transparência vira preto. Redimensiona para
 * caber em MAX_DIMENSION (sem ampliar) para não gerar canvases gigantes com
 * fotos de câmera/drone.
 * Se a conversão falhar (canvas indisponível), devolve o blob original: subir a
 * foto no formato errado é melhor que perder a foto.
 */
export async function toJpegBlob(blob: Blob): Promise<{ blob: Blob; ext: string }> {
  if (EXT_BY_MIME[blob.type] === 'jpg') return { blob, ext: 'jpg' };
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const { width, height } = scaleToFit(bitmap.width, bitmap.height, MAX_DIMENSION);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d indisponível');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    if (!jpeg) throw new Error('toBlob devolveu null');
    return { blob: jpeg, ext: 'jpg' };
  } catch (e) {
    console.warn(`⚠️ Conversão para JPEG falhou, subindo formato original: ${(e as Error).message}`);
    return { blob, ext: EXT_BY_MIME[blob.type] ?? 'jpg' };
  } finally {
    bitmap?.close();
  }
}

/**
 * Faz upload das fotos que ainda estão em data URL (base64). Cada foto nova passa
 * pelo PIPELINE DE MARCA D'ÁGUA; a URL persistida aponta para o derivado com marca
 * na CDN. URLs http(s) já persistidas passam direto. Se o pipeline falhar numa foto,
 * cai no upload cru (sem marca) para nunca derrubar o save do imóvel.
 */
export async function uploadImoveisFotos({
  fotos,
  tenantId,
  codigoImovel,
}: UploadImoveisFotosParams): Promise<Foto[]> {
  if (!fotos || fotos.length === 0) return [];
  if (!tenantId) throw new Error('uploadImoveisFotos: tenantId é obrigatório');

  const tenantSeg = sanitizePathSegment(tenantId);
  const codigoSeg = sanitizePathSegment(codigoImovel);

  return Promise.all(
    fotos.map(async (foto): Promise<Foto> => {
      if (!foto?.url || !isDataUrl(foto.url)) return foto;

      const parsed = parseDataUrl(foto.url);
      if (!parsed) {
        console.warn('⚠️ Foto em data URL inválida — mantendo como está:', foto.legenda || '(sem legenda)');
        return foto;
      }

      // Pipeline de marca d'água com fallback para upload cru (nunca derruba o save).
      const { url, id } = await uploadFotoComMarca({
        blob: parsed.blob,
        tenantId,
        propertyId: codigoImovel,
        rawUpload: async () => {
          const jpeg = await toJpegBlob(parsed.blob);
          return uploadRaw(jpeg.blob, jpeg.ext, tenantSeg, codigoSeg);
        },
      });
      return url ? { ...foto, url, id } : foto;
    }),
  );
}
