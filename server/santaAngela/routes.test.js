import { describe, it, expect } from 'vitest';
import express from 'express';
import { registerSantaAngelaRoutes } from './index.js';

// email: quem é o usuário do JWT. memberships: [{tenant_id,user_id,role}] p/ o gate admin.
function makeApp({ ownerEmail = 'octo.inteligenciaimobiliaria@gmail.com', userId = 'u1', memberships = [], overrides = {} } = {}) {
  const app = express();
  app.use(express.json());
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userId, email: ownerEmail } }, error: null }) },
    from(table) {
      let filters = {};
      const b = {
        select() { return b; },
        eq(col, val) { filters[col] = val; return b; },
        order: async () => ({ data: [], error: null }),
        maybeSingle: async () => {
          if (table === 'tenant_memberships') {
            const row = memberships.find((m) => m.tenant_id === filters.tenant_id && m.user_id === filters.user_id);
            return { data: row ? { role: row.role } : null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return b;
    },
  };
  registerSantaAngelaRoutes(app, supabase, overrides);
  return app;
}

async function call(app, method, path, { token = 'x', body } = {}) {
  const server = app.listen(0);
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  server.close();
  return { status: res.status, json };
}

it('não-owner sem membership => 403', async () => {
  const app = makeApp({ ownerEmail: 'alguem@x.com', userId: 'u-x', memberships: [] });
  const r = await call(app, 'POST', '/api/v1/santa-angela/config/test', { body: { tenantId: 't1' } });
  expect(r.status).toBe(403);
});

it('admin do PRÓPRIO tenant => passa', async () => {
  const app = makeApp({
    ownerEmail: 'admin@imob.com', userId: 'u-a',
    memberships: [{ tenant_id: 't1', user_id: 'u-a', role: 'admin' }],
    overrides: { resolver: { saveConfig: async () => ({ ok: true }) } },
  });
  const r = await call(app, 'POST', '/api/v1/santa-angela/config',
    { body: { tenantId: 't1', baseUrl: 'https://u', apiKey: 'k' } });
  expect(r.status).toBe(200);
});

it('ISOLAMENTO: admin de OUTRO tenant => 403', async () => {
  const app = makeApp({
    ownerEmail: 'admin@imob.com', userId: 'u-a',
    memberships: [{ tenant_id: 't2', user_id: 'u-a', role: 'admin' }], // admin de t2
  });
  const r = await call(app, 'POST', '/api/v1/santa-angela/config',
    { body: { tenantId: 't1', baseUrl: 'https://u', apiKey: 'k' } }); // tenta t1
  expect(r.status).toBe(403);
});

it('config/get devolve metadados sem a api_key', async () => {
  const app = makeApp({
    overrides: { resolver: { resolveConfig: async (t) => ({ tenantId: t, baseUrl: 'https://u', status: 'active', apiKey: 'segredo' }) } },
  });
  const r = await call(app, 'POST', '/api/v1/santa-angela/config/get', { body: { tenantId: 't1' } });
  expect(r.status).toBe(200);
  expect(r.json.config.baseUrl).toBe('https://u');
  expect(r.json.config.hasApiKey).toBe(true);
  expect(JSON.stringify(r.json)).not.toContain('segredo');
});

it('POST config salva via resolver', async () => {
  let saved;
  const app = makeApp({ overrides: { resolver: { saveConfig: async (t, c) => { saved = { t, c }; return { ok: true }; } } } });
  const r = await call(app, 'POST', '/api/v1/santa-angela/config',
    { body: { tenantId: 't1', baseUrl: 'https://u', apiKey: 'k' } });
  expect(r.status).toBe(200);
  expect(saved.t).toBe('t1');
  expect(saved.c.apiKey).toBe('k');
});

it('POST sync/run dispara o runner compartilhado (202, em background)', async () => {
  const runner = { trigger: () => ({ started: true, alreadyRunning: false }) };
  const app = makeApp({ overrides: { runner } });
  const r = await call(app, 'POST', '/api/v1/santa-angela/sync/run', { body: {} });
  expect(r.status).toBe(202);
  expect(r.json.ok).toBe(true);
  expect(r.json.started).toBe(true);
});

it('POST sync/run quando já há ciclo em andamento responde started=false', async () => {
  const runner = { trigger: () => ({ started: false, alreadyRunning: true }) };
  const app = makeApp({ overrides: { runner } });
  const r = await call(app, 'POST', '/api/v1/santa-angela/sync/run', { body: {} });
  expect(r.status).toBe(202);
  expect(r.json.started).toBe(false);
  expect(r.json.message).toMatch(/já em andamento/);
});
