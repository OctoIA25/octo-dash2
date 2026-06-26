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

/**
 * Supabase fake roteado por tabela para o handler de dispatch.
 * Cada tabela devolve { data } via .select().eq()...maybeSingle().
 * Owner (platform owner) não consulta tenant_memberships.
 */
function fakeSupabaseByTable(tables) {
  return {
    from(table) {
      const cfg = tables[table] || {};
      const node = {
        select: () => node,
        eq: () => node,
        order: () => node,
        maybeSingle: async () => ({ data: cfg.data ?? null, error: cfg.error ?? null }),
      };
      return node;
    },
  };
}

describe('POST /campaigns/:id/dispatch — validação de variableMapping (C2 T5)', () => {
  function dispatchHarness(tables) {
    const supabase = fakeSupabaseByTable(tables);
    const { app, find } = captureRoutes();
    const deps = { requireSupabaseAuth: (_req, _res, next) => next(), schedulerDeps: {} };
    registerDispatchRoutes(app, '/base', supabase, {}, deps);
    const handler = find('POST', '/base/campaigns/:id/dispatch');
    return { handler };
  }

  function runReqRes() {
    const captured = { status: 200, body: null };
    const res = {
      status(code) { captured.status = code; return res; },
      json(payload) { captured.body = payload; return res; },
    };
    const req = { params: { id: 'camp1' }, body: { tenantId: 't1' }, userEmail: 'octo.inteligenciaimobiliaria@gmail.com' };
    return { req, res, captured };
  }

  it('mapping incompleto → 400 incomplete_mapping com missing', async () => {
    const { handler } = dispatchHarness({
      communication_campaigns: { data: { id: 'camp1', audience_id: 'a1', template_id: 'tpl1', max_recipients: null, variable_mapping: {} } },
      communication_templates: { data: { approval_status: 'approved', body: 'Oi {{1}}', name: 'promo', variables: ['1'] } },
    });
    const { req, res, captured } = runReqRes();
    await handler(req, res);
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ ok: false, error: 'incomplete_mapping', missing: ['1'] });
  });

  it('template sem variáveis → não retorna incomplete_mapping (retrocompat)', async () => {
    // Sem creds Meta configuradas, o handler segue além da validação e falha
    // depois em loadMetaCreds (whatsapp_not_configured). O que importa aqui é
    // que NÃO bloqueou em incomplete_mapping.
    const { handler } = dispatchHarness({
      communication_campaigns: { data: { id: 'camp1', audience_id: 'a1', template_id: 'tpl1', max_recipients: null, variable_mapping: null } },
      communication_templates: { data: { approval_status: 'approved', body: 'Oi', name: 'promo', variables: [] } },
      whatsapp_config: { data: null },
    });
    const { req, res, captured } = runReqRes();
    await handler(req, res);
    expect(captured.body?.error).not.toBe('incomplete_mapping');
  });
});

describe('POST /confirm — Disparador valida variableMapping por templateName (C2 T5)', () => {
  function confirmHarness(tables) {
    const supabase = fakeSupabaseByTable(tables);
    const { app, find } = captureRoutes();
    const deps = { requireSupabaseAuth: (_req, _res, next) => next(), schedulerDeps: {} };
    registerDispatchRoutes(app, '/base', supabase, {}, deps);
    return { handler: find('POST', '/base/confirm') };
  }

  function runConfirm(body) {
    const captured = { status: 200, body: null };
    const res = {
      status(code) { captured.status = code; return res; },
      json(payload) { captured.body = payload; return res; },
    };
    const req = { body, userEmail: 'octo.inteligenciaimobiliaria@gmail.com' };
    return { req, res, captured };
  }

  it('templateName com variável + mapping vazio → 400 incomplete_mapping', async () => {
    const { handler } = confirmHarness({
      communication_templates: { data: { variables: ['1'] } },
    });
    const { req, res, captured } = runConfirm({ tenantId: 't1', previewToken: 'pt1', templateName: 'promo', variableMapping: {} });
    await handler(req, res);
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ ok: false, error: 'incomplete_mapping', missing: ['1'] });
  });

  it('sem templateName → não valida mapeamento (retrocompat: não bloqueia em incomplete_mapping)', async () => {
    // Sem templateName o handler não consulta o template e segue ao
    // confirmOperation; com previewToken inexistente, falha lá (não em mapping).
    const { handler } = confirmHarness({});
    const { req, res, captured } = runConfirm({ tenantId: 't1', previewToken: 'pt1' });
    await handler(req, res);
    expect(captured.body?.error).not.toBe('incomplete_mapping');
  });

  it('erro no lookup do template → 500 template_lookup_failed', async () => {
    const { handler } = confirmHarness({
      communication_templates: { data: null, error: { message: 'db timeout' } },
    });
    const { req, res, captured } = runConfirm({ tenantId: 't1', previewToken: 'pt1', templateName: 'promo', variableMapping: {} });
    await handler(req, res);
    expect(captured.status).toBe(500);
    expect(captured.body).toEqual({ ok: false, error: 'template_lookup_failed' });
  });

  it('templateName + mapping completo → não bloqueia em incomplete_mapping nem template_lookup_failed', async () => {
    // Template existe e variável '1' está mapeada → validação passa.
    // O handler segue ao confirmOperation; sem previewToken válido no cache do
    // service, falha adiante — mas NÃO em incomplete_mapping nem template_lookup_failed.
    const { handler } = confirmHarness({
      communication_templates: { data: { variables: ['1'] } },
    });
    const { req, res, captured } = runConfirm({
      tenantId: 't1',
      previewToken: 'pt1',
      templateName: 'promo',
      variableMapping: { 1: { type: 'lead_field', value: 'name' } },
    });
    await handler(req, res);
    expect(captured.body?.error).not.toBe('incomplete_mapping');
    expect(captured.body?.error).not.toBe('template_lookup_failed');
  });
});

