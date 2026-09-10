/**
 * Rotas de cadência: autenticação, recorte por tenant e visibilidade.
 *
 * O Supabase é falsificado à mão (padrão de server/zap/routes.test.js) porque
 * o ponto do teste não é o SQL — é quem pode ler o quê, e o que a rota faz com
 * corpo inválido. A regra de negócio está em compute.test.js.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerLiaCadenciaRoutes, podeVerCadencia } from './index.js';

const LEAD = 'bf3bfb20-d643-4147-a2ba-aa170d21a5b7';
const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';
const CORRETOR = '11111111-1111-1111-1111-111111111111';
const OUTRO = '22222222-2222-2222-2222-222222222222';

/** Coleta os handlers registrados para poder invocá-los direto. */
function appFalso() {
  const rotas = new Map();
  return {
    rotas,
    get: (caminho, ...fns) => rotas.set(`GET ${caminho}`, fns),
    post: (caminho, ...fns) => rotas.set(`POST ${caminho}`, fns),
    /** Roda a cadeia (middleware + handler) como o Express faria. */
    async chamar(chave, req) {
      const res = {
        statusCode: 200,
        corpo: null,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.corpo = b; return this; },
      };
      for (const fn of rotas.get(chave)) {
        let seguiu = false;
        await fn(req, res, () => { seguiu = true; });
        if (!seguiu) return res;
      }
      return res;
    },
  };
}

/**
 * Client falso: `tabelas` mapeia nome → linhas devolvidas. Toda chamada
 * encadeada é registrada em `chamadas` para podermos afirmar o isolamento
 * por tenant sem depender da ordem interna do handler.
 */
function supabaseFalso(tabelas = {}, usuario = { id: CORRETOR, email: 'corretor@x.com' }) {
  const chamadas = [];
  const client = {
    chamadas,
    auth: {
      getUser: vi.fn(async () => (usuario ? { data: { user: usuario } } : { data: null, error: new Error('x') })),
    },
    from(tabela) {
      const registro = { tabela, filtros: {} };
      chamadas.push(registro);
      const linhas = tabelas[tabela] ?? [];
      const chain = {
        select: () => chain,
        // INSERT devolve a linha criada, como o PostgREST faz com .select().single().
        insert: (row) => { registro.insert = row; registro.criada = { id: 'nova-linha' }; return chain; },
        update: (row) => { registro.update = row; return chain; },
        eq: (col, val) => { registro.filtros[col] = val; return chain; },
        in: () => chain,
        or: (expr) => { registro.or = expr; return chain; },
        gte: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: linhas, error: null }),
        maybeSingle: () => Promise.resolve({ data: linhas[0] ?? null, error: null }),
        single: () => Promise.resolve({ data: registro.criada ?? linhas[0] ?? null, error: null }),
        then: (r) => Promise.resolve({ data: linhas, error: null }).then(r),
      };
      return chain;
    },
  };
  return client;
}

const reqGet = (over = {}) => ({
  params: { leadId: LEAD },
  query: { tenantId: TENANT },
  headers: { authorization: 'Bearer jwt' },
  body: {},
  ...over,
});

describe('podeVerCadencia — regra pura', () => {
  it('owner da plataforma vê qualquer lead', () => {
    expect(podeVerCadencia({ ehOwnerDaPlataforma: true, lead: { owner_id: OUTRO } })).toBe(true);
  });

  it.each(['admin', 'owner', 'team_leader'])('gestão (%s) vê o tenant inteiro', (role) => {
    expect(podeVerCadencia({ role, userId: CORRETOR, lead: { owner_id: OUTRO } })).toBe(true);
  });

  it('corretor vê o próprio lead', () => {
    expect(podeVerCadencia({ role: 'corretor', userId: CORRETOR, lead: { owner_id: CORRETOR } })).toBe(true);
  });

  it('corretor NÃO vê lead de outro', () => {
    expect(podeVerCadencia({ role: 'corretor', userId: CORRETOR, lead: { owner_id: OUTRO } })).toBe(false);
  });

  it('lead sem dono (bolsão) só aparece para gestão', () => {
    expect(podeVerCadencia({ role: 'corretor', userId: CORRETOR, lead: { owner_id: null } })).toBe(false);
  });

  it('não é membro do tenant: role null não passa', () => {
    expect(podeVerCadencia({ role: null, userId: CORRETOR, lead: { owner_id: OUTRO } })).toBe(false);
  });
});

