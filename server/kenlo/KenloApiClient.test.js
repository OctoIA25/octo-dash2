import { describe, it, expect, vi } from 'vitest';
import { createKenloApiClient } from './KenloApiClient.js';

const integration = { tenant_id: 't1' };
const ENV = { KENLO_HTTP_RETRIES: '2', KENLO_HTTP_BACKOFF_MS: '1', KENLO_RATE_PER_SEC: '1000', KENLO_BURST: '1000' };
const authStub = (token = 'TKN') => ({ getToken: vi.fn().mockResolvedValue(token), refresh: vi.fn().mockResolvedValue('TKN2') });
const okResp = (body) => ({ ok: true, status: 200, json: async () => body });
const errResp = (status) => ({ ok: false, status, json: async () => ({}) });

describe('KenloApiClient', () => {
  it('faz GET com Bearer e retorna body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResp({ data: [1] }));
    const client = createKenloApiClient({ authService: authStub(), fetchImpl, processEnv: ENV, sleep: async () => {} });
    const r = await client.getJson(integration, 'https://leads.ingaia.com.br/x');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ data: [1] });
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer TKN');
  });

  it('retry em 5xx e depois sucesso', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(errResp(503)).mockResolvedValueOnce(okResp({ ok: 1 }));
    const client = createKenloApiClient({ authService: authStub(), fetchImpl, processEnv: ENV, sleep: async () => {} });
    const r = await client.getJson(integration, 'https://x');
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('NÃO faz retry em 404', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errResp(404));
    const client = createKenloApiClient({ authService: authStub(), fetchImpl, processEnv: ENV, sleep: async () => {} });
    const r = await client.getJson(integration, 'https://x');
    expect(r.status).toBe(404);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('401 dispara refresh e repete UMA vez', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(errResp(401)).mockResolvedValueOnce(okResp({ ok: 1 }));
    const auth = authStub();
    const client = createKenloApiClient({ authService: auth, fetchImpl, processEnv: ENV, sleep: async () => {} });
    const r = await client.getJson(integration, 'https://x');
    expect(auth.refresh).toHaveBeenCalledOnce();
    expect(r.status).toBe(200);
    expect(fetchImpl.mock.calls[1][1].headers.authorization).toBe('Bearer TKN2');
  });

  it('breaker abre após N falhas e recusa rápido', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errResp(500));
    const client = createKenloApiClient({
      authService: authStub(), fetchImpl, sleep: async () => {},
      processEnv: { ...ENV, KENLO_BREAKER_THRESHOLD: '1', KENLO_BREAKER_COOLDOWN_MS: '999999' },
    });
    await client.getJson(integration, 'https://x'); // falha → abre
    const callsAfterFirst = fetchImpl.mock.calls.length;
    const r = await client.getJson(integration, 'https://x'); // breaker aberto
    expect(r.status).toBe(0);
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst); // não chamou de novo
  });
});
