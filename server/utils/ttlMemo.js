/**
 * Memoização com TTL para funções async — cache de curta duração por chave.
 *
 * Usado pelos workers de envio para colapsar consultas idênticas por tenant
 * (config WhatsApp, soft-delete) dentro de uma janela curta: o valor fica
 * fresco o suficiente (TTL de segundos) e o banco deixa de ser consultado a
 * cada mensagem. Não há sweep: entradas velhas são sobrescritas no próximo
 * acesso — o universo de chaves (tenants) é pequeno e estável.
 *
 * @param {Function} fn função async a memoizar.
 * @param {number} ttlMs validade de cada entrada, em ms.
 * @param {{ keyOf?: Function, shouldCache?: Function, now?: () => number }} opts
 *   keyOf: deriva a chave a partir dos args (default: String do 1º arg).
 *   shouldCache: predicado sobre o resultado — false não entra no cache
 *     (ex.: erro transitório de query não deve ficar colado por TTL).
 *   now: relógio injetável para testes.
 */
export function memoizeTtl(fn, ttlMs, opts = {}) {
  const { keyOf = (...args) => String(args[0]), shouldCache = () => true, now = Date.now } = opts;
  const cache = new Map();
  return async (...args) => {
    const key = keyOf(...args);
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = await fn(...args);
    if (shouldCache(value)) cache.set(key, { at: now(), value });
    else cache.delete(key);
    return value;
  };
}
