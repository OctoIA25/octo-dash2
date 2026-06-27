import { describe, it, expect, beforeEach } from 'vitest';
import { registerZapRoutes } from './routes.js';

const OWNER = 'octo.inteligenciaimobiliaria@gmail.com';

// Express fake: registra handlers e permite invocá-los; aplica a chain de middleware.
function makeApp() {
  const routes = {};
  const app = {
    post(path, ...handlers) { routes[`POST ${path}`] = handlers; },
    get(path, ...handlers) { routes[`GET ${path}`] = handlers; },
  };
  async function call(method, path, { body = {}, auth = `Bearer t` } = {}) {
    const handlers = routes[`${method} ${path}`];
    if (!handlers) throw new Error(`rota não registrada: ${method} ${path}`);
    const req = { body, headers: { authorization: auth } };
    let statusCode = 200; let jsonBody;
    const res = {
      status(c) { statusCode = c; return res; },
      json(b) { jsonBody = b; return res; },
    };
    for (const h of handlers) {
      let nexted = false;
      await h(req, res, () => { nexted = true; });
      if (!nexted) break; // middleware respondeu (ex.: 401/403)
    }
    return { statusCode, body: jsonBody };
  }
  return { app, call };
}

// Supabase fake: auth.getUser controlável + lookup de tenant_memberships + status list.
// memberships: array de { tenant_id, user_id, role } para o gate de admin-do-tenant.
function makeSupabase({ email = OWNER, userId = 'u1', authError = null, statusRows = [], memberships = [] } = {}) {
  return {
    auth: { getUser: async () => (authError ? { data: null, error: authError } : { data: { user: { id: userId, email } }, error: null }) },
    from(table) {
      let filters = {};
      const b = {
        select() { return b; },
        eq(col, val) { filters[col] = val; return b; },
        order() { return Promise.resolve({ data: statusRows, error: null }); },
        maybeSingle() {
          if (table === 'tenant_memberships') {
            const row = memberships.find((m) => m.tenant_id === filters.tenant_id && m.user_id === filters.user_id) || null;
            return Promise.resolve({ data: row ? { role: row.role } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return b;
    },
  };
}

function fakeResolver(overrides = {}) {
  return {
    saveConfig: async () => ({ ok: true }),
    rotateSecret: async () => ({ ok: true, secret: 'novo-secret' }),
    resolveByTenant: async (id) => ({ tenantId: id, feedSecret: 'sec', contactEmail: 'a@x.com', status: 'active' }),
    ...overrides,
  };
}

describe('zap routes — auth', () => {
  let call;
  beforeEach(() => {
    const m = makeApp(); call = m.call;
    registerZapRoutes(m.app, makeSupabase(), { resolver: fakeResolver() });
  });

  it('401 sem Bearer', async () => {
    const r = await call('POST', '/api/v1/zap/config', { auth: '' });
    expect(r.statusCode).toBe(401);
  });

  it('owner passa em qualquer tenant', async () => {
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase({ email: OWNER }), { resolver: fakeResolver() });
    const r = await m.call('POST', '/api/v1/zap/config', { body: { tenantId: 'A' } });
    expect(r.statusCode).toBe(200);
  });

  it('admin do PRÓPRIO tenant passa', async () => {
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase({
      email: 'admin@imob.com', userId: 'u-admin',
      memberships: [{ tenant_id: 'A', user_id: 'u-admin', role: 'admin' }],
    }), { resolver: fakeResolver() });
    const r = await m.call('POST', '/api/v1/zap/config', { body: { tenantId: 'A' } });
    expect(r.statusCode).toBe(200);
  });

  it('ISOLAMENTO: admin de OUTRO tenant é barrado (403)', async () => {
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase({
      email: 'admin@imob.com', userId: 'u-admin',
      memberships: [{ tenant_id: 'B', user_id: 'u-admin', role: 'admin' }], // admin de B
    }), { resolver: fakeResolver() });
    const r = await m.call('POST', '/api/v1/zap/config', { body: { tenantId: 'A' } }); // tenta mexer em A
    expect(r.statusCode).toBe(403);
  });

  it('corretor do próprio tenant é barrado (403)', async () => {
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase({
      email: 'c@imob.com', userId: 'u-c',
      memberships: [{ tenant_id: 'A', user_id: 'u-c', role: 'corretor' }],
    }), { resolver: fakeResolver() });
    const r = await m.call('POST', '/api/v1/zap/config', { body: { tenantId: 'A' } });
    expect(r.statusCode).toBe(403);
  });

  it('não-membro é barrado (403)', async () => {
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase({ email: 'estranho@x.com', userId: 'u-x', memberships: [] }), { resolver: fakeResolver() });
    const r = await m.call('POST', '/api/v1/zap/config', { body: { tenantId: 'A' } });
    expect(r.statusCode).toBe(403);
  });

  it('GET /status continua owner-only (admin barrado)', async () => {
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase({
      email: 'admin@imob.com', userId: 'u-admin',
      memberships: [{ tenant_id: 'A', user_id: 'u-admin', role: 'admin' }],
    }), { resolver: fakeResolver() });
    const r = await m.call('GET', '/api/v1/zap/sync/status', {});
    expect(r.statusCode).toBe(403);
  });
});

describe('zap routes — config CRUD', () => {
  it('POST /config exige tenantId', async () => {
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase(), { resolver: fakeResolver() });
    const r = await m.call('POST', '/api/v1/zap/config', { body: {} });
    expect(r.statusCode).toBe(400);
  });

  it('POST /config salva e devolve ok', async () => {
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase(), { resolver: fakeResolver() });
    const r = await m.call('POST', '/api/v1/zap/config', { body: { tenantId: 'A', contactEmail: 'a@x.com' } });
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('GET /config nunca expõe o secret em claro', async () => {
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase(), { resolver: fakeResolver() });
    const r = await m.call('POST', '/api/v1/zap/config/get', { body: { tenantId: 'A' } });
    expect(r.statusCode).toBe(200);
    expect(r.body.config).toBeTruthy();
    expect(JSON.stringify(r.body)).not.toContain('sec'); // feedSecret omitido
    expect(r.body.config.hasSecret).toBe(true); // mas informa que existe
  });

  it('POST /config/rotate-secret devolve o novo secret uma vez', async () => {
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase(), { resolver: fakeResolver() });
    const r = await m.call('POST', '/api/v1/zap/config/rotate-secret', { body: { tenantId: 'A' } });
    expect(r.statusCode).toBe(200);
    expect(r.body.secret).toBe('novo-secret');
  });

  it('POST /config/test ok quando há secret configurado', async () => {
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase(), { resolver: fakeResolver() });
    const r = await m.call('POST', '/api/v1/zap/config/test', { body: { tenantId: 'A' } });
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('POST /config/test falha quando tenant não tem config', async () => {
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase(), { resolver: fakeResolver({ resolveByTenant: async () => null }) });
    const r = await m.call('POST', '/api/v1/zap/config/test', { body: { tenantId: 'A' } });
    expect(r.body.ok).toBe(false);
  });

  it('GET /status lista tenants sem segredos', async () => {
    const rows = [{ tenant_id: 'A', status: 'active', last_feed_at: null, last_lead_at: null, last_error: null }];
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase({ statusRows: rows }), { resolver: fakeResolver() });
    const r = await m.call('GET', '/api/v1/zap/sync/status', {});
    expect(r.statusCode).toBe(200);
    expect(r.body.integrations).toHaveLength(1);
  });
});
