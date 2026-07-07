/**
 * Rotas da integração Contact2Sale: config (salvar/ler/testar) + sync (run/status).
 *
 * Auth espelha server/santaAngela/routes.js (que espelha server/zap/routes.js):
 *  - requireOwnerOrTenantAdmin: owner OU admin/team_leader do PRÓPRIO tenant
 *    (req.body.tenantId); role lida de tenant_memberships por tenant_id+user_id.
 *  - requireOwner: só o owner (sync/run e sync/status operam sobre TODOS os tenants).
 *
 * D2 (camada de serviço): ativar a C2S valida o token na origem (GET /me) e
 * desativa kenlo_integrations NA MESMA requisição. O trigger de banco
 * (20260706_provider_exclusivity) é o cinto de segurança para caminhos de
 * escrita que não passam por aqui.
 */
import { createC2sConfigResolver } from './configResolver.js';
import { createC2sApiClient } from './c2sApiClient.js';
import { makeC2sRunner } from './scheduler.js';

const CONFIG_TABLE = 'tenant_contact2sale_config';
const STALLED_AFTER_MS = 10 * 60 * 1000; // running sem heartbeat há 10min = processo morreu

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;
const TENANT_MANAGER_ROLES = new Set(['admin', 'team_leader']);

async function authenticate(supabase, req, res) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) { res.status(401).json({ ok: false, error: 'missing_authorization' }); return null; }
  const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
  if (error || !data?.user) { res.status(401).json({ ok: false, error: 'invalid_token' }); return null; }
  return data.user;
}

