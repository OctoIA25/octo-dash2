/**
 * Validação/normalização das URLs de mídia do imóvel (vídeo e tour virtual).
 *
 * Extraído de CriarImovelForm.tsx para que o formulário e o completômetro
 * apliquem exatamente a mesma regra — sem duplicar validação.
 */

/** Extrai o ID de um vídeo do YouTube a partir das URLs mais comuns. */
export const extractYouTubeId = (url: string): string | null => {
  const s = (url || '').trim();
  if (!s) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
};

/** Normaliza para a URL canônica de watch; null se não for YouTube válido. */
export const normalizeYouTubeUrl = (url: string): string | null => {
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
};

/** Tour virtual aceita qualquer provedor — valida só que seja URL http(s). */
export const isHttpUrl = (url: string): boolean => {
  const s = (url || '').trim();
  if (!s) return false;
  try {
    const parsed = new URL(s);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};
