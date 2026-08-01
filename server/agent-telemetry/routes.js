/**
 * Telemetria de Agentes IA — rotas HTTP (T1 ingest + T4 leitura).
 *
 *   POST /api/v1/agent-telemetry/events      (ingest: n8n/front/backend)
 *   GET  /api/v1/agent-telemetry/summary     (totais, percentis, custo, quebras)
 *   GET  /api/v1/agent-telemetry/timeseries  (série por hour|day)
 *   GET  /api/v1/agent-telemetry/errors      (ranking de erros)
 *   GET  /api/v1/agent-telemetry/overview    (agregados das tabelas EXISTENTES)
 *
 * Auth (mesmo padrão dual de agent-actions/routes.js):
 *   1) Header `x-service-token` === AGENT_TELEMETRY_SERVICE_TOKEN (fallback:
 *      DISPARADOR_SERVICE_TOKEN, credencial que o n8n já possui). Fail-closed:
 *      sem env definida, o caminho de serviço fica desativado.
 *   2) `Authorization: Bearer <JWT Supabase>` — o tenant do payload/query é
 *      validado contra tenant_memberships (ou owner da plataforma).
 *
 * Leituras: `tenantId` na query define o escopo; SEM tenantId = cross-tenant,
 * permitido só para owner/serviço. Janela default = últimos 30 dias;
 * `window=all` remove o filtro (ex.: "custo total"). Agregação pesada vive nas
 * RPCs (migration 20260725_agent_telemetry_aggregations.sql); custo é derivado
 * aqui via pricing.js (tokens reais × preço; modelo sem preço → null).
 *
 * Ingest — corpo aceito (Content-Type: application/json):
 *   { "tenant_id": "<uuid>", "events": [ { agent_slug, event_type, ... } ] }
 *   ou um único evento no topo: { "tenant_id": "...", "agent_slug": "...", ... }
 * Validação estrita, all-or-nothing: qualquer evento inválido → 422 com
 * índice+motivo e NADA é inserido. Shape/normalização: normalizeEvent (emit.js).
 */

import { isPlatformOwner } from '../utils/ownerAuth.js';
import { normalizeEvent } from './emit.js';
import { costForModelBreakdown } from './pricing.js';
import { computeEscalationMetrics } from './derive/escalations.js';
import { fetchEscalationRows, fetchClosedLeadIds } from './derive/escalationsQuery.js';
import { computeCostMetrics } from './derive/costMetrics.js';
import { billableEventsFromByModel, sumVgcBrl, fetchRateForDate } from './derive/costQuery.js';
import { pickRate } from './pricing/exchange.js';
import { computeQualityMetrics } from './derive/qualityMetrics.js';

const MAX_BATCH = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

/**
 * Extrai { tenantId, events[] } do corpo, aceitando lote ou evento único.
 * Só estrutura — a validação de cada evento é de validateEvents().
 */
export function parseBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'invalid_body' };
  }
  const tenantId = String(body.tenant_id ?? '').trim();
  if (!UUID_RE.test(tenantId)) return { ok: false, reason: 'invalid_tenant_id' };

  let events;
  if (Array.isArray(body.events)) {
    events = body.events;
  } else if (body.agent_slug != null) {
    events = [body]; // evento único no topo (n8n manda 1 por chamada)
  } else {
    return { ok: false, reason: 'missing_events' };
  }

  if (events.length === 0) return { ok: false, reason: 'missing_events' };
  if (events.length > MAX_BATCH) return { ok: false, reason: 'too_many_events' };
  return { ok: true, tenantId, events };
}

/**
 * Normaliza o lote inteiro. All-or-nothing: um inválido derruba o lote com a
 * lista de { index, reason } — nunca insere subconjunto silenciosamente.
 */
export function validateEvents(events, { now = Date.now() } = {}) {
  const rows = [];
  const details = [];
  events.forEach((raw, index) => {
    const normalized = normalizeEvent(raw, { now });
    if (normalized.ok) rows.push(normalized.event);
    else details.push({ index, reason: normalized.reason });
  });
  if (details.length > 0) return { ok: false, details };
  return { ok: true, rows };
}

