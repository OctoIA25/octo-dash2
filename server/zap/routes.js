/**
 * Rotas owner-only da integração ZAP Imóveis: CRUD da config por tenant, geração/
 * rotação do feed_secret, teste e status. Owner-guard espelha server/santaAngela/routes.js.
 *
 * Auth: requireOwner (dono da plataforma) — mesmo modelo de Kenlo/SA, que gerencia
 * integrações de qualquer tenant via impersonation. Não inventamos um modelo novo.
 * O secret NUNCA volta ao front em leitura: GET /config devolve só `hasSecret`.
 * O secret só aparece (uma vez) na resposta de save/rotate, para colar no painel da ZAP.
 */
import { createZapConfigResolver } from './zapConfigResolver.js';
import { generateFeedSecret } from './secretLookup.js';

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;
const CONFIG_TABLE = 'tenant_zap_config';

function makeRequireOwner(supabase) {
  return async function requireOwner(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_authorization' });
      const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
      if (error || !data?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });
      if (!isPlatformOwner(data.user.email)) return res.status(403).json({ ok: false, error: 'forbidden' });
      next();
    } catch (err) {
      console.error('[zap] erro de auth:', err?.message);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

export function registerZapRoutes(app, supabase, options = {}) {
  const requireOwner = makeRequireOwner(supabase);
  const resolver = options.resolver || createZapConfigResolver({ supabase });

  // Salva/edita config. Se `generateSecret` for true e ainda não houver secret,
  // gera um e devolve uma vez. Campos não-secretos são parciais (edição incremental).
  app.post('/api/v1/zap/config', requireOwner, async (req, res) => {
    const { tenantId, generateSecret, ...fields } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });

    let secret;
    if (generateSecret) { secret = generateFeedSecret(); fields.feedSecret = secret; }

    const r = await resolver.saveConfig(tenantId, fields);
    if (!r.ok) return res.status(400).json(r);
    res.status(200).json({ ok: true, ...(secret ? { secret } : {}) });
  });

  // Leitura para a UI: metadados visíveis, segredos NUNCA — só flag hasSecret.
  app.post('/api/v1/zap/config/get', requireOwner, async (req, res) => {
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
  app.post('/api/v1/zap/config/rotate-secret', requireOwner, async (req, res) => {
    const { tenantId } = req.body || {};
    if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
    const r = await resolver.rotateSecret(tenantId);
    if (!r.ok) return res.status(400).json(r);
    res.status(200).json({ ok: true, secret: r.secret });
  });

  // "Testar conexão": a ZAP não tem endpoint de auth nosso para bater — o que valida
  // a integração é existir config com secret. Confirma que o tenant resolve e tem secret.
  app.post('/api/v1/zap/config/test', requireOwner, async (req, res) => {
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
