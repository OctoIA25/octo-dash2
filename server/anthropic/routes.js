/**
 * Rotas da integração Anthropic. Auth espelha server/contact2sale/routes.js:
 *  - requireOwnerOrTenantAdmin: owner OU admin/team_leader do tenant (req.body.tenantId).
 *  - requireOwner: só o owner (usage — dado sensível de consumo).
 * A API key nunca volta ao frontend (só maskedKey / hasKey).
 */
import { createAnthropicConfigResolver } from './configResolver.js';
import { createAnthropicService, weekWindow } from './service.js';
import { fetchCostReport, AnthropicApiError } from './client.js';
import { checkAndSendOwnerAlert } from './alerts.js';

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
    } catch (err) { console.error('[anthropic] erro de auth:', err?.message); res.status(500).json({ ok: false, error: 'auth_internal_error' }); }
  };
}

function makeRequireOwnerOrTenantAdmin(supabase) {
  return async function requireOwnerOrTenantAdmin(req, res, next) {
    try {
      const user = await authenticate(supabase, req, res);
      if (!user) return;
      if (isPlatformOwner(user.email)) return next();
      const tenantId = req.body?.tenantId;
      if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
      const { data: membership, error } = await supabase
        .from('tenant_memberships').select('role').eq('tenant_id', tenantId).eq('user_id', user.id).maybeSingle();
      if (error) { console.error('[anthropic] membership lookup falhou:', error.message); return res.status(500).json({ ok: false, error: 'auth_internal_error' }); }
      if (!membership || !TENANT_MANAGER_ROLES.has(membership.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
      next();
    } catch (err) { console.error('[anthropic] erro de auth:', err?.message); res.status(500).json({ ok: false, error: 'auth_internal_error' }); }
  };
}

/** last_state ANTES do recálculo manual — mesmo padrão best-effort do scheduler. */
async function readPrevState(supabase, tenantId) {
  try {
    const { data, error } = await supabase
      .from('tenant_anthropic_config').select('last_state').eq('tenant_id', tenantId).maybeSingle();
    if (error) { console.warn(`[anthropic] readPrevState (rota) falhou tenant=${tenantId}: ${error.message}`); return null; }
    return data?.last_state ?? null;
  } catch (err) {
    console.warn(`[anthropic] readPrevState (rota) falhou tenant=${tenantId}: ${err?.message}`);
    return null;
  }
}

function maskKey(apiKey) {
  if (!apiKey) return null;
  const tail = String(apiKey).slice(-4);
  return `••••${tail}`;
}

export function registerAnthropicRoutes(app, supabase, options = {}) {
  const requireManager = makeRequireOwnerOrTenantAdmin(supabase);
  const requireOwner = makeRequireOwner(supabase);
  const resolver = options.resolver || createAnthropicConfigResolver({ supabase });
  const service = options.service || createAnthropicService({ supabase, resolver });
  const clientImpl = options.clientImpl || fetchCostReport;

  app.post('/api/v1/anthropic/config', requireManager, async (req, res) => {
    const { tenantId, apiKey, alertThresholdBps, mode } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    if (alertThresholdBps !== undefined && alertThresholdBps !== null) {
      if (!Number.isInteger(alertThresholdBps) || alertThresholdBps < 1 || alertThresholdBps > 10000) {
        return res.status(400).json({ ok: false, error: 'alertThresholdBps inválido (inteiro 1..10000)' });
      }
    }
    if (mode !== undefined && mode !== null && mode !== 'api' && mode !== 'max') {
      return res.status(400).json({ ok: false, error: "mode inválido ('api'|'max')" });
    }
    const saved = await resolver.saveConfig(tenantId, { apiKey, alertThresholdBps, mode });
    if (!saved.ok) return res.status(400).json(saved);
    res.status(200).json({ ok: true });
  });

  app.post('/api/v1/anthropic/config/get', requireManager, async (req, res) => {
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    const cfg = await resolver.resolveConfig(tenantId);
    if (!cfg) return res.status(200).json({ ok: true, config: null });
    res.status(200).json({
      ok: true,
      config: {
        tenantId: cfg.tenantId, status: cfg.status,
        hasKey: Boolean(cfg.apiKey), maskedKey: maskKey(cfg.apiKey),
        weeklyLimitUsd: cfg.weeklyLimitUsd ?? null,
        lastSyncedAt: cfg.lastSyncedAt ?? null,
        alertThresholdBps: cfg.alertThresholdBps ?? 1430,
        mode: cfg.mode ?? 'api',
      },
    });
  });

  app.post('/api/v1/anthropic/test', requireManager, async (req, res) => {
    const { tenantId, apiKey } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    const key = apiKey || (await resolver.resolveConfig(tenantId))?.apiKey;
    if (!key) return res.status(400).json({ ok: false, error: 'sem_key' });
    const w = weekWindow();
    try {
      await clientImpl({ apiKey: key, startingAt: w.startsAt, endingAt: w.endsAt });
      res.status(200).json({ ok: true });
    } catch (err) {
      const code = err instanceof AnthropicApiError ? err.code : 'provider_error';
      res.status(200).json({ ok: false, error: code });
    }
  });

  app.post('/api/v1/anthropic/usage', requireOwner, async (req, res) => {
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    const prevState = await readPrevState(supabase, tenantId);
    const usage = await service.getWeeklyUsage(tenantId);
    await checkAndSendOwnerAlert(supabase, { dto: usage, prevState, tenantId });
    res.status(200).json({ ok: true, usage });
  });

  app.post('/api/v1/anthropic/refresh', requireManager, async (req, res) => {
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    const prevState = await readPrevState(supabase, tenantId);
    const dto = await service.getWeeklyUsage(tenantId);
    await checkAndSendOwnerAlert(supabase, { dto, prevState, tenantId });
    res.status(200).json({ ok: true });
  });
}
