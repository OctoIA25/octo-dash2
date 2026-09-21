/**
 * Geocodificação pelo Nominatim (OpenStreetMap) — P2.6.
 *
 * POR QUE NO SERVIDOR, SE A TELA JÁ GEOCODIFICAVA
 * O `geocodingService` do front chama o Nominatim direto do navegador. A
 * política de uso do OSM pede identificação de quem chama e no máximo 1
 * requisição por segundo — e cada navegador aberto é uma fila própria, então o
 * limite era respeitado por um usuário e furado por três. Aqui existe uma fila
 * só, com o nome da Dash no User-Agent. Decidido pelo chefe em 21/09/2026.
 *
 * O cache de endereço (`geocoded_addresses`) continua valendo: a chamada mais
 * barata é a que não acontece.
 *
 * `fetch` é injetável para o teste não depender da internet.
 */

/** A política do OSM exige identificar quem chama. Sem isto, o serviço bloqueia. */
export const USER_AGENT = 'OctoDash/1.0 (CRM imobiliario; contato via octoia.org)';

/** 1 req/s é o teto do OSM; 1,1 s dá folga para o relógio. */
export const INTERVALO_MS = 1100;

export function montarUrl(endereco) {
  const q = String(endereco ?? '').trim();
  if (!q) return null;
  const p = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '1',
    addressdetails: '0',
    // Sem isto, "Rua Augusta" acha uma Rua Augusta em Portugal.
    countrycodes: 'br',
  });
  return `https://nominatim.openstreetmap.org/search?${p}`;
}

/**
 * Lê a resposta do Nominatim.
 *
 * Devolve null em vez de chutar: resposta vazia, coordenada fora do Brasil ou
 * número ilegível viram "não achei", que é informação. Um pino no meio do
 * Atlântico é pior do que pino nenhum — ninguém desconfia de um mapa, e o
 * corretor leva o cliente ao lugar errado.
 */
export function lerResposta(json) {
  const primeiro = Array.isArray(json) ? json[0] : null;
  if (!primeiro) return null;
  const lat = Number(primeiro.lat);
  const lng = Number(primeiro.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Caixa do Brasil, com folga. Fora dela a resposta não é deste país.
  if (lat < -34 || lat > 6 || lng < -74 || lng > -34) return null;
  return { lat, lng };
}

/**
 * Uma consulta. Erro de rede vira `{ erro }`, não exceção: o script em massa
 * precisa registrar a falha daquele endereço e seguir para o próximo.
 */
export async function geocodificar(endereco, { fetchImpl = fetch } = {}) {
  const url = montarUrl(endereco);
  if (!url) return { erro: 'endereco_vazio' };
  try {
    const r = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (!r.ok) return { erro: `nominatim_${r.status}` };
    const coords = lerResposta(await r.json());
    return coords ?? { erro: 'nao_encontrado' };
  } catch (e) {
    return { erro: `falha_de_rede: ${String(e?.message ?? e).slice(0, 120)}` };
  }
}

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
