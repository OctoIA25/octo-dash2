/**
 * Coordenada colada pelo gestor (pedido do Erick, 01/10): o que o Google Maps
 * copia ao clicar com o botão direito ("-23.18712, -46.88452") ou o link do
 * mapa ("…/@-23.18712,-46.88452,17z"). Ponto é o separador decimal — é o que
 * os dois formatos usam. Fora do globo, ou só um número, é null.
 */
const PAR = /(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/;

export function lerCoordenadas(texto: string): [number, number] | null {
  const t = texto.trim();
  const m = t.match(/@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/) ?? t.match(PAR);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}
