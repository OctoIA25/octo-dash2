/**
 * Rotas dos toques do corretor: quem pode ler, registrar e desfazer.
 *
 * Supabase falsificado à mão, no molde de liaCadencia/routes.test.js — o ponto
 * é autorização e isolamento por tenant, não o SQL. A validação do corpo está
 * em normalize.test.js.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { registerLeadToquesRoutes } from './index.js';

const LEAD = 'bf3bfb20-d643-4147-a2ba-aa170d21a5b7';
const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';
const CORRETOR = '11111111-1111-1111-1111-111111111111';
const OUTRO = '22222222-2222-2222-2222-222222222222';
const TOQUE = '33333333-3333-3333-3333-333333333333';

function appFalso() {
  const rotas = new Map();
  const registrar = (metodo) => (caminho, ...fns) => rotas.set(`${metodo} ${caminho}`, fns);
  return {
    get: registrar('GET'),
    post: registrar('POST'),
    delete: registrar('DELETE'),
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

/** `tabelas` mapeia nome → linhas devolvidas; cada chamada fica em `chamadas`. */
function supabaseFalso(tabelas = {}, usuario = { id: CORRETOR, email: 'ana@imob.com' }) {
  const chamadas = [];
  return {
    chamadas,
    auth: { getUser: vi.fn(async () => ({ data: { user: usuario } })) },
    from(tabela) {
      const registro = { tabela, filtros: {} };
      chamadas.push(registro);
      const linhas = tabelas[tabela] ?? [];
      const resposta = () => Promise.resolve({ data: registro.insert ? { id: TOQUE, ...registro.insert } : linhas, error: null });
      const chain = {
        select: () => chain,
        insert: (row) => { registro.insert = row; return chain; },
        delete: () => { registro.delete = true; return chain; },
        eq: (col, val) => { registro.filtros[col] = val; return chain; },
        update: (row) => { registro.update = row; return chain; },
        in: () => chain,
        not: () => chain,
        neq: () => chain,
        order: () => chain,
        limit: () => resposta(),
        maybeSingle: () => Promise.resolve({ data: linhas[0] ?? null, error: null }),
        single: () => resposta(),
        then: (r) => resposta().then(r),
      };
      return chain;
    },
  };
}

const req = (over = {}) => ({
  params: { leadId: LEAD },
  query: { tenantId: TENANT },
  headers: { authorization: 'Bearer jwt' },
  body: {},
  ...over,
});

const corretorDono = {
  tenant_memberships: [{ tenant_id: TENANT, role: 'corretor' }],
  leads: [{ id: LEAD, phone: '11999998888', assigned_agent_id: CORRETOR }],
};

