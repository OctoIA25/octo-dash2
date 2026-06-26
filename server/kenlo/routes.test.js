import { describe, it, expect, vi } from 'vitest';
import { registerKenloRoutes } from './routes.js';

const OWNER = 'octo.inteligenciaimobiliaria@gmail.com';

// App falso: captura (método, path, handlers) registrados. Sem supertest.
function fakeApp() {
  const routes = {};
  const reg = (method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers; };
  return { post: reg('POST'), get: reg('GET'), routes };
}

// Executa a cadeia [middleware, handler] com req falso; devolve o res capturado.
async function run(handlers, req) {
  const res = {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  for (const h of handlers) {
    let nexted = false;
    await h(req, res, () => { nexted = true; });
    if (!nexted) break; // middleware bloqueou (não chamou next)
  }
  return res;
}

function makeSupabase({ user, integrations = [] }) {
  return {
    auth: { getUser: async () => (user ? { data: { user }, error: null } : { data: null, error: 'x' }) },
    from() { return { select() { return { order() { return Promise.resolve({ data: integrations, error: null }); } }; } }; },
  };
}

describe('rotas Kenlo', () => {
  it('POST /sync/run exige owner (403 para não-owner)', async () => {
    const app = fakeApp();
    registerKenloRoutes(app, makeSupabase({ user: { id: 'u', email: 'alguem@x.com' } }), { syncService: { syncAllTenants: vi.fn() } });
    const res = await run(app.routes['POST /api/v1/kenlo/sync/run'], { headers: { authorization: 'Bearer t' } });
    expect(res.statusCode).toBe(403);
  });

  it('POST /sync/run roda syncAllTenants para owner', async () => {
    const app = fakeApp();
    const syncService = { syncAllTenants: vi.fn().mockResolvedValue([{ tenantId: 't1', new: 2 }]) };
    registerKenloRoutes(app, makeSupabase({ user: { id: 'u', email: OWNER } }), { syncService });
    const res = await run(app.routes['POST /api/v1/kenlo/sync/run'], { headers: { authorization: 'Bearer t' } });
    expect(res.statusCode).toBe(200);
    expect(syncService.syncAllTenants).toHaveBeenCalledOnce();
  });

  it('GET /sync/status retorna integrações para owner', async () => {
    const app = fakeApp();
    registerKenloRoutes(app, makeSupabase({ user: { id: 'u', email: OWNER }, integrations: [{ tenant_id: 't1', status: 'active', leads_count: 5 }] }), { syncService: {} });
    const res = await run(app.routes['GET /api/v1/kenlo/sync/status'], { headers: { authorization: 'Bearer t' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.integrations[0].tenant_id).toBe('t1');
  });

  it('401 sem token', async () => {
    const app = fakeApp();
    registerKenloRoutes(app, makeSupabase({ user: null }), { syncService: { syncAllTenants: vi.fn() } });
    const res = await run(app.routes['POST /api/v1/kenlo/sync/run'], { headers: {} });
    expect(res.statusCode).toBe(401);
  });
});
