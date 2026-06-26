/**
 * Rotas owner-only do módulo Kenlo: disparo manual e status. Auth replica o
 * padrão mínimo de recommendations (valida JWT Supabase, exige owner da
 * plataforma) sem acoplar ao módulo de recommendations.
 */
import { makeSyncService } from './kenloScheduler.js';

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;

function makeRequireOwner(supabase) {
  return async function requireOwner(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_authorization' });
      const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
      if (error || !data?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });
      if (!isPlatformOwner(data.user.email)) return res.status(403).json({ ok: false, error: 'forbidden' });
      req.userEmail = data.user.email;
      next();
    } catch (err) {
      console.error('[kenlo] erro de auth:', err?.message);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

export function registerKenloRoutes(app, supabase, options = {}) {
  const requireOwner = makeRequireOwner(supabase);
  const syncService = options.syncService || makeSyncService(supabase, options);

  app.post('/api/v1/kenlo/sync/run', requireOwner, async (req, res) => {
    try {
      const summary = await syncService.syncAllTenants();
      res.status(200).json({ ok: true, summary });
    } catch (err) {
      console.error('[kenlo] erro no run manual:', err?.message);
      res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  app.get('/api/v1/kenlo/sync/status', requireOwner, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('kenlo_integrations')
        .select('tenant_id,status,last_sync_at,leads_count')
        .order('last_sync_at', { ascending: false });
      if (error) return res.status(500).json({ ok: false, error: error.message });
      res.status(200).json({ ok: true, integrations: data || [] });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });
}
