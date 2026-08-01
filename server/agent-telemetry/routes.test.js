import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerAgentTelemetryRoutes, __test__ } from './routes.js';

const { parseBody, validateEvents, parseWindow, MAX_BATCH } = __test__;

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';
const event = (over = {}) => ({ agent_slug: 'lia', event_type: 'llm_call', ...over });

describe('parseBody — estrutura do corpo', () => {
  it('aceita lote { tenant_id, events } e evento único no topo', () => {
    const lote = parseBody({ tenant_id: TENANT, events: [event()] });
    expect(lote.ok).toBe(true);
    expect(lote.events).toHaveLength(1);

    const unico = parseBody({ tenant_id: TENANT, ...event() });
    expect(unico.ok).toBe(true);
    expect(unico.events).toHaveLength(1);
  });

  it('rejeita corpo inválido, tenant não-uuid, sem eventos e lote acima do teto', () => {
    expect(parseBody(null).reason).toBe('invalid_body');
    expect(parseBody({ tenant_id: 'abc', events: [event()] }).reason).toBe('invalid_tenant_id');
    expect(parseBody({ tenant_id: TENANT }).reason).toBe('missing_events');
    expect(parseBody({ tenant_id: TENANT, events: [] }).reason).toBe('missing_events');
    const muitos = Array.from({ length: MAX_BATCH + 1 }, () => event());
    expect(parseBody({ tenant_id: TENANT, events: muitos }).reason).toBe('too_many_events');
  });
});

describe('validateEvents — all-or-nothing', () => {
  it('lote válido vira rows normalizadas', () => {
    const r = validateEvents([event(), event({ agent_slug: 'ELAINE' })]);
    expect(r.ok).toBe(true);
    expect(r.rows[1].agent_slug).toBe('elaine');
  });

  it('um inválido derruba o lote com índice e motivo', () => {
    const r = validateEvents([event(), event({ event_type: 'nope' })]);
    expect(r.ok).toBe(false);
    expect(r.details).toEqual([{ index: 1, reason: 'invalid_event_type' }]);
  });
});

