/**
 * Cliente HTTP autenticado da API de leads Santa Ângela. Auth é Bearer estático
 * (vem do resolver, por tenant). Rate-limit por tenant reusa o token bucket comum.
 * Mantém a lógica de negócio (sync) limpa, espelhando KenloApiClient (porém sem
 * refresh/login — a key não expira).
 */
import { createTenantRateLimiter } from '../communication/rateLimiter.js';

const noopLogger = { info() {}, warn() {}, error() {} };
const RATE_PER_SEC = 5;
const BURST = 10;
const DEFAULT_TIMEOUT_MS = 15000; // aborta um fetch pendurado (espelha KenloApiClient)
const EMPREENDIMENTOS_TTL_MS = 60 * 60 * 1000;

// Body padrão: traz todos os termômetros/situações (portado do client).
const DEFAULT_BODY = {
  filtro: {
    cliente_novo: '1', cliente_atendimento: '1', cliente_banco_compradores: '1',
    cliente_banco_nao_compradores: '1', iniciado_com: '',
    cliente_termometro_frio: '1', cliente_termometro_morno: '1', cliente_termometro_quente: '1',
    query: '', cadastradas_no_mes: '0', sem_contato_mais_uma_semana: '0',
    com_atividade_agendada_proximo_trinta_dias: '0', customizado: '0', filtro_customizado: null,
    data_vigencia_avaliacao_vencida: '0', data_vigencia_avaliacao_pendente: '0',
    possui_propostas_com_data_vigencia_avaliacao_pendente: '0',
  },
  paginacao: { paginaAtual: 1, porPagina: 100 },
  ordenacao: { coluna: 'PESSOA.datahoracadastro', tipo: 'DESC' },
};

// A config guarda a URL do grid (…/prospects/grid/v2). Os demais recursos vivem
// na mesma raiz da API, então derivamos em vez de pedir uma segunda URL por tenant.
const apiRoot = (baseUrl) => baseUrl.replace(/\/prospects\/grid\/v2\/?$/, '');

export function createSantaAngelaApiClient({
  resolver, fetchImpl = fetch, now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), logger = noopLogger,
  processEnv = process.env, timeoutMs,
}) {
  const effectiveTimeoutMs = timeoutMs ?? (Number(processEnv.SANTA_ANGELA_HTTP_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const limiter = createTenantRateLimiter({ ratePerSec: RATE_PER_SEC, burst: BURST, now });
  // Empreendimentos mudam raramente (14 no tenant real) e são consultados uma vez
  // por lead novo — sem cache, seriam N requisições idênticas por ciclo.
  const empreendimentosCache = new Map(); // tenantId → { byId: Map, at: number }

  async function waitForToken(tenantId) {
    while (!limiter.tryRemove(tenantId, 1)) await sleep(50);
  }

  // Requisição autenticada + rate-limited + com timeout. Único ponto que fala HTTP.
  async function request(tenantId, { url, method = 'GET', body }) {
    const cfg = await resolver.resolveConfig(tenantId);
    if (!cfg || !cfg.apiKey || !cfg.baseUrl) {
      return { ok: false, status: 0, error: 'config Santa Ângela ausente para o tenant' };
    }
    if (cfg.status !== 'active') {
      return { ok: false, status: 0, error: 'integração inativa' };
    }
    await waitForToken(tenantId);
    // Timeout por requisição: um tenant com a API pendurada não pode travar o
    // ciclo. AbortController dispara após timeoutMs e o fetch rejeita (cai no catch).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
    try {
      const resp = await fetchImpl(url ? `${apiRoot(cfg.baseUrl)}${url}` : cfg.baseUrl, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      if (!resp.ok) {
        logger.warn(`[santa-angela] HTTP ${resp.status} tenant=${tenantId} ${url || 'grid'}`);
        return { ok: false, status: resp.status, error: `HTTP ${resp.status}` };
      }
      return { ok: true, status: resp.status, data: await resp.json() };
    } catch (err) {
      const error = err?.name === 'AbortError' ? `timeout após ${effectiveTimeoutMs}ms` : (err?.message || 'erro de rede');
      return { ok: false, status: 0, error };
    } finally {
      clearTimeout(timer);
    }
  }

  // `page` > 1 é usado só pelo primeiro sync de um tenant (backfill da base
  // histórica); o polling normal continua lendo apenas a página 1.
  async function fetchLeads(tenantId, page = 1) {
    const body = { ...DEFAULT_BODY, paginacao: { ...DEFAULT_BODY.paginacao, paginaAtual: page } };
    const r = await request(tenantId, { method: 'POST', body });
    if (!r.ok) return { ok: false, leads: [], status: r.status, error: r.error };
    return {
      ok: true,
      leads: r.data?.prospects || [],
      status: r.status,
      ultimaPagina: Number(r.data?.paginacao?.ultimaPagina) || 1,
    };
  }

  // O grid NÃO traz o imóvel — só o detalhe do prospect tem `empreendimento_id`.
  // Sem isso o lead chega na Lia sem saber de qual empreendimento se trata.
  async function fetchProspectDetail(tenantId, prospectId) {
    if (!prospectId) return null;
    const r = await request(tenantId, { url: `/prospects/${encodeURIComponent(prospectId)}` });
    // Prospect de outra carteira responde 400 ("você não tem acesso") — é esperado,
    // não é falha do ciclo: o lead entra sem código em vez de derrubar o sync.
    if (!r.ok) { logger.info(`[santa-angela] detalhe indisponível prospect=${prospectId}: ${r.error}`); return null; }
    return r.data || null;
  }

  // id do empreendimento → { id, codigo, nome }. Cacheado por tenant (TTL 1h).
  async function fetchEmpreendimentos(tenantId) {
    const cached = empreendimentosCache.get(tenantId);
    if (cached && now() - cached.at < EMPREENDIMENTOS_TTL_MS) return cached.byId;

    const r = await request(tenantId, { url: '/empreendimentos' });
    if (!r.ok || !Array.isArray(r.data)) {
      logger.warn(`[santa-angela] empreendimentos indisponíveis tenant=${tenantId}: ${r.error || 'resposta inesperada'}`);
      return cached?.byId || new Map(); // mantém o último bom: melhor código velho que nenhum
    }
    const byId = new Map(r.data
      .filter((e) => e?.id != null)
      .map((e) => [String(e.id), { id: String(e.id), codigo: e.codigo_empreendimento ?? null, nome: e.nome ?? null }]));
    empreendimentosCache.set(tenantId, { byId, at: now() });
    return byId;
  }

  return { fetchLeads, fetchProspectDetail, fetchEmpreendimentos };
}
