/**
 * Auth de OWNER da plataforma — util compartilhado.
 *
 * A checagem "é o owner?" está hoje duplicada literalmente em 6+ módulos
 * (kenlo, santaAngela, zap, kpis, recommendations, contact2sale), sem um util
 * comum. Este arquivo centraliza a versão canônica; por ora é usado apenas por
 * server/observability/tenantHealthRoutes.js (P2). Migrar os módulos legados
 * para cá é um refactor futuro (fora do escopo desta feature).
 *
 * Corpos de erro seguem o contrato do endpoint P2: { error: 'unauthorized' | 'forbidden' }.
 */

const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';

/** true se o email for o owner da plataforma (case-insensitive). */
export function isPlatformOwner(email) {
  return (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;
}

/**
 * Middleware Express que exige o owner da plataforma. Valida o JWT do Supabase
 * (Authorization: Bearer <token>) e o email. Fonte da verdade da autorização —
 * o gate de UI é só conveniência.
 *
 * @param {object} supabase client com `.auth.getUser`
 * @returns {(req, res, next) => Promise<void>}
 */
export function makeRequireOwner(supabase) {
  return async function requireOwner(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
      if (error || !data?.user) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      if (!isPlatformOwner(data.user.email)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      req.userEmail = data.user.email;
      next();
    } catch (err) {
      console.error('[ownerAuth] erro de auth:', err?.message);
      res.status(500).json({ error: 'internal_error' });
    }
  };
}
