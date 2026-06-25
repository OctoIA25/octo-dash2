/**
 * Rate-limiter por tenant — token bucket em memória (por processo).
 *
 * Cada tenant tem um balde de `burst` tokens que recarrega a `ratePerSec`
 * tokens/segundo (cap em `burst`). `tryRemove(tenantId, n)` consome n tokens se
 * houver; senão recusa sem consumir (decisão tudo-ou-nada). Serve para suavizar
 * o ritmo de envio do outbox sem estourar limites externos (ex.: WhatsApp).
 *
 * Determinístico: o relógio é injetável (`now`) — testável sem timers reais.
 * Estado é por processo: em múltiplas instâncias o limite é por instância
 * (suficiente para a Fase 1; um limitador distribuído fica para depois se
 * necessário).
 *
 * @param {{ ratePerSec: number, burst: number, now?: () => number }} cfg
 *   ratePerSec: tokens recarregados por segundo.
 *   burst: capacidade máxima do balde (e valor inicial de cada tenant).
 *   now: relógio em ms (default Date.now); injetável para testes.
 * @returns {{ tryRemove: (tenantId: string, n?: number) => boolean, refill: (tenantId: string) => void }}
 */
export function createTenantRateLimiter({ ratePerSec, burst, now = Date.now }) {
  // tenantId → { tokens, lastRefill }
  const buckets = new Map();

  function getBucket(tenantId) {
    let b = buckets.get(tenantId);
    if (!b) {
      // Primeiro acesso: balde cheio, ancorado no instante atual.
      b = { tokens: burst, lastRefill: now() };
      buckets.set(tenantId, b);
    }
    return b;
  }

  /** Recarrega o balde proporcionalmente ao tempo decorrido (cap em burst). */
  function refill(tenantId) {
    const b = getBucket(tenantId);
    const current = now();
    const elapsedMs = current - b.lastRefill;
    if (elapsedMs > 0) {
      b.tokens = Math.min(burst, b.tokens + (elapsedMs / 1000) * ratePerSec);
      b.lastRefill = current;
    }
  }

  /**
   * Tenta consumir `n` tokens do balde do tenant. Recarrega antes de avaliar.
   * Tudo-ou-nada: se não houver `n` tokens, NÃO consome e retorna false.
   */
  function tryRemove(tenantId, n = 1) {
    refill(tenantId);
    const b = buckets.get(tenantId);
    if (b.tokens >= n) {
      b.tokens -= n;
      return true;
    }
    return false;
  }

  return { tryRemove, refill };
}
