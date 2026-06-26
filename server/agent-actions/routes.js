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
import { toMetaBody, submitTemplate, fetchTemplateStatus } from '../communication/metaTemplates.js';

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
function applyRunsFilters(query, { status, q, from, to, limit, offset, campaignId } = {}) {
  const lim = Math.min(Math.max(limit != null && limit !== '' ? Number(limit) : 50, 1), 200);
  const off = Math.max(offset != null && offset !== '' ? Number(offset) : 0, 0);
  let qb = query;
  if (campaignId) qb = qb.eq('campaign_id', campaignId);
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

/** Quem pode criar/editar/submeter templates (gestor). */
function canManageTemplates(role) {
  return role === 'admin' || role === 'team_leader' || role === 'owner';
}

/** Quem pode criar/editar/disparar campanhas (gestor). */
function canManageCampaigns(role) {
  return role === 'admin' || role === 'team_leader' || role === 'owner';
}

/** Carrega as credenciais Meta (WABA + token) do tenant. */
async function loadMetaCreds(supabase, tenantId) {
  const { data, error } = await supabase
    .from('whatsapp_config').select('business_account_id, access_token, is_active').eq('tenant_id', tenantId).maybeSingle();
  if (error || !data || !data.is_active || !data.business_account_id) return { ok: false, error: 'whatsapp_not_configured' };
  return { ok: true, wabaId: data.business_account_id, accessToken: data.access_token };
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
  // body: { tenantId, command? | audienceId? }
  // -------------------------------------------------------------------------
  app.post(`${basePath}/preview`, requireSupabaseAuth, async (req, res) => {
    const { tenantId, command, audienceId } = req.body || {};
    if (!tenantId || (!command && !audienceId)) return res.status(400).json({ ok: false, error: 'missing_fields' });

    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });

    // Lê o modo de fonte pública configurado para o tenant (resiliente: fallback = kenlo_only).
    const mode = await resolvePublicSourceMode(supabase, tenantId);

    const result = await previewOperation(
      supabase,
      { command, audienceId, tenantId, mode, user: { id: req.userId, email: req.userEmail, role: ctx.role, brokerName: ctx.brokerName } },
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

    const { status, q, from, to, limit, offset, campaignId } = req.query;
    const built = applyRunsFilters(base, { status, q, from, to, limit, offset, campaignId });
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
    
    // DELETE é mais restrito que POST/PUT: apenas admin/owner, alinhado com a RLS
    // que só permite DELETE a essas roles (team_leader pode criar/editar, não excluir).
    if (!(ctx.role === 'admin' || ctx.role === 'owner')) return res.status(403).json({ ok: false, error: 'forbidden' });

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

  // -- Templates -------------------------------------------------------------
  const TEMPLATES_TABLE = 'communication_templates';
  const TEMPLATE_COLS = 'id, name, channel, category, language, body, variables, example_values, provider_template_id, approval_status, rejected_reason, created_by_email, created_at, updated_at';

  app.get(`${basePath}/templates`, requireSupabaseAuth, async (req, res) => {
    const tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    const { data, error } = await supabase
      .from(TEMPLATES_TABLE).select(TEMPLATE_COLS).eq('tenant_id', tenantId).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    return res.json({ ok: true, templates: data || [] });
  });

  app.post(`${basePath}/templates`, requireSupabaseAuth, async (req, res) => {
    const { tenantId, name, body, category, language, exampleValues } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    if (!canManageTemplates(ctx.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
    if (!name || !String(name).trim()) return res.status(400).json({ ok: false, error: 'invalid_name' });
    if (!body || !String(body).trim()) return res.status(400).json({ ok: false, error: 'invalid_body' });
    const { variables } = toMetaBody(body);
    const { data, error } = await supabase.from(TEMPLATES_TABLE).insert({
      tenant_id: tenantId, name: String(name).trim(), body: String(body),
      category: category === 'UTILITY' ? 'UTILITY' : 'MARKETING',
      language: language || 'pt_BR',
      variables, example_values: Array.isArray(exampleValues) ? exampleValues : [],
      created_by_email: req.userEmail || null,
    }).select(TEMPLATE_COLS).maybeSingle();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ ok: false, error: 'template_name_taken' });
      return res.status(500).json({ ok: false, error: 'persist_failed' });
    }
    return res.json({ ok: true, template: data });
  });

  app.put(`${basePath}/templates/:id`, requireSupabaseAuth, async (req, res) => {
    const { id } = req.params;
    const { tenantId, name, body, category, exampleValues } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    if (!canManageTemplates(ctx.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
    // Não permite editar template já enviado/aprovado (imutável na Meta).
    const { data: cur, error: curErr } = await supabase
      .from(TEMPLATES_TABLE).select('approval_status').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (curErr) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    if (!cur) return res.status(404).json({ ok: false, error: 'template_not_found' });
    if (cur.approval_status === 'pending' || cur.approval_status === 'approved') {
      return res.status(400).json({ ok: false, error: 'template_locked' });
    }
    const patch = {};
    if (name !== undefined) { if (!String(name).trim()) return res.status(400).json({ ok: false, error: 'invalid_name' }); patch.name = String(name).trim(); }
    if (body !== undefined) { if (!String(body).trim()) return res.status(400).json({ ok: false, error: 'invalid_body' }); patch.body = String(body); patch.variables = toMetaBody(body).variables; }
    if (category !== undefined) patch.category = category === 'UTILITY' ? 'UTILITY' : 'MARKETING';
    if (exampleValues !== undefined) patch.example_values = Array.isArray(exampleValues) ? exampleValues : [];
    if (Object.keys(patch).length === 0) return res.status(400).json({ ok: false, error: 'nothing_to_update' });
    const { data, error } = await supabase.from(TEMPLATES_TABLE).update(patch).eq('id', id).eq('tenant_id', tenantId).select(TEMPLATE_COLS).maybeSingle();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ ok: false, error: 'template_name_taken' });
      return res.status(500).json({ ok: false, error: 'persist_failed' });
    }
    if (!data) return res.status(404).json({ ok: false, error: 'template_not_found' });
    return res.json({ ok: true, template: data });
  });

  app.delete(`${basePath}/templates/:id`, requireSupabaseAuth, async (req, res) => {
    const { id } = req.params;
    const tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    // Excluir é mais restrito (admin/owner), alinhado com a RLS.
    if (!(ctx.role === 'admin' || ctx.role === 'owner')) return res.status(403).json({ ok: false, error: 'forbidden' });
    // Não exclui template já enviado/aprovado na Meta (ficaria órfão na WABA).
    const { data: cur, error: curErr } = await supabase
      .from(TEMPLATES_TABLE).select('approval_status').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (curErr) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    if (!cur) return res.status(404).json({ ok: false, error: 'template_not_found' });
    if (cur.approval_status === 'pending' || cur.approval_status === 'approved') {
      return res.status(400).json({ ok: false, error: 'template_locked' });
    }
    const { error } = await supabase.from(TEMPLATES_TABLE).delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) return res.status(500).json({ ok: false, error: 'delete_failed' });
    return res.json({ ok: true });
  });

  app.post(`${basePath}/templates/:id/submit`, requireSupabaseAuth, async (req, res) => {
    const { id } = req.params;
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    if (!canManageTemplates(ctx.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
    const { data: tpl, error: tErr } = await supabase
      .from(TEMPLATES_TABLE).select('name, language, category, body, example_values, approval_status, provider_template_id').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (tErr) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    if (!tpl) return res.status(404).json({ ok: false, error: 'template_not_found' });
    if (tpl.approval_status === 'pending' || tpl.approval_status === 'approved') return res.status(400).json({ ok: false, error: 'already_submitted' });
    if (tpl.provider_template_id) return res.status(400).json({ ok: false, error: 'already_submitted' });
    const creds = await loadMetaCreds(supabase, tenantId);
    if (!creds.ok) return res.status(400).json({ ok: false, error: creds.error });
    const sub = await submitTemplate({ wabaId: creds.wabaId, accessToken: creds.accessToken, name: tpl.name, language: tpl.language, category: tpl.category, body: tpl.body, exampleValues: tpl.example_values || [] });
    if (!sub.ok) {
      const { error: upErr } = await supabase.from(TEMPLATES_TABLE).update({ approval_status: 'error', rejected_reason: sub.detail || 'meta_error' }).eq('id', id).eq('tenant_id', tenantId);
      if (upErr) console.error('[templates] falha ao gravar status error:', upErr.message);
      return res.status(502).json({ ok: false, error: 'meta_submit_failed', detail: sub.detail });
    }
    const { data, error } = await supabase.from(TEMPLATES_TABLE)
      .update({ provider_template_id: sub.providerTemplateId, approval_status: 'pending', rejected_reason: null })
      .eq('id', id).eq('tenant_id', tenantId).select(TEMPLATE_COLS).maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: 'persist_failed' });
    return res.json({ ok: true, template: data });
  });

  app.post(`${basePath}/templates/:id/refresh-status`, requireSupabaseAuth, async (req, res) => {
    const { id } = req.params;
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    if (!canManageTemplates(ctx.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
    const { data: tpl, error: tErr } = await supabase
      .from(TEMPLATES_TABLE).select('name').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (tErr) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    if (!tpl) return res.status(404).json({ ok: false, error: 'template_not_found' });
    const creds = await loadMetaCreds(supabase, tenantId);
    if (!creds.ok) return res.status(400).json({ ok: false, error: creds.error });
    const st = await fetchTemplateStatus({ wabaId: creds.wabaId, accessToken: creds.accessToken, name: tpl.name });
    if (!st.ok) return res.status(502).json({ ok: false, error: 'meta_status_failed', detail: st.detail });
    const { data, error } = await supabase.from(TEMPLATES_TABLE)
      .update({ approval_status: st.status, rejected_reason: st.reason || null })
      .eq('id', id).eq('tenant_id', tenantId).select(TEMPLATE_COLS).maybeSingle();
    if (error) return res.status(500).json({ ok: false, error: 'persist_failed' });
    return res.json({ ok: true, template: data });
  });

  // -- Campanhas --------------------------------------------------------------
  const CAMPAIGNS_TABLE = 'communication_campaigns';
  const CAMPAIGN_COLS = 'id, name, template_id, audience_id, max_recipients, send_window, throttle_per_min, avoid_resend, variable_mapping, internal_note, notify_on_complete, schedule, status, created_by_email, created_at, updated_at';

  // Valida que o template existe, é do tenant e está approved. Retorna {ok}|{ok:false,error}.
  async function assertTemplateUsable(tenantId, templateId) {
    if (!templateId) return { ok: false, error: 'template_required' };
    const { data, error } = await supabase
      .from('communication_templates').select('approval_status, body').eq('id', templateId).eq('tenant_id', tenantId).maybeSingle();
    if (error) return { ok: false, error: 'lookup_failed' };
    if (!data) return { ok: false, error: 'template_not_found' };
    if (data.approval_status !== 'approved') return { ok: false, error: 'template_not_approved' };
    return { ok: true, body: data.body };
  }
  // Normaliza um valor jsonb p/ objeto (rejeita array, que typeof reporta como 'object').
  function toJsonbObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  // Valida que o público existe e é do tenant.
  async function assertAudienceUsable(tenantId, audienceId) {
    if (!audienceId) return { ok: false, error: 'audience_required' };
    const { data, error } = await supabase
      .from('audiences').select('id').eq('id', audienceId).eq('tenant_id', tenantId).maybeSingle();
    if (error) return { ok: false, error: 'lookup_failed' };
    if (!data) return { ok: false, error: 'audience_not_found' };
    return { ok: true };
  }

  app.get(`${basePath}/campaigns`, requireSupabaseAuth, async (req, res) => {
    const tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    const { data: campaigns, error } = await supabase
      .from(CAMPAIGNS_TABLE).select(CAMPAIGN_COLS).eq('tenant_id', tenantId).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    // Agregação dos runs por campanha (sem N+1): 1 query, agrupa em memória.
    const ids = (campaigns || []).map((c) => c.id);
    const stats = {};
    if (ids.length > 0) {
      const { data: runs } = await supabase
        .from('agent_action_runs').select('campaign_id, sent_count, failed_count, completed_at, created_at')
        .eq('tenant_id', tenantId).in('campaign_id', ids);
      for (const run of runs || []) {
        const s = stats[run.campaign_id] || (stats[run.campaign_id] = { runs_count: 0, total_sent: 0, total_failed: 0, last_dispatched_at: null });
        s.runs_count += 1;
        s.total_sent += run.sent_count || 0;
        s.total_failed += run.failed_count || 0;
        const when = run.completed_at || run.created_at;
        if (when && (!s.last_dispatched_at || when > s.last_dispatched_at)) s.last_dispatched_at = when;
      }
    }
    const withStats = (campaigns || []).map((c) => ({ ...c, ...(stats[c.id] || { runs_count: 0, total_sent: 0, total_failed: 0, last_dispatched_at: null }) }));
    return res.json({ ok: true, campaigns: withStats });
  });

  app.post(`${basePath}/campaigns`, requireSupabaseAuth, async (req, res) => {
    const { tenantId, name, templateId, audienceId, maxRecipients, sendWindow, throttlePerMin, avoidResend, variableMapping, internalNote, notifyOnComplete } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    if (!canManageCampaigns(ctx.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
    if (!name || !String(name).trim()) return res.status(400).json({ ok: false, error: 'invalid_name' });
    if (maxRecipients != null && !(Number.isInteger(maxRecipients) && maxRecipients >= 1)) return res.status(400).json({ ok: false, error: 'invalid_max_recipients' });
    const t = await assertTemplateUsable(tenantId, templateId);
    if (!t.ok) return res.status(400).json({ ok: false, error: t.error });
    const a = await assertAudienceUsable(tenantId, audienceId);
    if (!a.ok) return res.status(400).json({ ok: false, error: a.error });
    const { data, error } = await supabase.from(CAMPAIGNS_TABLE).insert({
      tenant_id: tenantId, name: String(name).trim(), template_id: templateId, audience_id: audienceId,
      max_recipients: maxRecipients ?? null,
      send_window: toJsonbObject(sendWindow),
      throttle_per_min: throttlePerMin ?? null,
      avoid_resend: Boolean(avoidResend),
      variable_mapping: toJsonbObject(variableMapping),
      internal_note: internalNote ?? null,
      notify_on_complete: Boolean(notifyOnComplete),
      created_by_email: req.userEmail || null,
    }).select(CAMPAIGN_COLS).maybeSingle();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ ok: false, error: 'campaign_name_taken' });
      return res.status(500).json({ ok: false, error: 'persist_failed' });
    }
    return res.json({ ok: true, campaign: data });
  });

  app.put(`${basePath}/campaigns/:id`, requireSupabaseAuth, async (req, res) => {
    const { id } = req.params;
    const { tenantId, name, templateId, audienceId, maxRecipients, sendWindow, throttlePerMin, avoidResend, variableMapping, internalNote, notifyOnComplete } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    if (!canManageCampaigns(ctx.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
    const patch = {};
    if (name !== undefined) { if (!String(name).trim()) return res.status(400).json({ ok: false, error: 'invalid_name' }); patch.name = String(name).trim(); }
    if (templateId !== undefined) { const t = await assertTemplateUsable(tenantId, templateId); if (!t.ok) return res.status(400).json({ ok: false, error: t.error }); patch.template_id = templateId; }
    if (audienceId !== undefined) { const a = await assertAudienceUsable(tenantId, audienceId); if (!a.ok) return res.status(400).json({ ok: false, error: a.error }); patch.audience_id = audienceId; }
    if (maxRecipients !== undefined) { if (maxRecipients != null && !(Number.isInteger(maxRecipients) && maxRecipients >= 1)) return res.status(400).json({ ok: false, error: 'invalid_max_recipients' }); patch.max_recipients = maxRecipients ?? null; }
    if (sendWindow !== undefined) patch.send_window = toJsonbObject(sendWindow);
    if (throttlePerMin !== undefined) patch.throttle_per_min = throttlePerMin ?? null;
    if (avoidResend !== undefined) patch.avoid_resend = Boolean(avoidResend);
    if (variableMapping !== undefined) patch.variable_mapping = toJsonbObject(variableMapping);
    if (internalNote !== undefined) patch.internal_note = internalNote ?? null;
    if (notifyOnComplete !== undefined) patch.notify_on_complete = Boolean(notifyOnComplete);
    if (Object.keys(patch).length === 0) return res.status(400).json({ ok: false, error: 'nothing_to_update' });
    const { data, error } = await supabase.from(CAMPAIGNS_TABLE).update(patch).eq('id', id).eq('tenant_id', tenantId).select(CAMPAIGN_COLS).maybeSingle();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ ok: false, error: 'campaign_name_taken' });
      return res.status(500).json({ ok: false, error: 'persist_failed' });
    }
    if (!data) return res.status(404).json({ ok: false, error: 'campaign_not_found' });
    return res.json({ ok: true, campaign: data });
  });

  app.delete(`${basePath}/campaigns/:id`, requireSupabaseAuth, async (req, res) => {
    const { id } = req.params;
    const tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    if (!(ctx.role === 'admin' || ctx.role === 'owner')) return res.status(403).json({ ok: false, error: 'forbidden' });
    const { data: existing, error: lookErr } = await supabase
      .from(CAMPAIGNS_TABLE).select('id').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (lookErr) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    if (!existing) return res.status(404).json({ ok: false, error: 'campaign_not_found' });
    const { error } = await supabase.from(CAMPAIGNS_TABLE).delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) return res.status(500).json({ ok: false, error: 'delete_failed' });
    return res.json({ ok: true });
  });

  app.post(`${basePath}/campaigns/:id/dispatch`, requireSupabaseAuth, async (req, res) => {
    const { id } = req.params;
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    if (!canManageCampaigns(ctx.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
    const { data: camp, error: cErr } = await supabase
      .from(CAMPAIGNS_TABLE).select('id, audience_id, template_id, max_recipients').eq('id', id).eq('tenant_id', tenantId).maybeSingle();
    if (cErr) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    if (!camp) return res.status(404).json({ ok: false, error: 'campaign_not_found' });
    const tpl = await assertTemplateUsable(tenantId, camp.template_id);
    if (!tpl.ok) return res.status(400).json({ ok: false, error: tpl.error });
    const creds = await loadMetaCreds(supabase, tenantId);
    if (!creds.ok) return res.status(400).json({ ok: false, error: creds.error });
    // MESMO caminho de /preview e /confirm (verificado em routes.js:200-233):
    const user = { id: req.userId, email: req.userEmail, role: ctx.role, brokerName: ctx.brokerName };
    const mode = await resolvePublicSourceMode(supabase, tenantId);
    const prev = await previewOperation(
      supabase,
      { audienceId: camp.audience_id, tenantId, mode, campaignId: camp.id, user },
      { maxRecipients: camp.max_recipients ?? undefined },
    );
    if (!prev.ok || !prev.previewToken) return res.status(400).json({ ok: false, error: prev.error || 'preview_failed' });
    const conf = await confirmOperation(supabase, { previewToken: prev.previewToken, tenantId, message: tpl.body, user });
    if (!conf.ok) return res.status(400).json({ ok: false, error: conf.error || 'confirm_failed' });
    // Drena a fila imediatamente (best-effort), idêntico ao /confirm (routes.js:233).
    if (conf.enqueued > 0) {
      runDueActions(supabase, { deliver: schedulerDeps.deliver, schedulerDeps, getEnvironment: schedulerDeps.getEnvironment })
        .catch((err) => console.error('[campaigns] drain pós-dispatch falhou:', err?.message));
    }
    return res.json({ ok: true, runId: conf.runId, enqueued: conf.enqueued });
  });

  app.get(`${basePath}/campaigns/:id/runs`, requireSupabaseAuth, async (req, res) => {
    const { id } = req.params;
    const tenantId = req.query.tenantId;
    if (!tenantId) return res.status(400).json({ ok: false, error: 'missing_tenant' });
    const ctx = await resolveUserContext(supabase, req, tenantId);
    if (!ctx.ok) return res.status(statusFor(ctx.error)).json({ ok: false, error: ctx.error });
    const { data, error } = await supabase
      .from('agent_action_runs')
      .select('id, command_text, status, found_count, eligible_count, sent_count, failed_count, deduplicated_count, requested_by_email, created_at, completed_at')
      .eq('tenant_id', tenantId).eq('campaign_id', id).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: 'lookup_failed' });
    return res.json({ ok: true, runs: data || [] });
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

export const __test__ = { resolveUserContext, statusFor, isPlatformOwner, resolvePublicSourceMode, applyRunsFilters, computeProgress, canManageAudiences, canManageTemplates, canManageCampaigns, loadMetaCreds, registerDispatchRoutes, makeDispatchDeps };
