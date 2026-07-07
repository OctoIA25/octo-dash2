import { describe, it, expect, vi } from 'vitest';
import { registerContact2SaleRoutes } from './routes.js';

const OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';

function fakeApp() {
  const routes = {};
  return {
    routes,
    post(path, ...handlers) { routes[`POST ${path}`] = handlers; },
    get(path, ...handlers) { routes[`GET ${path}`] = handlers; },
  };
}

function makeRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

async function call(handlers, req) {
  const res = makeRes();
  for (const h of handlers) {
    let nexted = false;
    await h(req, res, () => { nexted = true; });
    if (!nexted) break;
  }
  return res;
}

function fakeSupabase({ user = { id: 'u1', email: 'admin@imob.com' }, role = 'admin' } = {}) {
  const kenloUpdates = [];
  return {
    kenloUpdates,
    auth: {
      getUser: async (token) => (token === 'good'
        ? { data: { user }, error: null }
        : { data: null, error: { message: 'invalid' } }),
    },
    from(table) {
      if (table === 'tenant_memberships') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role ? { role } : null, error: null }) }) }) }) };
      }
      if (table === 'kenlo_integrations') {
        return { update: (p) => ({ eq: (_c, tenant) => ({ eq: () => { kenloUpdates.push({ ...p, tenant }); return Promise.resolve({ error: null }); } }) }) };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}

function setup({ supabase = fakeSupabase(), stored = { tenantId: 't1', apiToken: 'stored-tok', status: 'inactive' }, meOk = true, meStatus = 403 } = {}) {
  const app = fakeApp();
  const resolver = {
    resolveConfig: vi.fn(async () => stored),
    saveConfig: vi.fn(async () => ({ ok: true })),
    invalidate: vi.fn(),
  };
  const apiClient = { getMe: vi.fn(async () => (meOk ? { ok: true, status: 200, body: { name: 'Imob X' } } : { ok: false, status: meStatus })) };
  registerContact2SaleRoutes(app, supabase, { resolver, apiClient });
  const post = (path, body, auth = 'Bearer good') => call(app.routes[`POST ${path}`], { headers: { authorization: auth }, body });
  return { app, resolver, apiClient, supabase, post };
}

