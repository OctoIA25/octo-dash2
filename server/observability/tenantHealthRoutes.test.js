import { describe, it, expect } from 'vitest';
import { registerTenantHealthRoutes } from './tenantHealthRoutes.js';

const OWNER = 'octo.inteligenciaimobiliaria@gmail.com';
const UUID = '11111111-1111-1111-1111-111111111111';

// App/req/res falsos — mesmo padrão de kenlo/routes.test.js.
function fakeApp() {
  const routes = {};
  const reg = (m) => (path, ...h) => { routes[`${m} ${path}`] = h; };
  return { get: reg('GET'), post: reg('POST'), routes };
}
async function run(handlers, req) {
  const res = {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  for (const h of handlers) {
    let nexted = false;
    await h(req, res, () => { nexted = true; });
    if (!nexted) break; // middleware bloqueou
  }
  return res;
}
function reqFor(tenantId, token = 'Bearer t') {
  return { params: { tenantId }, headers: { authorization: token } };
}

// Supabase mock: auth + um builder de query encadeável que resolve valores por tabela.
function makeSupabase({ user, tables = {}, authError = false } = {}) {
  return {
    auth: {
      getUser: async () => (authError || !user ? { data: null, error: 'x' } : { data: { user }, error: null }),
    },
    from(table) {
      const result = tables[table] ?? { data: null, error: null, count: 0 };
      // Builder que ignora .select/.eq/.gte/.order/.limit e resolve no await ou no .maybeSingle().
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        gte() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() { return Promise.resolve(result); },
        then(onF, onR) { return Promise.resolve(result).then(onF, onR); },
      };
      return builder;
    },
  };
}

const OWNER_USER = { id: 'u', email: OWNER };

