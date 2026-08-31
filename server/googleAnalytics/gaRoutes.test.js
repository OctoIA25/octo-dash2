import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import express from 'express';
import { registerGaRoutes } from './index.js';

const { privateKey: TEST_PEM } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

/**
 * Supabase fake: auth fixa + tabelas em memória por nome. Ignora os filtros
 * (eq/in) — cada teste usa fixtures com uma única linha relevante, então o
 * fake só precisa devolver "a tabela inteira" para bater com o que a rota
 * espera. `.not()` é deliberadamente OMITIDO: getDeletedTenantIds (chamado
 * por resolveTenant) usa `.not('deleted_at', 'is', null)` — se o fake
 * respondesse a isso devolvendo a linha de `tenants` (sem deleted_at), o
 * tenant apareceria como soft-deletado. Sem o método, a chamada lança e
 * getDeletedTenantIds falha aberto (Set vazio), que é o comportamento real
 * pretendido para fixtures sem tenant deletado.
 */
function fakeSupabase({ user = { id: 'u1', email: 'user@t.com' }, memberships = [], gaRow = null } = {}) {
  const results = {
    tenant_memberships: memberships,
    ga_integrations: gaRow ? [gaRow] : [],
    tenants: [{ id: 't1' }],
  };
  const upserts = [];
  const from = (table) => {
    const chain = {
      _rows: results[table] || [],
      select() { return chain; },
      eq() { return chain; },
      in() { return chain; },
      maybeSingle: async () => ({ data: chain._rows[0] || null, error: null }),
      then: (resolve) => resolve({ data: chain._rows, error: null }), // await sem maybeSingle
      upsert: async (row, opts) => { upserts.push({ table, row, opts }); return { data: row, error: null }; },
    };
    return chain;
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from: vi.fn(from),
    _upserts: upserts,
  };
}

function makeApp(supabase, deps) {
  const app = express();
  app.use(express.json());
  registerGaRoutes(app, supabase, deps);
  return app;
}

async function listen(app) {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

const ENV = { GA_SA_CLIENT_EMAIL: 'ga@p.iam', GA_SA_PRIVATE_KEY: 'k' };
const AUTH = { Authorization: 'Bearer jwt' };

describe('GET /api/v1/integrations/ga/status', () => {
  it('sem config → connected:false, com o e-mail da service account', async () => {
    const supabase = fakeSupabase({ memberships: [{ tenant_id: 't1', role: 'admin' }] });
    const app = makeApp(supabase, { env: ENV, fetchImpl: vi.fn() });
    const { base, close } = await listen(app);
    const json = await (await fetch(`${base}/api/v1/integrations/ga/status`, { headers: AUTH })).json();
    await close();
    expect(json).toMatchObject({ ok: true, connected: false, serviceAccountEmail: 'ga@p.iam', canManage: true });
  });

  it('corretor vê canManage:false', async () => {
    const supabase = fakeSupabase({ memberships: [{ tenant_id: 't1', role: 'corretor' }] });
    const app = makeApp(supabase, { env: ENV, fetchImpl: vi.fn() });
    const { base, close } = await listen(app);
    const json = await (await fetch(`${base}/api/v1/integrations/ga/status`, { headers: AUTH })).json();
    await close();
    expect(json.canManage).toBe(false);
  });

  it('config presente → connected:true e propertyId devolvido', async () => {
    const supabase = fakeSupabase({
      memberships: [{ tenant_id: 't1', role: 'admin' }],
      gaRow: { tenant_id: 't1', property_id: '999' },
    });
    const app = makeApp(supabase, { env: ENV, fetchImpl: vi.fn() });
    const { base, close } = await listen(app);
    const json = await (await fetch(`${base}/api/v1/integrations/ga/status`, { headers: AUTH })).json();
    await close();
    expect(json).toMatchObject({ ok: true, connected: true, propertyId: '999' });
  });
});

describe('POST /api/v1/integrations/ga/config', () => {
  it('corretor recebe 403 e nada é gravado', async () => {
    const supabase = fakeSupabase({ memberships: [{ tenant_id: 't1', role: 'corretor' }] });
    const app = makeApp(supabase, { env: ENV, fetchImpl: vi.fn() });
    const { base, close } = await listen(app);
    const res = await fetch(`${base}/api/v1/integrations/ga/config`, {
      method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: '123' }),
    });
    await close();
    expect(res.status).toBe(403);
    expect(supabase._upserts).toHaveLength(0);
  });

  it('admin + probe OK → upsert por tenant', async () => {
    const supabase = fakeSupabase({ memberships: [{ tenant_id: 't1', role: 'admin' }] });
    // fetch injetado: token + runReport de probe, ambos OK
    const fetchImpl = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes('oauth2') ? { access_token: 't', expires_in: 3600 } : {}) }));
    const app = makeApp(supabase, { env: { ...ENV, GA_SA_PRIVATE_KEY: TEST_PEM }, fetchImpl });
    const { base, close } = await listen(app);
    const res = await fetch(`${base}/api/v1/integrations/ga/config`, {
      method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: '123' }),
    });
    await close();
    expect(res.status).toBe(200);
    expect(supabase._upserts[0].row).toMatchObject({ tenant_id: 't1', property_id: '123' });
  });

  it('probe 403 → 422 ga_access_denied, sem upsert', async () => {
    const supabase = fakeSupabase({ memberships: [{ tenant_id: 't1', role: 'admin' }] });
    const fetchImpl = vi.fn(async (url) => (String(url).includes('oauth2')
      ? { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) }
      : { ok: false, status: 403, json: async () => ({}) }));
    const app = makeApp(supabase, { env: { ...ENV, GA_SA_PRIVATE_KEY: TEST_PEM }, fetchImpl });
    const { base, close } = await listen(app);
    const res = await fetch(`${base}/api/v1/integrations/ga/config`, {
      method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: '123' }),
    });
    await close();
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('ga_access_denied');
    expect(supabase._upserts).toHaveLength(0);
  });

  it('propertyId inválido → 400, sem upsert', async () => {
    const supabase = fakeSupabase({ memberships: [{ tenant_id: 't1', role: 'admin' }] });
    const app = makeApp(supabase, { env: { ...ENV, GA_SA_PRIVATE_KEY: TEST_PEM }, fetchImpl: vi.fn() });
    const { base, close } = await listen(app);
    const res = await fetch(`${base}/api/v1/integrations/ga/config`, {
      method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: 'abc' }),
    });
    await close();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_property_id');
    expect(supabase._upserts).toHaveLength(0);
  });
});

