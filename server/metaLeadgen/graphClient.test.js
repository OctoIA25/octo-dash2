import { describe, it, expect, vi } from 'vitest';
import { createMetaGraphClient } from './graphClient.js';

const ENV = { META_HTTP_RETRIES: '2', META_HTTP_BACKOFF_MS: '0' };
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const fail = (status, body = {}) => ({ ok: false, status, json: async () => body });

const make = (fetchImpl) =>
  createMetaGraphClient({ fetchImpl, processEnv: ENV, sleep: async () => {} });

describe('fetchLead', () => {
  it('devolve o lead e pede os campos certos', async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 'lg-1', field_data: [] }));
    const r = await make(fetchImpl).fetchLead('lg-1', 'tok');
    expect(r.ok).toBe(true);
    expect(r.lead.id).toBe('lg-1');

    const url = fetchImpl.mock.calls[0][0];
    expect(url).toContain('/v21.0/lg-1');
    expect(url).toContain('field_data');
    expect(url).toContain('platform');
  });

  it('manda o token no header, nunca na query string', async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 'lg-1' }));
    await make(fetchImpl).fetchLead('lg-1', 'tok-secreto');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).not.toContain('tok-secreto');
    expect(init.headers.authorization).toBe('Bearer tok-secreto');
  });

  // Classificação retriable vs permanente: por HTTP status (RETRIABLE) e por
  // error.code no corpo (rate limit/transient da Meta, que não usa 429).
  // Cada linha é um caso documentado — o título aparece no relatório do teste
  // se aquele código específico regredir.
  it.each([
    ['401 é permanente — token inválido não melhora com retry', 401, {}, false, 1],
    ['400 é permanente', 400, {}, false, 1],
    ['500 tenta de novo e desiste como retriable', 500, {}, true, 2],
    ['429 tenta de novo', 429, {}, true, 2],
    ['HTTP 403 com error.code 4 (rate limit) é retriable', 403, { error: { code: 4, message: 'Application request limit reached' } }, true, 2],
    ['HTTP 400 com error.code 17 (user rate limit) é retriable', 400, { error: { code: 17 } }, true, 2],
    ['HTTP 400 com error.code 2 e is_transient true é retriable', 400, { error: { code: 2, is_transient: true } }, true, 2],
    ['HTTP 400 com error.code 100 (inválido) é permanente', 400, { error: { code: 100, message: 'Invalid parameter' } }, false, 1],
    ['HTTP 401 com error.code 190 (token revogado) é permanente', 401, { error: { code: 190 } }, false, 1],
  ])('%s', async (_title, status, body, expectRetriable, expectCalls) => {
    const fetchImpl = vi.fn(async () => fail(status, body));
    const r = await make(fetchImpl).fetchLead('lg-1', 'tok');
    expect(r.ok).toBe(false);
    expect(r.retriable).toBe(expectRetriable);
    expect(fetchImpl).toHaveBeenCalledTimes(expectCalls);
  });

  it('recupera no segundo attempt', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => (++n === 1 ? fail(503) : ok({ id: 'lg-1' })));
    const r = await make(fetchImpl).fetchLead('lg-1', 'tok');
    expect(r.ok).toBe(true);
  });

  it('erro de rede é retriable', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const r = await make(fetchImpl).fetchLead('lg-1', 'tok');
    expect(r.ok).toBe(false);
    expect(r.retriable).toBe(true);
    expect(r.status).toBeNull();
  });

  it('sem token não chama a Meta', async () => {
    const fetchImpl = vi.fn();
    const r = await make(fetchImpl).fetchLead('lg-1', null);
    expect(r.ok).toBe(false);
    expect(r.retriable).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // Sem o clamp em metaConfig, o laço não roda nenhuma vez e fetchLead devolve
  // `null` — o processor estoura no `fetched.ok`.
  it('META_HTTP_RETRIES=0 ainda devolve um resultado, nunca null', async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 'lg-1' }));
    const client = createMetaGraphClient({ fetchImpl, processEnv: { META_HTTP_RETRIES: '0' }, sleep: async () => {} });
    const r = await client.fetchLead('lg-1', 'tok');
    expect(r).not.toBeNull();
    expect(r.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // 2xx com corpo não-JSON: `{ ok: true, lead: null }` explodiria no normalizer.
  it('2xx com corpo nulo é falha retriable, não sucesso', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('não é JSON'); } }));
    const r = await make(fetchImpl).fetchLead('lg-1', 'tok');
    expect(r.ok).toBe(false);
    expect(r.retriable).toBe(true);
    expect(r.error).toContain('sem corpo JSON');
  });

  it('a mensagem de erro não vaza o token', async () => {
    const fetchImpl = vi.fn(async () => fail(401, { error: { message: 'bad token' } }));
    const r = await make(fetchImpl).fetchLead('lg-1', 'tok-secreto');
    expect(JSON.stringify(r)).not.toContain('tok-secreto');
  });
});
