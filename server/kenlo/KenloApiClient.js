/**
 * Cliente HTTP autenticado para a API de leads do Kenlo. Concentra TODA a
 * resiliência (retry/backoff+jitter, timeout, circuit breaker, rate-limit) para
 * que LeadService/SyncService permaneçam lógica de negócio pura.
 */
import { loadKenloEnv } from './kenloConfig.js';
import { createTenantRateLimiter } from '../communication/rateLimiter.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const RETRIABLE = new Set([408, 429, 500, 502, 503, 504]);

export function createKenloApiClient({
  authService, fetchImpl = fetch, processEnv = process.env,
  now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), logger = noopLogger,
}) {
  const cfg = loadKenloEnv(processEnv);
  const limiter = createTenantRateLimiter({ ratePerSec: cfg.ratePerSec, burst: cfg.burst, now });
  const breakers = new Map(); // tenantId → { fails, openUntil }

  const breakerFor = (t) => {
    let b = breakers.get(t);
    if (!b) { b = { fails: 0, openUntil: 0 }; breakers.set(t, b); }
    return b;
  };

  async function waitForToken(tenantId) {
    while (!limiter.tryRemove(tenantId, 1)) await sleep(50);
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

  async function getJson(integration, url) {
    const tenantId = integration.tenant_id;
    const b = breakerFor(tenantId);
    if (b.openUntil > now()) {
      logger.warn(`[kenlo] {"event":"kenlo.breaker.open","tenantId":"${tenantId}"}`);
      return { status: 0, body: null };
    }

    let token = await authService.getToken(integration);
    let refreshed = false;

    for (let attempt = 0; attempt <= cfg.retries; attempt++) {
      await waitForToken(tenantId);
      const r = await once(token, url);

      if ((r.status === 401 || r.status === 403) && !refreshed) {
        refreshed = true;
        try { token = await authService.refresh(integration); } catch { /* segue */ }
        continue; // repete imediatamente com novo token
      }

      const transient = r.status === 0 || RETRIABLE.has(r.status);
      if (!transient) { b.fails = 0; return r; } // sucesso ou 4xx terminal

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

  return { getJson };
}
