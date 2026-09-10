/**
 * Rotas de histórico: autenticação, recorte por tenant e — o ponto central do
 * contrato — a resolução do lead feita PELO SERVIDOR.
 *
 * O Supabase é falsificado à mão (padrão de liaCadencia/routes.test.js) porque
 * o que se testa aqui não é SQL: é quem pode ler o quê, e o que a rota faz com
 * uma âncora ambígua. A regra da linha do tempo está em compute.test.js.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerLeadEventsRoutes } from './index.js';

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

function supabaseFalso(tabelas = {}, usuario = { id: CORRETOR, email: 'corretor@x.com' }) {
  const chamadas = [];
  return {
    chamadas,
    auth: {
      getUser: vi.fn(async () =>
        (usuario ? { data: { user: usuario } } : { data: null, error: new Error('x') })),
    },
    from(tabela) {
      const registro = { tabela, filtros: {} };
      chamadas.push(registro);
      const linhas = tabelas[tabela] ?? [];
      const chain = {
        select: () => chain,
        insert: (row) => { registro.insert = row; registro.criada = { id: 'nova-linha' }; return chain; },
        update: (row) => { registro.update = row; return chain; },
        eq: (col, val) => { registro.filtros[col] = val; return chain; },
        in: (col, vals) => { registro.in = { col, vals }; return chain; },
        or: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: linhas, error: null }),
        maybeSingle: () => Promise.resolve({ data: linhas[0] ?? null, error: null }),
        single: () => Promise.resolve({ data: registro.criada ?? linhas[0] ?? null, error: null }),
        then: (r) => Promise.resolve({ data: linhas, error: null }).then(r),
      };
      return chain;
    },
  };
}

const leadRow = (over = {}) => ({
  id: LEAD,
  name: 'Fulano',
  phone: '11999998888',
  source: 'ZAP',
  status: 'Novos Leads',
  assigned_agent_id: null,
  assigned_agent_name: null,
  assigned_at: null,
  archived_at: null,
  archive_reason: null,
  created_at: '2026-09-01T10:00:00Z',
  ...over,
});

const reqGet = (over = {}) => ({
  params: { leadId: LEAD },
  query: { tenantId: TENANT },
  headers: { authorization: 'Bearer jwt' },
  body: {},
  ...over,
});

describe('GET /api/v1/leads/:leadId/eventos', () => {
  let app;
  beforeEach(() => { app = appFalso(); });

  const registrar = (tabelas, usuario) => {
    const sb = supabaseFalso(tabelas, usuario);
    registerLeadEventsRoutes(app, sb, { verbose: false });
    return sb;
  };

  it('sem Authorization devolve 401', async () => {
    registrar({});
    const res = await app.chamar('GET /api/v1/leads/:leadId/eventos', reqGet({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  it('leadId que não é uuid devolve 400, sem ir ao banco', async () => {
    const sb = registrar({ tenant_memberships: [{ tenant_id: TENANT, role: 'admin' }] });
    const res = await app.chamar('GET /api/v1/leads/:leadId/eventos', reqGet({ params: { leadId: 'abc' } }));
    expect(res.statusCode).toBe(400);
    expect(sb.chamadas.some((c) => c.tabela === 'lead_events')).toBe(false);
  });

  it('corretor pedindo lead de outro recebe 403 e nenhum evento é lido', async () => {
    const sb = registrar({
      tenant_memberships: [{ tenant_id: TENANT, role: 'corretor' }],
      leads: [leadRow({ assigned_agent_id: OUTRO })],
    });
    const res = await app.chamar('GET /api/v1/leads/:leadId/eventos', reqGet());
    expect(res.statusCode).toBe(403);
    expect(sb.chamadas.some((c) => c.tabela === 'lead_events')).toBe(false);
  });

  it('dono do lead recebe a linha do tempo, tudo filtrado por tenant', async () => {
    const sb = registrar({
      tenant_memberships: [{ tenant_id: TENANT, role: 'corretor' }],
      leads: [leadRow({ assigned_agent_id: CORRETOR, assigned_agent_name: 'João', assigned_at: '2026-09-01T10:05:00Z' })],
      lead_events: [{
        id: 'ev-1', event_type: 'lead.stage_changed', de: 'Novos Leads', para: 'Interação',
        ator_tipo: 'usuario', metadata: {}, created_at: '2026-09-02T09:00:00Z',
      }],
    });
    const res = await app.chamar('GET /api/v1/leads/:leadId/eventos', reqGet());
    expect(res.statusCode).toBe(200);
    // reais + derivados (criação e atribuição, que são anteriores aos triggers)
    expect(res.corpo.eventos.map((e) => e.tipo)).toEqual([
      'lead.created', 'lead.assigned', 'lead.stage_changed',
    ]);
    expect(res.corpo.resumo).toMatchObject({ reais: 1, derivados: 2 });

    for (const c of sb.chamadas.filter((x) => x.tabela === 'lead_events')) {
      expect(c.filtros.tenant_id).toBe(TENANT);
    }
  });
});

describe('POST /api/v1/lia/lead-events', () => {
  let app;
  beforeEach(() => {
    app = appFalso();
    vi.stubEnv('LIA_SERVICE_TOKEN', 'segredo');
    vi.stubEnv('DISPARADOR_SERVICE_TOKEN', '');
  });

  const corpo = (over = {}) => ({
    tenant_id: TENANT,
    lead_id: LEAD,
    event_type: 'lia.contato_realizado',
    idempotency_key: 'lia:x:contato:1',
    ...over,
  });
  const reqPost = (body, headers = { 'x-service-token': 'segredo' }) =>
    ({ headers, body, params: {}, query: {} });

  const registrar = (tabelas) => {
    const sb = supabaseFalso(tabelas);
    registerLeadEventsRoutes(app, sb, { verbose: false });
    return sb;
  };

  it('token de serviço errado devolve 401', async () => {
    registrar({});
    const res = await app.chamar(
      'POST /api/v1/lia/lead-events',
      reqPost(corpo(), { 'x-service-token': 'errado' }),
    );
    expect(res.statusCode).toBe(401);
    expect(res.corpo.error).toBe('invalid_service_token');
  });

  it('sem env configurada, o caminho de serviço não existe (fail-closed)', async () => {
    vi.stubEnv('LIA_SERVICE_TOKEN', '');
    registrar({});
    const res = await app.chamar('POST /api/v1/lia/lead-events', reqPost(corpo()));
    expect(res.statusCode).toBe(401);
  });

  it('tenant_id malformado devolve 400', async () => {
    registrar({});
    const res = await app.chamar('POST /api/v1/lia/lead-events', reqPost(corpo({ tenant_id: 'x' })));
    expect(res.statusCode).toBe(400);
  });

  it('corpo inválido devolve 422 com campo e motivo', async () => {
    registrar({});
    const res = await app.chamar(
      'POST /api/v1/lia/lead-events',
      reqPost(corpo({ idempotency_key: undefined, event_type: 'lead.created' })),
    );
    expect(res.statusCode).toBe(422);
    expect(res.corpo.details.map((d) => d.field).sort()).toEqual(['event_type', 'idempotency_key']);
  });

  it('lead que não é deste tenant devolve 404 em vez de criar linha órfã', async () => {
    const sb = registrar({ lead_events: [] });
    const res = await app.chamar('POST /api/v1/lia/lead-events', reqPost(corpo()));
    expect(res.statusCode).toBe(404);
    expect(sb.chamadas.some((c) => c.insert)).toBe(false);
  });

  it('resolve o lead pelo TELEFONE quando quem integra não conhece o uuid', async () => {
    // É o caso de lead vindo do Kenlo/C2S: a LIA só tem o telefone.
    const sb = registrar({
      leads: [leadRow({ assigned_agent_name: 'João', assigned_agent_id: CORRETOR })],
      lead_events: [],
    });
    const res = await app.chamar(
      'POST /api/v1/lia/lead-events',
      reqPost(corpo({ lead_id: undefined, lead_phone: '11999998888' })),
    );
    expect(res.statusCode).toBe(201);
    const busca = sb.chamadas.find((c) => c.tabela === 'leads' && c.in);
    expect(busca.in.vals).toContain('5511999998888');
    expect(busca.filtros.tenant_id).toBe(TENANT);
  });

  it('devolve o lead COMO A DASH O ENXERGA — é o que denuncia divergência', async () => {
    // Sem este eco, a LIA gravaria achando que fala com o corretor X enquanto a
    // dash tem o Y, e ninguém notaria até alguém abrir o card.
    const sb = registrar({
      leads: [leadRow({ assigned_agent_id: CORRETOR, assigned_agent_name: 'João', status: 'Interação' })],
      lead_events: [],
    });
    const res = await app.chamar('POST /api/v1/lia/lead-events', reqPost(corpo()));
    expect(res.corpo.lead).toEqual({
      id: LEAD,
      source: 'leads',
      nome: 'Fulano',
      etapa: 'Interação',
      corretor: { nome: 'João', user_id: CORRETOR },
    });
    const gravou = sb.chamadas.find((c) => c.insert);
    // o id gravado é o que o SERVIDOR resolveu, com a tabela de origem junto
    expect(gravou.insert).toMatchObject({ tenant_id: TENANT, lead_id: LEAD, lead_source: 'leads', ator_tipo: 'lia' });
  });

  it('a mesma chave não cria segunda linha: atualiza e devolve created:false', async () => {
    const sb = registrar({
      leads: [leadRow()],
      lead_events: [{ id: 'ev-existente' }],
    });
    const res = await app.chamar('POST /api/v1/lia/lead-events', reqPost(corpo({ descricao: 'segunda chamada' })));
    expect(res.statusCode).toBe(200);
    expect(res.corpo).toMatchObject({ ok: true, created: false, id: 'ev-existente' });
    expect(sb.chamadas.some((c) => c.insert)).toBe(false);
    expect(sb.chamadas.find((c) => c.update).update.descricao).toBe('segunda chamada');
  });

  it('o UPDATE não pode mover o evento de lead — lead_id só entra no INSERT', async () => {
    const sb = registrar({ leads: [leadRow()], lead_events: [{ id: 'ev-existente' }] });
    await app.chamar('POST /api/v1/lia/lead-events', reqPost(corpo()));
    const { update } = sb.chamadas.find((c) => c.update);
    expect(update.lead_id).toBeUndefined();
    expect(update.lead_source).toBeUndefined();
  });
});
