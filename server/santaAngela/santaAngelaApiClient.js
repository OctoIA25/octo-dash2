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

export function createSantaAngelaApiClient({
  resolver, fetchImpl = fetch, now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), logger = noopLogger,
  processEnv = process.env, timeoutMs,
}) {
  const effectiveTimeoutMs = timeoutMs ?? (Number(processEnv.SANTA_ANGELA_HTTP_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const limiter = createTenantRateLimiter({ ratePerSec: RATE_PER_SEC, burst: BURST, now });

  async function waitForToken(tenantId) {
    while (!limiter.tryRemove(tenantId, 1)) await sleep(50);
  }

  async function fetchLeads(tenantId) {
    const cfg = await resolver.resolveConfig(tenantId);
    if (!cfg || !cfg.apiKey || !cfg.baseUrl) {
      return { ok: false, leads: [], status: 0, error: 'config Santa Ângela ausente para o tenant' };
    }
    if (cfg.status !== 'active') {
      return { ok: false, leads: [], status: 0, error: 'integração inativa' };
    }
    await waitForToken(tenantId);
    // Timeout por requisição: um tenant com a API pendurada não pode travar o
    // ciclo. AbortController dispara após timeoutMs e o fetch rejeita (cai no catch).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
    try {
      const resp = await fetchImpl(cfg.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(DEFAULT_BODY),
        signal: controller.signal,
      });
      if (!resp.ok) {
        logger.warn(`[santa-angela] HTTP ${resp.status} tenant=${tenantId}`);
        return { ok: false, leads: [], status: resp.status, error: `HTTP ${resp.status}` };
      }
      const data = await resp.json();
      return { ok: true, leads: data.prospects || [], status: resp.status };
    } catch (err) {
      const error = err?.name === 'AbortError' ? `timeout após ${effectiveTimeoutMs}ms` : (err?.message || 'erro de rede');
      return { ok: false, leads: [], status: 0, error };
    } finally {
      clearTimeout(timer);
    }
  }

  return { fetchLeads };
}
