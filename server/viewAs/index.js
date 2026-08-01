/**
 * 👁️ Rotas do "visualizar como".
 *
 *   GET /api/v1/view-as/users?q=&tenantId=  — usuários do tenant que o
 *                                             solicitante pode assumir.
 *
 * Auth idêntica a kpis/enps: Bearer → supabase.auth.getUser → req.userId/req.userEmail,
 * e o tenant vem de `resolveTenant` (deriva da membership; só o owner da
 * plataforma pode informar ?tenantId=). Reusar esses dois helpers em vez de
 * recriá-los mantém o contrato de multi-tenant em um lugar só.
 *
 * A autorização propriamente dita vive em ./authorize.js.
 */

import { makeRequireSupabaseAuth, resolveTenant } from '../kpis/index.js';
import { canViewAsOthers, searchTenantUsers } from './authorize.js';

/** Handler de GET /api/v1/view-as/users. */
export function makeListViewableUsersHandler(supabase) {
  return async function listViewableUsers(req, res) {
    try {
      const resolved = await resolveTenant(supabase, req);
      if (resolved.error) {
        return res.status(resolved.status).json({ ok: false, error: resolved.error });
      }
      const { tenantId } = resolved;

      const allowed = await canViewAsOthers(supabase, {
        userId: req.userId,
        userEmail: req.userEmail,
        tenantId,
      });
      if (!allowed) {
        return res.status(403).json({ ok: false, error: 'view_as_forbidden' });
      }

      const users = await searchTenantUsers(supabase, {
        tenantId,
        term: req.query?.q,
        excludeUserId: req.userId,
      });

      return res.json({ ok: true, users });
    } catch (err) {
      console.error('[viewAs] erro ao listar usuários:', err);
      return res.status(500).json({ ok: false, error: 'view_as_internal_error' });
    }
  };
}

/** Registra as rotas do "visualizar como" no app Express. */
export function registerViewAsRoutes(app, supabase) {
  const requireSupabaseAuth = makeRequireSupabaseAuth(supabase);
  app.get('/api/v1/view-as/users', requireSupabaseAuth, makeListViewableUsersHandler(supabase));
}
