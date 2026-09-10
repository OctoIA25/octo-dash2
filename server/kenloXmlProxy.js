/**
 * 🔌 PROXY DO XML DE IMÓVEIS (/api/kenlo)
 *
 * O frontend não pode buscar o XML do tenant direto do navegador (CORS), então
 * passa por aqui: `/api/kenlo?url=<xml_url do tenant>`.
 *
 * Esta rota existia SÓ no proxy do Vite (dev). Em produção o
 * `proxy-production.js` anunciava `/api/kenlo` no banner mas nunca a registrava:
 * a requisição caía no catch-all da SPA e voltava `index.html` com HTTP 200. O
 * cliente aceitava aquilo como XML, extraía zero imóveis e — pior — o sync
 * gravava a lista vazia por cima do cache e do backup do catálogo.
 *
 * SSRF: o alvo vem da query string, então o host precisa estar na allowlist —
 * senão isto vira um proxy aberto para a rede interna do container (metadata do
 * cloud, Supabase interno, etc). A allowlist é a união de:
 *   1. os hosts já configurados em `tenant_xml_config.xml_url` (cache curto);
 *   2. `KENLO_XML_ALLOWED_HOSTS` (CSV), que cobre o onboarding — o admin
 *      sincroniza antes de salvar a URL, então o host ainda não está no banco.
 *
 * A URL do feed carrega a credencial na query (`?p=<chave>`), por isso os logs
 * registram só o host.
 */

import express from 'express';

/** Provedor conhecido; mantém o onboarding funcionando sem configurar env. */
export const HOSTS_PADRAO = ['imob.valuegaia.com.br'];

const TTL_CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 30_000;

export const hostsDoEnv = (valor) =>
  String(valor || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

/** Host de uma URL http(s); null para qualquer outra coisa. */
export const hostDaUrl = (url) => {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Decide se o alvo pode ser buscado. Pura de propósito: é a fronteira de
 * segurança da rota e precisa ser testável sem subir servidor.
 */
export const validarAlvo = (rawUrl, hostsPermitidos) => {
  if (!rawUrl) {
    return { ok: false, status: 400, erro: 'Parâmetro obrigatório ausente: url' };
  }

  let alvo;
  try {
    alvo = new URL(String(rawUrl));
  } catch {
    return { ok: false, status: 400, erro: 'URL inválida' };
  }

  if (alvo.protocol !== 'http:' && alvo.protocol !== 'https:') {
    return { ok: false, status: 400, erro: `Protocolo não suportado: ${alvo.protocol}` };
  }

  // `http://user:senha@host` engana validação por prefixo e é vetor clássico.
  if (alvo.username || alvo.password) {
    return { ok: false, status: 400, erro: 'URL com credenciais embutidas não é aceita' };
  }

  if (!hostsPermitidos.has(alvo.hostname.toLowerCase())) {
    return {
      ok: false,
      status: 403,
      erro:
        `Host não autorizado: ${alvo.hostname}. ` +
        'Salve a URL do XML nas Integrações (ela entra na allowlist) ou ' +
        'inclua o host em KENLO_XML_ALLOWED_HOSTS.',
    };
  }

  return { ok: true, alvo };
};

/**
 * Handler do proxy.
 *
 * @param {object} deps
 * @param {object} deps.supabase        cliente com service_role (lê tenant_xml_config)
 * @param {Function} [deps.fetchImpl]   injetável no teste
 * @param {number} [deps.ttlMs]         validade do cache da allowlist
 */
export const criarHandlerXml = ({
  supabase,
  fetchImpl = globalThis.fetch,
  ttlMs = TTL_CACHE_MS,
  env = process.env,
} = {}) => {
  let cache = { hosts: null, gravadoEm: 0 };

  const hostsConfigurados = async () => {
    const agora = Date.now();
    if (cache.hosts && agora - cache.gravadoEm < ttlMs) return cache.hosts;

    const hosts = new Set([...HOSTS_PADRAO, ...hostsDoEnv(env.KENLO_XML_ALLOWED_HOSTS)]);

    try {
      const { data, error } = await supabase.from('tenant_xml_config').select('xml_url');
      if (error) throw new Error(`${error.code} ${error.message}`);
      for (const linha of data ?? []) {
        const host = hostDaUrl(linha?.xml_url);
        if (host) hosts.add(host);
      }
      cache = { hosts, gravadoEm: agora };
    } catch (err) {
      // Sem o banco seguimos com env + padrão: nega mais do que deveria, mas
      // nunca libera host que ninguém configurou. Não cacheia lista degradada.
      console.error('[kenlo-proxy] não foi possível ler tenant_xml_config:', err.message);
    }

    return hosts;
  };

  return async (req, res) => {
    const permitidos = await hostsConfigurados();
    const veredito = validarAlvo(req.query?.url, permitidos);

    if (!veredito.ok) {
      console.warn('[kenlo-proxy] recusado:', veredito.erro);
      return res.status(veredito.status).json({ error: veredito.erro });
    }

    const metodo = req.method === 'POST' ? 'POST' : 'GET';

    const buscar = (url, verbo) =>
      fetchImpl(url, {
        method: verbo,
        redirect: 'manual', // seguir cego permitiria pular a allowlist via 302
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Accept: 'application/xml, text/xml, */*',
          'User-Agent': 'octo-dash/1.0',
          ...(verbo === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        ...(verbo === 'POST' ? { body: '' } : {}),
      });

    try {
      let resposta = await buscar(veredito.alvo.toString(), metodo);

      // Um salto de redirect, revalidando o destino na allowlist.
      if (resposta.status >= 300 && resposta.status < 400) {
        const destino = resposta.headers.get('location');
        const absoluto = destino ? new URL(destino, veredito.alvo).toString() : '';
        const vereditoRedirect = validarAlvo(absoluto, permitidos);
        if (!vereditoRedirect.ok) {
          console.warn('[kenlo-proxy] redirect recusado:', vereditoRedirect.erro);
          return res.status(502).json({ error: 'Redirecionamento para host não autorizado' });
        }
        resposta = await buscar(vereditoRedirect.alvo.toString(), 'GET');
      }

      const corpo = await resposta.text();

      if (!resposta.ok) {
        console.error(
          `[kenlo-proxy] upstream ${veredito.alvo.hostname} respondeu ${resposta.status}`,
        );
        return res.status(502).json({
          error: `Feed respondeu HTTP ${resposta.status}`,
          preview: corpo.slice(0, 200),
        });
      }

      res.set('Content-Type', resposta.headers.get('content-type') || 'application/xml; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      return res.send(corpo);
    } catch (err) {
      const motivo = err?.name === 'TimeoutError' ? 'timeout ao buscar o feed' : err.message;
      console.error(`[kenlo-proxy] falha em ${veredito.alvo.hostname}:`, motivo);
      return res.status(502).json({ error: `Falha ao buscar o XML: ${motivo}` });
    }
  };
};

/** Router montado em `/api/kenlo`. O handler fica separado para ser testável. */
export const criarKenloXmlProxyRouter = (deps = {}) => {
  const router = express.Router();
  router.all('/', criarHandlerXml(deps));
  return router;
};
