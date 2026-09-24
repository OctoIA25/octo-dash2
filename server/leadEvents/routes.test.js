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

function supabaseFalso(tabelas = {}, usuario = { id: CORRETOR, email: 'corretor@x.com' }, rpcs = {}) {
  const chamadas = [];
  return {
    chamadas,
    // A contagem do funil passou a ser um `group by` do banco em 24/09 — o
    // PostgREST cortava a resposta em mil linhas e a conta em JavaScript dava
    // [1000, 0, 0, ...]. Por isso a rota agora chama `rpc`.
    rpc: (nome, args) => {
      chamadas.push({ rpc: nome, args });
      return Promise.resolve({ data: rpcs[nome] ?? null, error: null });
    },
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
        not: (col, op, val) => { registro.not = { col, op, val }; return chain; },
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

// ============================================================
// POST /api/v1/leads/:leadId/requisitos-ignorados  (P1.6)
//
// Decidido pelo chefe em 20/09/2026: falta de pré-requisito avisa, DEIXA
// PASSAR e registra. Estes testes travam o "registra" — sem ele o "deixa
// passar" viraria "ninguém fica sabendo", e a chave não serviria para nada.
// ============================================================
describe('POST /api/v1/leads/:leadId/requisitos-ignorados', () => {
  let app;
  beforeEach(() => { app = appFalso(); });

  const registrar = (tabelas, usuario) => {
    const sb = supabaseFalso(tabelas, usuario);
    registerLeadEventsRoutes(app, sb, { verbose: false });
    return sb;
  };

  const req = (over = {}) => ({
    params: { leadId: LEAD },
    query: { tenantId: TENANT },
    headers: { authorization: 'Bearer jwt' },
    body: { etapa: 'proposta-assinada', pendencias: ['sem_documento_anexado', 'relato_curto'] },
    ...over,
  });

  const CHAVE = 'POST /api/v1/leads/:leadId/requisitos-ignorados';

  it('sem Authorization devolve 401', async () => {
    registrar({});
    expect((await app.chamar(CHAVE, req({ headers: {} }))).statusCode).toBe(401);
  });

  it('leadId que não é uuid devolve 400 sem tocar no extrato', async () => {
    const sb = registrar({ tenant_memberships: [{ tenant_id: TENANT, role: 'admin' }] });
    const res = await app.chamar(CHAVE, req({ params: { leadId: 'abc' } }));
    expect(res.statusCode).toBe(400);
    expect(sb.chamadas.some((c) => c.tabela === 'lead_events')).toBe(false);
  });

  it('sem pendências devolve 400 — evento sem motivo não é extrato', async () => {
    const sb = registrar({ tenant_memberships: [{ tenant_id: TENANT, role: 'admin' }] });
    const res = await app.chamar(CHAVE, req({ body: { etapa: 'x', pendencias: [] } }));
    expect(res.statusCode).toBe(400);
    expect(sb.chamadas.some((c) => c.tabela === 'lead_events')).toBe(false);
  });

  it('CORRETOR DE OUTRO LEAD recebe 403 e nada é gravado', async () => {
    // Mesmo recorte da leitura: quem não pode ver o histórico não escreve nele.
    const sb = registrar({
      tenant_memberships: [{ tenant_id: TENANT, role: 'corretor' }],
      leads: [leadRow({ assigned_agent_id: OUTRO })],
    });
    const res = await app.chamar(CHAVE, req());
    expect(res.statusCode).toBe(403);
    expect(sb.chamadas.some((c) => c.tabela === 'lead_events' && c.insert)).toBe(false);
  });

  it('o dono do lead registra, e o SERVIDOR é quem monta a linha', async () => {
    const sb = registrar({
      tenant_memberships: [{ tenant_id: TENANT, role: 'corretor' }],
      leads: [leadRow({ assigned_agent_id: CORRETOR })],
    });
    const res = await app.chamar(CHAVE, req());
    expect(res.statusCode).toBe(200);

    const gravou = sb.chamadas.find((c) => c.tabela === 'lead_events' && c.insert);
    expect(gravou, 'nada foi gravado no extrato').toBeTruthy();
    expect(gravou.insert.tenant_id).toBe(TENANT);
    expect(gravou.insert.lead_id).toBe(LEAD);
    // Namespace próprio: `lead.` é do trigger do banco.
    expect(gravou.insert.event_type).toBe('etapa.requisito_ignorado');
    expect(gravou.insert.event_type.startsWith('lead.')).toBe(false);
    expect(gravou.insert.ator_tipo).toBe('usuario');
    expect(gravou.insert.metadata.pendencias).toEqual(['sem_documento_anexado', 'relato_curto']);
  });

  it('o corpo NÃO escolhe o que vai gravado — só etapa e ids de pendência', async () => {
    // Quem escreve no extrato é o servidor. Se o corpo pudesse ditar o evento,
    // um corretor poderia gravar "atendido" num lead que não atendeu.
    const sb = registrar({
      tenant_memberships: [{ tenant_id: TENANT, role: 'admin' }],
      leads: [leadRow()],
    });
    await app.chamar(CHAVE, req({
      body: {
        etapa: 'visita-agendada',
        pendencias: ['visita_sem_data'],
        event_type: 'lia.contato_realizado',
        ator_tipo: 'lia',
        tenant_id: '00000000-0000-4000-a000-000000000000',
      },
    }));
    const gravou = sb.chamadas.find((c) => c.tabela === 'lead_events' && c.insert);
    expect(gravou.insert.event_type).toBe('etapa.requisito_ignorado');
    expect(gravou.insert.ator_tipo).toBe('usuario');
    expect(gravou.insert.tenant_id).toBe(TENANT);
  });

  it('corpo gigante é cortado em vez de ir inteiro para o banco', async () => {
    const sb = registrar({
      tenant_memberships: [{ tenant_id: TENANT, role: 'admin' }],
      leads: [leadRow()],
    });
    await app.chamar(CHAVE, req({
      body: { etapa: 'x'.repeat(500), pendencias: Array.from({ length: 80 }, (_, i) => `p${i}`.repeat(50)) },
    }));
    const gravou = sb.chamadas.find((c) => c.tabela === 'lead_events' && c.insert);
    expect(gravou.insert.para.length).toBeLessThanOrEqual(80);
    expect(gravou.insert.metadata.pendencias.length).toBeLessThanOrEqual(20);
    expect(Math.max(...gravou.insert.metadata.pendencias.map((p) => p.length))).toBeLessThanOrEqual(60);
  });
});

describe('GET /api/v1/funil/passaram-por-etapa', () => {
  const CHAVE = 'GET /api/v1/funil/passaram-por-etapa';
  let app;
  beforeEach(() => { app = appFalso(); });

  const registrar = (tabelas, usuario, rpcs) => {
    const sb = supabaseFalso(tabelas, usuario, rpcs);
    registerLeadEventsRoutes(app, sb, { verbose: false });
    return sb;
  };

  const pedido = (over = {}) => ({
    params: {},
    query: { tenantId: TENANT, etapas: 'Novos Leads|Interação|Visita Agendada' },
    headers: { authorization: 'Bearer jwt' },
    body: {},
    ...over,
  });

  /** O que a função do banco devolve: já agregado, uma linha por etapa. */
  const contagem = (pares) => Object.entries(pares).map(([etapa, passaram]) => ({ etapa, passaram }));

  it('sem Authorization devolve 401', async () => {
    registrar({});
    const res = await app.chamar(CHAVE, pedido({ headers: {} }));
    expect(res.statusCode).toBe(401);
  });

  it('sem etapas devolve 400, sem ir ao banco', async () => {
    const sb = registrar({ tenant_memberships: [{ tenant_id: TENANT, role: 'admin' }] });
    const res = await app.chamar(CHAVE, pedido({ query: { tenantId: TENANT } }));
    expect(res.statusCode).toBe(400);
    expect(res.corpo.error).toBe('etapas_obrigatorias');
    expect(sb.chamadas.some((c) => c.tabela === 'lead_events')).toBe(false);
  });

  /*
   * O caso que sustenta o arquivo. `passaram` é POSICIONAL: a tela casa
   * número com etapa pelo índice. Se a ordem sair diferente da pedida, cada
   * etapa mostra o número da vizinha — e o erro é invisível, porque todos os
   * números continuam plausíveis.
   */
  it('devolve um número por etapa, na ORDEM pedida, e zero para quem não veio', async () => {
    const sb = registrar(
      { tenant_memberships: [{ tenant_id: TENANT, role: 'admin' }] },
      undefined,
      {
        // O banco devolve só as etapas que TÊM evento, e em ordem qualquer.
        funil_passaram_por_etapa: contagem({ 'Visita Agendada': 1, 'Interação': 2, 'Arquivado': 9 }),
        funil_inicio_do_historico: '2026-09-10T10:00:00Z',
      },
    );
    const res = await app.chamar(CHAVE, pedido());

    expect(res.statusCode).toBe(200);
    expect(res.corpo.etapas).toEqual(['Novos Leads', 'Interação', 'Visita Agendada']);
    // Posicional e na ordem pedida: "Novos Leads" não veio do banco e vira 0,
    // "Arquivado" veio e é descartado por não estar na lista.
    expect(res.corpo.passaram).toEqual([0, 2, 1]);
    expect(res.corpo.inicio_do_historico).toBe('2026-09-10T10:00:00Z');

    // E o recorte por imobiliária vai nos DOIS lados da pergunta.
    const chamadas = sb.chamadas.filter((c) => c.rpc);
    expect(chamadas.map((c) => c.rpc).sort()).toEqual(
      ['funil_inicio_do_historico', 'funil_passaram_por_etapa'],
    );
    expect(chamadas.every((c) => c.args.p_tenant_id === TENANT)).toBe(true);
  });

  it('sem evento nenhum, a data de início vem nula em vez de hoje', async () => {
    registrar(
      { tenant_memberships: [{ tenant_id: TENANT, role: 'admin' }] },
      undefined,
      { funil_passaram_por_etapa: [], funil_inicio_do_historico: null },
    );
    const res = await app.chamar(CHAVE, pedido());
    expect(res.corpo.passaram).toEqual([0, 0, 0]);
    expect(res.corpo.inicio_do_historico).toBeNull();
  });
});
