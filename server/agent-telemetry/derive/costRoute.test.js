import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerAgentTelemetryRoutes } from '../routes.js';

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';

// Mock cobrindo o /costs: RPC summary, exchange_rates, commercial_sales (VGC),
// e counts (leads atendidos / vendas). countByTable dá o count por tabela.
function buildSupabase({ summary, rates, vgcRows, counts, membership, getUser }) {
  const rateChain = { select() { return this; }, eq() { return this; }, then(r) { return r({ data: rates, error: null }); } };
  const vgcChain = {
    select() { return this; }, eq() { return this; }, gte() { return this; }, lte() { return this; },
    range() { return Promise.resolve({ data: vgcRows, error: null }); },
  };
  const countChain = (table) => ({
    select() { return this; }, eq() { return this; }, gt() { return this; }, gte() { return this; }, lt() { return this; },
    then(r) { return r({ count: counts[table] ?? 0, error: null }); },
  });
  return {
    auth: { getUser: vi.fn(async () => getUser) },
    rpc: vi.fn(async () => ({ data: summary, error: null })),
    from: vi.fn((table) => {
      if (table === 'tenant_memberships') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => membership }) }) }) };
      }
      if (table === 'exchange_rates') return rateChain;
      if (table === 'commercial_sales') return vgcChain;
      return countChain(table); // leads (atendidos e vendas)
    }),
  };
}

describe('GET /api/v1/agent-telemetry/costs', () => {
  let handlers;
  const call = async (req) => {
    const res = {
      statusCode: 200, body: null,
      status(c) { this.statusCode = c; return this; },
      json(p) { this.body = p; return this; },
    };
    await handlers['/api/v1/agent-telemetry/costs']({ headers: {}, query: {}, ...req }, res);
    return res;
  };
  const register = (s) => { handlers = {}; registerAgentTelemetryRoutes({ post: () => {}, get: (p, h) => { handlers[p] = h; } }, s); };

  beforeEach(() => { process.env.AGENT_TELEMETRY_SERVICE_TOKEN = 'segredo'; });
  afterEach(() => { delete process.env.AGENT_TELEMETRY_SERVICE_TOKEN; });

  it('sem credencial → 401; usuário sem tenantId → 403', async () => {
    register(buildSupabase({ summary: {}, rates: [], vgcRows: [], counts: {} }));
    expect((await call({})).statusCode).toBe(401);
    register(buildSupabase({
      summary: {}, rates: [], vgcRows: [], counts: {},
      getUser: { data: { user: { id: 'u1', email: 'a@b.com' } }, error: null },
    }));
    expect((await call({ headers: { authorization: 'Bearer jwt' } })).statusCode).toBe(403);
  });

  it('monta cards em R$ com câmbio vigente e denominadores de negócio', async () => {
    register(buildSupabase({
      membership: { data: { tenant_id: TENANT }, error: null },
      getUser: { data: { user: { id: 'u1', email: 'a@b.com' } }, error: null },
      summary: { by_model: [{ model: 'gpt-4o-mini', events: 100, input_tokens: 1e6, output_tokens: 0, cached_tokens: 0 }] },
      rates: [{ rate: 5, effective_from: '2026-01-01T00:00:00Z' }],
      vgcRows: [{ valor_vgc: 1000 }],
      counts: { leads: 50 }, // usado tanto p/ atendidos quanto vendas no mock
    }));
    const res = await call({ headers: { 'x-service-token': 'segredo' }, query: { tenantId: TENANT } });
    expect(res.statusCode).toBe(200);
    // gpt-4o-mini 1M input = $0.15 → ×5 = R$0,75 total
    expect(res.body.costs.total.cost_usd).toBeCloseTo(0.15, 10);
    expect(res.body.costs.total.exchange_rate).toBe(5);
    expect(res.body.costs.total.cost_brl).toBeCloseTo(0.75, 10);
    expect(res.body.costs.per_event.denominator).toBe(100);
  });

  it('sem câmbio vigente → cards BRL null, mas USD total permanece (N/A honesto)', async () => {
    register(buildSupabase({
      membership: { data: { tenant_id: TENANT }, error: null },
      getUser: { data: { user: { id: 'u1', email: 'a@b.com' } }, error: null },
      summary: { by_model: [{ model: 'gpt-4o-mini', events: 100, input_tokens: 1e6, output_tokens: 0, cached_tokens: 0 }] },
      rates: [], vgcRows: [], counts: {},
    }));
    const res = await call({ headers: { 'x-service-token': 'segredo' }, query: { tenantId: TENANT } });
    expect(res.body.costs.total.cost_usd).toBeCloseTo(0.15, 10);
    expect(res.body.costs.total.cost_brl).toBeNull();
    expect(res.body.costs.per_event.value_brl).toBeNull();
  });
});
