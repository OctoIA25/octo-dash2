import { describe, it, expect, beforeEach } from 'vitest';
import { registerHealthRoutes } from './healthRoutes.js';

// App/req/res falsos — mesmo padrão de kenlo/routes.test.js (sem supertest).
function fakeApp() {
  const routes = {};
  const reg = (method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers; };
  return { get: reg('GET'), post: reg('POST'), routes };
}

async function run(handlers, req) {
  const res = {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  for (const h of handlers) await h(req, res, () => {});
  return res;
}

// req com header via .get() (como Express) e valor de X-Health-Token.
function makeReq(token) {
  return { get: (name) => (name === 'X-Health-Token' ? token : undefined) };
}

function makeSupabase({ rows = [], error = null } = {}) {
  return {
    from: () => ({ select: () => Promise.resolve({ data: rows, error }) }),
  };
}

const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();

beforeEach(() => {
  process.env.HEALTH_API_TOKEN = 'segredo';
});

describe('GET /api/v1/health/jobs', () => {
  it('token inválido retorna 401 unauthorized', async () => {
    const app = fakeApp();
    registerHealthRoutes(app, makeSupabase());
    const res = await run(app.routes['GET /api/v1/health/jobs'], makeReq('errado'));
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('fail-closed: sem HEALTH_API_TOKEN configurado retorna 401', async () => {
    delete process.env.HEALTH_API_TOKEN;
    const app = fakeApp();
    registerHealthRoutes(app, makeSupabase());
    const res = await run(app.routes['GET /api/v1/health/jobs'], makeReq(undefined));
    expect(res.statusCode).toBe(401);
  });

  it('heartbeat recente e ok=true → status ok', async () => {
    const app = fakeApp();
    const rows = [
      { job_name: 'c2s_sync', last_run_at: iso(NOW - 1000), last_result: { ok: true, duration_ms: 50 } },
      { job_name: 'kenlo_sync', last_run_at: iso(NOW - 1000), last_result: { ok: true } },
      { job_name: 'outbox_worker', last_run_at: iso(NOW - 1000), last_result: { ok: true } },
      { job_name: 'recommendation_scheduler', last_run_at: iso(NOW - 1000), last_result: { ok: true } },
      { job_name: 'anthropic_usage', last_run_at: iso(NOW - 1000), last_result: { ok: true } },
    ];
    registerHealthRoutes(app, makeSupabase({ rows }));
    const res = await run(app.routes['GET /api/v1/health/jobs'], makeReq('segredo'));
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.jobs.c2s_sync.status).toBe('ok');
    expect(res.body.jobs.c2s_sync.duration_ms).toBe(50);
  });

  it('heartbeat expirado → status degraded', async () => {
    const app = fakeApp();
    // c2s_sync limite = 10min; 20min atrás = expirado.
    const rows = [
      { job_name: 'c2s_sync', last_run_at: iso(NOW - 20 * 60 * 1000), last_result: { ok: true } },
      { job_name: 'kenlo_sync', last_run_at: iso(NOW - 1000), last_result: { ok: true } },
      { job_name: 'outbox_worker', last_run_at: iso(NOW - 1000), last_result: { ok: true } },
      { job_name: 'recommendation_scheduler', last_run_at: iso(NOW - 1000), last_result: { ok: true } },
    ];
    registerHealthRoutes(app, makeSupabase({ rows }));
    const res = await run(app.routes['GET /api/v1/health/jobs'], makeReq('segredo'));
    expect(res.body.status).toBe('degraded');
    expect(res.body.jobs.c2s_sync.status).toBe('degraded');
    expect(res.body.jobs.kenlo_sync.status).toBe('ok');
  });

  it('último ciclo com ok=false → degraded mesmo se recente', async () => {
    const app = fakeApp();
    const rows = [
      { job_name: 'c2s_sync', last_run_at: iso(NOW - 1000), last_result: { ok: false, consecutive_failures: 3 } },
    ];
    registerHealthRoutes(app, makeSupabase({ rows }));
    const res = await run(app.routes['GET /api/v1/health/jobs'], makeReq('segredo'));
    expect(res.body.jobs.c2s_sync.status).toBe('degraded');
    expect(res.body.jobs.c2s_sync.consecutive_failures).toBe(3);
  });

  it('job sem heartbeat → degraded/no_heartbeat', async () => {
    const app = fakeApp();
    registerHealthRoutes(app, makeSupabase({ rows: [] }));
    const res = await run(app.routes['GET /api/v1/health/jobs'], makeReq('segredo'));
    expect(res.body.status).toBe('degraded');
    expect(res.body.jobs.kenlo_sync.reason).toBe('no_heartbeat');
  });

  it('erro do banco → 503, não derruba', async () => {
    const app = fakeApp();
    registerHealthRoutes(app, makeSupabase({ error: { message: 'db down' } }));
    const res = await run(app.routes['GET /api/v1/health/jobs'], makeReq('segredo'));
    expect(res.statusCode).toBe(503);
  });
});
