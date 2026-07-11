/**
 * P2 — Status do Tenant: lógica PURA de derivação (sem I/O).
 * Spec: docs/superpowers/specs/2026-07-11-status-do-tenant-design.md
 *
 * Separada do endpoint (tenantHealthRoutes.js, que só faz I/O + montagem) para
 * ser testável isoladamente e manter alta coesão. Nada aqui toca banco/rede.
 */

const STALLED_MS = 10 * 60 * 1000; // running há mais que isto sem heartbeat = travado.

// Palavras-chave que denunciam falha do FORNECEDOR externo (vs. nossa/config).
const EXTERNAL_HINTS = ['429', 'timeout', 'timed out', 'unavailable', 'econnrefused', 'enotfound', 'socket hang up', '500', '502', '503', '504'];
// Palavras-chave de problema de CONFIG do tenant (credencial).
const CONFIG_HINTS = ['unauthorized', '401', '403', 'invalid credential', 'invalid token', 'api key', 'forbidden'];

/**
 * Classifica a origem de uma falha a partir do texto do erro.
 * @param {string|null|undefined} text
 * @returns {'external'|'config'|'internal'|null} null quando não há texto de erro.
 */
export function classifyFailure(text) {
  if (!text) return null;
  const t = String(text).toLowerCase();
  if (EXTERNAL_HINTS.some((k) => t.includes(k))) return 'external';
  if (CONFIG_HINTS.some((k) => t.includes(k))) return 'config';
  return 'internal';
}

/**
 * Parse seguro do snapshot sync_state (jsonb ou string) + deriva `stalled`
 * (running preso). Replica a lógica de kenlo/routes.js:parseSyncState (8 linhas,
 * não vale extrair/acoplar entre módulos).
 * @param {string|object|null} raw
 * @param {number} [now=Date.now()]
 */
export function parseSyncState(raw, now = Date.now()) {
  if (!raw) return null;
  let s;
  try { s = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  const ref = s?.heartbeat_at || s?.started_at;
  if (s?.status === 'running' && ref && now - Date.parse(ref) > STALLED_MS) {
    return { ...s, stalled: true };
  }
  return s;
}

/**
 * Deriva o card de um sync (C2S ou Kenlo — mesmo shape de sync_state/engine).
 * @param {{status?: string, last_sync_at?: string, sync_state?: any}|null} row  config do tenant
 * @param {number} [now]
 * @returns card { available, status, failure_origin, last_sync_at, last_error, details }
 */
export function deriveSyncCard(row, now = Date.now()) {
  if (!row) {
    return { available: true, status: 'inactive', failure_origin: null, last_sync_at: null, last_error: null, details: null };
  }
  if (row.status && row.status !== 'active') {
    return { available: true, status: 'inactive', failure_origin: null, last_sync_at: row.last_sync_at || null, last_error: null, details: null };
  }
  const sync = parseSyncState(row.sync_state, now);
  const lastError = sync?.error_message || null;
  let status;
  if (sync?.stalled) status = 'degraded';
  else if (sync?.status === 'error' || (sync?.errors > 0)) status = 'error';
  else status = 'ok';
  return {
    available: true,
    status,
    failure_origin: status === 'ok' ? null : classifyFailure(lastError || (sync?.stalled ? 'internal stalled' : '')),
    last_sync_at: row.last_sync_at || null,
    last_error: lastError,
    details: sync
      ? { fetched: sync.fetched ?? null, new: sync.new ?? null, updated: sync.updated ?? null, errors: sync.errors ?? null }
      : null,
  };
}

/**
 * Deriva o card do outbox a partir dos counts.
 * @param {{pending:number, failed:number, lastError?:string|null}} c
 */
export function deriveOutboxCard({ pending = 0, failed = 0, lastError = null }) {
  const status = failed > 0 ? 'error' : 'ok';
  return {
    available: true,
    status,
    failure_origin: status === 'ok' ? null : classifyFailure(lastError) || 'internal',
    queue_pending: pending,
    queue_failed: failed,
    last_error: lastError,
  };
}

/**
 * Deriva o card de webhooks (falhas recentes por janela).
 * @param {{recentFailures:number, lastError?:string|null}} c
 */
export function deriveWebhooksCard({ recentFailures = 0, lastError = null }) {
  const status = recentFailures > 0 ? 'error' : 'ok';
  return {
    available: true,
    status,
    failure_origin: status === 'ok' ? null : classifyFailure(lastError) || 'internal',
    recent_failures: recentFailures,
    last_error: lastError,
  };
}

/**
 * Deriva o card do WhatsApp.
 * @param {{active:boolean, queued:number, failed:number, lastError?:string|null}} c
 */
export function deriveWhatsappCard({ active = false, queued = 0, failed = 0, lastError = null }) {
  let status;
  if (!active) status = 'inactive';
  else if (failed > 0) status = 'error';
  else status = 'ok';
  return {
    available: true,
    status,
    failure_origin: status === 'error' ? (classifyFailure(lastError) || 'external') : null,
    active,
    queued,
    failed,
    last_error: lastError,
  };
}

/**
 * Card indisponível: a LEITURA falhou (≠ estado ruim). Erro genérico, sem
 * mensagem crua do banco (não vaza schema).
 */
export function unavailableCard() {
  return { available: false, status: 'unknown', failure_origin: 'internal', error: 'query failed' };
}
