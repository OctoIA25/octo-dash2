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

// Supabase fake: auth.getUser controlável + resolver-bypass via options.resolver.
function makeSupabase({ email = OWNER, authError = null, statusRows = [] } = {}) {
  return {
    auth: { getUser: async () => (authError ? { data: null, error: authError } : { data: { user: { email } }, error: null }) },
    from() { return this; },
    select() { return this; },
    order() { return Promise.resolve({ data: statusRows, error: null }); },
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

  it('403 se não for owner', async () => {
    const m = makeApp();
    registerZapRoutes(m.app, makeSupabase({ email: 'qualquer@x.com' }), { resolver: fakeResolver() });
    const r = await m.call('POST', '/api/v1/zap/config', { body: { tenantId: 'A' } });
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
