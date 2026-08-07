/**
 * GET /{leadgen_id} no Graph API. O webhook da Meta NÃO traz os campos do
 * formulário — só o leadgen_id — então esta chamada é obrigatória para o lead
 * existir de fato.
 *
 * Classificar erro em retriable vs permanente é o ponto importante: 401 (token
 * revogado) tentado de novo é ruído infinito na fila, e 500 tratado como
 * permanente joga um lead pago no lixo.
 *
 * ponytail: retry simples com backoff, sem circuit breaker nem rate limiter
 * como o c2sApiClient. Aqui o volume é uma chamada POR LEAD, disparada por
 * webhook — não há varredura de páginas para estourar cota. Se aparecer 429 com
 * frequência, o breaker do C2S é o modelo a copiar.
 */
import { loadMetaEnv } from './metaConfig.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const RETRIABLE = new Set([408, 429, 500, 502, 503, 504]);
const FIELDS = 'id,created_time,ad_id,adset_id,campaign_id,form_id,platform,field_data';
// A Meta NÃO usa 429 para throttling: rate limit chega com error.code 4/17/32/613
// sobre HTTP 403 ou 400. Classificar só por status descartaria lead throttled
// como se fosse dado inválido. `is_transient` é o sinal explícito da própria Meta.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80004]);
const TRANSIENT_CODES = new Set([1, 2]);

function isRetriableBody(body) {
  const err = body?.error;
  if (!err) return false;
  if (err.is_transient === true) return true;
  return RATE_LIMIT_CODES.has(err.code) || TRANSIENT_CODES.has(err.code);
}

export function createMetaGraphClient({
  fetchImpl = fetch,
  processEnv = process.env,
  logger = noopLogger,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const cfg = loadMetaEnv(processEnv);

  async function once(leadgenId, accessToken) {
    const url = `https://graph.facebook.com/${cfg.graphVersion}/${encodeURIComponent(leadgenId)}?fields=${FIELDS}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      // Token no header, não na query: query string vaza em log de proxy e em
      // referer. O Graph aceita as duas formas.
      const resp = await fetchImpl(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      let body = null;
      try { body = await resp.json(); } catch { body = null; }
      // 2xx com corpo vazio/não-JSON não é sucesso: `lead: null` explodiria no
      // normalizer lá na frente. Retriable — corpo truncado é sintoma de
      // resposta interrompida, não de dado inválido.
      if (resp.ok && body == null) {
        return { ok: false, status: resp.status, retriable: true, error: `resposta ${resp.status} sem corpo JSON` };
      }
      if (resp.ok) return { ok: true, lead: body };
      return {
        ok: false,
        status: resp.status,
        retriable: RETRIABLE.has(resp.status) || isRetriableBody(body),
        error: body?.error?.message || `status ${resp.status}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchLead(leadgenId, accessToken) {
    if (!accessToken) {
      return { ok: false, status: null, retriable: false, error: 'token de acesso ausente na config do tenant' };
    }
    let last = null;
    for (let attempt = 1; attempt <= cfg.retries; attempt++) {
      try {
        last = await once(leadgenId, accessToken);
      } catch (e) {
        // Rede/timeout: sem status. Vale retry — não sabemos se a Meta recebeu.
        last = { ok: false, status: null, retriable: true, error: e?.name === 'AbortError' ? 'timeout' : (e?.message || 'erro de rede') };
      }
      if (last.ok || !last.retriable) return last;
      if (attempt < cfg.retries) await sleep(cfg.backoffMs * attempt);
    }
    logger.warn(`[meta-leadgen] fetchLead esgotou tentativas: ${last?.error}`);
    return last;
  }

  return { fetchLead };
}
