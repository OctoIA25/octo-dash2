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
    registerKenloRoutes(app, makeSupabase({ user: { id: 'u', email: 'alguem@x.com' } }), { runner: { trigger: vi.fn() } });
    const res = await run(app.routes['POST /api/v1/kenlo/sync/run'], { headers: { authorization: 'Bearer t' } });
    expect(res.statusCode).toBe(403);
  });

  it('POST /sync/run dispara em background e responde 202 para owner', async () => {
    const app = fakeApp();
    const runner = { trigger: vi.fn().mockReturnValue({ started: true, alreadyRunning: false }) };
    registerKenloRoutes(app, makeSupabase({ user: { id: 'u', email: OWNER } }), { runner });
    const res = await run(app.routes['POST /api/v1/kenlo/sync/run'], { headers: { authorization: 'Bearer t' } });
    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({ ok: true, started: true });
    expect(runner.trigger).toHaveBeenCalledOnce();
  });

  it('POST /sync/run responde 202 started:false quando já há sync em andamento', async () => {
    const app = fakeApp();
    const runner = { trigger: vi.fn().mockReturnValue({ started: false, alreadyRunning: true }) };
    registerKenloRoutes(app, makeSupabase({ user: { id: 'u', email: OWNER } }), { runner });
    const res = await run(app.routes['POST /api/v1/kenlo/sync/run'], { headers: { authorization: 'Bearer t' } });
    expect(res.statusCode).toBe(202);
    expect(res.body).toMatchObject({ ok: true, started: false });
  });

  it('GET /sync/status parseia sync_state e devolve em `sync`', async () => {
    const app = fakeApp();
    const syncState = JSON.stringify({ status: 'done', mode: 'LIVE', saved: 42, errors: 0 });
    registerKenloRoutes(app, makeSupabase({ user: { id: 'u', email: OWNER }, integrations: [{ tenant_id: 't1', status: 'active', leads_count: 5, sync_state: syncState }] }), { runner: {} });
    const res = await run(app.routes['GET /api/v1/kenlo/sync/status'], { headers: { authorization: 'Bearer t' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.integrations[0].sync).toMatchObject({ status: 'done', saved: 42 });
  });

  it('GET /sync/status retorna integrações para owner', async () => {
    const app = fakeApp();
    registerKenloRoutes(app, makeSupabase({ user: { id: 'u', email: OWNER }, integrations: [{ tenant_id: 't1', status: 'active', leads_count: 5 }] }), { runner: {} });
    const res = await run(app.routes['GET /api/v1/kenlo/sync/status'], { headers: { authorization: 'Bearer t' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.integrations[0].tenant_id).toBe('t1');
  });

  it('401 sem token', async () => {
    const app = fakeApp();
    registerKenloRoutes(app, makeSupabase({ user: null }), { runner: { trigger: vi.fn() } });
    const res = await run(app.routes['POST /api/v1/kenlo/sync/run'], { headers: {} });
    expect(res.statusCode).toBe(401);
  });
});
