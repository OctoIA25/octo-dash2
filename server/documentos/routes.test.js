/**
 * A rota pela qual a LIA devolve a leitura de um documento (P4.7).
 *
 * O que estes testes protegem, em uma frase: esta rota NUNCA deixa um
 * documento pronto. Ela grava sugestão e põe o documento em "lido"; quem
 * confirma é uma pessoa, pela tela. Se um dia alguém fizer esta rota marcar
 * "conferido", a Regra 1 do plano cai por fora — e nenhum teste de banco pega,
 * porque o banco só vê o que a rota mandar.
 *
 * O segundo protegido é o tenant: o documento manda de quem ele é, e quem
 * chama não escolhe. Sem isso a LIA grava leitura no documento de outra
 * imobiliária.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerDocumentosRoutes } from './routes.js';

const resposta = () => {
  const r = { code: 200, corpo: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.corpo = b; return r; };
  return r;
};

/** Um app de mentira que só guarda as rotas por método e caminho. */
function appFalso() {
  const rotas = new Map();
  const reg = (metodo) => (caminho, ...resto) =>
    rotas.set(`${metodo} ${caminho}`, resto[resto.length - 1]);
  return { get: reg('GET'), post: reg('POST'), rotas };
}

/** Supabase de mentira: devolve o documento pedido e registra as chamadas. */
function supabaseFalso({ doc = { id: 'doc-1', tenant_id: 't-1', status: 'enviado' }, rpc } = {}) {
  const chamadas = { rpc: [], update: [] };
  return {
    chamadas,
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: doc, error: null }),
            order: () => ({ limit: async () => ({ data: [], error: null }) }),
          }),
          order: () => ({ limit: async () => ({ data: [], error: null }) }),
        }),
      }),
      update: (v) => ({ eq: async () => { chamadas.update.push(v); return { error: null }; } }),
    }),
    rpc: async (nome, args) => {
      chamadas.rpc.push({ nome, args });
      return rpc ? rpc(nome, args) : { data: { gravados: 2 }, error: null };
    },
  };
}

const semAutenticacao = (req, _res, next) => { req.tenantId = 't-1'; next(); };

function montar(sb) {
  const app = appFalso();
  registerDocumentosRoutes(app, sb, semAutenticacao);
  return app;
}

const chamar = async (app, chave, req) => {
  const res = resposta();
  const handler = app.rotas.get(chave);
  const pedido = { params: {}, query: {}, body: {}, ...req };
  await new Promise((ok) => { semAutenticacao(pedido, res, ok); });
  await handler(pedido, res);
  return res;
};

const ID = '11111111-1111-4111-8111-111111111111';

describe('a leitura que a LIA devolve', () => {
  let sb;
  beforeEach(() => { sb = supabaseFalso(); });

  it('grava sugestão e diz, na resposta, que o documento NÃO ficou pronto', async () => {
    const app = montar(sb);
    const res = await chamar(app, 'POST /api/v1/documentos/:id/campos', {
      params: { id: ID },
      body: { campos: [{ campo: 'cpf', valor: '529.982.247-25', confianca: 0.97 }] },
    });
    expect(res.code).toBe(200);
    expect(res.corpo.data.status).toBe('lido');
    // O eco é o que impede quem integra de concluir que acabou.
    expect(res.corpo.data.aviso).toMatch(/só vale depois que uma pessoa confirmar/i);
  });

  it('manda para a função que grava SUGESTÃO, nunca para a de confirmar', async () => {
    const app = montar(sb);
    await chamar(app, 'POST /api/v1/documentos/:id/campos', {
      params: { id: ID }, body: { campos: [{ campo: 'cpf', valor: '1' }] },
    });
    const nomes = sb.chamadas.rpc.map((c) => c.nome);
    expect(nomes).toContain('documento_leitura_recebida');
    expect(nomes).not.toContain('documento_confirmar');
  });

  it('confiança fora de 0 a 1 vira nulo — confiança inventada pinta o certo de amarelo', async () => {
    const app = montar(sb);
    await chamar(app, 'POST /api/v1/documentos/:id/campos', {
      params: { id: ID },
      body: { campos: [
        { campo: 'a', valor: 'x', confianca: 7 },
        { campo: 'b', valor: 'y', confianca: -1 },
        { campo: 'c', valor: 'z', confianca: 'muito' },
        { campo: 'd', valor: 'w', confianca: 0.5 },
      ] },
    });
    const campos = sb.chamadas.rpc[0].args.p_campos;
    expect(campos.map((c) => c.confianca)).toEqual([null, null, null, 0.5]);
  });

  it('o tenant vem do DOCUMENTO, e o corpo não consegue trocá-lo', async () => {
    const app = montar(sb);
    await chamar(app, 'POST /api/v1/documentos/:id/campos', {
      params: { id: ID },
      body: { campos: [{ campo: 'a', valor: 'x' }], tenant_id: 'outro-tenant' },
    });
    // A RPC recebe só o id do documento; o tenant nunca trafega no corpo.
    expect(sb.chamadas.rpc[0].args).not.toHaveProperty('p_tenant_id');
    expect(sb.chamadas.rpc[0].args.p_documento_id).toBe('doc-1');
  });

  it('recusa id que não é uuid antes de encostar no banco', async () => {
    const app = montar(sb);
    const res = await chamar(app, 'POST /api/v1/documentos/:id/campos', {
      params: { id: 'sou-um-id' }, body: { campos: [{ campo: 'a', valor: 'x' }] },
    });
    expect(res.code).toBe(400);
    expect(sb.chamadas.rpc).toHaveLength(0);
  });

  it('recusa corpo sem a lista de campos, dizendo o formato', async () => {
    const app = montar(sb);
    const res = await chamar(app, 'POST /api/v1/documentos/:id/campos', {
      params: { id: ID }, body: {},
    });
    expect(res.code).toBe(400);
    expect(res.corpo.error.message).toMatch(/campos:/);
  });

  it('recusa lista grande demais', async () => {
    const app = montar(sb);
    const res = await chamar(app, 'POST /api/v1/documentos/:id/campos', {
      params: { id: ID },
      body: { campos: Array.from({ length: 61 }, (_, i) => ({ campo: `c${i}`, valor: 'x' })) },
    });
    expect(res.code).toBe(400);
    expect(res.corpo.error.code).toBe('CAMPOS_DEMAIS');
  });

  it('descarta campo sem nome em vez de mandar lixo ao banco', async () => {
    const app = montar(sb);
    const res = await chamar(app, 'POST /api/v1/documentos/:id/campos', {
      params: { id: ID }, body: { campos: [{ valor: 'x' }, { campo: '   ', valor: 'y' }] },
    });
    expect(res.code).toBe(400);
    expect(res.corpo.error.code).toBe('CAMPOS_VAZIOS');
  });

  it('404 quando o documento é de outra imobiliária', async () => {
    const sbVazio = supabaseFalso({ doc: null });
    const res = await chamar(montar(sbVazio), 'POST /api/v1/documentos/:id/campos', {
      params: { id: ID }, body: { campos: [{ campo: 'a', valor: 'x' }] },
    });
    expect(res.code).toBe(404);
  });

  it('409 quando uma pessoa já conferiu — a leitura não desfaz decisão de gente', async () => {
    const sbConferido = supabaseFalso({
      rpc: () => { throw new Error('Este documento já foi conferido por uma pessoa; a leitura não o sobrescreve.'); },
    });
    const res = await chamar(montar(sbConferido), 'POST /api/v1/documentos/:id/campos', {
      params: { id: ID }, body: { campos: [{ campo: 'a', valor: 'x' }] },
    });
    expect(res.code).toBe(409);
    expect(res.corpo.error.code).toBe('JA_CONFERIDO');
  });

  it('corta valor e âncora comprido em vez de recusar o documento inteiro', async () => {
    const app = montar(sb);
    await chamar(app, 'POST /api/v1/documentos/:id/campos', {
      params: { id: ID },
      body: { campos: [{ campo: 'a', valor: 'x'.repeat(2000), ancora: 'y'.repeat(2000) }] },
    });
    const c = sb.chamadas.rpc[0].args.p_campos[0];
    expect(c.valor).toHaveLength(500);
    expect(c.ancora).toHaveLength(300);
  });
});

