/**
 * A rota pela qual a LIA avisa pessoas.
 *
 * O que estes testes protegem: a imobiliária vem da CHAVE (nunca do corpo);
 * reenvio devolve 200 com o mesmo id; cada erro do banco vira 422 com o campo
 * certo; laço descontrolado leva 429; erro inesperado não vaza detalhe.
 */
import { describe, it, expect, vi } from 'vitest';
import { registerComunicadosRoutes } from './routes.js';
import { createTenantRateLimiter } from '../communication/rateLimiter.js';

const resposta = () => {
  const r = { code: 200, corpo: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.corpo = b; return r; };
  r.set = (k, v) => { r.headers[k] = v; return r; };
  return r;
};

const OK = { data: [{ comunicado_id: 'c-1', destinatarios: 2, criado: true }], error: null };

function montar({ rpc = async () => OK, limiter } = {}) {
  const rotas = new Map();
  const erros = [];
  const app = { post: (caminho, ...handlers) => rotas.set(caminho, handlers), use: (_caminho, h) => erros.push(h) };
  const supabase = { rpc: vi.fn(rpc) };
  const validateApiKey = (req, _res, next) => { req.tenantId = 't-da-chave'; next(); };
  registerComunicadosRoutes(app, supabase, validateApiKey, limiter ? { limiter } : undefined);
  const [auth, handler] = rotas.get('/api/v1/comunicados');
  const chamar = async (body) => {
    const req = { body };
    const res = resposta();
    await new Promise((ok) => auth(req, res, ok));
    await handler(req, res);
    return res;
  };
  return { chamar, supabase, erros };
}

const VALIDO = {
  idempotency_key: 'lia:lead-atrasado:1',
  categoria: 'alerta',
  titulo: 'Lead sem resposta há 2h',
  mensagem: 'Maria espera retorno.',
  prioridade: 'importante',
  publico: { tipo: 'pessoas', emails: ['Joao@Lotus.com.br'], copiar_gestor: true },
  link: { tipo: 'lead', id: '8f0c2b1e-1111-4222-8333-444455556666' },
};

describe('JSON quebrado', () => {
  it('erro de parse do express.json vira 400 BODY_INVALIDO', () => {
    const { erros } = montar();
    const res = resposta();
    const next = vi.fn();
    erros[0]({ type: 'entity.parse.failed' }, {}, res, next);
    expect(res.code).toBe(400);
    expect(res.corpo.error.code).toBe('BODY_INVALIDO');
    expect(next).not.toHaveBeenCalled();
  });

  it('outro erro segue adiante', () => {
    const { erros } = montar();
    const boom = new Error('x');
    const next = vi.fn();
    erros[0](boom, {}, resposta(), next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});

describe('POST /api/v1/comunicados', () => {
  it('201 e chama publicar_comunicado com a casa da CHAVE', async () => {
    const { chamar, supabase } = montar();
    const res = await chamar({ ...VALIDO, tenant_id: 'casa-errada' });
    expect(res.code).toBe(201);
    expect(res.corpo).toEqual({ success: true, data: { id: 'c-1', destinatarios: 2, criado: true } });
    expect(supabase.rpc).toHaveBeenCalledWith('publicar_comunicado', {
      p_tenant_id: 't-da-chave',
      p_origem: 'lia',
      p_autor_user_id: null,
      p_categoria: 'alerta',
      p_titulo: 'Lead sem resposta há 2h',
      p_mensagem: 'Maria espera retorno.',
      p_prioridade: 'importante',
      p_publico_tipo: 'pessoas',
      p_equipe_ids: [],
      p_emails: ['joao@lotus.com.br'],
      p_copiar_gestor: true,
      p_link_type: 'lead',
      p_link_id: '8f0c2b1e-1111-4222-8333-444455556666',
      p_idempotency_key: 'lia:lead-atrasado:1',
    });
  });

  it('200 no reenvio (criado = false)', async () => {
    const { chamar } = montar({ rpc: async () => ({ data: [{ comunicado_id: 'c-1', destinatarios: 2, criado: false }], error: null }) });
    const res = await chamar(VALIDO);
    expect(res.code).toBe(200);
    expect(res.corpo.data.criado).toBe(false);
  });

  it.each([[null], [[1, 2]], ['texto']])('400 quando o corpo não é objeto (%j)', async (body) => {
    const { chamar, supabase } = montar();
    const res = await chamar(body);
    expect(res.code).toBe(400);
    expect(res.corpo.error.code).toBe('BODY_INVALIDO');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('422 com os campos quando o conteúdo não vale', async () => {
    const { chamar, supabase } = montar();
    const res = await chamar({ ...VALIDO, titulo: '' });
    expect(res.code).toBe(422);
    expect(res.corpo.error.code).toBe('VALIDATION_ERROR');
    expect(res.corpo.error.details).toEqual([{ campo: 'titulo', motivo: 'obrigatorio' }]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('422 DESTINATARIO_DESCONHECIDO com os e-mails', async () => {
    const { chamar } = montar({ rpc: async () => ({ data: null, error: { code: 'P0001', message: 'destinatario_desconhecido', details: 'a@x.dev, b@y.dev' } }) });
    const res = await chamar(VALIDO);
    expect(res.code).toBe(422);
    expect(res.corpo.error.details).toEqual([{ campo: 'publico.emails', motivo: 'DESTINATARIO_DESCONHECIDO', valores: ['a@x.dev', 'b@y.dev'] }]);
  });

  it.each([
    ['lead_nao_encontrado', 'link.id', 'LEAD_NAO_ENCONTRADO'],
    ['sem_destinatarios', 'publico', 'SEM_DESTINATARIOS'],
  ])('422 para %s', async (mensagem, campo, motivo) => {
    const { chamar } = montar({ rpc: async () => ({ data: null, error: { code: 'P0001', message: mensagem } }) });
    const res = await chamar(VALIDO);
    expect(res.code).toBe(422);
    expect(res.corpo.error.details).toEqual([{ campo, motivo }]);
  });

  it('429 com Retry-After quando a casa passa do limite, sem chamar o banco', async () => {
    const limiter = createTenantRateLimiter({ ratePerSec: 0, burst: 1, now: () => 0 });
    const { chamar, supabase } = montar({ limiter });
    expect((await chamar(VALIDO)).code).toBe(201);
    const res = await chamar(VALIDO);
    expect(res.code).toBe(429);
    expect(res.headers['Retry-After']).toBe('5');
    expect(res.corpo.error.code).toBe('RATE_LIMITED');
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('500 genérico em erro desconhecido do banco, sem vazar a mensagem', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { chamar } = montar({ rpc: async () => ({ data: null, error: { code: '23514', message: 'violates check constraint "comunicados_titulo_check"' } }) });
    const res = await chamar(VALIDO);
    expect(res.code).toBe(500);
    expect(JSON.stringify(res.corpo)).not.toContain('constraint');
    erro.mockRestore();
  });

  it('500 quando a chamada estoura (rede)', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { chamar } = montar({ rpc: async () => { throw new Error('fetch failed'); } });
    const res = await chamar(VALIDO);
    expect(res.code).toBe(500);
    expect(res.corpo.error.code).toBe('SERVER_ERROR');
    erro.mockRestore();
  });
});
