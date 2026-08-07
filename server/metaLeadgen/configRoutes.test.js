import { describe, it, expect, vi } from 'vitest';
import { registerMetaConfigRoutes } from './configRoutes.js';

const OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';

function fakeApp() {
  const routes = {};
  return {
    routes,
    post(path, ...h) { routes[`POST ${path}`] = h; },
    get(path, ...h) { routes[`GET ${path}`] = h; },
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

// apiKeys: linhas de tenant_api_keys que o fake devolve
function fakeSupabase({ email = OWNER_EMAIL, apiKeys = [] } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email } }, error: null }) },
    from(table) {
      const q = {
        _f: {},
        select() { return q; },
        eq(c, v) { q._f[c] = v; return q; },
        limit: async () => ({ data: apiKeys, error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return q;
    },
  };
}

const fakeResolver = (overrides = {}) => ({
  saved: [],
  resolveByTenant: async () => ({
    tenantId: 't1', pageId: 'p1', status: 'inactive',
    webhookToken: 'wt-abc', verifyToken: 'vt-xyz',
    appSecret: 'segredo', accessToken: 'token',
  }),
  saveConfig: async function (tenantId, patch) { this.saved.push({ tenantId, patch }); return { ok: true }; },
  ...overrides,
});

const authed = (body) => ({ headers: { authorization: 'Bearer good' }, body, query: body });

// tenantWithAccess: único tenant_id para o qual maybeSingle devolve membership
// admin. Usado pelos testes de IDOR abaixo — simula um admin do tenant-A
// tentando escopar a requisição para o tenant-B.
function fakeSupabaseScoped(tenantWithAccess, { email = 'admin@imob.com', apiKeys = [] } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email } }, error: null }) },
    from(table) {
      const q = {
        _f: {},
        select() { return q; },
        eq(c, v) { q._f[c] = v; return q; },
        limit: async () => ({ data: apiKeys, error: null }),
        maybeSingle: async () => {
          if (table === 'tenant_memberships' && q._f.tenant_id === tenantWithAccess) {
            return { data: { role: 'admin' }, error: null };
          }
          return { data: null, error: null };
        },
      };
      return q;
    },
  };
}

describe('POST /api/v1/integrations/meta/config/get', () => {
  it('nunca devolve os segredos', async () => {
    const app = fakeApp();
    registerMetaConfigRoutes(app, fakeSupabase(), { resolver: fakeResolver() });
    const res = await call(app.routes['POST /api/v1/integrations/meta/config/get'], authed({ tenantId: 't1' }));
    expect(res.statusCode).toBe(200);
    const s = JSON.stringify(res.body);
    expect(s).not.toContain('segredo');
    expect(s).not.toContain('token');
  });

  it('devolve a URL do webhook montada e o verify token', async () => {
    const app = fakeApp();
    registerMetaConfigRoutes(app, fakeSupabase(), { resolver: fakeResolver() });
    const res = await call(app.routes['POST /api/v1/integrations/meta/config/get'], authed({ tenantId: 't1' }));
    expect(res.body.config.webhookUrl).toContain('/api/v1/integrations/meta/webhook/wt-abc');
    expect(res.body.config.verifyToken).toBe('vt-xyz');
  });

  it('sinaliza quais segredos já estão gravados sem revelá-los', async () => {
    const app = fakeApp();
    registerMetaConfigRoutes(app, fakeSupabase(), { resolver: fakeResolver() });
    const res = await call(app.routes['POST /api/v1/integrations/meta/config/get'], authed({ tenantId: 't1' }));
    expect(res.body.config.hasAppSecret).toBe(true);
    expect(res.body.config.hasAccessToken).toBe(true);
  });

  // Correção pós-review: tenant sem linha em tenant_meta_leadgen_config não
  // pode ver "config: null" — a URL do webhook é o primeiro passo do
  // onboarding, precisa existir ANTES de qualquer campo preenchido.
  it('tenant sem config: provisiona a linha e devolve webhookUrl/verifyToken preenchidos', async () => {
    const app = fakeApp();
    let existe = false;
    const resolver = fakeResolver({
      resolveByTenant: async (tenantId) => {
        if (!existe) return null;
        return {
          tenantId, pageId: null, status: 'inactive',
          webhookToken: 'wt-novo', verifyToken: 'vt-novo',
          appSecret: null, accessToken: null,
        };
      },
      saveConfig: async function (tenantId, patch) {
        this.saved.push({ tenantId, patch });
        existe = true;
        return { ok: true };
      },
    });
    registerMetaConfigRoutes(app, fakeSupabase(), { resolver });
    const res = await call(app.routes['POST /api/v1/integrations/meta/config/get'], authed({ tenantId: 't1' }));

    expect(res.statusCode).toBe(200);
    expect(res.body.config).not.toBeNull();
    expect(res.body.config.webhookUrl).toContain('wt-novo');
    expect(res.body.config.verifyToken).toBe('vt-novo');
    expect(res.body.config.status).toBe('inactive'); // não ativa nada sozinho
    expect(resolver.saved).toHaveLength(1);
    expect(resolver.saved[0]).toEqual({ tenantId: 't1', patch: {} }); // sem campos: só provisiona
  });
});

