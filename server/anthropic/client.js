/**
 * Cliente HTTP da Admin API da Anthropic (só comunicação; sem regra de negócio).
 * Usa a Admin API key (x-api-key) — DIFERENTE da ANTHROPIC_API_KEY. NUNCA loga a
 * key nem o header Authorization. Paginação via has_more/next_page. Timeout
 * obrigatório via AbortController.
 */

export const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = Number(process.env.ANTHROPIC_HTTP_TIMEOUT_MS) || 15000;

export class AnthropicApiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'AnthropicApiError';
    this.code = code; // unauthorized|forbidden|rate_limited|timeout|invalid_response|provider_error
  }
}

function statusToCode(status) {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  return 'provider_error';
}

/**
 * Busca o cost_report (bucket_width=1d) da janela [startingAt, endingAt) e
 * devolve o array agregado de buckets (data[]), seguindo next_page.
 */
export async function fetchCostReport({
  apiKey, startingAt, endingAt,
  fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, baseUrl = ANTHROPIC_BASE_URL,
}) {
  const buckets = [];
  let page = null;
  // ponytail: sem lib de paginação — while(has_more) basta. Limite defensivo de
  // 60 páginas (7 dias diários cabem em 1; o cap evita loop se a API repetir cursor).
  for (let guard = 0; guard < 60; guard += 1) {
    const url = new URL('/v1/organizations/cost_report', baseUrl);
    url.searchParams.set('starting_at', startingAt);
    url.searchParams.set('ending_at', endingAt);
    url.searchParams.set('bucket_width', '1d');
    if (page) url.searchParams.set('page', page);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw new AnthropicApiError('timeout');
      throw new AnthropicApiError('provider_error', 'network');
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) throw new AnthropicApiError(statusToCode(res.status), `HTTP ${res.status}`);

    let body;
    try { body = await res.json(); } catch { throw new AnthropicApiError('invalid_response', 'json'); }
    if (!body || !Array.isArray(body.data)) throw new AnthropicApiError('invalid_response', 'sem data[]');

    buckets.push(...body.data);
    if (!body.has_more || !body.next_page) return buckets;
    page = body.next_page;
  }
  return buckets;
}