describe('auth das rotas C2S', () => {
  it('sem Authorization → 401', async () => {
    const { post } = setup();
    const res = await post('/api/v1/contact2sale/config', { tenantId: 't1' }, '');
    expect(res.statusCode).toBe(401);
  });

  it('membro sem papel de gestão (corretor) → 403', async () => {
    const { post } = setup({ supabase: fakeSupabase({ role: 'corretor' }) });
    const res = await post('/api/v1/contact2sale/config', { tenantId: 't1', apiToken: 'x' });
    expect(res.statusCode).toBe(403);
  });

  it('owner da plataforma passa sem membership', async () => {
    const { post } = setup({ supabase: fakeSupabase({ user: { id: 'u0', email: OWNER_EMAIL }, role: null }) });
    const res = await post('/api/v1/contact2sale/config/get', { tenantId: 't1' });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /api/v1/contact2sale/config', () => {
  it('salva token sem ativar: cifra via resolver e NÃO mexe no Kenlo', async () => {
    const { post, resolver, supabase } = setup();
    const res = await post('/api/v1/contact2sale/config', { tenantId: 't1', apiToken: 'tok-novo' });
    expect(res.statusCode).toBe(200);
    expect(resolver.saveConfig).toHaveBeenCalledWith('t1', expect.objectContaining({ apiToken: 'tok-novo' }));
    expect(supabase.kenloUpdates).toHaveLength(0);
  });

  it('ativação valida o token na C2S (GET /me) e DESATIVA o Kenlo na mesma requisição (D2 — camada de serviço)', async () => {
    const { post, resolver, apiClient, supabase } = setup();
    const res = await post('/api/v1/contact2sale/config', { tenantId: 't1', apiToken: 'tok', status: 'active' });
    expect(res.statusCode).toBe(200);
    // tenantId junto: chave de rate/breaker por tenant (não a 'adhoc' compartilhada)
    expect(apiClient.getMe).toHaveBeenCalledWith({ tenantId: 't1', apiToken: 'tok' });
    expect(resolver.saveConfig).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'active' }));
    expect(supabase.kenloUpdates).toEqual([{ status: 'inactive', tenant: 't1' }]);
  });

  it('ativação com token inválido → 400, não salva e não desativa Kenlo', async () => {
    const { post, resolver, supabase } = setup({ meOk: false });
    const res = await post('/api/v1/contact2sale/config', { tenantId: 't1', apiToken: 'ruim', status: 'active' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('token_invalido');
    expect(resolver.saveConfig).not.toHaveBeenCalled();
    expect(supabase.kenloUpdates).toHaveLength(0);
  });

  it('C2S fora do ar (status 0) na ativação → 503 c2s_indisponivel, NUNCA "token inválido"', async () => {
    const { post, resolver } = setup({ meOk: false, meStatus: 0 });
    const res = await post('/api/v1/contact2sale/config', { tenantId: 't1', apiToken: 'tok', status: 'active' });
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('c2s_indisponivel');
    expect(resolver.saveConfig).not.toHaveBeenCalled();
  });

  it('ativação sem token novo usa o armazenado; sem nenhum → 400', async () => {
    const armazenado = setup();
    const ok = await armazenado.post('/api/v1/contact2sale/config', { tenantId: 't1', status: 'active' });
    expect(ok.statusCode).toBe(200);
    expect(armazenado.apiClient.getMe).toHaveBeenCalledWith({ tenantId: 't1', apiToken: 'stored-tok' });

    const semToken = setup({ stored: null });
    const res = await semToken.post('/api/v1/contact2sale/config', { tenantId: 't1', status: 'active' });
    expect(res.statusCode).toBe(400);
  });
});

describe('rotas de sync (owner-only)', () => {
  const OWNER = { id: 'u0', email: OWNER_EMAIL };

  function syncSetup({ user = OWNER, role = null, statusRows = [], runnerResult = { started: 1, skipped: 0 }, runningTenants = new Set() } = {}) {
    const app = fakeApp();
    const supabase = fakeSupabase({ user, role });
    // Estende o fake para a tabela de config C2S (reset do full + listagem do status).
    const c2sUpdates = [];
    const baseFrom = supabase.from.bind(supabase);
    supabase.c2sUpdates = c2sUpdates;
    supabase.from = (table) => {
      if (table === 'tenant_contact2sale_config') {
        return {
          update: (p) => ({ eq: (_c, v) => { c2sUpdates.push({ ...p, tenant: v }); return Promise.resolve({ error: null }); } }),
          select: () => ({ order: () => Promise.resolve({ data: statusRows, error: null }) }),
        };
      }
      return baseFrom(table);
    };
    const runner = {
      trigger: vi.fn(async () => runnerResult),
      isRunning: vi.fn((tenantId) => runningTenants.has(tenantId)),
    };
    registerContact2SaleRoutes(app, supabase, {
      resolver: { resolveConfig: vi.fn(), saveConfig: vi.fn(), invalidate: vi.fn() },
      apiClient: { getMe: vi.fn() },
      runner,
    });
    const post = (path, body, auth = 'Bearer good') => call(app.routes[`POST ${path}`], { headers: { authorization: auth }, body });
    const get = (path, auth = 'Bearer good') => call(app.routes[`GET ${path}`], { headers: { authorization: auth }, body: {} });
    return { post, get, runner, supabase };
  }

  it('sync/run é owner-only: admin de tenant recebe 403', async () => {
    const { post, runner } = syncSetup({ user: { id: 'u1', email: 'admin@imob.com' }, role: 'admin' });
    const res = await post('/api/v1/contact2sale/sync/run', { tenantId: 't1' });
    expect(res.statusCode).toBe(403);
    expect(runner.trigger).not.toHaveBeenCalled();
  });

  it('owner dispara ciclo (202), com tenantId opcional repassado ao runner', async () => {
    const { post, runner } = syncSetup();
    const res = await post('/api/v1/contact2sale/sync/run', { tenantId: 't9' });
    expect(res.statusCode).toBe(202);
    expect(runner.trigger).toHaveBeenCalledWith({ tenantId: 't9' });
  });

  it('full exige tenantId; com ele, reseta cursores ANTES de disparar (re-walk silencioso, D3)', async () => {
    const semTenant = syncSetup();
    const r400 = await semTenant.post('/api/v1/contact2sale/sync/run', { full: true });
    expect(r400.statusCode).toBe(400);
    expect(semTenant.runner.trigger).not.toHaveBeenCalled();

    const { post, runner, supabase } = syncSetup();
    const res = await post('/api/v1/contact2sale/sync/run', { tenantId: 't1', full: true });
    expect(res.statusCode).toBe(202);
    expect(supabase.c2sUpdates).toEqual([{ last_full_sync_at: null, backfill_cursor: null, tenant: 't1' }]);
    expect(runner.trigger).toHaveBeenCalledWith({ tenantId: 't1' });
  });

  it('full durante ciclo em andamento retorna 409 antes de resetar cursor', async () => {
    const { post, runner, supabase } = syncSetup({ runningTenants: new Set(['t1']) });
    const res = await post('/api/v1/contact2sale/sync/run', { tenantId: 't1', full: true });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: 'sync_em_andamento' });
    expect(supabase.c2sUpdates).toHaveLength(0);
    expect(runner.trigger).not.toHaveBeenCalled();
  });

  it('falha futura do trigger vira 500 tratado, sem rejeição pendurada na rota', async () => {
    const { post, runner } = syncSetup();
    runner.trigger.mockRejectedValueOnce(new Error('boom'));
    const res = await post('/api/v1/contact2sale/sync/run', { tenantId: 't1' });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('sync_trigger_failed');
  });

  it('sync/status parseia sync_state e deriva stalled pelo heartbeat (backfill de horas não é falso-positivo)', async () => {
    const velho = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const agora = new Date().toISOString();
    const statusRows = [
      { tenant_id: 't1', status: 'active', sync_state: JSON.stringify({ status: 'running', heartbeat_at: velho }) },
      { tenant_id: 't2', status: 'active', sync_state: JSON.stringify({ status: 'running', heartbeat_at: agora }) },
      { tenant_id: 't3', status: 'active', sync_state: JSON.stringify({ status: 'done' }) },
      { tenant_id: 't4', status: 'active', sync_state: 'não-json{' },
      { tenant_id: 't5', status: 'active', sync_state: JSON.stringify({ status: 'running', started_at: velho }) },
    ];
    const { get } = syncSetup({ statusRows });
    const res = await get('/api/v1/contact2sale/sync/status');
    expect(res.statusCode).toBe(200);
    const by = Object.fromEntries(res.body.integrations.map((i) => [i.tenant_id, i]));
    expect(by.t1.stalled).toBe(true);    // running com heartbeat de 30min → processo morreu
    expect(by.t2.stalled).toBe(false);   // running com heartbeat fresco → backfill legítimo
    expect(by.t3.stalled).toBe(false);   // done
    expect(by.t4.sync_state).toBeNull(); // sync_state corrompido não derruba a rota
    expect(by.t5.stalled).toBe(true);    // compat: estados antigos sem heartbeat usam started_at
  });
});

describe('POST /api/v1/contact2sale/config/get e /config/test', () => {
  it('get devolve metadados e hasToken — NUNCA o token', async () => {
    const { post } = setup();
    const res = await post('/api/v1/contact2sale/config/get', { tenantId: 't1' });
    expect(res.statusCode).toBe(200);
    expect(res.body.config).toEqual({ tenantId: 't1', status: 'inactive', hasToken: true });
    expect(JSON.stringify(res.body)).not.toContain('stored-tok');
  });

  it('get sem config → config null', async () => {
    const { post } = setup({ stored: null });
    const res = await post('/api/v1/contact2sale/config/get', { tenantId: 't1' });
    expect(res.body.config).toBeNull();
  });

  it('test usa o token fornecido (ou o armazenado) contra GET /me', async () => {
    const { post, apiClient } = setup();
    const res = await post('/api/v1/contact2sale/config/test', { tenantId: 't1', apiToken: 'avulso' });
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.company).toBe('Imob X');
    expect(apiClient.getMe).toHaveBeenCalledWith({ tenantId: 't1', apiToken: 'avulso' });
  });
});
