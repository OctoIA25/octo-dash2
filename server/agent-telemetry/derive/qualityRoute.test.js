import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerAgentTelemetryRoutes } from '../routes.js';

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';

function buildSupabase({ membership, getUser, upsert, counts = {}, evalCounts = {} }) {
  const countChain = (table) => ({
    select() { return this; }, eq() { return this; }, gte() { return this; }, lt() { return this; },
    then(r) {
      const key = table === 'agent_response_evaluations' ? evalCounts : counts;
      // evalCounts é { correct, incorrect } — o handler filtra por verdict via eq()
      return r({ count: key.__next ?? key.default ?? 0, error: null });
    },
  });
  return {
    auth: { getUser: vi.fn(async () => getUser) },
    from: vi.fn((table) => {
      if (table === 'tenant_memberships') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => membership }) }) }) };
      }
      if (table === 'agent_response_evaluations') {
        return { upsert: upsert ?? vi.fn(async () => ({ error: null })), ...countChain(table) };
      }
      return countChain(table);
    }),
  };
}

describe('POST /api/v1/agent-telemetry/evaluations — registrar avaliação', () => {
  let handlers; let upsert;
  const call = async (req) => {
    const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
    await handlers['/api/v1/agent-telemetry/evaluations']({ headers: {}, body: {}, ...req }, res);
    return res;
  };
  const register = (s) => { handlers = {}; registerAgentTelemetryRoutes({ post: (p, h) => { handlers[p] = h; }, get: () => {} }, s); };

  beforeEach(() => { upsert = vi.fn(async () => ({ error: null })); process.env.AGENT_TELEMETRY_SERVICE_TOKEN = 'segredo'; });
  afterEach(() => { delete process.env.AGENT_TELEMETRY_SERVICE_TOKEN; });

  it('exige JWT de usuário (serviço não avalia — não tem quem avaliou)', async () => {
    register(buildSupabase({ upsert }));
    const res = await call({ headers: { 'x-service-token': 'segredo' }, body: { tenantId: TENANT, agentSlug: 'elaine', verdict: 'incorrect' } });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('evaluator_required');
  });

  it('grava o avaliador do JWT (NUNCA do body) e o verdict', async () => {
    register(buildSupabase({
      upsert,
      membership: { data: { tenant_id: TENANT }, error: null },
      getUser: { data: { user: { id: 'real-user', email: 'a@b.com' } }, error: null },
    }));
    const res = await call({
      headers: { authorization: 'Bearer jwt' },
      body: { tenantId: TENANT, agentSlug: 'elaine', executionId: 'conv-1', verdict: 'incorrect', evaluator_user_id: 'HACKER' },
    });
    expect(res.statusCode).toBe(200);
    const row = upsert.mock.calls[0][0];
    expect(row.evaluator_user_id).toBe('real-user'); // do JWT, não do body
    expect(row.tenant_id).toBe(TENANT);
    expect(row.verdict).toBe('incorrect');
  });

  it('verdict inválido → 400', async () => {
    register(buildSupabase({
      upsert,
      membership: { data: { tenant_id: TENANT }, error: null },
      getUser: { data: { user: { id: 'u1', email: 'a@b.com' } }, error: null },
    }));
    const res = await call({ headers: { authorization: 'Bearer jwt' }, body: { tenantId: TENANT, agentSlug: 'elaine', verdict: 'talvez' } });
    expect(res.statusCode).toBe(400);
  });

  it('não-membro do tenant → 403 (isolamento)', async () => {
    register(buildSupabase({
      upsert,
      membership: { data: null, error: null },
      getUser: { data: { user: { id: 'u1', email: 'a@b.com' } }, error: null },
    }));
    const res = await call({ headers: { authorization: 'Bearer jwt' }, body: { tenantId: TENANT, agentSlug: 'elaine', verdict: 'correct' } });
    expect(res.statusCode).toBe(403);
  });
});