describe('GET /api/v1/integrations/ga/report', () => {
  it('tenant sem config → 404 not_connected (não 500)', async () => {
    const supabase = fakeSupabase({ memberships: [{ tenant_id: 't1', role: 'admin' }] });
    const app = makeApp(supabase, { env: ENV, fetchImpl: vi.fn() });
    const { base, close } = await listen(app);
    const res = await fetch(`${base}/api/v1/integrations/ga/report?range=7d`, { headers: AUTH });
    await close();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_connected');
  });

  it('server sem env da service account → 503 ga_not_configured', async () => {
    const supabase = fakeSupabase({ memberships: [{ tenant_id: 't1', role: 'admin' }], gaRow: { tenant_id: 't1', property_id: '123' } });
    const app = makeApp(supabase, { env: {}, fetchImpl: vi.fn() });
    const { base, close } = await listen(app);
    const res = await fetch(`${base}/api/v1/integrations/ga/report?range=7d`, { headers: AUTH });
    await close();
    expect(res.status).toBe(503);
  });

  it('GA nega acesso (403) → 502 ga_access_denied', async () => {
    const supabase = fakeSupabase({ memberships: [{ tenant_id: 't1', role: 'admin' }], gaRow: { tenant_id: 't1', property_id: '123' } });
    const fetchImpl = vi.fn(async (url) => (String(url).includes('oauth2')
      ? { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) }
      : { ok: false, status: 403, json: async () => ({}) }));
    const app = makeApp(supabase, { env: { ...ENV, GA_SA_PRIVATE_KEY: TEST_PEM }, fetchImpl });
    const { base, close } = await listen(app);
    const res = await fetch(`${base}/api/v1/integrations/ga/report?range=7d`, { headers: AUTH });
    await close();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('ga_access_denied');
  });

  it('relatório OK → normaliza e cacheia (2ª chamada não repete o batchRunReports)', async () => {
    const supabase = fakeSupabase({ memberships: [{ tenant_id: 't1', role: 'admin' }], gaRow: { tenant_id: 't1', property_id: '123' } });
    let batchCalls = 0;
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('oauth2')) return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) };
      batchCalls += 1;
      return { ok: true, status: 200, json: async () => ({ reports: [] }) };
    });
    const app = makeApp(supabase, { env: { ...ENV, GA_SA_PRIVATE_KEY: TEST_PEM }, fetchImpl });
    const { base, close } = await listen(app);
    const res1 = await fetch(`${base}/api/v1/integrations/ga/report?range=7d`, { headers: AUTH });
    const json1 = await res1.json();
    const res2 = await fetch(`${base}/api/v1/integrations/ga/report?range=7d`, { headers: AUTH });
    const json2 = await res2.json();
    await close();
    expect(res1.status).toBe(200);
    expect(json1.report).toMatchObject({ timeseries: [], sources: [], pages: [], devices: [], cities: [] });
    expect(json2).toEqual(json1);
    expect(batchCalls).toBe(1); // cache 1h por property+range
  });
});
