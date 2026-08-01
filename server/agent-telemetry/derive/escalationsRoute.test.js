import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerAgentTelemetryRoutes } from '../routes.js';

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';

// Supabase mock cobrindo os caminhos do endpoint de escalonamento:
// - tenant_memberships (auth) → maybeSingle
// - lia_perguntas_corretor  → select/eq/order/range/gte/lt, resolve com `perguntas`
// - leads                   → select/eq/gt/in, resolve com `leadsFechados`
function buildSupabase({ perguntas, leadsFechados, membership, getUser }) {
  const perguntasChain = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    range(offset) { return this; },
    gte() { return this; },
    lt() { return this; },
    then(resolve) { return resolve({ data: perguntas, error: null }); },
  };
  const leadsChain = {
    select() { return this; },
    eq() { return this; },
    gt() { return this; },
    in() { return this; },
    then(resolve) { return resolve({ data: leadsFechados, error: null }); },
  };
  return {
    auth: { getUser: vi.fn(async () => getUser) },
    from: vi.fn((table) => {
      if (table === 'tenant_memberships') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => membership }) }) }) };
      }
      if (table === 'lia_perguntas_corretor') return perguntasChain;
      if (table === 'leads') return leadsChain;
      throw new Error(`tabela inesperada: ${table}`);
    }),
  };
}

describe('GET /api/v1/agent-telemetry/escalations', () => {
  let handlers;
  const call = async (req) => {
    const res = {
      statusCode: 200, body: null,
      status(c) { this.statusCode = c; return this; },
      json(p) { this.body = p; return this; },
    };
    await handlers['/api/v1/agent-telemetry/escalations']({ headers: {}, query: {}, ...req }, res);
    return res;
  };
  const register = (supabase) => {
    handlers = {};
    registerAgentTelemetryRoutes({ post: () => {}, get: (p, h) => { handlers[p] = h; } }, supabase);
  };

  beforeEach(() => { process.env.AGENT_TELEMETRY_SERVICE_TOKEN = 'segredo'; });
  afterEach(() => { delete process.env.AGENT_TELEMETRY_SERVICE_TOKEN; });

  it('sem credencial → 401', async () => {
    register(buildSupabase({ perguntas: [], leadsFechados: [] }));
    expect((await call({})).statusCode).toBe(401);
  });

  it('usuário sem tenantId → 403 tenant_required (isolamento: não vaza cross-tenant)', async () => {
    register(buildSupabase({
      perguntas: [], leadsFechados: [],
      getUser: { data: { user: { id: 'u1', email: 'admin@imob.com' } }, error: null },
    }));
    const res = await call({ headers: { authorization: 'Bearer jwt' } });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('tenant_required');
  });

  it('membro do tenant recebe métricas derivadas (contagem, P50/P95, fechamento)', async () => {
    register(buildSupabase({
      membership: { data: { tenant_id: TENANT }, error: null },
      getUser: { data: { user: { id: 'u1', email: 'admin@imob.com' } }, error: null },
      perguntas: [
        { lead_id: 'L1', criado_em: '2026-07-01T00:00:00Z', respondida_em: '2026-07-01T01:00:00Z', status: 'respondida' },
        { lead_id: 'L2', criado_em: '2026-07-02T00:00:00Z', respondida_em: null, status: 'pendente' },
      ],
      leadsFechados: [{ id: 'L1' }],
    }));
    const res = await call({ headers: { authorization: 'Bearer jwt' }, query: { tenantId: TENANT } });
    expect(res.statusCode).toBe(200);
    expect(res.body.escalations.total).toBe(2);
    expect(res.body.escalations.resolved).toBe(1);
    expect(res.body.escalations.response_time.p50_minutes).toBe(60);
    expect(res.body.escalations.closure.escalated_leads).toBe(2);
    expect(res.body.escalations.closure.closed_leads).toBe(1);
    expect(res.body.escalations.closure.rate).toBeCloseTo(0.5, 10);
  });

  it('sem escalonamentos → payload em estado vazio honesto (percentis e taxa null)', async () => {
    register(buildSupabase({
      membership: { data: { tenant_id: TENANT }, error: null },
      getUser: { data: { user: { id: 'u1', email: 'admin@imob.com' } }, error: null },
      perguntas: [], leadsFechados: [],
    }));
    const res = await call({ headers: { authorization: 'Bearer jwt' }, query: { tenantId: TENANT } });
    expect(res.statusCode).toBe(200);
    expect(res.body.escalations.total).toBe(0);
    expect(res.body.escalations.response_time.p50_minutes).toBeNull();
    expect(res.body.escalations.closure.rate).toBeNull();
  });
});
