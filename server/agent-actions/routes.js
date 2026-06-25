/**
 * 🌐 Rotas HTTP do Agente Disparador.
 *
 * Endpoints (JWT Supabase, mesmo padrão do módulo whatsapp):
 *   POST /api/v1/agent-actions/preview  — interpreta + resolve + prévia (NÃO envia)
 *   POST /api/v1/agent-actions/confirm  — confirma o previewToken e enfileira
 *   GET  /api/v1/agent-actions/runs/:id — relatório de um run (contagens + falhas)
 *   POST /api/v1/agent-actions/run-queue — drena a fila (owner; ou cron interno)
 *   GET  /api/v1/agent-actions/runs — lista os disparos do tenant (filtros + paginação)
 *
 * Esta camada só faz: autenticação, resolução de contexto (tenant, role, nome de
 * corretor) e tradução request→service. A interpretação NL acontece via n8n
 * (interpreter.js) — não há chave de IA no CRM. Toda a regra de negócio está em
 * service.js / worker.js (testáveis sem HTTP).
 */

import { previewOperation, confirmOperation } from './service.js';
import { runDueActions } from './actionWorker.js';
import { makeSchedulerDeps } from '../recommendations/index.js';
import { resolveSegmentDual } from './segmentResolver.js';
import { validateSegment } from './segmentSchema.js';

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';

function isPlatformOwner(email) {
  return (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;
}

/** Middleware: valida JWT Supabase e injeta req.userId/req.userEmail. */
function makeRequireSupabaseAuth(supabase) {
  return async function requireSupabaseAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'missing_authorization' });
      const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
      if (error || !data?.user) return res.status(401).json({ error: 'invalid_token' });
      req.userId = data.user.id;
      req.userEmail = data.user.email;
      next();
    } catch (err) {
      console.error('[agent-actions] erro validando token:', err);
      res.status(500).json({ error: 'auth_internal_error' });
    }
  };
}

/**
 * Resolve o contexto do usuário no tenant: { ok, role, brokerName } ou erro.
 * - role vem de tenant_memberships.
 * - brokerName (nm_corretor) vem de "Corretores" por email — necessário para
 *   escopar o corretor aos próprios leads (attended_by_name).
 * - platform owner: role 'owner' sem necessidade de membership.
 */
async function resolveUserContext(supabase, req, tenantId) {
  if (isPlatformOwner(req.userEmail)) return { ok: true, role: 'owner', brokerName: null };

  const { data: membership, error: memErr } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', req.userId)
    .maybeSingle();
  if (memErr) return { ok: false, error: 'membership_lookup_failed' };
  if (!membership) return { ok: false, error: 'not_a_member' };

  let brokerName = null;
  if (membership.role === 'corretor') {
    const { data: corretor } = await supabase
      .from('Corretores')
      .select('nm_corretor')
      .eq('tenant_id', tenantId)
      .ilike('email', req.userEmail || '')
      .maybeSingle();
    brokerName = corretor?.nm_corretor || null;
  }
  return { ok: true, role: membership.role, brokerName };
}

/**
 * Lê o modo de fonte pública configurado para o tenant.
 * Retorna o valor da tabela `agent_public_source_config` ou o fallback seguro (kenlo_only).
 * Resiliente: qualquer erro de query ou exceção retorna o fallback — nunca derruba a rota.
 */
async function resolvePublicSourceMode(supabase, tenantId) {
  const fallback = process.env.AGENT_PUBLIC_SOURCE_DEFAULT || 'kenlo_only';
  try {
    const { data, error } = await supabase
      .from('agent_public_source_config')
      .select('mode')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error || !data) return fallback;
    return data.mode || fallback;
  } catch {
    return fallback; // resiliente: qualquer falha → default seguro (kenlo_only)
  }
}

/**
 * Deriva o progresso de um run. Para 'running', usa contagens da fila;
 * pending engloba pending+processing. Para terminais, usa os contadores
 * persistidos do run (sem reconsultar a fila). Puro/testável.
 */
function computeProgress(run, queueCounts) {
  const total = run.found_count || 0;
  if (run.status === 'running' && queueCounts) {
    const done = queueCounts.done || 0;
    const failed = queueCounts.failed || 0;
    const pending = (queueCounts.pending || 0) + (queueCounts.processing || 0);
    return { status: 'running', done, failed, pending, total };
  }
  return {
    status: run.status,
    done: run.sent_count || 0,
    failed: run.failed_count || 0,
    pending: 0,
    total,
  };
}

