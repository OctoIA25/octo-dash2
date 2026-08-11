/**
 * Ordenação e limpeza das fotos que vão para o feed VRSync da ZAP.
 *
 * Mora aqui porque o feed é duplicado em proxy-production.js e api-server.js e
 * nenhum dos dois é importável (chamam app.listen): sem este módulo, o teste
 * roda uma réplica da lógica e uma mutação real (inverter o sort, mexer no
 * dedup) passa batida.
 */

const normalizeZapPhotoUrl = (photo) => {
  if (!photo) return null;
  if (typeof photo === 'string') return photo.trim();
  if (typeof photo === 'object') {
    return String(photo.url || photo.src || photo.preview || photo.publicUrl || '').trim() || null;
  }
  return null;
};

/**
 * A capa (`isCapa` no JSONB) vai para a primeira posição: o VRSync marca a foto
 * de destaque com primary="true" no primeiro Item, e a ZAP exibe as demais na
 * ordem em que são enviadas. Sort estável → sem capa, a ordem original se mantém.
 */
export const extractZapPhotoUrls = (photos) => {
  const rawPhotos = Array.isArray(photos) ? photos : [];
  const isCapa = (p) => (p?.isCapa ? 1 : 0);
  const seen = new Set();

  return [...rawPhotos]
    .sort((a, b) => isCapa(b) - isCapa(a))
    .map(normalizeZapPhotoUrl)
    .filter((url) => url && /^https?:\/\//i.test(url))
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, 30); // teto de fotos por anúncio no feed
};
