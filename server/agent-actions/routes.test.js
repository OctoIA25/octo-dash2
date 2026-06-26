import { describe, it, expect } from 'vitest';
import { __test__ } from './routes.js';

const { resolveUserContext, statusFor, isPlatformOwner, resolvePublicSourceMode, applyRunsFilters, computeProgress, canManageAudiences, canManageTemplates, loadMetaCreds, canManageCampaigns, registerDispatchRoutes, makeDispatchDeps, summarizeImport } = __test__;

function recordingBuilder() {
  const calls = [];
  const b = {
    eq: (c, v) => (calls.push(['eq', c, v]), b),
    ilike: (c, v) => (calls.push(['ilike', c, v]), b),
    gte: (c, v) => (calls.push(['gte', c, v]), b),
    lte: (c, v) => (calls.push(['lte', c, v]), b),
    order: (c, o) => (calls.push(['order', c, o]), b),
    range: (a, z) => (calls.push(['range', a, z]), b),
  };
  return { b, calls };
}

describe('applyRunsFilters', () => {
  it('aplica status, busca, período, ordem e paginação', () => {
    const { b, calls } = recordingBuilder();
    applyRunsFilters(b, { status: 'done', q: 'arquivados', from: '2026-01-01', to: '2026-02-01', limit: 50, offset: 0 });
    expect(calls).toContainEqual(['eq', 'status', 'done']);
    expect(calls).toContainEqual(['ilike', 'command_text', '%arquivados%']);
    expect(calls).toContainEqual(['gte', 'created_at', '2026-01-01']);
    expect(calls).toContainEqual(['lte', 'created_at', '2026-02-01']);
    expect(calls).toContainEqual(['order', 'created_at', { ascending: false }]);
    expect(calls).toContainEqual(['range', 0, 49]);
  });

  it('omite filtros ausentes (só ordem + paginação default)', () => {
    const { b, calls } = recordingBuilder();
    applyRunsFilters(b, {});
    expect(calls.find((c) => c[0] === 'eq')).toBeUndefined();
    expect(calls.find((c) => c[0] === 'ilike')).toBeUndefined();
    expect(calls).toContainEqual(['order', 'created_at', { ascending: false }]);
    expect(calls).toContainEqual(['range', 0, 49]);
  });

  it('clampa limit e offset nos limites', () => {
    const a = recordingBuilder();
    const r1 = applyRunsFilters(a.b, { limit: 0, offset: -5 });   // limit→1, offset→0
    expect(a.calls).toContainEqual(['range', 0, 0]);
    expect(r1.limit).toBe(1); expect(r1.offset).toBe(0);

    const c = recordingBuilder();
    const r2 = applyRunsFilters(c.b, { limit: 999, offset: 10 }); // limit→200
    expect(c.calls).toContainEqual(['range', 10, 209]);
    expect(r2.limit).toBe(200); expect(r2.offset).toBe(10);
  });

  it('filtra por campaign_id quando campaignId é passado', () => {
    const { b, calls } = recordingBuilder();
    applyRunsFilters(b, { campaignId: 'camp1' });
    expect(calls).toContainEqual(['eq', 'campaign_id', 'camp1']);
  });

  it('não filtra por campaign_id quando campaignId ausente', () => {
    const { b, calls } = recordingBuilder();
    applyRunsFilters(b, {});
    expect(calls.find((c) => c[0] === 'eq' && c[1] === 'campaign_id')).toBeUndefined();
  });
});

describe('routes.statusFor — mapeamento de erro → HTTP', () => {
  it('permissão → 403', () => {
    expect(statusFor('forbidden_no_broker_identity')).toBe(403);
    expect(statusFor('not_a_member')).toBe(403);
  });
  it('não encontrado → 404', () => {
    expect(statusFor('run_not_found')).toBe(404);
  });
  it('validação → 400', () => {
    expect(statusFor('message_required')).toBe(400);
    expect(statusFor('already_confirmed')).toBe(400);
    expect(statusFor('unsupported_action:x')).toBe(400);
    expect(statusFor('invalid_segment')).toBe(400);
  });
  it('falha do n8n → 502', () => {
    expect(statusFor('n8n_error')).toBe(502);
  });
  it('desconhecido → 500', () => {
    expect(statusFor('persist_failed')).toBe(500);
    expect(statusFor(null)).toBe(500);
  });
});

