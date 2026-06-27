import { describe, it, expect } from 'vitest';
import express from 'express';
import { registerSantaAngelaRoutes } from './index.js';

function makeApp({ ownerEmail = 'octo.inteligenciaimobiliaria@gmail.com', overrides = {} } = {}) {
  const app = express();
  app.use(express.json());
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { email: ownerEmail } }, error: null }) },
    from() { return this; }, select() { return this; }, order: async () => ({ data: [], error: null }),
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

it('config/test não-owner => 403', async () => {
  const app = makeApp({ ownerEmail: 'alguem@x.com' });
  const r = await call(app, 'POST', '/api/v1/santa-angela/config/test', { body: { tenantId: 't1' } });
  expect(r.status).toBe(403);
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
