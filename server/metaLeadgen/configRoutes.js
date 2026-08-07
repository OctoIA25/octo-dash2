/**
 * Rotas de configuração do Meta Lead Ads. Auth espelha
 * server/contact2sale/routes.js: owner da plataforma OU admin/team_leader do
 * próprio tenant.
 *
 * Segredos são via de mão única: entram no POST, nunca saem na leitura. A
 * leitura devolve só booleanos dizendo o que já está gravado, mais a URL do
 * webhook e o verify token — que não são segredos, são o que a imobiliária
 * precisa colar no app dela.
 *
 * A leitura é POST /config/get, não GET, de propósito: o middleware de auth
 * lê tenantId SÓ do corpo (fonte única, mesma dos módulos irmãos — C2S, Santa
 * Ângela, zap). Um GET leria de req.query, uma segunda fonte que pode divergir
 * do corpo usado para autorizar — foi exatamente essa divergência que causou
 * um IDOR (tenant A autoriza com o próprio id no corpo, lê a config do tenant
 * B pela query). Não "consertar" de volta para GET.
 */
import { createMetaConfigResolver } from './configResolver.js';

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

function makeRequireManager(supabase) {
  return async function requireManager(req, res, next) {
    try {
      const user = await authenticate(supabase, req, res);
      if (!user) return;
      if (isPlatformOwner(user.email)) return next();

      const tenantId = req.body?.tenantId;
      if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });

      const { data: membership, error } = await supabase
        .from('tenant_memberships').select('role')
        .eq('tenant_id', tenantId).eq('user_id', user.id).maybeSingle();
      if (error) { console.error('[meta-leadgen] membership lookup falhou:', error.message); return res.status(500).json({ ok: false, error: 'auth_internal_error' }); }
      if (!membership || !TENANT_MANAGER_ROLES.has(membership.role)) return res.status(403).json({ ok: false, error: 'forbidden' });
      next();
    } catch (err) {
      console.error('[meta-leadgen] erro de auth:', err?.message);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

// O processor injeta o lead via POST /api/v1/leads com a API key do tenant.
// Sem key ativa a integração recebe o webhook e falha no processamento — falha
// tardia, invisível para quem acabou de configurar. Barrar na ativação.
async function hasActiveCrmApiKey(supabase, tenantId) {
  const { data, error } = await supabase
    .from('tenant_api_keys').select('tenant_id')
    .eq('tenant_id', tenantId).eq('provider', 'crm').eq('status', 'active')
    .limit(1);
  if (error) { console.error('[meta-leadgen] lookup de api key falhou:', error.message); return false; }
  return Array.isArray(data) && data.length > 0;
}

export function registerMetaConfigRoutes(app, supabase, options = {}) {
  const requireManager = makeRequireManager(supabase);
  const resolver = options.resolver || createMetaConfigResolver({ supabase });
  const publicBaseUrl = options.publicBaseUrl || process.env.PUBLIC_BASE_URL || 'https://octodash.octoia.org';
  const webhookUrlFor = (webhookToken) => `${publicBaseUrl}/api/v1/integrations/meta/webhook/${webhookToken}`;

  // Único formato de saída para GET e POST — evita a divergência silenciosa
  // entre rotas (ex.: uma delas esquecer hasAppSecret/hasAccessToken e a
  // legenda "já configurado" sumir da tela mesmo com o segredo intacto no banco).
  const toClientConfig = (cfg) => ({
    pageId: cfg?.pageId,
    status: cfg?.status,
    verifyToken: cfg?.verifyToken,
    webhookUrl: cfg ? webhookUrlFor(cfg.webhookToken) : null,
    hasAppSecret: Boolean(cfg?.appSecret),
    hasAccessToken: Boolean(cfg?.accessToken),
  });

  app.post('/api/v1/integrations/meta/config/get', requireManager, async (req, res) => {
    try {
      const tenantId = req.body?.tenantId;
      if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });
      let cfg = await resolver.resolveByTenant(tenantId);
      if (!cfg) {
        // A URL do webhook e o verify token são o PRIMEIRO passo do onboarding —
        // a imobiliária precisa colá-los no app da Meta antes de preencher
        // qualquer outro campo. Mas webhook_token/verify_token só existem
        // (são DEFAULT da coluna) depois que a linha existe, e a linha só
        // nascia no primeiro saveConfig. Resultado: tenant novo não via nada
        // para copiar. Provisiona a linha aqui, na leitura, sem nenhum campo —
        // status nasce 'inactive', então o webhook segue 404 até ativação
        // explícita (ver gate de API key abaixo).
        const created = await resolver.saveConfig(tenantId, {});
        if (!created.ok) return res.status(500).json({ ok: false, error: created.error });
        cfg = await resolver.resolveByTenant(tenantId);
      }
      if (!cfg) return res.json({ ok: true, config: null });
      return res.json({ ok: true, config: toClientConfig(cfg) });
    } catch (err) {
      console.error('[meta-leadgen] leitura de config falhou:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  app.post('/api/v1/integrations/meta/config', requireManager, async (req, res) => {
    try {
      const { tenantId, pageId, appSecret, accessToken, status } = req.body || {};
      if (!tenantId) return res.status(400).json({ ok: false, error: 'tenantId obrigatório' });

      if (status === 'active' && !(await hasActiveCrmApiKey(supabase, tenantId))) {
        return res.status(400).json({
          ok: false,
          error: 'api_key_ausente',
          message: 'Este tenant não tem API key ativa. Gere uma em Integrações antes de ativar o Meta Lead Ads.',
        });
      }

      const saved = await resolver.saveConfig(tenantId, { pageId, appSecret, accessToken, status });
      if (!saved.ok) return res.status(500).json({ ok: false, error: saved.error });

      const cfg = await resolver.resolveByTenant(tenantId);
      // Mesmo formato do GET (toClientConfig): o cliente troca o config
      // inteiro pela resposta do POST (setConfig), então uma fonte só de
      // formato evita divergência silenciosa entre rotas.
      return res.json({ ok: true, config: toClientConfig(cfg) });
    } catch (err) {
      console.error('[meta-leadgen] POST config falhou:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });
}
