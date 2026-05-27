import { supabase } from './supabaseClient';
import type { Foto } from '@/components/imoveis/fotos-helpers';

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

/**
 * Faz upload das fotos que ainda estão em data URL (base64) pro bucket `imoveis-fotos`
 * e devolve o array com `url` apontando pra URL pública. Fotos que já são URLs HTTP
 * passam direto. Falhas individuais não derrubam o lote — a foto é mantida como veio
 * e o erro é logado pra inspeção.
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

      const path = `${tenantSeg}/${codigoSeg}/${randomId()}.${parsed.ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, parsed.blob, { contentType: parsed.blob.type, upsert: false });

      if (uploadError) {
        console.error(`❌ Falha ao subir foto pro bucket ${BUCKET} (${path}):`, uploadError.message);
        return foto;
      }

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      if (!data?.publicUrl) {
        console.error(`❌ Não consegui obter URL pública pra ${path}`);
        return foto;
      }

      return { ...foto, url: data.publicUrl };
    }),
  );
}