describe('quando a LIA não consegue ler', () => {
  it('devolve o documento para a fila humana, e NÃO o marca como recusado', async () => {
    const sb = supabaseFalso({ doc: { id: 'doc-1', status: 'enviado' } });
    const res = await chamar(montar(sb), 'POST /api/v1/documentos/:id/erro', {
      params: { id: ID }, body: { motivo: 'PDF sem texto' },
    });
    expect(res.code).toBe(200);
    // Recusar é decisão de gente: a falha de leitura não recusa documento.
    expect(sb.chamadas.update[0]).toEqual({ status: 'enviado', lido_por: null, lido_em: null });
    expect(res.corpo.data.status).toBe('enviado');
  });

  it('exige o motivo — "não deu" sem motivo não ajuda ninguém', async () => {
    const res = await chamar(montar(supabaseFalso()), 'POST /api/v1/documentos/:id/erro', {
      params: { id: ID }, body: {},
    });
    expect(res.code).toBe(400);
  });

  it('não mexe no que uma pessoa já conferiu', async () => {
    const sb = supabaseFalso({ doc: { id: 'doc-1', status: 'conferido' } });
    const res = await chamar(montar(sb), 'POST /api/v1/documentos/:id/erro', {
      params: { id: ID }, body: { motivo: 'qualquer' },
    });
    expect(res.code).toBe(409);
    expect(sb.chamadas.update).toHaveLength(0);
  });
});

describe('o esquema que a LIA pede antes de ler', () => {
  it('404 para tipo que não existe, em vez de esquema vazio', async () => {
    const sb = supabaseFalso({ rpc: () => ({ data: null, error: null }) });
    const res = await chamar(montar(sb), 'GET /api/v1/documentos/esquema/:tipo', {
      params: { tipo: 'passaporte-marciano' },
    });
    expect(res.code).toBe(404);
  });

  it('devolve o esquema do tipo conhecido', async () => {
    const sb = supabaseFalso({
      rpc: () => ({ data: { tipo: 'holerite', campos: [{ campo: 'liquido' }] }, error: null }),
    });
    const res = await chamar(montar(sb), 'GET /api/v1/documentos/esquema/:tipo', {
      params: { tipo: 'holerite' },
    });
    expect(res.code).toBe(200);
    expect(res.corpo.data.tipo).toBe('holerite');
  });
});

describe('a fila de pendentes', () => {
  it('não devolve mais que o teto, mesmo se pedirem mil', async () => {
    const app = appFalso();
    let limitePedido = null;
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ order: () => ({
            limit: async (n) => { limitePedido = n; return { data: [], error: null }; },
          }) }) }),
        }),
      }),
    };
    registerDocumentosRoutes(app, sb, semAutenticacao);
    await chamar(app, 'GET /api/v1/documentos/pendentes', { query: { limite: '5000' } });
    expect(limitePedido).toBe(100);
  });
});