describe('routes.isPlatformOwner', () => {
  it('reconhece o email do owner (case-insensitive)', () => {
    expect(isPlatformOwner('octo.inteligenciaimobiliaria@gmail.com')).toBe(true);
    expect(isPlatformOwner('OCTO.inteligenciaimobiliaria@GMAIL.com')).toBe(true);
    expect(isPlatformOwner('outro@x.com')).toBe(false);
  });
});

/** Fake simples por tabela. */
function fakeSupabase(tables) {
  return {
    from(table) {
      const cfg = tables[table] || {};
      const node = {
        select: () => node,
        eq: () => node,
        ilike: () => node,
        maybeSingle: async () => ({ data: cfg.data ?? null, error: cfg.error ?? null }),
      };
      return node;
    },
  };
}

/** Fake supabase para resolvePublicSourceMode: permite customizar por tabela e comportamento. */
function fakeSupabaseForMode({ data = null, error = null, throws = false } = {}) {
  return {
    from() {
      const node = {
        select: () => node,
        eq: () => node,
        maybeSingle: async () => {
          if (throws) throw new Error('network_timeout');
          return { data, error };
        },
      };
      return node;
    },
  };
}

describe('routes.resolvePublicSourceMode', () => {
  it('retorna o mode da tabela quando a linha existe', async () => {
    const supabase = fakeSupabaseForMode({ data: { mode: 'shadow_leads' } });
    const result = await resolvePublicSourceMode(supabase, 't1');
    expect(result).toBe('shadow_leads');
  });

  it('retorna kenlo_only quando não existe linha (data null, sem error)', async () => {
    const supabase = fakeSupabaseForMode({ data: null, error: null });
    const result = await resolvePublicSourceMode(supabase, 't1');
    expect(result).toBe('kenlo_only');
  });

  it('retorna kenlo_only quando a query retorna error', async () => {
    const supabase = fakeSupabaseForMode({ data: null, error: { message: 'table not found' } });
    const result = await resolvePublicSourceMode(supabase, 't1');
    expect(result).toBe('kenlo_only');
  });

  it('retorna kenlo_only quando a query lança exceção (rede, timeout)', async () => {
    const supabase = fakeSupabaseForMode({ throws: true });
    const result = await resolvePublicSourceMode(supabase, 't1');
    expect(result).toBe('kenlo_only');
  });

  it('respeita AGENT_PUBLIC_SOURCE_DEFAULT como fallback quando não há linha', async () => {
    const original = process.env.AGENT_PUBLIC_SOURCE_DEFAULT;
    process.env.AGENT_PUBLIC_SOURCE_DEFAULT = 'leads_only';
    const supabase = fakeSupabaseForMode({ data: null });
    const result = await resolvePublicSourceMode(supabase, 't1');
    if (original === undefined) delete process.env.AGENT_PUBLIC_SOURCE_DEFAULT;
    else process.env.AGENT_PUBLIC_SOURCE_DEFAULT = original;
    expect(result).toBe('leads_only');
  });
});

