/**
 * O aceite de contrato (P4.3).
 *
 * O que estes testes protegem, em uma frase: o IP e o usuário do aceite NÃO
 * podem vir do cliente. O IP vem da conexão; o usuário, do token. Um aceite em
 * que o aceitante informa os dois não prova nada.
 */
import { describe, it, expect, vi } from 'vitest';
import { ipDoPedido, makeAceitarHandler, makeRequireSupabaseAuth } from './routes.js';

const resposta = () => {
  const r = { code: null, corpo: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.corpo = b; return r; };
  return r;
};

describe('o endereço de quem aceita', () => {
  it('prefere o cabeçalho do proxy, porque req.ip seria o do próprio proxy', () => {
    expect(ipDoPedido({ headers: { 'x-forwarded-for': '203.0.113.7' }, ip: '10.0.0.1' }))
      .toBe('203.0.113.7');
  });

  it('pega o PRIMEIRO da cadeia — é o cliente, os outros são proxies', () => {
    expect(ipDoPedido({ headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' } }))
      .toBe('203.0.113.7');
  });

  it('aguenta o cabeçalho repetido, que chega como lista', () => {
    expect(ipDoPedido({ headers: { 'x-forwarded-for': ['203.0.113.7', '198.51.100.1'] } }))
      .toBe('203.0.113.7');
  });

  it('cai no endereço da conexão quando não há proxy', () => {
    expect(ipDoPedido({ headers: {}, ip: '10.0.0.1' })).toBe('10.0.0.1');
  });

  it('devolve vazio quando não há nenhum dos dois — e aí a rota recusa', () => {
    expect(ipDoPedido({ headers: {} })).toBe('');
  });
});

describe('a rota de aceite', () => {
  const supabaseQue = (retorno) => ({ rpc: vi.fn().mockResolvedValue(retorno) });

  it('recusa sem o contrato', async () => {
    const res = resposta();
    await makeAceitarHandler(supabaseQue({ data: null }))(
      { body: {}, headers: {}, ip: '1.2.3.4', userId: 'u1' }, res);
    expect(res.code).toBe(400);
    expect(res.corpo.error).toBe('atribuicao_id_obrigatorio');
  });

  it('recusa quando não dá para saber de onde veio', async () => {
    const res = resposta();
    await makeAceitarHandler(supabaseQue({ data: null }))(
      { body: { atribuicao_id: 'a1' }, headers: {}, userId: 'u1' }, res);
    expect(res.code).toBe(400);
    expect(res.corpo.error).toBe('sem_endereco_de_origem');
  });

  // Esta é a asserção central do arquivo.
  it('manda ao banco o usuário DO TOKEN e o IP DA CONEXÃO, nunca o que o corpo diz', async () => {
    const supabase = supabaseQue({ data: { aceito: true, hash: 'abc' } });
    const res = resposta();
    await makeAceitarHandler(supabase)({
      body: {
        atribuicao_id: 'a1',
        // o cliente tenta se passar por outro e forjar o endereço
        p_user_id: 'outra-pessoa',
        user_id: 'outra-pessoa',
        ip: '9.9.9.9',
      },
      headers: { 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Mozilla/5.0' },
      ip: '10.0.0.1',
      userId: 'u-do-token',
    }, res);

    expect(supabase.rpc).toHaveBeenCalledWith('contrato_aceitar', {
      p_atribuicao_id: 'a1',
      p_user_id: 'u-do-token',
      p_ip: '203.0.113.7',
      p_user_agent: 'Mozilla/5.0',
    });
    expect(res.corpo.ok).toBe(true);
  });

  it('corta um aparelho absurdamente longo antes de gravar', async () => {
    const supabase = supabaseQue({ data: { aceito: true } });
    await makeAceitarHandler(supabase)({
      body: { atribuicao_id: 'a1' },
      headers: { 'x-forwarded-for': '1.2.3.4', 'user-agent': 'x'.repeat(5000) },
      userId: 'u1',
    }, resposta());
    expect(supabase.rpc.mock.calls[0][1].p_user_agent).toHaveLength(500);
  });

  it('devolve 403 quando o contrato é de outra pessoa', async () => {
    const res = resposta();
    await makeAceitarHandler(supabaseQue({ error: { message: 'Este contrato é de outra pessoa.' } }))(
      { body: { atribuicao_id: 'a1' }, headers: { 'x-forwarded-for': '1.2.3.4' }, userId: 'u1' }, res);
    expect(res.code).toBe(403);
  });

  it('repassa o motivo do banco, que é o que a tela mostra', async () => {
    const res = resposta();
    await makeAceitarHandler(supabaseQue({
      error: { message: 'Este documento exige assinatura eletrônica e não pode ser aceito por aqui.' },
    }))({ body: { atribuicao_id: 'a1' }, headers: { 'x-forwarded-for': '1.2.3.4' }, userId: 'u1' }, res);
    expect(res.code).toBe(400);
    expect(res.corpo.error).toMatch(/assinatura eletrônica/);
  });

  it('404 quando a atribuição não existe', async () => {
    const res = resposta();
    await makeAceitarHandler(supabaseQue({ data: null }))(
      { body: { atribuicao_id: 'a1' }, headers: { 'x-forwarded-for': '1.2.3.4' }, userId: 'u1' }, res);
    expect(res.code).toBe(404);
  });
});

describe('o guarda do token', () => {
  const supabaseComUsuario = (u) => ({ auth: { getUser: vi.fn().mockResolvedValue(u) } });

  it('recusa sem cabeçalho de autorização', async () => {
    const res = resposta();
    await makeRequireSupabaseAuth(supabaseComUsuario({}))({ headers: {} }, res, () => {});
    expect(res.code).toBe(401);
    expect(res.corpo.error).toBe('missing_authorization');
  });

  it('recusa token inválido', async () => {
    const res = resposta();
    await makeRequireSupabaseAuth(supabaseComUsuario({ error: { message: 'bad' } }))(
      { headers: { authorization: 'Bearer xxx' } }, res, () => {});
    expect(res.code).toBe(401);
    expect(res.corpo.error).toBe('invalid_token');
  });

  it('põe no pedido o usuário do token', async () => {
    const req = { headers: { authorization: 'Bearer ok' } };
    let seguiu = false;
    await makeRequireSupabaseAuth(
      supabaseComUsuario({ data: { user: { id: 'u1', email: 'a@b.dev' } } })
    )(req, resposta(), () => { seguiu = true; });
    expect(seguiu).toBe(true);
    expect(req.userId).toBe('u1');
  });
});
