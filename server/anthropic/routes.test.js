import { describe, it, expect } from 'vitest';
import { registerAnthropicRoutes } from './routes.js';

const OWNER = 'octo.inteligenciaimobiliaria@gmail.com';

// App falso: captura (método, path, handlers) registrados. Sem supertest.
function fakeApp() {
  const routes = {};
  const reg = (method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers; };
  return { post: reg('POST'), get: reg('GET'), routes };
}

// Executa a cadeia [middleware..., handler] com req falso; devolve o res capturado.
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

function fakeSupabase({ users = {}, memberships = {} } = {}) {
  const api = {
    auth: { getUser: async (token) => (users[token] ? { data: { user: users[token] }, error: null } : { data: { user: null }, error: 'x' }) },
    from() { return api; }, select() { return api; },
    eq(col, val) { if (col === 'tenant_id') api._t = val; if (col === 'user_id') api._u = val; return api; },
    async maybeSingle() { const m = memberships[`${api._t}:${api._u}`]; return { data: m ? { role: m } : null, error: null }; },
  };
  return api;
}

const dtoStub = { status: 'normal', usage: { current: 64.2, limit: 500, percentage: 12.84 }, window: { startsAt: 'a', endsAt: 'b' }, fetchedAt: 'z', provider: 'anthropic' };
const fakeService = { getWeeklyUsage: async () => dtoStub };

const savedCalls = [];
const fakeResolver = {
  resolveConfig: async () => ({ tenantId: 't1', apiKey: 'sk-ant-admin01-abcd', weeklyLimitUsd: 500, status: 'normal', lastSyncedAt: null, alertThresholdBps: 1430 }),
  saveConfig: async (tenantId, input) => { savedCalls.push({ tenantId, input }); return { ok: true }; },
  invalidate() {},
};

describe('POST /api/v1/anthropic/usage (owner-only)', () => {
  it('Owner → 200 com DTO', async () => {
    const app = fakeApp();
    const supabase = fakeSupabase({
      users: { owner_tok: { id: 'o', email: OWNER } },
      memberships: {},
    });
    registerAnthropicRoutes(app, supabase, { resolver: fakeResolver, service: fakeService });
    const res = await run(app.routes['POST /api/v1/anthropic/usage'], { headers: { authorization: 'Bearer owner_tok' }, body: { tenantId: 't1' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.usage.usage.percentage).toBe(12.84);
  });

  it('Gestor → 403', async () => {
    const app = fakeApp();
    const supabase = fakeSupabase({
      users: { gestor_tok: { id: 'g', email: 'g@x.com' } },
      memberships: { 't1:g': 'admin' },
    });
    registerAnthropicRoutes(app, supabase, { resolver: fakeResolver, service: fakeService });
    const res = await run(app.routes['POST /api/v1/anthropic/usage'], { headers: { authorization: 'Bearer gestor_tok' }, body: { tenantId: 't1' } });
    expect(res.statusCode).toBe(403);
  });

  it('Corretor → 403', async () => {
    const app = fakeApp();
    const supabase = fakeSupabase({
      users: { corretor_tok: { id: 'c', email: 'c@x.com' } },
      memberships: { 't1:c': 'corretor' },
    });
    registerAnthropicRoutes(app, supabase, { resolver: fakeResolver, service: fakeService });
    const res = await run(app.routes['POST /api/v1/anthropic/usage'], { headers: { authorization: 'Bearer corretor_tok' }, body: { tenantId: 't1' } });
    expect(res.statusCode).toBe(403);
  });

  it('sem token → 401', async () => {
    const app = fakeApp();
    const supabase = fakeSupabase({});
    registerAnthropicRoutes(app, supabase, { resolver: fakeResolver, service: fakeService });
    const res = await run(app.routes['POST /api/v1/anthropic/usage'], { headers: {}, body: { tenantId: 't1' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/anthropic/config/get (owner|gestor)', () => {
  it('Gestor → 200, key mascarada, nunca completa', async () => {
    const app = fakeApp();
    const supabase = fakeSupabase({
      users: { gestor_tok: { id: 'g', email: 'g@x.com' } },
      memberships: { 't1:g': 'admin' },
    });
    registerAnthropicRoutes(app, supabase, { resolver: fakeResolver, service: fakeService });
    const res = await run(app.routes['POST /api/v1/anthropic/config/get'], { headers: { authorization: 'Bearer gestor_tok' }, body: { tenantId: 't1' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.config.hasKey).toBe(true);
    expect(res.body.config.maskedKey).toBe('••••abcd');
    expect(res.body.config.lastSyncedAt).toBe(null);
    expect(JSON.stringify(res.body)).not.toContain('sk-ant-admin01-abcd');
  });

  it('Corretor → 403', async () => {
    const app = fakeApp();
    const supabase = fakeSupabase({
      users: { corretor_tok: { id: 'c', email: 'c@x.com' } },
      memberships: { 't1:c': 'corretor' },
    });
    registerAnthropicRoutes(app, supabase, { resolver: fakeResolver, service: fakeService });
    const res = await run(app.routes['POST /api/v1/anthropic/config/get'], { headers: { authorization: 'Bearer corretor_tok' }, body: { tenantId: 't1' } });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/v1/anthropic/config — alertThresholdBps', () => {
  it('aceita e repassa alertThresholdBps ao resolver', async () => {
    const app = fakeApp();
    const supabase = fakeSupabase({
      users: { gestor_tok: { id: 'g', email: 'g@x.com' } },
      memberships: { 't1:g': 'admin' },
    });
    registerAnthropicRoutes(app, supabase, { resolver: fakeResolver, service: fakeService });
    savedCalls.length = 0; // clear
    const res = await run(app.routes['POST /api/v1/anthropic/config'],
      { headers: { authorization: 'Bearer gestor_tok' }, body: { tenantId: 't1', alertThresholdBps: 5000 } });
    expect(res.statusCode).toBe(200);
    expect(savedCalls.at(-1).input.alertThresholdBps).toBe(5000);
  });
  it.each([[0], [10001], ['abc'], [14.3]])('rejeita alertThresholdBps inválido %s → 400', async (bad) => {
    const app = fakeApp();
    const supabase = fakeSupabase({
      users: { gestor_tok: { id: 'g', email: 'g@x.com' } },
      memberships: { 't1:g': 'admin' },
    });
    registerAnthropicRoutes(app, supabase, { resolver: fakeResolver, service: fakeService });
    const res = await run(app.routes['POST /api/v1/anthropic/config'],
      { headers: { authorization: 'Bearer gestor_tok' }, body: { tenantId: 't1', alertThresholdBps: bad } });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/anthropic/config/get — devolve o limiar', () => {
  it('config inclui alertThresholdBps', async () => {
    const app = fakeApp();
    const supabase = fakeSupabase({
      users: { gestor_tok: { id: 'g', email: 'g@x.com' } },
      memberships: { 't1:g': 'admin' },
    });
    registerAnthropicRoutes(app, supabase, { resolver: fakeResolver, service: fakeService });
    const res = await run(app.routes['POST /api/v1/anthropic/config/get'],
      { headers: { authorization: 'Bearer gestor_tok' }, body: { tenantId: 't1' } });
    expect(res.body.config.alertThresholdBps).toBe(1430);
  });
});