/**
 * Janela temporal das leituras: default últimos 30d; `window=all` sem filtro;
 * from/to ISO explícitos vencem. Inválido → { ok:false }.
 */
export function parseWindow(query = {}, nowMs = Date.now()) {
  if (query.window === 'all') return { ok: true, from: null, to: null };

  let from;
  if (query.from != null && query.from !== '') {
    const t = Date.parse(query.from);
    if (Number.isNaN(t)) return { ok: false, reason: 'invalid_from' };
    from = new Date(t).toISOString();
  } else {
    from = new Date(nowMs - DEFAULT_WINDOW_MS).toISOString();
  }

  let to = null;
  if (query.to != null && query.to !== '') {
    const t = Date.parse(query.to);
    if (Number.isNaN(t)) return { ok: false, reason: 'invalid_to' };
    to = new Date(t).toISOString();
  }
  if (to != null && from > to) return { ok: false, reason: 'invalid_range' };
  return { ok: true, from, to };
}

/** Filtro opcional de query: string aparada/capada ou null. */
const optionalFilter = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, 200) : null;
};

/** Autentica serviço (x-service-token) OU usuário (JWT Supabase). */
async function authenticate(req, supabase) {
  const providedServiceToken = req.headers['x-service-token'];
  if (providedServiceToken != null) {
    const serviceToken =
      process.env.AGENT_TELEMETRY_SERVICE_TOKEN || process.env.DISPARADOR_SERVICE_TOKEN;
    if (!serviceToken || providedServiceToken !== serviceToken) {
      return { ok: false, status: 401, error: 'invalid_service_token' };
    }
    return { ok: true, isService: true, userId: null, userEmail: null };
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'missing_authorization' };
  }
  const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !data?.user) return { ok: false, status: 401, error: 'invalid_token' };
  return { ok: true, isService: false, userId: data.user.id, userEmail: data.user.email };
}

/** Usuário comum precisa de membership no tenant; serviço/owner passam. */
async function authorizeTenant(supabase, auth, tenantId) {
  if (auth.isService || isPlatformOwner(auth.userEmail)) return { ok: true };
  const { data: membership, error } = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (error) {
    console.error('[agent-telemetry] membership check falhou:', error.message);
    return { ok: false, status: 500, error: 'membership_check_failed' };
  }
  if (!membership) return { ok: false, status: 403, error: 'not_a_member' };
  return { ok: true };
}

/**
 * Auth + escopo de tenant das LEITURAS. Responde o erro e retorna null quando
 * barrado; senão retorna { tenantId } (null = cross-tenant, só owner/serviço).
 */
async function resolveReadScope(req, res, supabase) {
  const auth = await authenticate(req, supabase);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return null;
  }

  const tenantId = String(req.query?.tenantId ?? '').trim() || null;
  if (tenantId) {
    if (!UUID_RE.test(tenantId)) {
      res.status(400).json({ error: 'invalid_tenant_id' });
      return null;
    }
    const authz = await authorizeTenant(supabase, auth, tenantId);
    if (!authz.ok) {
      res.status(authz.status).json({ error: authz.error });
      return null;
    }
    return { tenantId };
  }

  if (auth.isService || isPlatformOwner(auth.userEmail)) return { tenantId: null };
  res.status(403).json({ error: 'tenant_required' });
  return null;
}

/** Conta linhas por filtros sem trazê-las (head:true) — padrão tenantHealthRoutes. */
async function countBy(supabase, table, filters) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count || 0;
}

/**
 * Conta linhas do tenant onde `dateCol` cai na janela [from, to). Só head:true.
 * Extras: pares [operador, coluna, valor] (ex.: ['gt','final_sale_value',0]).
 */
async function countInWindow(supabase, table, tenantId, dateCol, { from, to }, extras = []) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  if (from) q = q.gte(dateCol, from);
  if (to) q = q.lt(dateCol, to);
  for (const [op, col, val] of extras) q = q[op](col, val);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count || 0;
}