describe('IDOR — tenantId tem que vir de uma única fonte (corpo)', () => {
  // O ataque original: corpo com o tenant PRÓPRIO (passa na autorização) e
  // query com o tenant da VÍTIMA (era o que o handler antigo lia). authed()
  // não serve aqui — ele aponta body e query para o mesmo objeto, o que
  // mascararia a regressão (o middleware corrigido continuaria passando pelo
  // check de membership de qualquer forma). A requisição precisa divergir.
  it('leitura: ignora o tenantId da query e usa só o do corpo (regressão do IDOR)', async () => {
    const app = fakeApp();
    const supabase = fakeSupabaseScoped('tenant-A');
    const resolveByTenant = vi.fn(async (tenantId) => ({
      tenantId, pageId: `p-${tenantId}`, status: 'active',
      webhookToken: `wt-${tenantId}`, verifyToken: `vt-${tenantId}`,
      appSecret: 'segredo', accessToken: 'token',
    }));
    const resolver = fakeResolver({ resolveByTenant });
    registerMetaConfigRoutes(app, supabase, { resolver });

    const req = {
      headers: { authorization: 'Bearer good' },
      body: { tenantId: 'tenant-A' },   // passa na autorização (admin do tenant-A)
      query: { tenantId: 'tenant-B' },  // é o que o handler vulnerável leria
    };
    const res = await call(app.routes['POST /api/v1/integrations/meta/config/get'], req);

    expect(res.statusCode).toBe(200);
    expect(resolveByTenant).toHaveBeenCalledWith('tenant-A');
    expect(resolveByTenant).not.toHaveBeenCalledWith('tenant-B');
    expect(JSON.stringify(res.body)).not.toContain('tenant-B');
  });

  it('salvar: ignora o tenantId da query e usa só o do corpo (regressão do IDOR)', async () => {
    const app = fakeApp();
    const supabase = fakeSupabaseScoped('tenant-A');
    const resolver = fakeResolver();
    const saveConfig = vi.fn(resolver.saveConfig.bind(resolver));
    resolver.saveConfig = saveConfig;
    registerMetaConfigRoutes(app, supabase, { resolver });

    const req = {
      headers: { authorization: 'Bearer good' },
      body: { tenantId: 'tenant-A', pageId: 'p1' },
      query: { tenantId: 'tenant-B' },
    };
    const res = await call(app.routes['POST /api/v1/integrations/meta/config'], req);

    expect(res.statusCode).toBe(200);
    expect(saveConfig).toHaveBeenCalledWith('tenant-A', expect.objectContaining({ pageId: 'p1' }));
    expect(saveConfig).not.toHaveBeenCalledWith('tenant-B', expect.anything());
    expect(JSON.stringify(res.body)).not.toContain('tenant-B');
  });
});