/** Aplica os filtros de listagem de runs a um query-builder (puro/testável).
 *  Retorna o builder + os valores de paginação efetivamente aplicados (clampados). */
function applyRunsFilters(query, { status, q, from, to, limit, offset } = {}) {
  const lim = Math.min(Math.max(limit != null && limit !== '' ? Number(limit) : 50, 1), 200);
  const off = Math.max(offset != null && offset !== '' ? Number(offset) : 0, 0);
  let qb = query;
  if (status) qb = qb.eq('status', status);
  if (q) qb = qb.ilike('command_text', `%${q}%`);
  if (from) qb = qb.gte('created_at', from);
  if (to) qb = qb.lte('created_at', to);
  qb = qb.order('created_at', { ascending: false }).range(off, off + lim - 1);
  return { query: qb, limit: lim, offset: off };
}

/** Quem pode criar/editar/excluir públicos (gestor). */
function canManageAudiences(role) {
  return role === 'admin' || role === 'team_leader' || role === 'owner';
}

/** Mapeia erros de domínio para HTTP status. */
function statusFor(error) {
  if (!error) return 500;
  if (error.startsWith('forbidden') || error === 'not_a_member') return 403;
  if (error === 'run_not_found') return 404;
  if (error === 'n8n_error') return 502; // falha do fluxo externo (n8n indisponível)
  if (
    error === 'empty_command' ||
    error === 'message_required' ||
    error === 'missing_preview_token' ||
    error === 'already_confirmed' ||
    error.startsWith('unsupported') ||
    error.startsWith('invalid')
  ) {
    return 400;
  }
  return 500;
}

/**
 * Registra os 4 endpoints do Disparador sob `basePath`, reusando os MESMOS
 * handlers. Permite expor o mesmo conjunto em mais de um prefixo (ex.: o caminho
 * legado /api/v1/agent-actions e o alias /api/v1/communication/dispatch) sem
 * duplicar nenhuma lógica de handler.
 *
 * @param app     instância Express
 * @param basePath prefixo das rotas (sem barra final), ex.: '/api/v1/agent-actions'
 * @param supabase client (service_role)
 * @param options  { disparadorWebhookUrl?, schedulerDeps?, ... }
 * @param deps     { requireSupabaseAuth, schedulerDeps } já resolvidos
 */
