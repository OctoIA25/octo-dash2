/**
 * A rota /api/kenlo só existia no proxy do Vite: em produção caía no catch-all
 * da SPA e devolvia index.html com HTTP 200. Estes testes cobrem a rota nova e,
 * principalmente, a allowlist — o alvo vem da query string, então sem ela o
 * endpoint seria um proxy aberto para a rede interna do container.
 */
import { describe, it, expect, vi } from 'vitest';
import { validarAlvo, hostDaUrl, hostsDoEnv, criarHandlerXml } from './kenloXmlProxy.js';

const permitidos = new Set(['imob.valuegaia.com.br']);

const resposta = ({ status = 200, corpo = '<Document/>', headers = {} } = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => corpo,
  headers: { get: (h) => headers[h.toLowerCase()] ?? null },
});

const fakeRes = () => ({
  code: 200,
  corpo: null,
  headers: {},
  status(c) { this.code = c; return this; },
  json(b) { this.corpo = b; return this; },
  send(b) { this.corpo = b; return this; },
  set(k, v) { this.headers[k] = v; return this; },
});

const supabaseCom = (linhas, error = null) => ({
  from: () => ({ select: async () => ({ data: linhas, error }) }),
});

describe('validarAlvo — fronteira de SSRF', () => {
  it('aceita host que está na allowlist', () => {
    const r = validarAlvo('https://imob.valuegaia.com.br/integra/midia.ashx?p=x', permitidos);
    expect(r.ok).toBe(true);
  });

  it('recusa host fora da allowlist', () => {
    const r = validarAlvo('https://evil.example.com/x.xml', permitidos);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });

  it('recusa o endpoint de metadata da cloud (o alvo clássico de SSRF)', () => {
    expect(validarAlvo('http://169.254.169.254/latest/meta-data/', permitidos).ok).toBe(false);
  });

  it('recusa localhost e rede interna', () => {
    expect(validarAlvo('http://localhost:8080/api/info', permitidos).ok).toBe(false);
    expect(validarAlvo('http://127.0.0.1/', permitidos).ok).toBe(false);
    expect(validarAlvo('http://10.0.0.5/', permitidos).ok).toBe(false);
  });

  it('recusa protocolo que não seja http(s)', () => {
    expect(validarAlvo('file:///etc/passwd', permitidos).ok).toBe(false);
    expect(validarAlvo('gopher://imob.valuegaia.com.br/', permitidos).ok).toBe(false);
  });

  it('recusa credenciais embutidas que fingem o host permitido', () => {
    const r = validarAlvo('http://imob.valuegaia.com.br@evil.example.com/', permitidos);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it('sem url é 400, não 403 — é erro de chamada, não de permissão', () => {
    expect(validarAlvo(undefined, permitidos)).toMatchObject({ ok: false, status: 400 });
  });

  it('compara host sem diferenciar caixa', () => {
    expect(validarAlvo('https://IMOB.ValueGaia.com.BR/x', permitidos).ok).toBe(true);
  });
});

describe('hostDaUrl / hostsDoEnv', () => {
  it('extrai o host de uma URL http(s) e ignora o resto', () => {
    expect(hostDaUrl('https://A.example.com/x?p=1')).toBe('a.example.com');
    expect(hostDaUrl('file:///etc/passwd')).toBeNull();
    expect(hostDaUrl('não é url')).toBeNull();
    expect(hostDaUrl(null)).toBeNull();
  });

  it('lê CSV do env tolerando espaço e caixa', () => {
    expect(hostsDoEnv(' A.com , b.com ,, ')).toEqual(['a.com', 'b.com']);
    expect(hostsDoEnv(undefined)).toEqual([]);
  });
});

describe('handler /api/kenlo', () => {
  it('repassa o XML do feed quando o host é permitido', async () => {
    const fetchImpl = vi.fn(async () => resposta({ corpo: '<Document><imoveis/></Document>' }));
    const handler = criarHandlerXml({ supabase: supabaseCom([]), fetchImpl, env: {} });
    const res = fakeRes();

    await handler({ method: 'GET', query: { url: 'https://imob.valuegaia.com.br/f.xml' } }, res);

    expect(res.code).toBe(200);
    expect(res.corpo).toBe('<Document><imoveis/></Document>');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('libera o host que o tenant configurou em tenant_xml_config', async () => {
    const fetchImpl = vi.fn(async () => resposta());
    const handler = criarHandlerXml({
      supabase: supabaseCom([{ xml_url: 'https://feed.outroprovedor.com/x.xml' }]),
      fetchImpl,
      env: {},
    });
    const res = fakeRes();

    await handler({ method: 'GET', query: { url: 'https://feed.outroprovedor.com/x.xml' } }, res);

    expect(res.code).toBe(200);
  });

  it('libera host vindo de KENLO_XML_ALLOWED_HOSTS (onboarding, antes de salvar)', async () => {
    const fetchImpl = vi.fn(async () => resposta());
    const handler = criarHandlerXml({
      supabase: supabaseCom([]),
      fetchImpl,
      env: { KENLO_XML_ALLOWED_HOSTS: 'novo.provedor.com' },
    });
    const res = fakeRes();

    await handler({ method: 'GET', query: { url: 'https://novo.provedor.com/x.xml' } }, res);

    expect(res.code).toBe(200);
  });

  it('nega host desconhecido sem sequer chamar fetch', async () => {
    const fetchImpl = vi.fn();
    const handler = criarHandlerXml({ supabase: supabaseCom([]), fetchImpl, env: {} });
    const res = fakeRes();

    await handler({ method: 'GET', query: { url: 'http://169.254.169.254/' } }, res);

    expect(res.code).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('não segue redirect para fora da allowlist', async () => {
    const fetchImpl = vi.fn(async () =>
      resposta({ status: 302, headers: { location: 'http://169.254.169.254/' } }),
    );
    const handler = criarHandlerXml({ supabase: supabaseCom([]), fetchImpl, env: {} });
    const res = fakeRes();

    await handler({ method: 'GET', query: { url: 'https://imob.valuegaia.com.br/f.xml' } }, res);

    expect(res.code).toBe(502);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('segue um redirect que continua dentro da allowlist', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        resposta({ status: 302, headers: { location: 'https://imob.valuegaia.com.br/real.xml' } }),
      )
      .mockResolvedValueOnce(resposta({ corpo: '<Document/>' }));
    const handler = criarHandlerXml({ supabase: supabaseCom([]), fetchImpl, env: {} });
    const res = fakeRes();

    await handler({ method: 'GET', query: { url: 'https://imob.valuegaia.com.br/f.xml' } }, res);

    expect(res.code).toBe(200);
    expect(res.corpo).toBe('<Document/>');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('erro do feed vira 502 com preview, não 200 com corpo estranho', async () => {
    const fetchImpl = vi.fn(async () => resposta({ status: 500, corpo: 'boom' }));
    const handler = criarHandlerXml({ supabase: supabaseCom([]), fetchImpl, env: {} });
    const res = fakeRes();

    await handler({ method: 'GET', query: { url: 'https://imob.valuegaia.com.br/f.xml' } }, res);

    expect(res.code).toBe(502);
    expect(res.corpo.error).toContain('500');
  });

  it('banco fora do ar não abre a allowlist — só o padrão continua valendo', async () => {
    const fetchImpl = vi.fn(async () => resposta());
    const handler = criarHandlerXml({
      supabase: supabaseCom(null, { code: '57014', message: 'timeout' }),
      fetchImpl,
      env: {},
    });

    const negado = fakeRes();
    await handler({ method: 'GET', query: { url: 'https://feed.outroprovedor.com/x.xml' } }, negado);
    expect(negado.code).toBe(403);

    const permitido = fakeRes();
    await handler({ method: 'GET', query: { url: 'https://imob.valuegaia.com.br/f.xml' } }, permitido);
    expect(permitido.code).toBe(200);
  });

  it('não cacheia allowlist degradada: volta a consultar o banco na requisição seguinte', async () => {
    let falhar = true;
    const supabase = {
      from: () => ({
        select: async () =>
          falhar
            ? { data: null, error: { code: '57014', message: 'timeout' } }
            : { data: [{ xml_url: 'https://feed.outroprovedor.com/x.xml' }], error: null },
      }),
    };
    const fetchImpl = vi.fn(async () => resposta());
    const handler = criarHandlerXml({ supabase, fetchImpl, env: {} });

    const antes = fakeRes();
    await handler({ method: 'GET', query: { url: 'https://feed.outroprovedor.com/x.xml' } }, antes);
    expect(antes.code).toBe(403);

    falhar = false;
    const depois = fakeRes();
    await handler({ method: 'GET', query: { url: 'https://feed.outroprovedor.com/x.xml' } }, depois);
    expect(depois.code).toBe(200);
  });
});
