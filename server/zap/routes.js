/**
 * Rotas da integração ZAP Imóveis: CRUD da config por tenant, geração/rotação do
 * feed_secret, teste e status.
 *
 * Auth (dois níveis):
 *  - requireOwnerOrTenantAdmin: o owner da plataforma OU um admin/team_leader do
 *    PRÓPRIO tenant (req.body.tenantId). Isolamento: o admin só gerencia a sua
 *    imobiliária — a role é lida de tenant_memberships filtrando por tenant_id+user_id.
 *  - requireOwner: só o owner (para GET /status, que lista TODOS os tenants).
 * O secret NUNCA volta ao front em leitura: GET /config devolve só `hasSecret`.
 * O secret só aparece (uma vez) na resposta de save/rotate, para colar no painel da ZAP.
 */
import { createZapConfigResolver } from './zapConfigResolver.js';
import { generateFeedSecret } from './secretLookup.js';

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;
const TENANT_MANAGER_ROLES = new Set(['admin', 'team_leader']);
const CONFIG_TABLE = 'tenant_zap_config';

// Autentica o JWT e devolve { user } ou responde o erro. Reuso interno dos gates.
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
      console.error('[zap] erro de auth:', err?.message);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

// Owner (qualquer tenant) OU admin/team_leader do tenant em req.body.tenantId.
// O isolamento vem do filtro tenant_id+user_id: um admin nunca resolve membership
// de outro tenant, então nunca gerencia a integração de outra imobiliária.
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
      if (error) { console.error('[zap] membership lookup falhou:', error.message); return res.status(500).json({ ok: false, error: 'auth_internal_error' }); }
      if (!membership || !TENANT_MANAGER_ROLES.has(membership.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
      next();
    } catch (err) {
      console.error('[zap] erro de auth:', err?.message);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

export function registerZapRoutes(app, supabase, options = {}) {
  const requireOwner = makeRequireOwner(supabase);
  const requireManager = makeRequireOwnerOrTenantAdmin(supabase);
  const resolver = options.resolver || createZapConfigResolver({ supabase });

  // Salva/edita config. Se `generateSecret` for true e ainda não houver secret,
  // gera um e devolve uma vez. Campos não-secretos são parciais (edição incremental).
  app.post('/api/v1/zap/config', requireManager, async (req, res) => {
    const { tenantId, generateSecret, ...fields } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });

    let secret;
    if (generateSecret) { secret = generateFeedSecret(); fields.feedSecret = secret; }

    const r = await resolver.saveConfig(tenantId, fields);
    if (!r.ok) return res.status(400).json(r);
    res.status(200).json({ ok: true, ...(secret ? { secret } : {}) });
  });

  // Leitura para a UI: metadados visíveis, segredos NUNCA — só flag hasSecret.
  app.post('/api/v1/zap/config/get', requireManager, async (req, res) => {
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    const cfg = await resolver.resolveByTenant(tenantId);
    if (!cfg) return res.status(200).json({ ok: true, config: null });
    res.status(200).json({
      ok: true,
      config: {
        tenantId: cfg.tenantId, status: cfg.status, provider: cfg.provider,
        contactName: cfg.contactName, contactEmail: cfg.contactEmail, contactPhone: cfg.contactPhone,
        publicationType: cfg.publicationType, detailBaseUrl: cfg.detailBaseUrl, resyncUrl: cfg.resyncUrl,
        hasSecret: Boolean(cfg.feedSecret), hasResyncToken: Boolean(cfg.resyncToken),
      },
    });
  });

  // Rotaciona o feed_secret e devolve o novo uma vez.
  app.post('/api/v1/zap/config/rotate-secret', requireManager, async (req, res) => {
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    const r = await resolver.rotateSecret(tenantId);
    if (!r.ok) return res.status(400).json(r);
    res.status(200).json({ ok: true, secret: r.secret });
  });

  // "Testar conexão": a ZAP não tem endpoint de auth nosso para bater — o que valida
  // a integração é existir config com secret. Confirma que o tenant resolve e tem secret.
  app.post('/api/v1/zap/config/test', requireManager, async (req, res) => {
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    const cfg = await resolver.resolveByTenant(tenantId);
    const ok = Boolean(cfg && cfg.feedSecret && cfg.status === 'active');
    res.status(200).json({ ok, error: ok ? undefined : 'tenant sem config ativa ou sem feed_secret' });
  });

  // Lista status/observabilidade por tenant — sem segredos.
  app.get('/api/v1/zap/sync/status', requireOwner, async (req, res) => {
    const { data, error } = await supabase
      .from(CONFIG_TABLE).select('tenant_id,status,last_feed_at,last_lead_at,last_error')
      .order('last_feed_at', { ascending: false });
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.status(200).json({ ok: true, integrations: data || [] });
  });
}