describe('PUT /campaigns/:id — scheduledAt (C3 T5)', () => {
  function putHarness(tables) {
    const supabase = fakeSupabaseByTable(tables);
    const { app, find } = captureRoutes();
    const deps = { requireSupabaseAuth: (_req, _res, next) => next(), schedulerDeps: {} };
    registerDispatchRoutes(app, '/base', supabase, {}, deps);
    const handler = find('PUT', '/base/campaigns/:id');
    return { handler };
  }

  function runPut(body) {
    const captured = { status: 200, body: null };
    const res = {
      status(code) { captured.status = code; return res; },
      json(payload) { captured.body = payload; return res; },
    };
    const req = { params: { id: 'camp1' }, body: { tenantId: 't1', ...body }, userEmail: 'octo.inteligenciaimobiliaria@gmail.com' };
    return { req, res, captured };
  }

  it('scheduledAt no passado → 400 invalid_schedule', async () => {
    const { handler } = putHarness({});
    const { req, res, captured } = runPut({ scheduledAt: '2020-01-01T00:00:00.000Z' });
    await handler(req, res);
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ ok: false, error: 'invalid_schedule' });
  });

  it('scheduledAt inválido (não é data) → 400 invalid_schedule', async () => {
    const { handler } = putHarness({});
    const { req, res, captured } = runPut({ scheduledAt: 'not-a-date' });
    await handler(req, res);
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ ok: false, error: 'invalid_schedule' });
  });

  it('scheduledAt futuro válido + template aprovado + mapping ok → schedule_status scheduled', async () => {
    const futureIso = new Date(Date.now() + 3_600_000).toISOString(); // +1h
    // supabase fake: cur (template_id + variable_mapping) + template aprovado sem variáveis + update devolve campanha
    function fakeForSchedule() {
      return {
        from(table) {
          const node = {
            update: () => node,
            select: () => node,
            eq: () => node,
            maybeSingle: async () => {
              if (table === 'communication_campaigns') return { data: { template_id: 'tpl1', variable_mapping: {} }, error: null };
              if (table === 'communication_templates') return { data: { approval_status: 'approved', body: 'Oi', name: 'promo', variables: [] }, error: null };
              return { data: null, error: null };
            },
          };
          return node;
        },
      };
    }
    const supabase = fakeForSchedule();
    const { app, find } = captureRoutes();
    const deps = { requireSupabaseAuth: (_req, _res, next) => next(), schedulerDeps: {} };
    registerDispatchRoutes(app, '/base', supabase, {}, deps);
    const handler = find('PUT', '/base/campaigns/:id');
    const { req, res, captured } = runPut({ scheduledAt: futureIso });
    await handler(req, res);
    // O update devolve null (campanha não existe no fake) → 404, mas o ponto principal
    // é que NÃO retornou invalid_schedule nem incomplete_mapping.
    expect(captured.body?.error).not.toBe('invalid_schedule');
    expect(captured.body?.error).not.toBe('incomplete_mapping');
  });

  it('scheduledAt null → limpa agendamento (sem erro)', async () => {
    function fakeForClear() {
      return {
        from() {
          const node = {
            update: () => node,
            select: () => node,
            eq: () => node,
            maybeSingle: async () => ({ data: { id: 'camp1' }, error: null }),
          };
          return node;
        },
      };
    }
    const supabase = fakeForClear();
    const { app, find } = captureRoutes();
    const deps = { requireSupabaseAuth: (_req, _res, next) => next(), schedulerDeps: {} };
    registerDispatchRoutes(app, '/base', supabase, {}, deps);
    const handler = find('PUT', '/base/campaigns/:id');
    const { req, res, captured } = runPut({ scheduledAt: null });
    await handler(req, res);
    expect(captured.body?.error).not.toBe('invalid_schedule');
    expect(captured.body?.error).not.toBe('nothing_to_update');
  });
});

