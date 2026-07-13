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

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

// Mediana de uma lista de números (já filtrada). [] => null.
function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Deriva o bloco `ia.lia` do card de IA a partir de contagens/linhas já lidas.
 * PURO — toda a matemática do diagnóstico da LIA. Ver spec 2026-07-12.
 * @param {object} i  ver JSDoc dos campos no plano/spec (contagens + respostasRows + interacoes)
 */
export function deriveLiaCard(i) {
  const now = i.now ?? Date.now();
  if (!(i.totalMensagens > 0)) {
    return { available: true, ativa: false };
  }

  const totalFollowups = i.fPending + i.fSent + i.fCancelled + i.fExpired;
  const totalPerguntas = i.pPendente + i.pRespondida;

  // tempo até resposta: deltas em minutos, só linhas com ambos timestamps válidos.
  const deltas = (i.respostasRows || [])
    .map((r) => (Date.parse(r?.respondida_em) - Date.parse(r?.criado_em)) / 60000)
    .filter((d) => Number.isFinite(d) && d >= 0);

  const interacoes = i.interacoes || [];

  return {
    available: true,
    ativa: true,
    // max(0): timestamp futuro (skew de relógio) não deve virar "há -N min".
    minutos_desde_ultima_msg: i.ultimaMsgAt ? Math.max(0, Math.round((now - Date.parse(i.ultimaMsgAt)) / 60000)) : null,
    mensagens: {
      total: i.totalMensagens,
      ia: i.msgsIA,
      corretor: i.msgsCorretor,
      proporcao_ia_corretor: i.msgsCorretor > 0 ? round2(i.msgsIA / i.msgsCorretor) : null,
    },
    followups: {
      pending: i.fPending, sent: i.fSent, cancelled: i.fCancelled, expired: i.fExpired,
      taxa_envio: totalFollowups > 0 ? round2(i.fSent / totalFollowups) : 0,
    },
    perguntas: {
      pendente: i.pPendente, respondida: i.pRespondida,
      taxa_resposta: totalPerguntas > 0 ? round2(i.pRespondida / totalPerguntas) : 0,
      tempo_mediano_min: deltas.length ? Math.round(median(deltas)) : null,
    },
    visitas: {
      total: i.visTotal, confirmadas: i.visConfirmadas,
      taxa_confirmacao: i.visTotal > 0 ? round2(i.visConfirmadas / i.visTotal) : 0,
    },
    engajamento: {
      interacao_media: interacoes.length ? round1(interacoes.reduce((a, b) => a + b, 0) / interacoes.length) : null,
      lead_mais_ativo: interacoes.length ? Math.max(...interacoes) : null,
    },
    qualificacao: { fatos: i.fatos, leads_qualificados: i.leadsQualificados },
  };
}