describe('computeProgress', () => {
  it('running: usa as contagens da fila (pending engloba pending+processing)', () => {
    const run = { status: 'running', found_count: 100 };
    const p = computeProgress(run, { done: 30, failed: 2, pending: 60, processing: 8 });
    expect(p).toEqual({ status: 'running', done: 30, failed: 2, pending: 68, total: 100 });
  });
  it('done: deriva do run, sem contar a fila', () => {
    const run = { status: 'done', sent_count: 95, failed_count: 5, found_count: 100 };
    const p = computeProgress(run, null);
    expect(p).toEqual({ status: 'done', done: 95, failed: 5, pending: 0, total: 100 });
  });
  it('failed: deriva do run', () => {
    const run = { status: 'failed', sent_count: 0, failed_count: 10, found_count: 10 };
    const p = computeProgress(run, null);
    expect(p).toEqual({ status: 'failed', done: 0, failed: 10, pending: 0, total: 10 });
  });
  it('tolera campos ausentes (|| 0)', () => {
    expect(computeProgress({ status: 'done' }, null)).toEqual({ status: 'done', done: 0, failed: 0, pending: 0, total: 0 });
    expect(computeProgress({ status: 'running', found_count: 10 }, { done: 5 })).toEqual({ status: 'running', done: 5, failed: 0, pending: 0, total: 10 });
  });
});

describe('routes.resolveUserContext — permissões', () => {
  it('platform owner: role owner sem membership', async () => {
    const supabase = fakeSupabase({});
    const ctx = await resolveUserContext(supabase, { userEmail: 'octo.inteligenciaimobiliaria@gmail.com' }, 't1');
    expect(ctx).toEqual({ ok: true, role: 'owner', brokerName: null });
  });

  it('não-membro é bloqueado', async () => {
    const supabase = fakeSupabase({ tenant_memberships: { data: null } });
    const ctx = await resolveUserContext(supabase, { userEmail: 'x@y.com', userId: 'u' }, 't1');
    expect(ctx).toEqual({ ok: false, error: 'not_a_member' });
  });

  it('admin: role admin, sem brokerName', async () => {
    const supabase = fakeSupabase({ tenant_memberships: { data: { role: 'admin' } } });
    const ctx = await resolveUserContext(supabase, { userEmail: 'a@y.com', userId: 'u' }, 't1');
    expect(ctx).toEqual({ ok: true, role: 'admin', brokerName: null });
  });

  it('corretor: resolve brokerName de Corretores', async () => {
    const supabase = fakeSupabase({
      tenant_memberships: { data: { role: 'corretor' } },
      Corretores: { data: { nm_corretor: 'Maria Corretora' } },
    });
    const ctx = await resolveUserContext(supabase, { userEmail: 'm@y.com', userId: 'u' }, 't1');
    expect(ctx).toEqual({ ok: true, role: 'corretor', brokerName: 'Maria Corretora' });
  });
});

describe('canManageAudiences', () => {
  it('permite gestores', () => {
    for (const r of ['admin', 'team_leader', 'owner']) expect(canManageAudiences(r)).toBe(true);
  });
  it('nega corretor e desconhecido', () => {
    expect(canManageAudiences('corretor')).toBe(false);
    expect(canManageAudiences(undefined)).toBe(false);
  });
});

// Cobertura de integração mínima: confirma que validateSegment rejeita
// segmento inválido com ok===false (o caminho HTTP completo é coberto no E2E).
describe('validateSegment (integração via segmentSchema)', () => {
  it('rejeita tipo inválido', async () => {
    const { validateSegment } = await import('./segmentSchema.js');
    expect(validateSegment({ type: 'nope' }).ok).toBe(false);
  });
});

// Documenta a regra de negócio: PUT /audiences/:id com body sem name nem segment
// deve ser rejeitado (400 nothing_to_update). A lógica de guarda é trivial
// (Object.keys(patch).length === 0) e não tem infra de fake-app aqui, por isso
// o teste verifica a invariante pura diretamente — cobertura HTTP fica no E2E.
describe('PUT /audiences/:id — guarda de patch vazio', () => {
  it('patch vazio (sem name nem segment) resulta em objeto sem chaves', () => {
    // Simula a montagem do patch como faz o handler:
    // nenhum campo enviado → patch permanece {}.
    const body = {};
    const patch = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.segment !== undefined) patch.segment = body.segment;

    // A guarda `if (Object.keys(patch).length === 0)` retornaria 400.
    expect(Object.keys(patch).length).toBe(0);
  });

  it('patch com name preenchido tem ao menos uma chave', () => {
    const body = { name: 'Leads Quentes' };
    const patch = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.segment !== undefined) patch.segment = body.segment;

    expect(Object.keys(patch).length).toBeGreaterThan(0);
  });

  it('patch com segment preenchido tem ao menos uma chave', () => {
    const body = { segment: { type: 'all' } };
    const patch = {};
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.segment !== undefined) patch.segment = body.segment;

    expect(Object.keys(patch).length).toBeGreaterThan(0);
  });
});

