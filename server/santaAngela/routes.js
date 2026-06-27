/**
 * Rotas da integração Santa Ângela: config (salvar/ler/testar), disparo de sync e status.
 *
 * Auth (dois níveis, espelha server/zap/routes.js):
 *  - requireOwnerOrTenantAdmin: owner OU admin/team_leader do PRÓPRIO tenant
 *    (req.body.tenantId); role lida de tenant_memberships por tenant_id+user_id.
 *  - requireOwner: só o owner (sync/run e sync/status operam sobre TODOS os tenants).
 */
import { createSantaAngelaConfigResolver } from './configResolver.js';
import { createSantaAngelaApiClient } from './santaAngelaApiClient.js';
import { createSantaAngelaSyncService } from './santaAngelaSyncService.js';
import { createSantaAngelaRunner } from './syncRunner.js';

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;
const TENANT_MANAGER_ROLES = new Set(['admin', 'team_leader']);
const CONFIG_TABLE = 'tenant_santa_angela_config';

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
      console.error('[santa-angela] erro de auth:', err?.message);
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
      if (error) { console.error('[santa-angela] membership lookup falhou:', error.message); return res.status(500).json({ ok: false, error: 'auth_internal_error' }); }
      if (!membership || !TENANT_MANAGER_ROLES.has(membership.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
      next();
    } catch (err) {
      console.error('[santa-angela] erro de auth:', err?.message);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

export function registerSantaAngelaRoutes(app, supabase, options = {}) {
  const requireOwner = makeRequireOwner(supabase);
  const requireManager = makeRequireOwnerOrTenantAdmin(supabase);
  const resolver = options.resolver || createSantaAngelaConfigResolver({ supabase });
  const apiClient = options.apiClient || createSantaAngelaApiClient({ resolver });
  const syncService = options.syncService || createSantaAngelaSyncService({ supabase, apiClient });
  // Runner compartilhado com o scheduler (mesma guarda de reentrância): o sync é
  // automático via cron; esta rota é disparo operacional/on-demand de um ciclo
  // COMPLETO (todos os tenants active), não um botão por-tenant na UI.
  const runner = options.runner || createSantaAngelaRunner(syncService);

  app.post('/api/v1/santa-angela/config', requireManager, async (req, res) => {
    const { tenantId, baseUrl, apiKey, status } = req.body || {};
    if (!tenantId || !baseUrl) return res.status(400).json({ ok: false, error: 'tenantId e baseUrl são obrigatórios' });
    const r = await resolver.saveConfig(tenantId, { baseUrl, apiKey, status });
    if (!r.ok) return res.status(400).json(r);
    res.status(200).json({ ok: true });
  });

  // Leitura para a UI (corrige o "some no F5"): metadados visíveis, api_key NUNCA —
  // só a flag hasApiKey. Sem esta rota o front não tinha como recarregar a config.
  app.post('/api/v1/santa-angela/config/get', requireManager, async (req, res) => {
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    const cfg = await resolver.resolveConfig(tenantId);
    if (!cfg) return res.status(200).json({ ok: true, config: null });
    res.status(200).json({
      ok: true,
      config: { tenantId: cfg.tenantId, baseUrl: cfg.baseUrl, status: cfg.status, hasApiKey: Boolean(cfg.apiKey) },
    });
  });

  app.post('/api/v1/santa-angela/config/test', requireManager, async (req, res) => {
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    const r = await apiClient.fetchLeads(tenantId);
    res.status(200).json({ ok: r.ok, status: r.status, error: r.error });
  });

  // Dispara um ciclo completo em background e responde na hora (202). O resultado
  // vai para os logs / tenant_santa_angela_config; a guarda de reentrância evita
  // sobrepor um ciclo do cron. Sem tenantId: o ciclo cobre todos os active.
  app.post('/api/v1/santa-angela/sync/run', requireOwner, (req, res) => {
    const { started, alreadyRunning } = runner.trigger();
    res.status(202).json({ ok: true, started, message: started
      ? 'sync iniciado — acompanhe em GET /api/v1/santa-angela/sync/status'
      : (alreadyRunning ? 'sync já em andamento' : 'sync não iniciado') });
  });

  app.get('/api/v1/santa-angela/sync/status', requireOwner, async (req, res) => {
    const { data, error } = await supabase
      .from(CONFIG_TABLE).select('tenant_id,status,last_sync_at,leads_count')
      .order('last_sync_at', { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.status(200).json({ ok: true, integrations: data || [] });
  });
}
