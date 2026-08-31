/**
 * 🌐 Integração Google Analytics (GA4) — rotas /api/v1/integrations/ga/*.
 *
 *   GET  /status  — conectado? property? e-mail da service account p/ setup.
 *   POST /config  — grava o property_id do tenant (só admin/platform owner),
 *                   validando antes com um runReport mínimo (probe).
 *   GET  /report  — batchRunReports normalizado, cache 1h por property+range.
 *
 * SEGURANÇA: service_role bypassa RLS — o isolamento por tenant é deste
 * código (JWT → resolveTenant, mesmo contrato do módulo kpis). A chave da
 * service account vem do env e nunca aparece em log ou resposta.
 */
import { makeRequireSupabaseAuth, resolveTenant } from '../kpis/index.js';
import { memoizeTtl } from '../utils/ttlMemo.js';
import { gaEnvConfig, makeGaTokenProvider } from './gaAuth.js';
import { fetchGaReport, probeProperty, RANGES } from './gaReport.js';

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const REPORT_CACHE_MS = 60 * 60_000;

const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;

async function isAdminOrOwner(supabase, req, tenantId) {
  if (isPlatformOwner(req.userEmail)) return true;
  const { data, error } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', req.userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return data?.role === 'admin';
}

async function getIntegration(supabase, tenantId) {
  const { data, error } = await supabase
    .from('ga_integrations')
    .select('property_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function registerGaRoutes(app, supabase, deps = {}) {
  const { env = process.env, fetchImpl = fetch, now = Date.now } = deps;
  const requireAuth = makeRequireSupabaseAuth(supabase);

  // Provider de token é único do processo (a service account é global).
  const saConfig = gaEnvConfig(env);
  const getAccessToken = saConfig
    ? makeGaTokenProvider({ ...saConfig, fetchImpl, now })
    : null;

  // Cache 1h por propriedade+range. memoizeTtl (server/utils/ttlMemo.js) só
  // faz `cache.set` DEPOIS de `await fn(...)` resolver — uma rejeição estoura
  // o `await` e sai da função antes do `set`, então nunca fica cacheada.
  // Retries após erro batem a API de novo, e não precisamos de shouldCache.
  const cachedReport = memoizeTtl(
    (propertyId, range) => fetchGaReport({ propertyId, range, getAccessToken, fetchImpl }),
    REPORT_CACHE_MS,
    { keyOf: (propertyId, range) => `${propertyId}:${range}`, now },
  );

  app.get('/api/v1/integrations/ga/status', requireAuth, async (req, res) => {
    try {
      const resolved = await resolveTenant(supabase, req);
      if (resolved.error) return res.status(resolved.status).json({ ok: false, error: resolved.error });
      const [integration, canManage] = await Promise.all([
        getIntegration(supabase, resolved.tenantId),
        isAdminOrOwner(supabase, req, resolved.tenantId),
      ]);
      res.json({
        ok: true,
        connected: Boolean(integration),
        propertyId: integration?.property_id || null,
        serviceAccountEmail: saConfig?.clientEmail || null,
        canManage,
      });
    } catch (err) {
      console.error('[ga] status:', err.message);
      res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  app.post('/api/v1/integrations/ga/config', requireAuth, async (req, res) => {
    try {
      const resolved = await resolveTenant(supabase, req);
      if (resolved.error) return res.status(resolved.status).json({ ok: false, error: resolved.error });
      if (!(await isAdminOrOwner(supabase, req, resolved.tenantId))) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      const propertyId = String(req.body?.propertyId || '').trim();
      if (!/^\d+$/.test(propertyId)) {
        return res.status(400).json({ ok: false, error: 'invalid_property_id' });
      }
      if (!getAccessToken) return res.status(503).json({ ok: false, error: 'ga_not_configured' });

      await probeProperty({ propertyId, getAccessToken, fetchImpl }); // lança se sem acesso

      const { error } = await supabase.from('ga_integrations').upsert(
        { tenant_id: resolved.tenantId, property_id: propertyId, connected_by: req.userId, updated_at: new Date(now()).toISOString() },
        { onConflict: 'tenant_id' },
      );
      if (error) throw error;
      res.json({ ok: true });
    } catch (err) {
      if (err.message === 'ga_access_denied') {
        return res.status(422).json({ ok: false, error: 'ga_access_denied' });
      }
      console.error('[ga] config:', err.message);
      res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  app.get('/api/v1/integrations/ga/report', requireAuth, async (req, res) => {
    try {
      const resolved = await resolveTenant(supabase, req);
      if (resolved.error) return res.status(resolved.status).json({ ok: false, error: resolved.error });
      const integration = await getIntegration(supabase, resolved.tenantId);
      if (!integration) return res.status(404).json({ ok: false, error: 'not_connected' });
      if (!getAccessToken) return res.status(503).json({ ok: false, error: 'ga_not_configured' });

      const range = RANGES[req.query.range] ? req.query.range : '28d';
      const report = await cachedReport(integration.property_id, range);
      res.json({ ok: true, report });
    } catch (err) {
      if (err.message === 'ga_access_denied') {
        return res.status(502).json({ ok: false, error: 'ga_access_denied' });
      }
      console.error('[ga] report:', err.message);
      res.status(502).json({ ok: false, error: 'ga_api_error' });
    }
  });
}