function makeRequireOwner(supabase) {
  return async function requireOwner(req, res, next) {
    try {
      const user = await authenticate(supabase, req, res);
      if (!user) return;
      if (!isPlatformOwner(user.email)) return res.status(403).json({ ok: false, error: 'forbidden' });
      next();
    } catch (err) {
      console.error('[contact2sale] erro de auth:', err?.message);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

// Owner (qualquer tenant) OU admin/team_leader do tenant em req.body.tenantId.
function makeRequireOwnerOrTenantAdmin(supabase) {
  return async function requireOwnerOrTenantAdmin(req, res, next) {
    try {
      const user = await authenticate(supabase, req, res);
      if (!user) return;
      if (isPlatformOwner(user.email)) return next();

      const tenantId = req.body?.tenantId;
      if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });

      const { data: membership, error } = await supabase
        .from('tenant_memberships').select('role')
        .eq('tenant_id', tenantId).eq('user_id', user.id).maybeSingle();
      if (error) { console.error('[contact2sale] membership lookup falhou:', error.message); return res.status(500).json({ ok: false, error: 'auth_internal_error' }); }
      if (!membership || !TENANT_MANAGER_ROLES.has(membership.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
      next();
    } catch (err) {
      console.error('[contact2sale] erro de auth:', err?.message);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

export function registerContact2SaleRoutes(app, supabase, options = {}) {
  const requireManager = makeRequireOwnerOrTenantAdmin(supabase);
  const requireOwner = makeRequireOwner(supabase);
  const resolver = options.resolver || createC2sConfigResolver({ supabase });
  const apiClient = options.apiClient || createC2sApiClient({ resolver });
  // Runner ÚNICO compartilhado com o scheduler quando injetado pelo entrypoint
  // (prod); em dev (api-server) constrói o próprio — a guarda por tenant vale
  // por processo de qualquer forma.
  const runner = options.runner || makeC2sRunner(supabase, { resolver, apiClient });

  app.post('/api/v1/contact2sale/config', requireManager, async (req, res) => {
    const { tenantId, apiToken, status } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    if (status && status !== 'active' && status !== 'inactive') {
      return res.status(400).json({ ok: false, error: 'status inválido' });
    }

    if (status === 'active') {
      // Ativar sem token utilizável seria um sync natimorto — valida ANTES.
      const effectiveToken = apiToken || (await resolver.resolveConfig(tenantId))?.apiToken;
      if (!effectiveToken) return res.status(400).json({ ok: false, error: 'token_obrigatorio_para_ativar' });
      const me = await apiClient.getMe({ tenantId, apiToken: effectiveToken });
      if (!me.ok) {
        // Indisponibilidade ≠ token inválido: não induzir o admin a regenerar
        // um token bom durante instabilidade da C2S.
        if (me.status === 0) return res.status(503).json({ ok: false, error: 'c2s_indisponivel' });
        return res.status(400).json({ ok: false, error: 'token_invalido', status: me.status });
      }

      const saved = await resolver.saveConfig(tenantId, { apiToken, status: 'active' });
      if (!saved.ok) return res.status(400).json(saved);

      // D2 — camada de serviço: C2S ativa ⇒ Kenlo inativo (trigger de banco cobre
      // os demais caminhos; falha aqui não derruba a ativação).
      const { error: kenloErr } = await supabase.from('kenlo_integrations')
        .update({ status: 'inactive' }).eq('tenant_id', tenantId).eq('status', 'active');
      if (kenloErr) console.error(`[contact2sale] desativar kenlo falhou (trigger de banco cobre): ${kenloErr.message}`);

      return res.status(200).json({ ok: true, company: me.body?.name || null });
    }

    const r = await resolver.saveConfig(tenantId, { apiToken, status });
    if (!r.ok) return res.status(400).json(r);
    res.status(200).json({ ok: true });
  });

  // Leitura para a UI: metadados visíveis, token NUNCA — só a flag hasToken.
  app.post('/api/v1/contact2sale/config/get', requireManager, async (req, res) => {
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    const cfg = await resolver.resolveConfig(tenantId);
    if (!cfg) return res.status(200).json({ ok: true, config: null });
    res.status(200).json({
      ok: true,
      config: { tenantId: cfg.tenantId, status: cfg.status, hasToken: Boolean(cfg.apiToken) },
    });
  });

  // Testa um token (fornecido ou armazenado) contra GET /me sem salvar nada.
  app.post('/api/v1/contact2sale/config/test', requireManager, async (req, res) => {
    const { tenantId, apiToken } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    const token = apiToken || (await resolver.resolveConfig(tenantId))?.apiToken;
    if (!token) return res.status(400).json({ ok: false, error: 'sem_token' });
    const me = await apiClient.getMe({ tenantId, apiToken: token });
    res.status(200).json({ ok: me.ok, status: me.status, company: me.body?.name || null, error: me.error || null });
  });

  // Dispara ciclos em background e responde na hora (202). tenantId restringe o
  // alvo; full=true zera os cursores do tenant e força re-walk COMPLETO da base
  // (modo BACKFILL → silencioso por D3). Se o tenant já está em ciclo, full=true
  // responde 409 ANTES de qualquer reset: cursor parcial seria perda silenciosa
  // da intenção explícita de resync completo.
  app.post('/api/v1/contact2sale/sync/run', requireOwner, async (req, res) => {
    const { tenantId, full } = req.body || {};
    if (full && !tenantId) {
      return res.status(400).json({ ok: false, error: 'full exige tenantId (resync completo é por tenant)' });
    }
    if (full && runner.isRunning?.(tenantId)) {
      return res.status(409).json({
        ok: false,
        error: 'sync_em_andamento',
        message: 'Já existe um ciclo em andamento para este tenant; tente o full resync novamente após concluir.',
      });
    }
    if (full) {
      const { error } = await supabase.from(CONFIG_TABLE)
        .update({ last_full_sync_at: null, backfill_cursor: null })
        .eq('tenant_id', tenantId);
      if (error) return res.status(500).json({ ok: false, error: error.message });
    }
    let r;
    try {
      r = await runner.trigger({ tenantId });
    } catch (err) {
      console.error('[contact2sale] trigger falhou:', err?.message);
      return res.status(500).json({ ok: false, error: 'sync_trigger_failed' });
    }
    res.status(202).json({
      ok: true, ...r,
      message: r.started > 0
        ? 'sync iniciado — acompanhe em GET /api/v1/contact2sale/sync/status'
        : 'nenhum ciclo iniciado (sem integração ativa ou tenant já em andamento)',
    });
  });

  app.get('/api/v1/contact2sale/sync/status', requireOwner, async (req, res) => {
    const { data, error } = await supabase
      .from(CONFIG_TABLE)
      .select('tenant_id,status,last_sync_at,last_full_sync_at,backfill_cursor,leads_count,sync_state')
      .order('last_sync_at', { ascending: false, nullsFirst: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    const integrations = (data || []).map((row) => {
      let state = null;
      try { state = row.sync_state ? JSON.parse(row.sync_state) : null; } catch { state = null; }
      // stalled = "processo morreu no meio", não "backfill demorado": o engine
      // grava heartbeat_at a cada página — só a ausência dele por 10min acusa.
      const ref = state?.heartbeat_at || state?.started_at;
      const stalled = Boolean(state?.status === 'running' && ref && (Date.now() - Date.parse(ref) > STALLED_AFTER_MS));
      return { ...row, sync_state: state, stalled };
    });
    res.status(200).json({ ok: true, integrations });
  });
}