export function registerAgentTelemetryRoutes(app, supabase) {
  // ---------------------------------------------------------------- ingest
  app.post('/api/v1/agent-telemetry/events', async (req, res) => {
    try {
      const auth = await authenticate(req, supabase);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const parsed = parseBody(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.reason });
      const { tenantId, events } = parsed;

      const authz = await authorizeTenant(supabase, auth, tenantId);
      if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

      const validated = validateEvents(events);
      if (!validated.ok) {
        return res.status(422).json({ error: 'invalid_events', details: validated.details });
      }

      // Front nunca dita source de servidor: fora do caminho de serviço,
      // tudo que chega por JWT é carimbado como crm_web.
      const rows = validated.rows.map((event) => ({
        tenant_id: tenantId,
        ...event,
        ...(auth.isService ? {} : { source: 'crm_web' }),
      }));

      const { error: insertErr } = await supabase.from('agent_telemetry_events').insert(rows);
      if (insertErr) {
        console.error('[agent-telemetry] insert do lote falhou:', insertErr.message);
        return res.status(500).json({ error: 'insert_failed' });
      }

      return res.json({ inserted: rows.length });
    } catch (err) {
      console.error('[agent-telemetry] erro no ingest:', err?.message);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  // --------------------------------------------------------------- summary
  app.get('/api/v1/agent-telemetry/summary', async (req, res) => {
    try {
      const scope = await resolveReadScope(req, res, supabase);
      if (!scope) return;

      const window = parseWindow(req.query);
      if (!window.ok) return res.status(400).json({ error: window.reason });

      const { data, error } = await supabase.rpc('agent_telemetry_summary', {
        p_tenant_id: scope.tenantId,
        p_from: window.from,
        p_to: window.to,
        p_agent_slug: optionalFilter(req.query.agent),
        p_model: optionalFilter(req.query.model),
        p_status: optionalFilter(req.query.status),
        p_event_type: optionalFilter(req.query.eventType),
      });
      if (error) {
        console.error('[agent-telemetry] summary rpc falhou:', error.message);
        return res.status(500).json({ error: 'rpc_failed' });
      }

      // Custo derivado na leitura: tokens por modelo × pricing.js. Modelo sem
      // preço fica em unknown_models (a UI mostra "—", nunca estima).
      const summary = data || {};
      const { rows, totalUsd, unknownModels } = costForModelBreakdown(summary.by_model || []);
      return res.json({
        window: { from: window.from, to: window.to },
        summary: {
          ...summary,
          by_model: rows,
          cost: { total_usd: totalUsd, unknown_models: unknownModels },
        },
      });
    } catch (err) {
      console.error('[agent-telemetry] erro no summary:', err?.message);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  // ------------------------------------------------------------ timeseries
  app.get('/api/v1/agent-telemetry/timeseries', async (req, res) => {
    try {
      const scope = await resolveReadScope(req, res, supabase);
      if (!scope) return;

      const window = parseWindow(req.query);
      if (!window.ok) return res.status(400).json({ error: window.reason });

      const bucket = req.query.bucket === 'hour' ? 'hour' : 'day';
      const { data, error } = await supabase.rpc('agent_telemetry_timeseries', {
        p_tenant_id: scope.tenantId,
        p_from: window.from,
        p_to: window.to,
        p_bucket: bucket,
        p_agent_slug: optionalFilter(req.query.agent),
        p_event_type: optionalFilter(req.query.eventType),
      });
      if (error) {
        console.error('[agent-telemetry] timeseries rpc falhou:', error.message);
        return res.status(500).json({ error: 'rpc_failed' });
      }

      return res.json({ window: { from: window.from, to: window.to }, bucket, points: data || [] });
    } catch (err) {
      console.error('[agent-telemetry] erro no timeseries:', err?.message);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  // ---------------------------------------------------------------- errors
  app.get('/api/v1/agent-telemetry/errors', async (req, res) => {
    try {
      const scope = await resolveReadScope(req, res, supabase);
      if (!scope) return;

      const window = parseWindow(req.query);
      if (!window.ok) return res.status(400).json({ error: window.reason });

      const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
      const { data, error } = await supabase.rpc('agent_telemetry_errors', {
        p_tenant_id: scope.tenantId,
        p_from: window.from,
        p_to: window.to,
        p_agent_slug: optionalFilter(req.query.agent),
        p_limit: limit,
      });
      if (error) {
        console.error('[agent-telemetry] errors rpc falhou:', error.message);
        return res.status(500).json({ error: 'rpc_failed' });
      }

      return res.json({ window: { from: window.from, to: window.to }, errors: data || [] });
    } catch (err) {
      console.error('[agent-telemetry] erro no errors:', err?.message);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  // --------------------------------------------------------------- overview
  // Agregados das tabelas EXISTENTES (princípio: não duplicar — o que já tem
  // registro é lido de onde vive). Counts head:true em paralelo, no espírito
  // do tenantHealthRoutes: aqui é Promise.all sobre blocos já blindados por
  // block() (try/catch) — mesmo efeito do allSettled de lá. Passada a auth e o
  // tenantId obrigatório, bloco que falha vira null e a resposta é sempre 200.
  app.get('/api/v1/agent-telemetry/overview', async (req, res) => {
    try {
      const scope = await resolveReadScope(req, res, supabase);
      if (!scope) return;
      if (!scope.tenantId) return res.status(400).json({ error: 'tenant_required' });
      const t = scope.tenantId;

      const block = async (fn) => {
        try {
          return await fn();
        } catch (err) {
          console.warn('[agent-telemetry] bloco do overview indisponível:', err?.message);
          return null;
        }
      };

      const [disparador, delivery, chat, lia, recovery] = await Promise.all([
        block(async () => {
          const [done, failed, pending, running] = await Promise.all([
            countBy(supabase, 'agent_action_runs', { tenant_id: t, status: 'done' }),
            countBy(supabase, 'agent_action_runs', { tenant_id: t, status: 'failed' }),
            countBy(supabase, 'agent_action_runs', { tenant_id: t, status: 'pending' }),
            countBy(supabase, 'agent_action_runs', { tenant_id: t, status: 'running' }),
          ]);
          return { runs: { done, failed, pending, running } };
        }),
        block(async () => {
          const [pending, delivered, failed] = await Promise.all([
            countBy(supabase, 'webhook_events', { tenant_id: t, status: 'pending' }),
            countBy(supabase, 'webhook_events', { tenant_id: t, status: 'delivered' }),
            countBy(supabase, 'webhook_events', { tenant_id: t, status: 'failed' }),
          ]);
          return { pending, delivered, failed };
        }),
        block(async () => {
          const [conversations, messages] = await Promise.all([
            countBy(supabase, 'agent_conversations', { tenant_id: t }),
            countBy(supabase, 'agent_messages', { tenant_id: t }),
          ]);
          return { conversations, messages };
        }),
        block(async () => {
          const [
            mensagens, mensagensIa, mensagensCorretor,
            perguntasPendentes, perguntasRespondidas,
            followupsSent, followupsPending, followupsCancelled, followupsExpired,
            visitas, visitasConfirmadas,
          ] = await Promise.all([
            countBy(supabase, 'lia_corretor_messages', { tenant_id: t }),
            countBy(supabase, 'lia_corretor_messages', { tenant_id: t, role: 'assistant' }),
            countBy(supabase, 'lia_corretor_messages', { tenant_id: t, role: 'user' }),
            countBy(supabase, 'lia_perguntas_corretor', { tenant_id: t, status: 'pendente' }),
            countBy(supabase, 'lia_perguntas_corretor', { tenant_id: t, status: 'respondida' }),
            countBy(supabase, 'lia_followups', { tenant_id: t, status: 'sent' }),
            countBy(supabase, 'lia_followups', { tenant_id: t, status: 'pending' }),
            // cancelled/expired completam o espaço de estados: 'expired' é o
            // sinal de abandono da metodologia (§6.5) e ambos entram no
            // denominador da taxa de envio (mesma conta do card IA·LIA).
            countBy(supabase, 'lia_followups', { tenant_id: t, status: 'cancelled' }),
            countBy(supabase, 'lia_followups', { tenant_id: t, status: 'expired' }),
            countBy(supabase, 'lia_visitas', { tenant_id: t }),
            countBy(supabase, 'lia_visitas', { tenant_id: t, status: 'confirmada' }),
          ]);
          return {
            mensagens: { total: mensagens, ia: mensagensIa, corretor: mensagensCorretor },
            perguntas: { pendentes: perguntasPendentes, respondidas: perguntasRespondidas },
            followups: {
              enviados: followupsSent,
              pendentes: followupsPending,
              cancelados: followupsCancelled,
              expirados: followupsExpired,
            },
            visitas: { total: visitas, confirmadas: visitasConfirmadas },
          };
        }),
        block(async () => {
          // 5 estados do CHECK da tabela — 'processing' incluído para o total fechar
          const [pending, processing, done, failed, skipped] = await Promise.all([
            countBy(supabase, 'recovery_queue', { tenant_id: t, status: 'pending' }),
            countBy(supabase, 'recovery_queue', { tenant_id: t, status: 'processing' }),
            countBy(supabase, 'recovery_queue', { tenant_id: t, status: 'done' }),
            countBy(supabase, 'recovery_queue', { tenant_id: t, status: 'failed' }),
            countBy(supabase, 'recovery_queue', { tenant_id: t, status: 'skipped' }),
          ]);
          return { pending, processing, done, failed, skipped };
        }),
      ]);

      return res.json({ disparador, delivery, chat, lia, recovery });
    } catch (err) {
      console.error('[agent-telemetry] erro no overview:', err?.message);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  // ----------------------------------------------------------- escalations
  // Escalonamento IA→corretor DERIVADO de lia_perguntas_corretor (não emitido):
  // coleta (escalationsQuery) → matemática pura (escalations) → DTO. Requer
  // tenantId (métrica por-tenant; sem cross-tenant). Janela por criado_em.
  app.get('/api/v1/agent-telemetry/escalations', async (req, res) => {
    try {
      const scope = await resolveReadScope(req, res, supabase);
      if (!scope) return;
      if (!scope.tenantId) return res.status(400).json({ error: 'tenant_required' });

      const window = parseWindow(req.query);
      if (!window.ok) return res.status(400).json({ error: window.reason });

      const rows = await fetchEscalationRows(supabase, scope.tenantId, window);
      const closedLeadIds = await fetchClosedLeadIds(supabase, scope.tenantId);

      return res.json({
        window: { from: window.from, to: window.to },
        escalations: computeEscalationMetrics(rows, closedLeadIds),
      });
    } catch (err) {
      console.error('[agent-telemetry] erro no escalations:', err?.message);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  // ----------------------------------------------------------------- costs
  // Cards financeiros (Fatia B): custo USD (summary) → BRL (câmbio vigente) ÷
  // denominadores de negócio. N/A honesto em costMetrics (sem câmbio/venda → null,
  // nunca 0 fingido). Requer tenantId. Janela por from/to (default 30d).
  app.get('/api/v1/agent-telemetry/costs', async (req, res) => {
    try {
      const scope = await resolveReadScope(req, res, supabase);
      if (!scope) return;
      if (!scope.tenantId) return res.status(400).json({ error: 'tenant_required' });

      const window = parseWindow(req.query);
      if (!window.ok) return res.status(400).json({ error: window.reason });
      const t = scope.tenantId;

      const { data: rawSummary, error: sErr } = await supabase.rpc('agent_telemetry_summary', {
        p_tenant_id: t, p_from: window.from, p_to: window.to,
        p_agent_slug: null, p_model: null, p_status: null, p_event_type: null,
      });
      if (sErr) throw new Error(sErr.message);

      const { totalUsd, rows: byModel } = costForModelBreakdown((rawSummary || {}).by_model || []);
      // Câmbio na borda final da janela (to), ou "agora" quando aberta.
      const refDate = window.to ? new Date(window.to) : new Date();
      const vgcStart = (window.from || '1970-01-01').slice(0, 10);
      const vgcEnd = (window.to || refDate.toISOString()).slice(0, 10);

      const [rate, vgcBrl, attendedLeads, closedSales] = await Promise.all([
        fetchRateForDate(supabase, pickRate, refDate),
        sumVgcBrl(supabase, t, vgcStart, vgcEnd),
        countInWindow(supabase, 'leads', t, 'first_response_at', window),
        countInWindow(supabase, 'leads', t, 'closing_date', window, [['gt', 'final_sale_value', 0]]),
      ]);

      return res.json({
        window: { from: window.from, to: window.to },
        costs: computeCostMetrics({
          costUsd: totalUsd,
          rate,
          billableEvents: billableEventsFromByModel(byModel),
          attendedLeads,
          closedSales,
          vgcBrl,
        }),
      });
    } catch (err) {
      console.error('[agent-telemetry] erro no costs:', err?.message);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  // ----------------------------------------------------- evaluations (write)
  // Avaliação humana de qualidade (Fatia C). O avaliador é SEMPRE o usuário do
  // JWT (nunca do body) — serviço não avalia (não tem quem). UPSERT idempotente
  // por (tenant, agent, execution, avaliador).
  app.post('/api/v1/agent-telemetry/evaluations', async (req, res) => {
    try {
      const auth = await authenticate(req, supabase);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
      if (!auth.userId) return res.status(400).json({ error: 'evaluator_required' });

      const body = req.body || {};
      const tenantId = String(body.tenantId ?? '').trim();
      if (!UUID_RE.test(tenantId)) return res.status(400).json({ error: 'invalid_tenant_id' });
      const agentSlug = optionalFilter(body.agentSlug);
      if (!agentSlug) return res.status(400).json({ error: 'agent_slug_required' });
      if (body.verdict !== 'correct' && body.verdict !== 'incorrect') {
        return res.status(400).json({ error: 'invalid_verdict' });
      }

      const authz = await authorizeTenant(supabase, auth, tenantId);
      if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

      const { error } = await supabase.from('agent_response_evaluations').upsert(
        {
          tenant_id: tenantId,
          agent_slug: agentSlug,
          execution_id: optionalFilter(body.executionId),
          verdict: body.verdict,
          note: optionalFilter(body.note),
          evaluator_user_id: auth.userId, // do JWT, nunca do body
        },
        { onConflict: 'tenant_id,agent_slug,execution_id,evaluator_user_id' },
      );
      if (error) {
        console.error('[agent-telemetry] upsert de avaliação falhou:', error.message);
        return res.status(500).json({ error: 'insert_failed' });
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('[agent-telemetry] erro em evaluations:', err?.message);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  // ------------------------------------------------------ quality (read)
  // Consolida avaliações em 3 estados (confirmed_correct/wrong/not_evaluated).
  // Elegíveis = execuções do agente na janela (denominador do não-avaliado).
  app.get('/api/v1/agent-telemetry/quality', async (req, res) => {
    try {
      const scope = await resolveReadScope(req, res, supabase);
      if (!scope) return;
      if (!scope.tenantId) return res.status(400).json({ error: 'tenant_required' });

      const window = parseWindow(req.query);
      if (!window.ok) return res.status(400).json({ error: window.reason });
      const t = scope.tenantId;
      const agent = optionalFilter(req.query.agent);

      const evalFilter = { tenant_id: t, ...(agent ? { agent_slug: agent } : {}) };
      const [evaluable, correct, incorrect] = await Promise.all([
        countInWindow(supabase, 'agent_telemetry_events', t, 'occurred_at', window,
          [['eq', 'event_type', 'execution'], ...(agent ? [['eq', 'agent_slug', agent]] : [])]),
        countBy(supabase, 'agent_response_evaluations', { ...evalFilter, verdict: 'correct' }),
        countBy(supabase, 'agent_response_evaluations', { ...evalFilter, verdict: 'incorrect' }),
      ]);

      return res.json({
        window: { from: window.from, to: window.to },
        quality: computeQualityMetrics({ evaluable, correct, incorrect }),
      });
    } catch (err) {
      console.error('[agent-telemetry] erro em quality:', err?.message);
      return res.status(500).json({ error: 'internal_error' });
    }
  });
}

export const __test__ = { parseBody, validateEvents, parseWindow, MAX_BATCH };
