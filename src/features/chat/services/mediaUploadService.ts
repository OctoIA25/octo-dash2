import { supabase } from '@/lib/supabaseClient';

export type WhatsappMediaType = 'image' | 'audio' | 'video' | 'document';

export interface UploadedMedia {
  url: string;
  type: WhatsappMediaType;
  filename: string;
  mime: string;
  size: number;
}

/**
 * Limites por tipo (matching Meta Cloud API constraints).
 * Audio é 16MB no envio; áudio recebido pode chegar maior. Document até 100MB.
 */
const SIZE_LIMITS: Record<WhatsappMediaType, number> = {
  image: 5 * 1024 * 1024, // 5MB
  audio: 16 * 1024 * 1024, // 16MB
  video: 16 * 1024 * 1024, // 16MB
  document: 100 * 1024 * 1024, // 100MB
};

function inferType(mime: string): WhatsappMediaType | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  // tudo o resto (pdf, docx, xlsx, txt...) cai em document
  if (
    mime === 'application/pdf' ||
    mime.startsWith('application/vnd.') ||
    mime === 'application/msword' ||
    mime === 'text/plain'
  ) {
    return 'document';
  }
  return null;
}

function safeFilename(name: string): string {
  // remove path traversal e caracteres problemáticos para o bucket
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
}

/**
 * Faz upload do arquivo para o bucket whatsapp-media (público) e retorna a URL
 * que a Meta vai baixar para enviar como image/audio/video/document.
 */
export async function uploadWhatsappMedia(params: {
  tenantId: string;
  conversationId: string;
  file: File;
  /** Se omitido, é inferido do mime type. */
  type?: WhatsappMediaType;
}): Promise<UploadedMedia> {
  const { tenantId, conversationId, file } = params;
  const inferred = inferType(file.type);
  const type = params.type ?? inferred;
  if (!type) {
    throw new Error(`Tipo de arquivo não suportado: ${file.type || 'desconhecido'}`);
  }

  const limit = SIZE_LIMITS[type];
  if (file.size > limit) {
    throw new Error(
      `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Limite ${type}: ${(
        limit /
        1024 /
        1024
      ).toFixed(0)}MB.`,
    );
  }

  const ts = Date.now();
  const safe = safeFilename(file.name || `${type}-${ts}`);
  const path = `${tenantId}/${conversationId}/${ts}-${safe}`;

  const { error: upErr } = await supabase.storage
    .from('whatsapp-media')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Falha ao obter URL pública do arquivo.');

  return {
    url: data.publicUrl,
    type,
    filename: file.name || safe,
    mime: file.type,
    size: file.size,
  };
}

/**
 * Upload com progresso real e cancelável.
 * Usa createSignedUploadUrl + XHR (o supabase.storage.upload não expõe onProgress
 * nem AbortSignal). A função antiga uploadWhatsappMedia continua para chamadas
 * que não precisam de progresso.
 */
export async function uploadWhatsappMediaWithProgress(params: {
  tenantId: string;
  conversationId: string;
  file: File;
  type?: WhatsappMediaType;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}): Promise<UploadedMedia> {
  const { tenantId, conversationId, file, onProgress, signal } = params;

  if (signal?.aborted) throw new DOMException('Upload abortado', 'AbortError');

  const type = params.type ?? inferType(file.type);
  if (!type) throw new Error(`Tipo de arquivo não suportado: ${file.type || 'desconhecido'}`);

  const limit = SIZE_LIMITS[type];
  if (file.size > limit) {
    throw new Error(
      `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Limite ${type}: ${(
        limit / 1024 / 1024
      ).toFixed(0)}MB.`,
    );
  }

  const ts = Date.now();
  const safe = safeFilename(file.name || `${type}-${ts}`);
  const path = `${tenantId}/${conversationId}/${ts}-${safe}`;

  const { data: signed, error: signErr } = await supabase.storage
    .from('whatsapp-media')
    .createSignedUploadUrl(path);
  if (signErr || !signed?.signedUrl) {
    throw signErr ?? new Error('Falha ao criar URL de upload.');
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signed.signedUrl, true);
    xhr.setRequestHeader('x-upsert', 'false');
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload falhou (HTTP ${xhr.status})`));
    xhr.onerror = () => reject(new Error('Erro de rede no upload.'));
    xhr.onabort = () => reject(new DOMException('Upload abortado', 'AbortError'));

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });

  const { data } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('Falha ao obter URL pública do arquivo.');

  return { url: data.publicUrl, type, filename: file.name || safe, mime: file.type, size: file.size };
}
