import { describe, it, expect, vi } from 'vitest';
import { createC2sApiClient } from './c2sApiClient.js';

const okBody = { data: [{ id: 'l1' }], pagination: { current_page: 1, per_page: 50, total_count: 1, total_pages: 1 } };
const jsonResp = (status, body) => ({ status, json: async () => body });

function makeClient({ fetchImpl, token = 'tok-1', env = {} } = {}) {
  let t = 0;
  const now = () => t;
  const sleep = async (ms) => { t += ms; };
  const resolver = {
    resolveConfig: vi.fn(async (tenantId) => (token ? { tenantId, apiToken: token, status: 'active' } : null)),
  };
  const client = createC2sApiClient({
    resolver, fetchImpl,
    processEnv: { C2S_BASE_URL: 'https://api.test/integration', ...env },
    now, sleep,
  });
  return { client, resolver, clock: () => t };
}

describe('c2sApiClient.getLeads', () => {
  it('monta URL com params, envia Bearer e devolve items', async () => {
    const fetchImpl = vi.fn(async () => jsonResp(200, okBody));
    const { client } = makeClient({ fetchImpl });
    const r = await client.getLeads('t1', { page: 2, perpage: 50, sort: 'updated_at', updated_gte: '2026-07-01T00:00:00Z', first_message: true });
    expect(r.ok).toBe(true);
    expect(r.items).toEqual([{ id: 'l1' }]);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toContain('https://api.test/integration/leads?');
    expect(url).toContain('page=2');
    expect(url).toContain('perpage=50');
    expect(url).toContain('sort=updated_at');
    expect(url).toContain('first_message=true');
    expect(url).toContain(encodeURIComponent('2026-07-01T00:00:00Z'));
    expect(opts.headers.authorization).toBe('Bearer tok-1');
  });

  it('hasMore vem do TAMANHO da página quando a C2S NÃO manda pagination (o feed real não manda)', async () => {
    // Bug de produção: página cheia sem `pagination` → o backfill parava na pág 1
    // e só importava os 50 leads mais antigos. Página cheia (== perpage) = há mais.
    const cheia = { data: Array.from({ length: 50 }, (_, i) => ({ id: `l${i}` })) }; // SEM pagination
    const { client } = makeClient({ fetchImpl: vi.fn(async () => jsonResp(200, cheia)) });
    const r = await client.getLeads('t1', { perpage: 50, page: 1 });
    expect(r.items).toHaveLength(50);
    expect(r.hasMore).toBe(true); // NÃO pode ser false só porque falta pagination
  });

  it('hasMore=false quando a página vem incompleta (fim do stream, sem pagination)', async () => {
    const parcial = { data: Array.from({ length: 12 }, (_, i) => ({ id: `l${i}` })) };
    const { client } = makeClient({ fetchImpl: vi.fn(async () => jsonResp(200, parcial)) });
    const r = await client.getLeads('t1', { perpage: 50, page: 1 });
    expect(r.hasMore).toBe(false);
  });

  it('se a C2S mandar total_pages, ele tem prioridade sobre o tamanho da página', async () => {
    const body = { data: Array.from({ length: 50 }, (_, i) => ({ id: `l${i}` })), pagination: { total_pages: 3, total_count: 130 } };
    const { client } = makeClient({ fetchImpl: vi.fn(async () => jsonResp(200, body)) });
    const r1 = await client.getLeads('t1', { perpage: 50, page: 1 });
    expect(r1.hasMore).toBe(true);   // page 1 < 3
    expect(r1.totalCount).toBe(130);
    const r3 = await client.getLeads('t1', { perpage: 50, page: 3 });
    expect(r3.hasMore).toBe(false);  // page 3 == total_pages, mesmo página cheia
  });

  it('sem token configurado → falha imediata sem rede', async () => {
    const fetchImpl = vi.fn();
    const { client } = makeClient({ fetchImpl, token: null });
    const r = await client.getLeads('t1', {});
    expect(r.ok).toBe(false);
    expect(r.error).toBe('missing_token');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('200 com corpo não-JSON é FALHA (não pode encerrar backfill como se a base estivesse vazia)', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => { throw new Error('html de proxy'); } }));
    const { client } = makeClient({ fetchImpl });
    const r = await client.getLeads('t1', {});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(200);
    expect(r.error).toBe('resposta_200_sem_json');
    expect(r.items).toEqual([]);
  });

  it('403 é terminal (token inválido): NÃO re-tenta', async () => {
    const fetchImpl = vi.fn(async () => jsonResp(403, { error: 'not_authorized' }));
    const { client } = makeClient({ fetchImpl });
    const r = await client.getLeads('t1', {});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('5xx re-tenta com backoff até o limite e devolve falha', async () => {
    const fetchImpl = vi.fn(async () => jsonResp(503, null));
    const { client, clock } = makeClient({ fetchImpl, env: { C2S_HTTP_RETRIES: '2' } });
    const r = await client.getLeads('t1', {});
    expect(r.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1ª + 2 retries
    expect(clock()).toBeGreaterThan(0);         // houve backoff (sleep avançou o relógio)
  });

  it('429 respeita Retry-After ("1 minute") em vez do backoff cego, e re-tenta com sucesso', async () => {
    const headers = (retryAfter) => ({ get: (k) => (k.toLowerCase() === 'retry-after' ? retryAfter : null) });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ status: 429, json: async () => null, headers: headers('1 minute') })
      .mockResolvedValueOnce({ status: 200, json: async () => okBody, headers: headers(null) });
    const { client, clock } = makeClient({ fetchImpl });
    const r = await client.getLeads('t1', {});
    expect(r.ok).toBe(true);                       // recuperou na 2ª tentativa
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(clock()).toBeGreaterThanOrEqual(60000); // esperou o minuto do Retry-After, não ~500ms
    expect(clock()).toBeLessThanOrEqual(65000);    // respeitou o cap maxRetryAfterMs
  });

  it('circuit breaker abre após N falhas e bloqueia a chamada seguinte sem rede', async () => {
    const fetchImpl = vi.fn(async () => jsonResp(500, null));
    const { client } = makeClient({ fetchImpl, env: { C2S_HTTP_RETRIES: '0', C2S_BREAKER_THRESHOLD: '2' } });
    await client.getLeads('t1', {}); // falha 1
    await client.getLeads('t1', {}); // falha 2 → abre
    const calls = fetchImpl.mock.calls.length;
    const r = await client.getLeads('t1', {});
    expect(r.status).toBe(0);
    expect(fetchImpl.mock.calls.length).toBe(calls); // nada novo: breaker aberto
  });

  it('respeita o rate limit por tenant (token bucket aguarda recarga)', async () => {
    const fetchImpl = vi.fn(async () => jsonResp(200, okBody));
    const { client, clock } = makeClient({ fetchImpl, env: { C2S_RATE_PER_MIN: '60', C2S_BURST: '1' } });
    await client.getLeads('t1', {}); // consome o único token
    await client.getLeads('t1', {}); // precisa esperar ~1s de recarga (60/min)
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(clock()).toBeGreaterThanOrEqual(950); // aguardou a recarga via sleep
  });
});

describe('c2sApiClient.getMe', () => {
  it('com apiToken explícito valida sem tocar no resolver (fluxo /config/test)', async () => {
    const fetchImpl = vi.fn(async () => jsonResp(200, { name: 'Imob X' }));
    const { client, resolver } = makeClient({ fetchImpl });
    const r = await client.getMe({ apiToken: 'raw-token' });
    expect(r.ok).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toContain('/me');
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer raw-token');
    expect(resolver.resolveConfig).not.toHaveBeenCalled();
  });

  it('com tenantId usa o token armazenado', async () => {
    const fetchImpl = vi.fn(async () => jsonResp(200, { name: 'Imob X' }));
    const { client } = makeClient({ fetchImpl });
    const r = await client.getMe({ tenantId: 't1' });
    expect(r.ok).toBe(true);
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer tok-1');
  });
});