export function registerDispatchRoutes(app, basePath, supabase, options, deps) {
  const { requireSupabaseAuth, schedulerDeps } = deps;

  // -------------------------------------------------------------------------
  // POST /preview — interpreta o comando e devolve a prévia. NÃO envia.
  // body: { tenantId, command }
  // -------------------------------------------------------------------------
  app.post(`${basePath}/preview`, requireSupabaseAuth, async (req, res) => {
    const { tenantId, command } = req.body || {};
    if (!tenantId || !command) return res.status(400).json({ ok: false, error: 'missing_fields' });

    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });

    // Lê o modo de fonte pública configurado para o tenant (resiliente: fallback = kenlo_only).
    const mode = await resolvePublicSourceMode(supabase, tenantId);

    const result = await previewOperation(
      supabase,
      { command, tenantId, mode, user: { id: req.userId, email: req.userEmail, role: ctx.role, brokerName: ctx.brokerName } },
      // Interpretação via n8n: passamos contexto p/ o payload; a URL vem da env
      // (DISPARADOR_WEBHOOK_URL) ou do default no interpreter.
      { interpretOpts: { webhookUrl: options.disparadorWebhookUrl, usuario: req.userEmail } },
    );
    return res.status(result.ok ? 200 : statusFor(result.error)).json(result);
  });

  // -------------------------------------------------------------------------
  // POST /confirm — confirma e enfileira. body: { tenantId, previewToken, message }
  // -------------------------------------------------------------------------
  app.post(`${basePath}/confirm`, requireSupabaseAuth, async (req, res) => {
    const { tenantId, previewToken, message } = req.body || {};
    if (!tenantId || !previewToken) return res.status(400).json({ ok: false, error: 'missing_fields' });

    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });

    const result = await confirmOperation(supabase, {
      previewToken,
      tenantId,
      message,
      user: { id: req.userId, email: req.userEmail, role: ctx.role, brokerName: ctx.brokerName },
    });

    // Drena a fila imediatamente após confirmar (best-effort), para que o
    // usuário veja o resultado sem depender do cron. Falha aqui não invalida o
    // enfileiramento — o worker reprocessa no próximo tick.
    if (result.ok && result.enqueued > 0) {
      runDueActions(supabase, { deliver: schedulerDeps.deliver, schedulerDeps, getEnvironment: schedulerDeps.getEnvironment }).catch(
        (err) => console.error('[agent-actions] drain pós-confirm falhou:', err?.message),
      );
    }

    return res.status(result.ok ? 200 : statusFor(result.error)).json(result);
  });

  // GET /runs — lista os disparos do tenant (gestor vê todos). Lista leve:
  // não traz itens da fila. Filtros: status, q (command_text), from/to, paginação.
  app.get(`${basePath}/runs`, requireSupabaseAuth, async (req, res) => {
    const tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });

    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });

    const base = supabase
      .from('agent_action_runs')
      .select('id, command_text, status, found_count, eligible_count, sent_count, failed_count, deduplicated_count, requested_by_email, created_at, completed_at')
      .eq('tenant_id', tenantId);

    const { status, q, from, to, limit, offset } = req.query;
    const built = applyRunsFilters(base, { status, q, from, to, limit, offset });
    const { data, error } = await built.query;
    if (error) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    return res.json({ ok: true, runs: data || [], limit: built.limit, offset: built.offset });
  });

  // -------------------------------------------------------------------------
  // GET /runs/:id — relatório do run (cabeçalho + falhas por destinatário).
  // -------------------------------------------------------------------------
  app.get(`${basePath}/runs/:id`, requireSupabaseAuth, async (req, res) => {
    const { id } = req.params;
    const tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });

    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });

    const { data: run, error } = await supabase
      .from('agent_action_runs')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    if (!run) return res.status(404).json({ ok: false, error: 'run_not_found' });

    const { data: failures } = await supabase
      .from('agent_action_queue')
      .select('lead_name, lead_phone, status, error')
      .eq('run_id', id)
      .eq('tenant_id', tenantId)
      .in('status', ['failed', 'skipped']);

    return res.json({ ok: true, run, failures: failures || [] });
  });

  // GET /runs/:id/progress — progresso ao vivo. Só conta a fila se 'running'
  // (count agregado por status, head:true — O(1) em linhas). Concluídos derivam
  // dos contadores do run.
  app.get(`${basePath}/runs/:id/progress`, requireSupabaseAuth, async (req, res) => {
    const { id } = req.params;
    const tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });

    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });

    const { data: run, error } = await supabase
      .from('agent_action_runs')
      .select('status, sent_count, failed_count, found_count')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    if (!run) return res.status(404).json({ ok: false, error: 'run_not_found' });

    let queueCounts = null;
    if (run.status === 'running') {
      const countByStatus = async (st) => {
        const { count } = await supabase
          .from('agent_action_queue')
          .select('id', { count: 'exact', head: true })
          .eq('run_id', id)
          .eq('tenant_id', tenantId)
          .eq('status', st);
        return count || 0;
      };
      const [done, failed, pending, processing] = await Promise.all([
        countByStatus('done'),
        countByStatus('failed'),
        countByStatus('pending'),
        countByStatus('processing'),
      ]);
      queueCounts = { done, failed, pending, processing };
    }

    return res.json({ ok: true, ...computeProgress(run, queueCounts) });
  });

  // -------------------------------------------------------------------------
  // POST /run-queue — drena a fila manualmente (platform owner). Útil p/ cron
  // externo ou operação. Em produção, prefira o worker com flag dedicada.
  // -------------------------------------------------------------------------
  app.post(`${basePath}/run-queue`, requireSupabaseAuth, async (req, res) => {
    if (!isPlatformOwner(req.userEmail)) return res.status(403).json({ ok: false, error: 'forbidden' });
    const summary = await runDueActions(supabase, {
      deliver: schedulerDeps.deliver,
      schedulerDeps,
      getEnvironment: schedulerDeps.getEnvironment,
    });
    return res.json({ ok: true, ...summary });
  });

  // -- Públicos (audiences) --------------------------------------------------
  const AUDIENCES_TABLE = 'audiences';

  app.get(`${basePath}/audiences`, requireSupabaseAuth, async (req, res) => {
    const tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });

    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    
    const { data, error } = await supabase
      .from(AUDIENCES_TABLE)
      .select('id, name, segment, created_by_email, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    return res.json({ ok: true, audiences: data || [] });
  });

  app.post(`${basePath}/audiences`, requireSupabaseAuth, async (req, res) => {
    const { tenantId, name, segment } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    
    if (!canManageAudiences(ctx.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
    
    if (!name || !String(name).trim()) return res.status(400).json({ ok: false, error: 'invalid_name' });
    
    const v = validateSegment(segment);
    if (!v.ok) return res.status(400).json({ ok: false, error: 'invalid_segment' });
    
    const { data, error } = await supabase
      .from(AUDIENCES_TABLE)
      .insert({ tenant_id: tenantId, name: String(name).trim(), segment: v.segment, created_by_email: req.userEmail || null })
      .select('id, name, segment, created_by_email, created_at, updated_at')
      .maybeSingle();
    
    if (error) {
      if (error.code === '23505') return res.status(409).json({ ok: false, error: 'audience_name_taken' });
      return res.status(500).json({ ok: false, error: 'persist_failed' });
    }
    
    return res.json({ ok: true, audience: data });
  });

  app.put(`${basePath}/audiences/:id`, requireSupabaseAuth, async (req, res) => {
    const { id } = req.params;
    const { tenantId, name, segment } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    
    if (!canManageAudiences(ctx.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
    
    const patch = {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ ok: false, error: 'invalid_name' });
      patch.name = String(name).trim();
    }
    
    if (segment !== undefined) {
      const v = validateSegment(segment);
      if (!v.ok) return res.status(400).json({ ok: false, error: 'invalid_segment' });
      patch.segment = v.segment;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'nothing_to_update' });
    }

    const { data, error } = await supabase
      .from(AUDIENCES_TABLE)
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('id, name, segment, created_by_email, created_at, updated_at')
      .maybeSingle();
    
    if (error) {
      if (error.code === '23505') return res.status(409).json({ ok: false, error: 'audience_name_taken' });
      return res.status(500).json({ ok: false, error: 'persist_failed' });
    }
    
    if (!data) return res.status(404).json({ ok: false, error: 'audience_not_found' });
    
    return res.json({ ok: true, audience: data });
  });

  app.delete(`${basePath}/audiences/:id`, requireSupabaseAuth, async (req, res) => {
    const { id } = req.params;
    
    const tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    
    if (!canManageAudiences(ctx.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
    
    const { error } = await supabase.from(AUDIENCES_TABLE).delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) return res.status(500).json({ ok: false, error: 'delete_failed' });
    
    return res.json({ ok: true });
  });

  app.get(`${basePath}/audiences/:id/count`, requireSupabaseAuth, async (req, res) => {
    const { id } = req.params;
    
    const tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    
    const { data: aud, error } = await supabase
      .from(AUDIENCES_TABLE).select('segment').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    if (!aud) return res.status(404).json({ ok: false, error: 'audience_not_found' });
    
    const resolved = await resolveSegmentDual(supabase, aud.segment, { tenantId, nowMs: Date.now() });
    // Público é auxiliar: erro do resolver → count 0, não derruba a tela.
    return res.json({ ok: true, count: resolved.ok ? resolved.rows.length : 0 });
  });
}

/** Resolve as deps compartilhadas (auth + envio) usadas pelos handlers. */
export function makeDispatchDeps(supabase, options = {}) {
  return {
    requireSupabaseAuth: makeRequireSupabaseAuth(supabase),
    // deps internas de envio reutilizadas pelo worker (mesma infra do scheduler).
    schedulerDeps: options.schedulerDeps || makeSchedulerDeps(supabase, options),
  };
}

/** Caminho LEGADO do Disparador: /api/v1/agent-actions/*. Mantido intacto. */
export function registerAgentActionRoutes(app, supabase, options = {}) {
  registerDispatchRoutes(app, '/api/v1/agent-actions', supabase, options, makeDispatchDeps(supabase, options));
}

export const __test__ = { resolveUserContext, statusFor, isPlatformOwner, resolvePublicSourceMode, applyRunsFilters, computeProgress, canManageAudiences, registerDispatchRoutes, makeDispatchDeps };
