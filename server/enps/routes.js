/**
 * Rotas do módulo eNPS:
 *   POST /api/v1/enps/responses        — submissão (anti-IDOR + atômica)
 *   GET  /api/v1/enps                  — agregação (dois eNPS + N-mínimo)
 *   GET  /api/v1/enps/cycle/:cycleId   — bootstrap da página de resposta
 *
 * Auth idêntica ao kpis: Bearer → supabase.auth.getUser → req.userId/req.userEmail.
 */
import { makeSubmitHandler } from './submitHandler.js';
import { makeAggregateHandler, makeCycleContextHandler } from './aggregate.js';

export function makeRequireSupabaseAuth(supabase) {
  return async function requireSupabaseAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ ok: false, error: 'missing_authorization' });
      const token = authHeader.slice(7);
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) return res.status(401).json({ ok: false, error: 'invalid_token' });
      req.userId = data.user.id;
      req.userEmail = data.user.email;
      next();
    } catch (err) {
      console.error('[enps] erro validando token:', err);
      res.status(500).json({ ok: false, error: 'auth_internal_error' });
    }
  };
}

export function registerEnpsRoutes(app, supabase) {
  const requireSupabaseAuth = makeRequireSupabaseAuth(supabase);
  app.post('/api/v1/enps/responses', requireSupabaseAuth, makeSubmitHandler(supabase));
  app.get('/api/v1/enps', requireSupabaseAuth, makeAggregateHandler(supabase));
  app.get('/api/v1/enps/cycle/:cycleId', requireSupabaseAuth, makeCycleContextHandler(supabase));
}
