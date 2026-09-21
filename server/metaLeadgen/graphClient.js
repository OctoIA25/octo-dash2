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

  /**
   * Uma chamada ao Graph. Recebe o caminho inteiro (sem a versão) para servir
   * tanto a `/{leadgen_id}` quanto a `/{page_id}/leadgen_forms` — a
   * classificação de erro é a mesma, e duplicá-la daria dois critérios de
   * "vale tentar de novo" divergindo com o tempo (P2.7).
   */
  async function once(caminho, accessToken, campos = FIELDS) {
    const sep = caminho.includes('?') ? '&' : '?';
    const url = `https://graph.facebook.com/${cfg.graphVersion}/${caminho}${campos ? `${sep}fields=${campos}` : ''}`;
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
      if (resp.ok) return { ok: true, lead: body, corpo: body };
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

  /** O laço de tentativas, para as três chamadas usarem o mesmo. */
  async function comRetry(caminho, accessToken, campos, rotulo) {
    if (!accessToken) {
      return { ok: false, status: null, retriable: false, error: 'token de acesso ausente na config do tenant' };
    }
    let last = null;
    for (let attempt = 1; attempt <= cfg.retries; attempt++) {
      try {
        last = await once(caminho, accessToken, campos);
      } catch (e) {
        // Rede/timeout: sem status. Vale retry — não sabemos se a Meta recebeu.
        last = { ok: false, status: null, retriable: true, error: e?.name === 'AbortError' ? 'timeout' : (e?.message || 'erro de rede') };
      }
      if (last.ok || !last.retriable) return last;
      if (attempt < cfg.retries) await sleep(cfg.backoffMs * attempt);
    }
    logger.warn(`[meta-leadgen] ${rotulo} esgotou tentativas: ${last?.error}`);
    return last;
  }

  async function fetchLead(leadgenId, accessToken) {
    return comRetry(encodeURIComponent(leadgenId), accessToken, FIELDS, 'fetchLead');
  }

  /**
   * Os formulários da página (P2.7). SÓ os nomes — não baixa lead nenhum.
   *
   * Decidido pelo chefe em 21/09: a tela lista TODOS os formulários da página,
   * inclusive os que nunca receberam lead. É o que permite desligar a captação
   * de um formulário ANTES do primeiro lead entrar; listando só os que já
   * geraram lead, o gestor só descobre o formulário quando já é tarde.
   */
  async function fetchForms(pageId, accessToken) {
    const r = await comRetry(
      `${encodeURIComponent(pageId)}/leadgen_forms?limit=100`,
      accessToken,
      'id,name,status,leads_count',
      'fetchForms',
    );
    if (!r.ok) return r;
    return { ok: true, forms: Array.isArray(r.corpo?.data) ? r.corpo.data : [] };
  }

  /**
   * Os leads de um formulário (P2.7). A Meta guarda os últimos 90 dias.
   *
   * `depois` corta pelo instante já baixado, para a segunda rodada não pagar
   * de novo pelo que já veio.
   */
  async function fetchFormLeads(formId, accessToken, { depois = null, limite = 100 } = {}) {
    const filtro = depois
      ? `&filtering=${encodeURIComponent(JSON.stringify([
          { field: 'time_created', operator: 'GREATER_THAN', value: Math.floor(new Date(depois).getTime() / 1000) },
        ]))}`
      : '';
    const r = await comRetry(
      `${encodeURIComponent(formId)}/leads?limit=${Math.min(Math.max(limite, 1), 500)}${filtro}`,
      accessToken,
      FIELDS,
      'fetchFormLeads',
    );
    if (!r.ok) return r;
    return { ok: true, leads: Array.isArray(r.corpo?.data) ? r.corpo.data : [] };
  }

  /**
   * Insights de uma conta de anúncios (P3.5).
   *
   * Recebe o caminho já montado por `caminhoDeInsights` porque ele carrega
   * query própria (`level`, `time_increment`, `time_range`) — codificá-lo aqui
   * como um id quebraria a chamada. A classificação de erro é a mesma das
   * outras três, e é por isso que esta função mora aqui e não no módulo novo.
   */
  async function fetchInsights(caminho, accessToken, campos) {
    return comRetry(caminho, accessToken, campos, 'fetchInsights');
  }

  return { fetchLead, fetchForms, fetchFormLeads, fetchInsights };
}