describe('POST /api/v1/agent-telemetry/events — handler', () => {
  let handler;
  let insert;
  let membershipResult;
  let getUserResult;

  const supabase = {
    auth: { getUser: vi.fn(async () => getUserResult) },
    from: vi.fn((table) => {
      if (table === 'tenant_memberships') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => membershipResult }) }),
          }),
        };
      }
      return { insert };
    }),
  };

  const call = async (req) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    await handler({ headers: {}, body: null, ...req }, res);
    return res;
  };

  beforeEach(() => {
    insert = vi.fn(async () => ({ error: null }));
    membershipResult = { data: { tenant_id: TENANT }, error: null };
    getUserResult = { data: { user: { id: 'u1', email: 'admin@imob.com' } }, error: null };
    // Há mais de uma rota POST agora (events + evaluations) — capturar por path,
    // não "último vence", senão o handler de events é sobrescrito.
    const app = {
      post: (path, h) => { if (path === '/api/v1/agent-telemetry/events') handler = h; },
      get: () => {},
    };
    registerAgentTelemetryRoutes(app, supabase);
    process.env.AGENT_TELEMETRY_SERVICE_TOKEN = 'segredo';
  });

  afterEach(() => {
    delete process.env.AGENT_TELEMETRY_SERVICE_TOKEN;
    delete process.env.DISPARADOR_SERVICE_TOKEN;
  });

  it('sem credencial → 401; token de serviço errado → 401', async () => {
    expect((await call({ body: { tenant_id: TENANT, events: [event()] } })).statusCode).toBe(401);
    const res = await call({ headers: { 'x-service-token': 'errado' } });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('invalid_service_token');
  });

  it('caminho de serviço é fail-closed sem env configurada', async () => {
    delete process.env.AGENT_TELEMETRY_SERVICE_TOKEN;
    const res = await call({
      headers: { 'x-service-token': 'qualquer' },
      body: { tenant_id: TENANT, events: [event()] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('token de serviço válido insere e preserva source do emissor (n8n)', async () => {
    const res = await call({
      headers: { 'x-service-token': 'segredo' },
      body: { tenant_id: TENANT, events: [event({ source: 'n8n', input_tokens: 10 })] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ inserted: 1 });
    const rows = insert.mock.calls[0][0];
    expect(rows[0]).toMatchObject({ tenant_id: TENANT, source: 'n8n', input_tokens: 10 });
  });

  it('fallback DISPARADOR_SERVICE_TOKEN funciona quando o token dedicado não existe', async () => {
    delete process.env.AGENT_TELEMETRY_SERVICE_TOKEN;
    process.env.DISPARADOR_SERVICE_TOKEN = 'legado';
    const res = await call({
      headers: { 'x-service-token': 'legado' },
      body: { tenant_id: TENANT, events: [event()] },
    });
    expect(res.statusCode).toBe(200);
  });

  it('JWT válido + membro do tenant insere com source forçado crm_web', async () => {
    const res = await call({
      headers: { authorization: 'Bearer jwt' },
      body: { tenant_id: TENANT, events: [event({ source: 'n8n' })] },
    });
    expect(res.statusCode).toBe(200);
    expect(insert.mock.calls[0][0][0].source).toBe('crm_web');
  });

  it('JWT válido mas não-membro → 403; owner da plataforma passa sem membership', async () => {
    membershipResult = { data: null, error: null };
    expect((await call({
      headers: { authorization: 'Bearer jwt' },
      body: { tenant_id: TENANT, events: [event()] },
    })).statusCode).toBe(403);

    getUserResult = {
      data: { user: { id: 'u0', email: 'octo.inteligenciaimobiliaria@gmail.com' } },
      error: null,
    };
    expect((await call({
      headers: { authorization: 'Bearer jwt' },
      body: { tenant_id: TENANT, events: [event()] },
    })).statusCode).toBe(200);
  });

  it('JWT inválido → 401', async () => {
    getUserResult = { data: null, error: { message: 'expired' } };
    const res = await call({
      headers: { authorization: 'Bearer ruim' },
      body: { tenant_id: TENANT, events: [event()] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('corpo malformado → 400; evento inválido → 422 sem inserir nada', async () => {
    const h = { 'x-service-token': 'segredo' };
    expect((await call({ headers: h, body: { tenant_id: 'x' } })).statusCode).toBe(400);
    const res = await call({
      headers: h,
      body: { tenant_id: TENANT, events: [event(), event({ status: 'nope' })] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.body.details).toHaveLength(1);
    expect(insert).not.toHaveBeenCalled();
  });

  it('falha do insert → 500 com erro estável', async () => {
    insert = vi.fn(async () => ({ error: { message: 'db down' } }));
    const res = await call({
      headers: { 'x-service-token': 'segredo' },
      body: { tenant_id: TENANT, events: [event()] },
    });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('insert_failed');
  });
});

describe('parseWindow — janela temporal das leituras', () => {
  const NOW = Date.parse('2026-07-25T12:00:00.000Z');

  it('default = últimos 30 dias, to aberto', () => {
    const w = parseWindow({}, NOW);
    expect(w).toEqual({ ok: true, from: '2026-06-25T12:00:00.000Z', to: null });
  });

  it('window=all remove o filtro (custo total all-time)', () => {
    expect(parseWindow({ window: 'all' }, NOW)).toEqual({ ok: true, from: null, to: null });
  });

  it('from/to explícitos vencem; inválidos → erro', () => {
    const w = parseWindow({ from: '2026-07-01', to: '2026-07-20T00:00:00Z' }, NOW);
    expect(w.ok).toBe(true);
    expect(w.from).toBe(new Date(Date.parse('2026-07-01')).toISOString());
    expect(w.to).toBe('2026-07-20T00:00:00.000Z');
    expect(parseWindow({ from: 'ontem' }, NOW)).toEqual({ ok: false, reason: 'invalid_from' });
    expect(parseWindow({ to: 'zzz' }, NOW)).toEqual({ ok: false, reason: 'invalid_to' });
  });

  it('from > to → invalid_range (inclusive com from default de 30d)', () => {
    expect(parseWindow({ from: '2026-07-20', to: '2026-07-01' }, NOW)).toEqual({
      ok: false,
      reason: 'invalid_range',
    });
    // to anterior à janela default (from implícito de 30d atrás) também é range invertido
    expect(parseWindow({ to: '2020-01-01' }, NOW)).toEqual({ ok: false, reason: 'invalid_range' });
  });
});

describe('GET endpoints de leitura — auth, RPCs e custo', () => {
  let handlers;
  let rpcMock;
  let membershipResult;
  let getUserResult;
  let countsByTable; // tabela → count fixo, ou função que lança

  const makeCountBuilder = (table) => ({
    select: () => {
      const chain = {
        eq: () => chain,
        then(resolve, reject) {
          try {
            const v = countsByTable[table];
            if (typeof v === 'function') v();
            return resolve({ count: v ?? 0, error: null });
          } catch (e) {
            return reject(e);
          }
        },
      };
      return chain;
    },
  });

  const supabase = {
    auth: { getUser: vi.fn(async () => getUserResult) },
    rpc: (...args) => rpcMock(...args),
    from: vi.fn((table) => {
      if (table === 'tenant_memberships') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => membershipResult }) }),
          }),
        };
      }
      return makeCountBuilder(table);
    }),
  };

  const call = async (path, req) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    await handlers[path]({ headers: {}, query: {}, ...req }, res);
    return res;
  };

  beforeEach(() => {
    rpcMock = vi.fn(async () => ({ data: {}, error: null }));
    membershipResult = { data: { tenant_id: TENANT }, error: null };
    getUserResult = { data: { user: { id: 'u1', email: 'admin@imob.com' } }, error: null };
    countsByTable = {};
    handlers = {};
    const app = {
      post: () => {},
      get: (path, h) => { handlers[path] = h; },
    };
    registerAgentTelemetryRoutes(app, supabase);
    process.env.AGENT_TELEMETRY_SERVICE_TOKEN = 'segredo';
  });

  afterEach(() => {
    delete process.env.AGENT_TELEMETRY_SERVICE_TOKEN;
  });

  it('summary: sem credencial → 401; usuário sem tenantId → 403 tenant_required', async () => {
    expect((await call('/api/v1/agent-telemetry/summary', {})).statusCode).toBe(401);
    const res = await call('/api/v1/agent-telemetry/summary', {
      headers: { authorization: 'Bearer jwt' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('tenant_required');
  });

  it('summary: membro do tenant chama a RPC com o escopo e a janela default', async () => {
    const res = await call('/api/v1/agent-telemetry/summary', {
      headers: { authorization: 'Bearer jwt' },
      query: { tenantId: TENANT, agent: 'lia' },
    });
    expect(res.statusCode).toBe(200);
    const [name, params] = rpcMock.mock.calls[0];
    expect(name).toBe('agent_telemetry_summary');
    expect(params.p_tenant_id).toBe(TENANT);
    expect(params.p_agent_slug).toBe('lia');
    expect(typeof params.p_from).toBe('string'); // default 30d
    expect(res.body.window.from).toBe(params.p_from);
  });

  it('summary: serviço sem tenantId = cross-tenant (p_tenant_id null); usuário comum não', async () => {
    const res = await call('/api/v1/agent-telemetry/summary', {
      headers: { 'x-service-token': 'segredo' },
      query: { window: 'all' },
    });
    expect(res.statusCode).toBe(200);
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_tenant_id: null, p_from: null, p_to: null });
  });

  it('summary: não-membro → 403; tenant inválido → 400; from inválido → 400; rpc erro → 500', async () => {
    membershipResult = { data: null, error: null };
    expect((await call('/api/v1/agent-telemetry/summary', {
      headers: { authorization: 'Bearer jwt' }, query: { tenantId: TENANT },
    })).statusCode).toBe(403);

    expect((await call('/api/v1/agent-telemetry/summary', {
      headers: { 'x-service-token': 'segredo' }, query: { tenantId: 'abc' },
    })).statusCode).toBe(400);

    expect((await call('/api/v1/agent-telemetry/summary', {
      headers: { 'x-service-token': 'segredo' }, query: { tenantId: TENANT, from: 'ontem' },
    })).statusCode).toBe(400);

    rpcMock = vi.fn(async () => ({ data: null, error: { message: 'boom' } }));
    expect((await call('/api/v1/agent-telemetry/summary', {
      headers: { 'x-service-token': 'segredo' }, query: { tenantId: TENANT },
    })).statusCode).toBe(500);
  });

  it('summary: enriquece by_model com custo e marca modelos sem preço', async () => {
    rpcMock = vi.fn(async () => ({
      data: {
        events: 3,
        by_model: [
          { model: 'gpt-4.1-mini', events: 2, input_tokens: 1_000_000, output_tokens: 0, cached_tokens: 0, total_tokens: 1_000_000 },
          { model: 'llama-n8n', events: 1, input_tokens: 10, output_tokens: 5, cached_tokens: 0, total_tokens: 15 },
        ],
      },
      error: null,
    }));
    const res = await call('/api/v1/agent-telemetry/summary', {
      headers: { 'x-service-token': 'segredo' },
      query: { tenantId: TENANT },
    });
    expect(res.body.summary.by_model[0].cost_usd).toBeCloseTo(0.4, 10);
    expect(res.body.summary.by_model[1].cost_usd).toBeNull();
    expect(res.body.summary.cost.total_usd).toBeCloseTo(0.4, 10);
    expect(res.body.summary.cost.unknown_models).toEqual(['llama-n8n']);
  });

  it('timeseries: bucket é whitelisted (qualquer coisa ≠ hour vira day)', async () => {
    await call('/api/v1/agent-telemetry/timeseries', {
      headers: { 'x-service-token': 'segredo' },
      query: { tenantId: TENANT, bucket: 'minute' },
    });
    expect(rpcMock.mock.calls[0][0]).toBe('agent_telemetry_timeseries');
    expect(rpcMock.mock.calls[0][1].p_bucket).toBe('day');

    await call('/api/v1/agent-telemetry/timeseries', {
      headers: { 'x-service-token': 'segredo' },
      query: { tenantId: TENANT, bucket: 'hour' },
    });
    expect(rpcMock.mock.calls[1][1].p_bucket).toBe('hour');
  });

  it('errors: limit é clampado a [1,100]', async () => {
    await call('/api/v1/agent-telemetry/errors', {
      headers: { 'x-service-token': 'segredo' },
      query: { tenantId: TENANT, limit: '9999' },
    });
    expect(rpcMock.mock.calls[0][0]).toBe('agent_telemetry_errors');
    expect(rpcMock.mock.calls[0][1].p_limit).toBe(100);
  });

  it('overview: exige tenantId mesmo para serviço/owner', async () => {
    const res = await call('/api/v1/agent-telemetry/overview', {
      headers: { 'x-service-token': 'segredo' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('tenant_required');
  });

  it('overview: agrega counts das tabelas existentes; bloco que falha vira null sem derrubar', async () => {
    countsByTable = {
      agent_action_runs: 5,
      webhook_events: 7,
      agent_conversations: 2,
      agent_messages: 9,
      recovery_queue: 3,
      lia_corretor_messages: () => { throw new Error('lia fora'); },
      lia_perguntas_corretor: 1,
      lia_followups: 1,
      lia_visitas: 1,
    };
    const res = await call('/api/v1/agent-telemetry/overview', {
      headers: { 'x-service-token': 'segredo' },
      query: { tenantId: TENANT },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.disparador).toEqual({ runs: { done: 5, failed: 5, pending: 5, running: 5 } });
    expect(res.body.delivery).toEqual({ pending: 7, delivered: 7, failed: 7 });
    expect(res.body.chat).toEqual({ conversations: 2, messages: 9 });
    // recovery cobre os 5 estados do CHECK (processing incluído)
    expect(res.body.recovery).toEqual({ pending: 3, processing: 3, done: 3, failed: 3, skipped: 3 });
    expect(res.body.lia).toBeNull(); // bloco indisponível degrada isolado
  });

  it('overview: bloco da Lia cobre o espaço de estados dos followups', async () => {
    countsByTable = {
      agent_action_runs: 0, webhook_events: 0, agent_conversations: 0,
      agent_messages: 0, recovery_queue: 0,
      lia_corretor_messages: 4, lia_perguntas_corretor: 2, lia_followups: 6, lia_visitas: 1,
    };
    const res = await call('/api/v1/agent-telemetry/overview', {
      headers: { 'x-service-token': 'segredo' },
      query: { tenantId: TENANT },
    });
    expect(res.body.lia.followups).toEqual({
      enviados: 6, pendentes: 6, cancelados: 6, expirados: 6,
    });
  });
});