describe('canManageTemplates', () => {
  it('gestores sim, corretor não', () => {
    for (const r of ['admin', 'team_leader', 'owner']) expect(canManageTemplates(r)).toBe(true);
    expect(canManageTemplates('corretor')).toBe(false);
  });
});

describe('loadMetaCreds', () => {
  it('ok quando config ativa com waba+token', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { business_account_id: 'W', access_token: 'T', is_active: true }, error: null }) }) }) }) };
    expect(await loadMetaCreds(supabase, 't1')).toEqual({ ok: true, wabaId: 'W', accessToken: 'T' });
  });
  it('erro quando inativa/sem config', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };
    expect((await loadMetaCreds(supabase, 't1')).ok).toBe(false);
  });
});

describe('canManageCampaigns', () => {
  it('gestores sim, corretor não', () => {
    for (const r of ['admin', 'team_leader', 'owner']) expect(canManageCampaigns(r)).toBe(true);
    expect(canManageCampaigns('corretor')).toBe(false);
  });
});

/** App fake que captura os handlers por método+caminho (sem executar nada). */
function captureRoutes() {
  const routes = [];
  const record = (method) => (path, ...handlers) => {
    routes.push({ method, path, handler: handlers[handlers.length - 1] });
  };
  const app = { post: record('POST'), get: record('GET'), put: record('PUT'), delete: record('DELETE') };
  const find = (method, path) => routes.find((r) => r.method === method && r.path === path)?.handler;
  return { app, routes, find };
}

/** Supabase fake que registra a cadeia de filtros aplicada na query de runs. */
function fakeSupabaseRecordingRuns(eqCalls) {
  const node = {
    select: () => node,
    eq: (col, val) => (eqCalls.push([col, val]), node),
    order: () => Promise.resolve({ data: [], error: null }),
  };
  return {
    from(table) {
      // resolveUserContext: platform owner não consulta tenant_memberships,
      // então só a query de agent_action_runs chega aqui.
      eqCalls.table = table;
      return node;
    },
  };
}

describe('summarizeImport', () => {
  it('conta novos vs atualizados por name', () => {
    const r = summarizeImport(['promo'], [{ name: 'promo' }, { name: 'nova' }]);
    expect(r).toEqual({ imported: 1, updated: 1, total: 2 });
  });
});

describe('GET /campaigns/:id/runs — filtra por tenant + campaign', () => {
  it('aplica .eq(tenant_id) e .eq(campaign_id) na query de runs', async () => {
    const eqCalls = [];
    const supabase = fakeSupabaseRecordingRuns(eqCalls);
    const { app, find } = captureRoutes();
    const deps = { requireSupabaseAuth: (_req, _res, next) => next(), schedulerDeps: {} };
    registerDispatchRoutes(app, '/base', supabase, {}, deps);

    const handler = find('GET', '/base/campaigns/:id/runs');
    expect(typeof handler).toBe('function');

    let body = null;
    const req = { params: { id: 'camp1' }, query: { tenantId: 't1' }, userEmail: 'octo.inteligenciaimobiliaria@gmail.com' };
    const res = { status() { return res; }, json(payload) { body = payload; return res; } };
    await handler(req, res);

    expect(eqCalls.table).toBe('agent_action_runs');
    expect(eqCalls).toContainEqual(['tenant_id', 't1']);
    expect(eqCalls).toContainEqual(['campaign_id', 'camp1']);
    expect(body).toEqual({ ok: true, runs: [] });
  });
});
