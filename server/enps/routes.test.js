import { describe, it, expect, vi } from 'vitest';
import { registerEnpsRoutes } from './routes.js';

function fakeApp() {
  const routes = {};
  return { routes, post(p, ...h) { routes[`POST ${p}`] = h; }, get(p, ...h) { routes[`GET ${p}`] = h; } };
}
function makeRes() { return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } }; }
async function call(handlers, req) {
  const res = makeRes();
  for (const h of handlers) { let nexted = false; await h(req, res, () => { nexted = true; }); if (!nexted) break; }
  return res;
}
function fakeSupabase({ user = { id: 'u1', email: 'c@imob.com' } } = {}) {
  return {
    auth: { getUser: async (t) => (t === 'good' ? { data: { user }, error: null } : { data: null, error: { message: 'bad' } }) },
    from() { return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }; },
  };
}

describe('rotas eNPS — auth', () => {
  it('registra POST /responses, GET /enps e GET /enps/cycle/:cycleId', () => {
    const app = fakeApp();
    registerEnpsRoutes(app, fakeSupabase());
    expect(app.routes['POST /api/v1/enps/responses']).toBeDefined();
    expect(app.routes['GET /api/v1/enps']).toBeDefined();
    expect(app.routes['GET /api/v1/enps/cycle/:cycleId']).toBeDefined();
  });

  it('sem Authorization → 401 (submit)', async () => {
    const app = fakeApp();
    registerEnpsRoutes(app, fakeSupabase());
    const res = await call(app.routes['POST /api/v1/enps/responses'], { headers: {}, body: {} });
    expect(res.statusCode).toBe(401);
  });

  it('token inválido → 401 (aggregate)', async () => {
    const app = fakeApp();
    registerEnpsRoutes(app, fakeSupabase());
    const res = await call(app.routes['GET /api/v1/enps'], { headers: { authorization: 'Bearer bad' }, query: {} });
    expect(res.statusCode).toBe(401);
  });

  it('token válido injeta req.userId e chega ao handler (submit sem cycle_id → 400)', async () => {
    const app = fakeApp();
    registerEnpsRoutes(app, fakeSupabase());
    const res = await call(app.routes['POST /api/v1/enps/responses'], { headers: { authorization: 'Bearer good' }, body: {} });
    expect(res.statusCode).toBe(400);
  });
});