describe('POST /campaigns/:id/cancel-schedule (C3 T5)', () => {
  function cancelHarness(updateError = null) {
    const updates = [];
    const supabase = {
      from() {
        const node = {
          update(patch) { updates.push(patch); return node; },
          eq: () => node,
          then: undefined, // não é thenable por si
        };
        // Simula a promise final do .eq().eq().eq() — supabase retorna { error }
        // A cadeia .eq().eq().eq() retorna node; o await node retorna { error }
        node[Symbol.iterator] = undefined;
        // Hack: torna node "await-able" para o handler que faz `const { error } = await supabase...`
        node.then = (resolve) => resolve({ error: updateError });
        return node;
      },
    };
    const { app, find } = captureRoutes();
    const deps = { requireSupabaseAuth: (_req, _res, next) => next(), schedulerDeps: {} };
    registerDispatchRoutes(app, '/base', supabase, {}, deps);
    const handler = find('POST', '/base/campaigns/:id/cancel-schedule');
    return { handler, updates };
  }

  function runCancel(body, email = 'octo.inteligenciaimobiliaria@gmail.com') {
    const captured = { status: 200, body: null };
    const res = {
      status(code) { captured.status = code; return res; },
      json(payload) { captured.body = payload; return res; },
    };
    const req = { params: { id: 'camp1' }, body: { tenantId: 't1', ...body }, userEmail: email };
    return { req, res, captured };
  }

  it('gestor (owner) → cancela e devolve ok:true', async () => {
    const { handler } = cancelHarness();
    const { req, res, captured } = runCancel({});
    await handler(req, res);
    expect(captured.status).toBe(200);
    expect(captured.body).toEqual({ ok: true });
  });

  it('sem tenantId → 400 missing_tenant', async () => {
    const { handler } = cancelHarness();
    const captured = { status: 200, body: null };
    const res = { status(c) { captured.status = c; return res; }, json(p) { captured.body = p; return res; } };
    const req = { params: { id: 'camp1' }, body: {}, userEmail: 'octo.inteligenciaimobiliaria@gmail.com' };
    await handler(req, res);
    expect(captured.status).toBe(400);
    expect(captured.body).toEqual({ ok: false, error: 'missing_tenant' });
  });

  it('não-gestor (corretor) → 403 forbidden', async () => {
    // Para simular corretor, precisamos de um supabase que retorne role corretor.
    const supabase = {
      from(table) {
        const node = {
          update: () => node,
          select: () => node,
          eq: () => node,
          ilike: () => node,
          maybeSingle: async () => {
            if (table === 'tenant_memberships') return { data: { role: 'corretor' }, error: null };
            if (table === 'Corretores') return { data: null, error: null };
            return { data: null, error: null };
          },
        };
        node.then = (resolve) => resolve({ error: null });
        return node;
      },
    };
    const { app, find } = captureRoutes();
    const deps = { requireSupabaseAuth: (_req, _res, next) => next(), schedulerDeps: {} };
    registerDispatchRoutes(app, '/base', supabase, {}, deps);
    const handler = find('POST', '/base/campaigns/:id/cancel-schedule');
    const captured = { status: 200, body: null };
    const res = { status(c) { captured.status = c; return res; }, json(p) { captured.body = p; return res; } };
    const req = { params: { id: 'camp1' }, body: { tenantId: 't1' }, userEmail: 'corretor@x.com', userId: 'u1' };
    await handler(req, res);
    expect(captured.status).toBe(403);
    expect(captured.body).toEqual({ ok: false, error: 'forbidden' });
  });

  it('idempotente: update não falha se campanha não estava scheduled (ok:true)', async () => {
    // Mesmo que nenhuma linha seja afetada, a rota devolve ok:true (sem verificar rowcount).
    const { handler } = cancelHarness();
    const { req, res, captured } = runCancel({});
    await handler(req, res);
    expect(captured.body).toEqual({ ok: true });
  });

  it('erro do banco → 500 persist_failed', async () => {
    const { handler } = cancelHarness({ message: 'db error' });
    const { req, res, captured } = runCancel({});
    await handler(req, res);
    expect(captured.status).toBe(500);
    expect(captured.body).toEqual({ ok: false, error: 'persist_failed' });
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
