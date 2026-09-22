/**
 * As rotas da ata de reunião (P4.8).
 *
 * O que estes testes protegem, em uma frase: esta rota escreve a ata e NÃO
 * cria tarefa na agenda de ninguém. "Revisão humana antes de criar as tarefas"
 * é o que o plano pede, e é a única coisa entre uma transcrição mal lida e um
 * corretor recebendo trabalho que ninguém combinou com ele.
 *
 * O segundo protegido é o responsável: a LIA manda TEXTO ("a Ana"), nunca uma
 * pessoa. Se ela pudesse apontar, a revisão humana viraria um carimbo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerAtasRoutes } from './routes.js';

const resposta = () => {
  const r = { code: 200, corpo: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.corpo = b; return r; };
  return r;
};

function appFalso() {
  const rotas = new Map();
  const reg = (m) => (caminho, ...resto) => rotas.set(`${m} ${caminho}`, resto[resto.length - 1]);
  return { get: reg('GET'), post: reg('POST'), rotas };
}

function supabaseFalso({ ata = { id: 'ata-1', tenant_id: 't-1', status: 'enviada' }, rpc } = {}) {
  const chamadas = { rpc: [] };
  return {
    chamadas,
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: ata, error: null }),
            order: () => ({ limit: async (n) => { chamadas.limite = n; return { data: [], error: null }; } }),
          }),
        }),
      }),
    }),
    rpc: async (nome, args) => {
      chamadas.rpc.push({ nome, args });
      return rpc ? rpc(nome, args) : { data: { tarefas: 2, status: 'lida' }, error: null };
    },
  };
}

const auth = (req, _res, next) => { req.tenantId = 't-1'; next(); };

const montar = (sb) => { const app = appFalso(); registerAtasRoutes(app, sb, auth); return app; };

const chamar = async (app, chave, req) => {
  const res = resposta();
  const pedido = { params: {}, query: {}, body: {}, ...req };
  await new Promise((ok) => { auth(pedido, res, ok); });
  await app.rotas.get(chave)(pedido, res);
  return res;
};

const ID = '22222222-2222-4222-8222-222222222222';

describe('o conteúdo que a LIA devolve', () => {
  let sb;
  beforeEach(() => { sb = supabaseFalso(); });

  it('a resposta diz que as tarefas AINDA NÃO existem', async () => {
    const res = await chamar(montar(sb), 'POST /api/v1/atas/:id/conteudo', {
      params: { id: ID }, body: { resumo: 'ok', tarefas: [{ descricao: 'x', responsavel: 'a Ana' }] },
    });
    expect(res.code).toBe(200);
    expect(res.corpo.data.aviso).toMatch(/depois que uma pessoa revisar/i);
  });

  it('chama a função que ESCREVE a ata, nunca a que cria tarefas', async () => {
    await chamar(montar(sb), 'POST /api/v1/atas/:id/conteudo', {
      params: { id: ID }, body: { tarefas: [{ descricao: 'x' }] },
    });
    const nomes = sb.chamadas.rpc.map((c) => c.nome);
    expect(nomes).toContain('ata_conteudo_recebido');
    expect(nomes).not.toContain('ata_criar_tarefas');
  });

  // Se a LIA pudesse apontar a pessoa, a revisão humana viraria um carimbo.
  it('o responsável vai como texto, e um e-mail no corpo não vira apontamento', async () => {
    await chamar(montar(sb), 'POST /api/v1/atas/:id/conteudo', {
      params: { id: ID },
      body: { tarefas: [{ descricao: 'x', responsavel: 'a Ana', responsavel_email: 'ana@x.dev' }] },
    });
    const t = sb.chamadas.rpc[0].args.p_conteudo.tarefas[0];
    expect(t.responsavel).toBe('a Ana');
    expect(t).not.toHaveProperty('responsavel_email');
  });

  it('descarta tarefa sem descrição em vez de gravar linha vazia', async () => {
    await chamar(montar(sb), 'POST /api/v1/atas/:id/conteudo', {
      params: { id: ID },
      body: { tarefas: [{ descricao: '  ', responsavel: 'x' }, { descricao: 'vale' }] },
    });
    const ts = sb.chamadas.rpc[0].args.p_conteudo.tarefas;
    expect(ts).toHaveLength(1);
    expect(ts[0].descricao).toBe('vale');
  });

  it('nível de mapa fora de 1 a 6 vira 1, em vez de quebrar a indentação', async () => {
    await chamar(montar(sb), 'POST /api/v1/atas/:id/conteudo', {
      params: { id: ID },
      body: { mapa: [{ nivel: 99, texto: 'a' }, { nivel: 2, texto: 'b' }, { nivel: 'dois', texto: 'c' }] },
    });
    expect(sb.chamadas.rpc[0].args.p_conteudo.mapa.map((m) => m.nivel)).toEqual([1, 2, 1]);
  });

  it('listas viram sempre array, mesmo quando vêm como texto ou nulo', async () => {
    await chamar(montar(sb), 'POST /api/v1/atas/:id/conteudo', {
      params: { id: ID }, body: { decisoes: 'uma decisão só', riscos: null, participantes: ['  ', 'Ana'] },
    });
    const c = sb.chamadas.rpc[0].args.p_conteudo;
    expect(c.decisoes).toEqual([]);
    expect(c.riscos).toEqual([]);
    expect(c.participantes).toEqual(['Ana']);
  });

  it('corta listas e textos compridos em vez de recusar a ata inteira', async () => {
    await chamar(montar(sb), 'POST /api/v1/atas/:id/conteudo', {
      params: { id: ID },
      body: {
        resumo: 'x'.repeat(9000),
        decisoes: Array.from({ length: 200 }, (_, i) => `d${i}`),
        tarefas: Array.from({ length: 300 }, (_, i) => ({ descricao: `t${i}` })),
      },
    });
    const c = sb.chamadas.rpc[0].args.p_conteudo;
    expect(c.resumo).toHaveLength(4000);
    expect(c.decisoes).toHaveLength(50);
    expect(c.tarefas).toHaveLength(100);
  });

  it('o tenant vem da ata; o corpo não consegue trocá-lo', async () => {
    await chamar(montar(sb), 'POST /api/v1/atas/:id/conteudo', {
      params: { id: ID }, body: { resumo: 'x', tenant_id: 'outro' },
    });
    expect(sb.chamadas.rpc[0].args).not.toHaveProperty('p_tenant_id');
    expect(sb.chamadas.rpc[0].args.p_ata_id).toBe('ata-1');
  });

  it('404 quando a ata é de outra imobiliária', async () => {
    const res = await chamar(montar(supabaseFalso({ ata: null })), 'POST /api/v1/atas/:id/conteudo', {
      params: { id: ID }, body: { resumo: 'x' },
    });
    expect(res.code).toBe(404);
  });

  it('409 quando as tarefas já foram criadas — reler apagaria a revisão', async () => {
    const sbJa = supabaseFalso({
      rpc: () => { throw new Error('As tarefas desta ata já foram criadas; reler apagaria o que uma pessoa revisou.'); },
    });
    const res = await chamar(montar(sbJa), 'POST /api/v1/atas/:id/conteudo', {
      params: { id: ID }, body: { resumo: 'x' },
    });
    expect(res.code).toBe(409);
    expect(res.corpo.error.code).toBe('JA_REVISADA');
  });

  it('recusa id que não é uuid antes de encostar no banco', async () => {
    const res = await chamar(montar(sb), 'POST /api/v1/atas/:id/conteudo', {
      params: { id: 'nao-sou-uuid' }, body: { resumo: 'x' },
    });
    expect(res.code).toBe(400);
    expect(sb.chamadas.rpc).toHaveLength(0);
  });

  it('recusa corpo que não é objeto', async () => {
    const res = await chamar(montar(sb), 'POST /api/v1/atas/:id/conteudo', {
      params: { id: ID }, body: ['isto', 'é', 'lista'],
    });
    expect(res.code).toBe(400);
  });
});

describe('a transcrição que a LIA busca', () => {
  it('vem com o formato esperado junto, para ninguém inventar o seu', async () => {
    const sb = supabaseFalso({
      ata: { id: 'ata-1', titulo: 'R', data_reuniao: '2026-09-21', transcricao: 'texto', status: 'enviada' },
    });
    const res = await chamar(montar(sb), 'GET /api/v1/atas/:id/transcricao', { params: { id: ID } });
    expect(res.code).toBe(200);
    expect(res.corpo.data.transcricao).toBe('texto');
    expect(Object.keys(res.corpo.data.formato_esperado))
      .toEqual(expect.arrayContaining(['resumo', 'decisoes', 'tarefas', 'mapa']));
  });

  it('404 para ata de outra imobiliária', async () => {
    const res = await chamar(montar(supabaseFalso({ ata: null })), 'GET /api/v1/atas/:id/transcricao',
      { params: { id: ID } });
    expect(res.code).toBe(404);
  });
});

describe('quando a LIA não consegue estruturar', () => {
  it('registra o motivo e deixa a ata aberta para escrever à mão', async () => {
    const sb = supabaseFalso();
    const res = await chamar(montar(sb), 'POST /api/v1/atas/:id/erro', {
      params: { id: ID }, body: { motivo: 'transcrição sem falas identificadas' },
    });
    expect(res.code).toBe(200);
    expect(sb.chamadas.rpc[0].nome).toBe('ata_leitura_falhou');
    expect(res.corpo.data.aviso).toMatch(/à mão/i);
  });

  it('exige o motivo', async () => {
    const res = await chamar(montar(supabaseFalso()), 'POST /api/v1/atas/:id/erro',
      { params: { id: ID }, body: {} });
    expect(res.code).toBe(400);
  });
});

describe('a fila de atas pendentes', () => {
  it('não devolve mais que o teto', async () => {
    const sb = supabaseFalso();
    await chamar(montar(sb), 'GET /api/v1/atas/pendentes', { query: { limite: '900' } });
    expect(sb.chamadas.limite).toBe(50);
  });
});