describe('rotas de toques', () => {
  let app;
  beforeEach(() => { app = appFalso(); });
  const registrar = (tabelas, usuario) => {
    const sb = supabaseFalso(tabelas, usuario);
    registerLeadToquesRoutes(app, sb);
    return sb;
  };

  describe('GET /api/v1/leads/:leadId/toques', () => {
    it('sem Authorization devolve 401', async () => {
      registrar({});
      const res = await app.chamar('GET /api/v1/leads/:leadId/toques', req({ headers: {} }));
      expect(res.statusCode).toBe(401);
    });

    it('leadId que não é uuid devolve 400', async () => {
      registrar(corretorDono);
      const res = await app.chamar('GET /api/v1/leads/:leadId/toques', req({ params: { leadId: 'abc' } }));
      expect(res.statusCode).toBe(400);
    });

    it('corretor pedindo lead de outro recebe 403 e nenhum toque é lido', async () => {
      const sb = registrar({ ...corretorDono, leads: [{ id: LEAD, assigned_agent_id: OUTRO }] });
      const res = await app.chamar('GET /api/v1/leads/:leadId/toques', req());
      expect(res.statusCode).toBe(403);
      expect(sb.chamadas.some((c) => c.tabela === 'lead_toques')).toBe(false);
    });

    it('dono do lead recebe os toques, filtrados por tenant e lead', async () => {
      const sb = registrar({ ...corretorDono, lead_toques: [{ id: TOQUE, canal: 'ligacao' }] });
      const res = await app.chamar('GET /api/v1/leads/:leadId/toques', req());
      expect(res.statusCode).toBe(200);
      expect(res.corpo).toEqual({ ok: true, toques: [{ id: TOQUE, canal: 'ligacao' }] });
      const leitura = sb.chamadas.find((c) => c.tabela === 'lead_toques');
      expect(leitura.filtros).toEqual({ tenant_id: TENANT, lead_id: LEAD });
    });
  });

  describe('POST /api/v1/leads/:leadId/toques', () => {
    const corpo = { canal: 'ligacao', resultado: 'numero_errado', executado_por: OUTRO };

    it('corpo inválido devolve 400 com os campos, sem gravar', async () => {
      const sb = registrar(corretorDono);
      const res = await app.chamar('POST /api/v1/leads/:leadId/toques', req({ body: { canal: 'sms' } }));
      expect(res.statusCode).toBe(400);
      expect(res.corpo.error).toBe('invalid_body');
      expect(sb.chamadas.some((c) => c.insert)).toBe(false);
    });

    it('corretor sem acesso ao lead recebe 403 e nada é gravado', async () => {
      const sb = registrar({ ...corretorDono, leads: [{ id: LEAD, assigned_agent_id: OUTRO }] });
      const res = await app.chamar('POST /api/v1/leads/:leadId/toques', req({ body: corpo }));
      expect(res.statusCode).toBe(403);
      expect(sb.chamadas.some((c) => c.insert)).toBe(false);
    });

    it('grava com tenant, lead e quem executou vindos da autenticação — nunca do corpo', async () => {
      const sb = registrar({ ...corretorDono, user_profiles: [{ full_name: 'Ana Souza' }] });
      const res = await app.chamar('POST /api/v1/leads/:leadId/toques', req({ body: corpo }));
      expect(res.statusCode).toBe(201);
      const { insert } = sb.chamadas.find((c) => c.insert);
      expect(insert).toMatchObject({
        tenant_id: TENANT,
        lead_id: LEAD,
        lead_source: 'leads',
        canal: 'ligacao',
        resultado: 'numero_errado',
        executado_por: CORRETOR,
        executado_por_nome: 'Ana Souza',
      });
    });

    it('sem nome no perfil, quem executou aparece pelo e-mail', async () => {
      const sb = registrar(corretorDono);
      await app.chamar('POST /api/v1/leads/:leadId/toques', req({ body: corpo }));
      expect(sb.chamadas.find((c) => c.insert).insert.executado_por_nome).toBe('ana@imob.com');
    });
  });

  describe('DELETE /api/v1/leads/:leadId/toques/:toqueId', () => {
    const reqDel = (toqueId = TOQUE) => req({ params: { leadId: LEAD, toqueId } });

    it('desfaz o último toque do lead quando foi quem registrou', async () => {
      const sb = registrar({ ...corretorDono, lead_toques: [{ id: TOQUE, executado_por: CORRETOR }] });
      const res = await app.chamar('DELETE /api/v1/leads/:leadId/toques/:toqueId', reqDel());
      expect(res.statusCode).toBe(200);
      const apagou = sb.chamadas.find((c) => c.delete);
      expect(apagou.filtros).toEqual({ id: TOQUE, tenant_id: TENANT });
    });

    it('toque de outra pessoa não pode ser desfeito', async () => {
      const sb = registrar({ ...corretorDono, lead_toques: [{ id: TOQUE, executado_por: OUTRO }] });
      const res = await app.chamar('DELETE /api/v1/leads/:leadId/toques/:toqueId', reqDel());
      expect(res.statusCode).toBe(403);
      expect(sb.chamadas.some((c) => c.delete)).toBe(false);
    });

    it('só o último toque do lead pode ser desfeito', async () => {
      const outroToque = '44444444-4444-4444-4444-444444444444';
      const sb = registrar({ ...corretorDono, lead_toques: [{ id: outroToque, executado_por: CORRETOR }] });
      const res = await app.chamar('DELETE /api/v1/leads/:leadId/toques/:toqueId', reqDel());
      expect(res.statusCode).toBe(409);
      expect(sb.chamadas.some((c) => c.delete)).toBe(false);
    });
  });
});

// Rota registrada só no api-server dá 404 em produção com tudo verde em dev.
describe.each(['proxy-production.js', 'api-server.js'])('%s', (arquivo) => {
  const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', arquivo), 'utf8');

  it('registra as rotas de toques antes do catch-all 404', () => {
    expect(src).toMatch(/from '\.\/leadToques\/index\.js'/);
    const registro = src.indexOf('registerLeadToquesRoutes(app, supabase)');
    expect(registro).toBeGreaterThan(-1);
    expect(registro).toBeLessThan(src.indexOf("app.use('/api/v1/*'"));
  });
});

/**
 * A cadência alimenta a agenda: o próximo toque marcado vira atividade do
 * corretor e, por ser bloqueante, entra na regra das 24h. Aqui só o caminho da
 * rota; o formato da atividade está em agenda.test.js.
 */
describe('POST de toque e a agenda', () => {
  let app;
  // Relógio congelado: a rota recusa toque no passado (normalize.js), então uma
  // data fixa no fixture envelhece e o teste passaria a falhar sozinho — foi o
  // que aconteceu em 21/09/2026, horas depois de escrito.
  beforeEach(() => {
    app = appFalso();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:00:00.000Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('toque com próximo marcado cria a atividade na agenda do corretor', async () => {
    const sb = supabaseFalso(corretorDono);
    registerLeadToquesRoutes(app, sb);

    const res = await app.chamar('POST /api/v1/leads/:leadId/toques', req({
      body: { canal: 'ligacao', resultado: 'nao_respondeu', proximo_toque_em: '2026-09-21T17:00:00.000Z' },
    }));

    expect(res.statusCode).toBe(201);
    const criacao = sb.chamadas.find((c) => c.tabela === 'agenda_eventos' && c.insert);
    expect(criacao.insert).toMatchObject({
      tipo: 'retornar_cliente',
      data: '2026-09-21',
      horario: '14:00',
      lead_uuid: LEAD,
      tenant_id: TENANT,
    });
  });

  it('toque sem próximo marcado não cria atividade', async () => {
    const sb = supabaseFalso(corretorDono);
    registerLeadToquesRoutes(app, sb);

    const res = await app.chamar('POST /api/v1/leads/:leadId/toques', req({
      body: { canal: 'ligacao', resultado: 'nao_respondeu' },
    }));

    expect(res.statusCode).toBe(201);
    expect(sb.chamadas.some((c) => c.tabela === 'agenda_eventos' && c.insert)).toBe(false);
  });
});
