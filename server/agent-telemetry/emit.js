/**
 * Telemetria de Agentes IA — normalização + emissor server-side (T1).
 * Spec: docs/superpowers/specs/2026-07-24-telemetria-agentes-engenharia-reversa.md
 *
 * REGRA DE OURO (mesma do heartbeat): telemetria jamais derruba produção.
 * `emitAgentEvent` NUNCA lança e não deve ser aguardado no caminho quente —
 * chame e siga em frente; falha vira console.warn.
 *
 * `normalizeEvent` é a ÚNICA fonte de verdade do shape de um evento — usada
 * pelo emissor (leniente: evento inválido é descartado com warn) e pelo
 * ingest HTTP (estrito: inválido vira 422). Mantém app e banco alinhados com
 * os CHECKs da migration 20260724_create_agent_telemetry_events.sql.
 *
 * Privacidade: um evento carrega métricas, nunca conteúdo de mensagem.
 */

export const EVENT_SOURCES = ['crm_server', 'crm_web', 'n8n'];
export const EVENT_TYPES = ['execution', 'llm_call', 'tool_call', 'handoff', 'error'];
export const EVENT_STATUSES = ['ok', 'error', 'timeout', 'empty_response', 'refused'];

const MAX_SHORT_TEXT = 200;        // slugs, modelo, provider, tool, execution_id
const MAX_ERROR_TEXT = 500;        // error_message
const MAX_METADATA_JSON = 2000;    // metadata serializada (cap anti-abuso)
const MAX_FUTURE_SKEW_MS = 5 * 60_000; // occurred_at até 5min à frente (skew n8n)

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,59}$/;

/** Inteiro ≥ 0 ou null ("não informado" ≠ 0 — só gravamos usage real). */
function toNonNegativeInt(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

/** Texto aparado/truncado ou null. */
function toShortText(value, max = MAX_SHORT_TEXT) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

/**
 * Valida e normaliza um evento cru em uma linha pronta para insert (SEM
 * tenant_id — quem resolve tenant é o chamador: emissor confia no server,
 * ingest valida membership). Retorna { ok, event } ou { ok:false, reason }.
 */
export function normalizeEvent(raw, { now = Date.now() } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not_an_object' };
  }

  const agentSlug = String(raw.agent_slug ?? '').trim().toLowerCase();
  if (!SLUG_RE.test(agentSlug)) return { ok: false, reason: 'invalid_agent_slug' };

  const source = raw.source ?? 'crm_server';
  if (!EVENT_SOURCES.includes(source)) return { ok: false, reason: 'invalid_source' };

  const eventType = raw.event_type;
  if (!EVENT_TYPES.includes(eventType)) return { ok: false, reason: 'invalid_event_type' };

  const status = raw.status ?? 'ok';
  if (!EVENT_STATUSES.includes(status)) return { ok: false, reason: 'invalid_status' };

  // occurred_at: default agora; se vier, precisa parsear; futuro além do skew
  // tolerado é clampado para "agora" (relógio do emissor não manda no nosso).
  let occurredMs = now;
  if (raw.occurred_at != null) {
    occurredMs = Date.parse(raw.occurred_at);
    if (Number.isNaN(occurredMs)) return { ok: false, reason: 'invalid_occurred_at' };
    if (occurredMs > now + MAX_FUTURE_SKEW_MS) occurredMs = now;
  }

  // metadata: só objeto plano; serializada acima do cap vira marcador honesto
  // (nunca truncamos JSON no meio — viraria lixo imparseável).
  let metadata = {};
  if (raw.metadata != null) {
    if (typeof raw.metadata !== 'object' || Array.isArray(raw.metadata)) {
      return { ok: false, reason: 'invalid_metadata' };
    }
    metadata = raw.metadata;
    try {
      if (JSON.stringify(metadata).length > MAX_METADATA_JSON) {
        metadata = { truncated: true };
      }
    } catch {
      return { ok: false, reason: 'invalid_metadata' };
    }
  }

  const inputTokens = toNonNegativeInt(raw.input_tokens);
  const outputTokens = toNonNegativeInt(raw.output_tokens);
  let totalTokens = toNonNegativeInt(raw.total_tokens);
  // Conveniência honesta: total derivado das partes reais quando ausente.
  if (totalTokens == null && (inputTokens != null || outputTokens != null)) {
    totalTokens = (inputTokens ?? 0) + (outputTokens ?? 0);
  }

  return {
    ok: true,
    event: {
      agent_slug: agentSlug,
      source,
      event_type: eventType,
      status,
      execution_id: toShortText(raw.execution_id),
      model: toShortText(raw.model),
      provider: toShortText(raw.provider),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached_tokens: toNonNegativeInt(raw.cached_tokens),
      total_tokens: totalTokens,
      duration_ms: toNonNegativeInt(raw.duration_ms),
      queue_ms: toNonNegativeInt(raw.queue_ms),
      error_class: toShortText(raw.error_class),
      error_message: toShortText(raw.error_message, MAX_ERROR_TEXT),
      tool_name: toShortText(raw.tool_name),
      metadata,
      occurred_at: new Date(occurredMs).toISOString(),
    },
  };
}

/**
 * Grava um evento de telemetria. Fire-and-forget: não aguarde no caminho
 * quente. Evento sem tenant_id ou inválido é descartado com warn.
 *
 * @param {object} supabase client service_role
 * @param {object} raw      evento cru: { tenant_id, agent_slug, event_type, ... }
 */
export async function emitAgentEvent(supabase, raw) {
  try {
    const tenantId = String(raw?.tenant_id ?? '').trim();
    if (!tenantId) {
      console.warn('[agent-telemetry] evento sem tenant_id descartado');
      return;
    }
    const normalized = normalizeEvent(raw);
    if (!normalized.ok) {
      console.warn(`[agent-telemetry] evento inválido descartado (${normalized.reason})`);
      return;
    }
    const { error } = await supabase
      .from('agent_telemetry_events')
      .insert({ tenant_id: tenantId, ...normalized.event });
    if (error) console.warn(`[agent-telemetry] insert falhou: ${error.message}`);
  } catch (e) {
    // Blindagem final: nada daqui pode escapar para o chamador.
    console.warn(`[agent-telemetry] emit falhou: ${e?.message}`);
  }
}