describe('GET /api/v1/leads/:leadId/cadencia', () => {
  let app;
  beforeEach(() => { app = appFalso(); });

  const registrar = (tabelas, usuario) => {
    const sb = supabaseFalso(tabelas, usuario);
    registerLiaCadenciaRoutes(app, sb, { verbose: false });
    return sb;
  };

  it('sem Authorization devolve 401', async () => {
    registrar({});
    const res = await app.chamar('GET /api/v1/leads/:leadId/cadencia', reqGet({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  it('leadId que não é uuid devolve 400, sem ir ao banco', async () => {
    const sb = registrar({ tenant_memberships: [{ tenant_id: TENANT, role: 'admin' }] });
    const res = await app.chamar('GET /api/v1/leads/:leadId/cadencia', reqGet({ params: { leadId: 'abc' } }));
    expect(res.statusCode).toBe(400);
    expect(sb.chamadas.some((c) => c.tabela === 'lia_followups')).toBe(false);
  });

  it('lead inexistente devolve 404', async () => {
    registrar({ tenant_memberships: [{ tenant_id: TENANT, role: 'admin' }] });
    const res = await app.chamar('GET /api/v1/leads/:leadId/cadencia', reqGet());
    expect(res.statusCode).toBe(404);
    expect(res.corpo).toEqual({ ok: false, error: 'lead_not_found' });
  });

  it('corretor pedindo lead de outro recebe 403 e nenhuma cadência é lida', async () => {
    const sb = registrar({
      tenant_memberships: [{ tenant_id: TENANT, role: 'corretor' }],
      leads: [{ id: LEAD, phone: '11999998888', assigned_agent_id: OUTRO }],
    });
    const res = await app.chamar('GET /api/v1/leads/:leadId/cadencia', reqGet());
    expect(res.statusCode).toBe(403);
    expect(sb.chamadas.some((c) => c.tabela === 'lia_followups')).toBe(false);
  });

  it('dono do lead recebe resumo e timeline, com tudo filtrado por tenant', async () => {
    const sb = registrar({
      tenant_memberships: [{ tenant_id: TENANT, role: 'corretor' }],
      leads: [{ id: LEAD, phone: '11999998888', assigned_agent_id: CORRETOR }],
      lia_followups: [{ id: 'f1', status: 'sent', sent_at: '2026-09-01T10:00:00Z', attempt_number: 1, tag: 't' }],
    });
    const res = await app.chamar('GET /api/v1/leads/:leadId/cadencia', reqGet());
    expect(res.statusCode).toBe(200);
    expect(res.corpo.ok).toBe(true);
    expect(res.corpo.resumo.enviadas).toBe(1);
    expect(res.corpo.timeline).toHaveLength(1);

    const consultas = sb.chamadas.filter((c) => c.tabela === 'lia_followups');
    expect(consultas.length).toBe(1);
    for (const c of consultas) expect(c.filtros.tenant_id).toBe(TENANT);
  });

  it('casa follow-up por lead_id E por telefone', async () => {
    const sb = registrar({
      tenant_memberships: [{ tenant_id: TENANT, role: 'admin' }],
      leads: [{ id: LEAD, phone: '11999998888', assigned_agent_id: null }],
    });
    await app.chamar('GET /api/v1/leads/:leadId/cadencia', reqGet());
    const { or } = sb.chamadas.find((c) => c.tabela === 'lia_followups');
    expect(or).toContain(`lead_id.eq.${LEAD}`);
    expect(or).toContain('lead_phone.in.(5511999998888');
  });
});

describe('POST /api/v1/lia/cadencias', () => {
  let app;
  beforeEach(() => {
    app = appFalso();
    vi.stubEnv('LIA_SERVICE_TOKEN', 'segredo');
    vi.stubEnv('DISPARADOR_SERVICE_TOKEN', '');
  });

  const corpo = (over = {}) => ({
    tenant_id: TENANT,
    lead_id: LEAD,
    idempotency_key: 'lia:x:pos_apresentacao:1',
    status: 'pending',
    scheduled_at: '2026-12-01T10:00:00Z',
    ...over,
  });
  const reqPost = (body, headers = { 'x-service-token': 'segredo' }) => ({ headers, body, params: {}, query: {} });

  it('token de serviço errado devolve 401', async () => {
    registerLiaCadenciaRoutes(app, supabaseFalso({}), { verbose: false });
    const res = await app.chamar('POST /api/v1/lia/cadencias', reqPost(corpo(), { 'x-service-token': 'errado' }));
    expect(res.statusCode).toBe(401);
    expect(res.corpo.error).toBe('invalid_service_token');
  });

  it('sem env configurada, o caminho de serviço não existe (fail-closed)', async () => {
    vi.stubEnv('LIA_SERVICE_TOKEN', '');
    registerLiaCadenciaRoutes(app, supabaseFalso({}), { verbose: false });
    const res = await app.chamar('POST /api/v1/lia/cadencias', reqPost(corpo()));
    expect(res.statusCode).toBe(401);
  });

  it('tenant_id ausente ou malformado devolve 400', async () => {
    registerLiaCadenciaRoutes(app, supabaseFalso({}), { verbose: false });
    const res = await app.chamar('POST /api/v1/lia/cadencias', reqPost(corpo({ tenant_id: 'x' })));
    expect(res.statusCode).toBe(400);
  });

  it('corpo inválido devolve 422 com o campo e o motivo', async () => {
    registerLiaCadenciaRoutes(app, supabaseFalso({}), { verbose: false });
    const res = await app.chamar(
      'POST /api/v1/lia/cadencias',
      reqPost(corpo({ idempotency_key: undefined, status: 'enviado' })),
    );
    expect(res.statusCode).toBe(422);
    expect(res.corpo.details.map((d) => d.field).sort()).toEqual(['idempotency_key', 'status']);
  });

  it('lead de outro tenant devolve 404 em vez de criar linha órfã', async () => {
    const sb = supabaseFalso({});
    registerLiaCadenciaRoutes(app, sb, { verbose: false });
    const res = await app.chamar('POST /api/v1/lia/cadencias', reqPost(corpo()));
    expect(res.statusCode).toBe(404);
    expect(sb.chamadas.some((c) => c.insert)).toBe(false);
  });

  it('insere quando a chave é nova e devolve 201 created', async () => {
    const sb = supabaseFalso({
      leads: [{ id: LEAD, phone: '11999998888', assigned_agent_id: null }],
      lia_followups: [],
    });
    registerLiaCadenciaRoutes(app, sb, { verbose: false });
    const res = await app.chamar('POST /api/v1/lia/cadencias', reqPost(corpo()));
    expect(res.statusCode).toBe(201);
    expect(res.corpo).toMatchObject({ ok: true, created: true });
    const gravou = sb.chamadas.find((c) => c.insert);
    expect(gravou.insert.tenant_id).toBe(TENANT);
    expect(gravou.insert.tenant_id).not.toBe(undefined);
  });

  it('o corpo não escolhe o tenant da linha gravada — quem escolhe é a autenticação', async () => {
    const sb = supabaseFalso({
      leads: [{ id: LEAD, phone: '1', assigned_agent_id: null }],
      lia_followups: [],
    });
    registerLiaCadenciaRoutes(app, sb, { verbose: false });
    await app.chamar('POST /api/v1/lia/cadencias', reqPost(corpo({ tenant_id: TENANT })));
    const gravou = sb.chamadas.find((c) => c.insert);
    // nem tenant_id de dentro do payload de cadência, nem coluna inventada
    expect(Object.keys(gravou.insert)).toContain('idempotency_key');
    expect(gravou.insert.tenant_id).toBe(TENANT);
  });
});
