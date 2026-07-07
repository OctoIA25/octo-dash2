/**
 * Cliente HTTP da API Contact2Sale. Mesma receita de resiliência do
 * KenloApiClient (retry/backoff+jitter determinístico, timeout, circuit breaker
 * e rate limit por tenant), com as diferenças do provider: token Bearer
 * ESTÁTICO por tenant (sem refresh — 401/403 é terminal: token inválido) e
 * knobs C2S_* próprios (~10 req/min).
 *
 * ponytail: receita espelhada do Kenlo, não importada — os acoplamentos (env,
 * auth com refresh via Puppeteer, logs) são por provider; extrair o miolo
 * compartilhado só quando um 3º provider repetir o padrão.
 */
import { loadC2sEnv } from './c2sConfig.js';
import { createTenantRateLimiter } from '../communication/rateLimiter.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const RETRIABLE = new Set([408, 429, 500, 502, 503, 504]);

export function createC2sApiClient({
  resolver, fetchImpl = fetch, processEnv = process.env,
  now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), logger = noopLogger,
}) {
  const cfg = loadC2sEnv(processEnv);
  const limiter = createTenantRateLimiter({ ratePerSec: cfg.ratePerMin / 60, burst: cfg.burst, now });
  const breakers = new Map(); // chave (tenantId) → { fails, openUntil }

  const breakerFor = (key) => {
    let b = breakers.get(key);
    if (!b) { b = { fails: 0, openUntil: 0 }; breakers.set(key, b); }
    return b;
  };

  async function waitForToken(key) {
    while (!limiter.tryRemove(key, 1)) await sleep(50);
  }

  async function once(token, url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const resp = await fetchImpl(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      let body = null;
      try { body = await resp.json(); } catch { body = null; }
      return { status: resp.status, body };
    } catch {
      return { status: 0, body: null }; // rede/timeout
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(key, token, url) {
    const b = breakerFor(key);
    if (b.openUntil > now()) {
      logger.warn(`[contact2sale] {"event":"c2s.breaker.open","key":"${key}"}`);
      return { status: 0, body: null };
    }
    for (let attempt = 0; attempt <= cfg.retries; attempt++) {
      await waitForToken(key);
      const r = await once(token, url);

      const transient = r.status === 0 || RETRIABLE.has(r.status);
      // Sucesso ou 4xx terminal (401/403 = token inválido; não há refresh na C2S).
      if (!transient) { b.fails = 0; return r; }

      b.fails++;
      if (b.fails >= cfg.breakerThreshold) {
        b.openUntil = now() + cfg.breakerCooldownMs;
        return r;
      }
      if (attempt < cfg.retries) {
        const backoff = cfg.backoffMs * 2 ** attempt;
        const jitter = backoff * 0.25 * ((attempt % 3) / 3); // determinístico, sem Math.random
        await sleep(backoff + jitter);
      } else {
        return r;
      }
    }
    return { status: 0, body: null };
  }

  async function tokenFor(tenantId) {
    const config = await resolver.resolveConfig(tenantId);
    return config?.apiToken || null;
  }

  /**
   * GET /leads paginado. params: page, perpage, sort, created_gte/updated_gte,
   * first_message... (passados como query string; null/undefined são omitidos).
   */
  async function getLeads(tenantId, params = {}) {
    const token = await tokenFor(tenantId);
    if (!token) return { ok: false, status: 0, error: 'missing_token', items: [], hasMore: false, totalCount: null };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const r = await request(tenantId, token, `${cfg.baseUrl}/leads?${qs.toString()}`);
    // 200 SEM JSON parseável é falha (proxy/middlebox devolvendo HTML): tratar
    // como sucesso encerraria um backfill "limpo" na página 1 com a base vazia.
    const ok = r.status === 200 && r.body !== null;
    const items = ok ? (r.body?.data || []) : [];
    // CRÍTICO: a API C2S real NÃO retorna o bloco `pagination` (a doc promete,
    // mas o feed real vem sem ele). Confiar em total_pages fazia o backfill parar
    // na página 1 (default 1) e importar só os 50 leads mais ANTIGOS. O sinal
    // confiável de "há mais páginas" é a página ter vindo CHEIA (== perpage
    // pedido). Se a API voltar a mandar total_pages um dia, ele tem prioridade.
    const perpage = Number(params.perpage) || items.length;
    const totalPages = r.body?.pagination?.total_pages ?? null;
    const currentPage = Number(params.page) || 1;
    const hasMore = totalPages != null ? currentPage < totalPages : (items.length >= perpage && perpage > 0);
    return {
      ok,
      status: r.status,
      items,
      hasMore,
      totalCount: r.body?.pagination?.total_count ?? null,
      error: ok ? null
        : (r.status === 200 ? 'resposta_200_sem_json'
          : (r.status === 0 ? 'network_or_timeout' : `status ${r.status}`)),
    };
  }

  /**
   * GET /me — valida token e identifica a empresa. Aceita apiToken avulso
   * (fluxo /config/test, antes de salvar) ou tenantId (token armazenado).
   */
  async function getMe({ tenantId, apiToken } = {}) {
    const token = apiToken || (tenantId ? await tokenFor(tenantId) : null);
    if (!token) return { ok: false, status: 0, error: 'missing_token', body: null };
    // Preferir tenantId como chave de rate/breaker mesmo com token avulso:
    // a chave 'adhoc' é compartilhada — falhas de um tenant bloqueariam os demais.
    const r = await request(tenantId || 'adhoc', token, `${cfg.baseUrl}/me`);
    const ok = r.status === 200 && r.body !== null;
    return { ok, status: r.status, body: r.body, error: ok ? null : `status ${r.status}` };
  }

  return { getLeads, getMe };
}