describe('POST /api/v1/integrations/meta/config', () => {
  const ACTIVE_KEY = [{ tenant_id: 't1', provider: 'crm', status: 'active' }];

  it('salva quando o tenant tem API key ativa', async () => {
    const app = fakeApp();
    const resolver = fakeResolver();
    registerMetaConfigRoutes(app, fakeSupabase({ apiKeys: ACTIVE_KEY }), { resolver });
    const res = await call(
      app.routes['POST /api/v1/integrations/meta/config'],
      authed({ tenantId: 't1', pageId: 'p1', appSecret: 's', accessToken: 'a', status: 'active' }),
    );
    expect(res.statusCode).toBe(200);
    expect(resolver.saved).toHaveLength(1);
  });

  it('BLOQUEIA ativar sem API key crm ativa', async () => {
    const app = fakeApp();
    const resolver = fakeResolver();
    registerMetaConfigRoutes(app, fakeSupabase({ apiKeys: [] }), { resolver });
    const res = await call(
      app.routes['POST /api/v1/integrations/meta/config'],
      authed({ tenantId: 't1', status: 'active' }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('api_key_ausente');
    expect(resolver.saved).toHaveLength(0);
  });

  // Correção pós-review: sem isso, salvar só o Page ID apaga a legenda
  // "já configurado" das labels de segredo na tela, mesmo com o segredo intacto.
  it('devolve hasAppSecret e hasAccessToken na resposta do POST, igual ao GET', async () => {
    const app = fakeApp();
    const resolver = fakeResolver(); // resolveByTenant devolve appSecret/accessToken truthy
    registerMetaConfigRoutes(app, fakeSupabase({ apiKeys: ACTIVE_KEY }), { resolver });
    const res = await call(
      app.routes['POST /api/v1/integrations/meta/config'],
      authed({ tenantId: 't1', pageId: 'p1' }),
    );
    expect(res.body.config.hasAppSecret).toBe(true);
    expect(res.body.config.hasAccessToken).toBe(true);
  });

  it('permite salvar inactive sem API key', async () => {
    const app = fakeApp();
    const resolver = fakeResolver();
    registerMetaConfigRoutes(app, fakeSupabase({ apiKeys: [] }), { resolver });
    const res = await call(
      app.routes['POST /api/v1/integrations/meta/config'],
      authed({ tenantId: 't1', pageId: 'p1' }),
    );
    expect(res.statusCode).toBe(200);
  });

  it('exige tenantId', async () => {
    const app = fakeApp();
    registerMetaConfigRoutes(app, fakeSupabase({ apiKeys: ACTIVE_KEY }), { resolver: fakeResolver() });
    const res = await call(app.routes['POST /api/v1/integrations/meta/config'], authed({ pageId: 'p1' }));
    expect(res.statusCode).toBe(400);
  });

  it('rejeita quem não é owner nem admin do tenant', async () => {
    const app = fakeApp();
    const supabase = fakeSupabase({ email: 'corretor@imob.com', apiKeys: ACTIVE_KEY });
    supabase.from = (table) => {
      const q = {
        select() { return q; },
        eq() { return q; },
        limit: async () => ({ data: ACTIVE_KEY, error: null }),
        maybeSingle: async () => ({ data: { role: 'corretor' }, error: null }),
      };
      return q;
    };
    registerMetaConfigRoutes(app, supabase, { resolver: fakeResolver() });
    const res = await call(app.routes['POST /api/v1/integrations/meta/config'], authed({ tenantId: 't1' }));
    expect(res.statusCode).toBe(403);
  });

  it('rejeita sem authorization', async () => {
    const app = fakeApp();
    registerMetaConfigRoutes(app, fakeSupabase(), { resolver: fakeResolver() });
    const res = await call(app.routes['POST /api/v1/integrations/meta/config'], { headers: {}, body: {}, query: {} });
    expect(res.statusCode).toBe(401);
  });
});
