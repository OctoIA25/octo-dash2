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
const fakeResolver = { resolveConfig: async () => ({ tenantId: 't1', apiKey: 'sk-ant-admin01-abcd', weeklyLimitUsd: 500, status: 'normal', lastSyncedAt: '2026-07-29T12:00:00Z' }), saveConfig: async () => ({ ok: true }), invalidate() {} };

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
    expect(res.body.config.lastSyncedAt).toBe('2026-07-29T12:00:00Z');
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