describe('GET /api/v1/health/tenant/:tenantId', () => {
  it('401 sem Bearer', async () => {
    const app = fakeApp();
    registerTenantHealthRoutes(app, makeSupabase({ user: OWNER_USER }));
    const res = await run(app.routes['GET /api/v1/health/tenant/:tenantId'], reqFor(UUID, ''));
    expect(res.statusCode).toBe(401);
  });

  it('401 token inválido', async () => {
    const app = fakeApp();
    registerTenantHealthRoutes(app, makeSupabase({ authError: true }));
    const res = await run(app.routes['GET /api/v1/health/tenant/:tenantId'], reqFor(UUID));
    expect(res.statusCode).toBe(401);
  });

  it('403 autenticado mas não-owner', async () => {
    const app = fakeApp();
    registerTenantHealthRoutes(app, makeSupabase({ user: { id: 'u', email: 'alguem@x.com' } }));
    const res = await run(app.routes['GET /api/v1/health/tenant/:tenantId'], reqFor(UUID));
    expect(res.statusCode).toBe(403);
  });

  it('400 tenantId não-UUID', async () => {
    const app = fakeApp();
    registerTenantHealthRoutes(app, makeSupabase({ user: OWNER_USER }));
    const res = await run(app.routes['GET /api/v1/health/tenant/:tenantId'], reqFor('nao-e-uuid'));
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_tenant_id' });
  });

  it('200 owner: monta tenant + platform, IA sem api_key', async () => {
    const app = fakeApp();
    const supabase = makeSupabase({
      user: OWNER_USER,
      tables: {
        tenant_contact2sale_config: { data: { status: 'active', last_sync_at: 'x', sync_state: JSON.stringify({ status: 'done', errors: 0 }) }, error: null },
        kenlo_integrations: { data: null, error: null },
        tenant_api_keys: { data: [{ provider: 'anthropic', model: 'claude-sonnet-5' }], error: null },
        agent_action_queue: { count: 0, error: null },
        webhook_events: { count: 0, error: null, data: [] },
        whatsapp_config: { data: { is_active: true }, error: null },
        whatsapp_messages: { count: 0, error: null },
        job_heartbeats: { data: [{ job_name: 'c2s_sync', last_run_at: new Date().toISOString(), last_result: { ok: true } }], error: null },
        tenants: { data: { deleted_at: null }, error: null },
      },
    });
    registerTenantHealthRoutes(app, supabase);
    const res = await run(app.routes['GET /api/v1/health/tenant/:tenantId'], reqFor(UUID));
    expect(res.statusCode).toBe(200);
    expect(res.body.tenant.contact2sale.status).toBe('ok');
    expect(res.body.tenant.kenlo.status).toBe('inactive'); // sem config
    expect(res.body.tenant.ia).toMatchObject({ available: true, provider: 'anthropic', model: 'claude-sonnet-5' });
    expect(res.body.tenant.ia.api_key).toBeUndefined(); // NUNCA expõe
    expect(res.body.platform.jobs.c2s_sync.ok).toBe(true);
    expect(res.body.exists).toBe(true);
  });

  it('falha parcial: uma query erra → card available:false, resto 200', async () => {
    const app = fakeApp();
    const supabase = makeSupabase({
      user: OWNER_USER,
      tables: {
        tenant_contact2sale_config: { data: null, error: { message: 'db down' } }, // <- falha
        kenlo_integrations: { data: { status: 'active', sync_state: JSON.stringify({ status: 'done' }) }, error: null },
        tenant_api_keys: { data: [], error: null },
        agent_action_queue: { count: 0, error: null },
        webhook_events: { count: 0, error: null },
        whatsapp_config: { data: null, error: null },
        whatsapp_messages: { count: 0, error: null },
        job_heartbeats: { data: [], error: null },
        tenants: { data: { deleted_at: null }, error: null },
      },
    });
    registerTenantHealthRoutes(app, supabase);
    const res = await run(app.routes['GET /api/v1/health/tenant/:tenantId'], reqFor(UUID));
    expect(res.statusCode).toBe(200); // NÃO derruba a página
    expect(res.body.tenant.contact2sale.available).toBe(false);
    expect(res.body.tenant.contact2sale.error).toBe('query failed'); // erro genérico, não "db down"
    expect(res.body.tenant.kenlo.available).toBe(true); // os outros seguem
  });

  it('soft-delete: sinaliza deleted_at sem bloquear (200)', async () => {
    const app = fakeApp();
    const supabase = makeSupabase({
      user: OWNER_USER,
      tables: {
        tenant_contact2sale_config: { data: null, error: null },
        kenlo_integrations: { data: null, error: null },
        tenant_api_keys: { data: [], error: null },
        agent_action_queue: { count: 0, error: null },
        webhook_events: { count: 0, error: null },
        whatsapp_config: { data: null, error: null },
        whatsapp_messages: { count: 0, error: null },
        job_heartbeats: { data: [], error: null },
        tenants: { data: { deleted_at: '2026-07-01T00:00:00Z' }, error: null },
      },
    });
    registerTenantHealthRoutes(app, supabase);
    const res = await run(app.routes['GET /api/v1/health/tenant/:tenantId'], reqFor(UUID));
    expect(res.statusCode).toBe(200);
    expect(res.body.deleted_at).toBe('2026-07-01T00:00:00Z');
    expect(res.body.exists).toBe(true);
  });

  it('200 owner: card ia ganha bloco lia (ativa) e perde telemetry', async () => {
    const app = fakeApp();
    const supabase = makeSupabase({
      user: OWNER_USER,
      tables: {
        tenant_api_keys: { data: [{ provider: 'anthropic', model: 'claude-sonnet-5' }], error: null },
        // LIA: mensagens com count>0 => ativa:true. (mock dá o mesmo count a todas as queries da tabela)
        lia_corretor_messages: { count: 561, error: null, data: [{ created_at: '2026-07-12T04:05:00.000Z' }] },
        lia_followups: { count: 45, error: null },
        lia_perguntas_corretor: { count: 35, error: null, data: [] },
        lia_visitas: { count: 89, error: null },
        lia_lead_extra: { count: 0, error: null, data: [{ interaction_count: 5 }] },
        lia_lead_facts: { count: 298, error: null, data: [{ lead_id: 'a' }] },
      },
    });
    registerTenantHealthRoutes(app, supabase);
    const res = await run(app.routes['GET /api/v1/health/tenant/:tenantId'], reqFor(UUID));
    expect(res.statusCode).toBe(200);
    expect(res.body.tenant.ia.lia).toBeDefined();
    expect(res.body.tenant.ia.lia.ativa).toBe(true);
    expect(res.body.tenant.ia.telemetry).toBeUndefined();
  });

  it('200 owner: tenant sem LIA => ia.lia.ativa:false', async () => {
    const app = fakeApp();
    const supabase = makeSupabase({
      user: OWNER_USER,
      tables: {
        tenant_api_keys: { data: [], error: null },
        lia_corretor_messages: { count: 0, error: null, data: [] },
        lia_followups: { count: 0, error: null },
        lia_perguntas_corretor: { count: 0, error: null, data: [] },
        lia_visitas: { count: 0, error: null },
        lia_lead_extra: { count: 0, error: null, data: [] },
        lia_lead_facts: { count: 0, error: null, data: [] },
      },
    });
    registerTenantHealthRoutes(app, supabase);
    const res = await run(app.routes['GET /api/v1/health/tenant/:tenantId'], reqFor(UUID));
    expect(res.body.tenant.ia.lia).toEqual({ available: true, ativa: false });
  });
});
