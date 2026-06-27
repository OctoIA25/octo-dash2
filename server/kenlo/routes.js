/**
 * Rotas owner-only do módulo Kenlo: disparo manual e status. Auth replica o
 * padrão mínimo de recommendations (valida JWT Supabase, exige owner da
 * plataforma) sem acoplar ao módulo de recommendations.
 */
import { makeSyncRunner } from './kenloScheduler.js';

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;

const STALLED_MS = 10 * 60 * 1000; // running há mais que isto sem terminar = travado (processo caiu)

// Parse seguro do snapshot sync_state + deriva `stalled` (running preso).
function parseSyncState(raw) {
  if (!raw) return null;
  let s;
  try { s = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (s?.status === 'running' && s.started_at && Date.now() - Date.parse(s.started_at) > STALLED_MS) {
    return { ...s, stalled: true };
  }
  return s;
}

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
  const runner = options.runner || makeSyncRunner(supabase, options);

  // Dispara em background e responde na hora: o sync de um tenant zerado leva
  // minutos (login Kenlo ~30s + histórico inteiro), o que estoura o timeout de
  // qualquer proxy/cliente. Acompanhe o progresso via GET /sync/status.
  app.post('/api/v1/kenlo/sync/run', requireOwner, (req, res) => {
    const { started } = runner.trigger();
    res.status(202).json({ ok: true, started, message: started
      ? 'sync iniciado — acompanhe em GET /api/v1/kenlo/sync/status'
      : 'sync já em andamento' });
  });

  app.get('/api/v1/kenlo/sync/status', requireOwner, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('kenlo_integrations')
        .select('tenant_id,status,last_sync_at,leads_count,sync_state')
        .order('last_sync_at', { ascending: false });
      if (error) return res.status(500).json({ ok: false, error: error.message });
      const integrations = (data || []).map((i) => ({ ...i, sync: parseSyncState(i.sync_state) }));
      res.status(200).json({ ok: true, integrations });
    } catch (err) {
      res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });
}
