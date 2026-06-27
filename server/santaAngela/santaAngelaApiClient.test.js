import { describe, it, expect } from 'vitest';
import { createSantaAngelaApiClient } from './santaAngelaApiClient.js';

const cfg = { tenantId: 't1', baseUrl: 'https://api', apiKey: 'k', status: 'active', source: 'db' };
const resolverWith = (c) => ({ resolveConfig: async () => c });

it('fetchLeads envia Bearer e retorna prospects', async () => {
  let seen;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return { ok: true, status: 200, json: async () => ({ prospects: [{ id: '1' }] }) };
  };
  const client = createSantaAngelaApiClient({ resolver: resolverWith(cfg), fetchImpl });
  const r = await client.fetchLeads('t1');
  expect(r.ok).toBe(true);
  expect(r.leads.length).toBe(1);
  expect(seen.url).toBe('https://api');
  expect(seen.opts.headers.Authorization).toBe('Bearer k');
});

it('fetchLeads sem config retorna erro claro', async () => {
  const client = createSantaAngelaApiClient({ resolver: resolverWith(null), fetchImpl: async () => ({}) });
  const r = await client.fetchLeads('t2');
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/config/i);
});

it('fetchLeads propaga HTTP não-ok', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const client = createSantaAngelaApiClient({ resolver: resolverWith(cfg), fetchImpl });
  const r = await client.fetchLeads('t1');
  expect(r.ok).toBe(false);
  expect(r.status).toBe(401);
});

it('fetchLeads aborta no timeout (AbortError vira erro de timeout)', async () => {
  // fetch que respeita o signal: rejeita com AbortError quando o controller aborta.
  const fetchImpl = (url, opts) => new Promise((_resolve, reject) => {
    opts.signal.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; reject(e);
    });
  });
  const client = createSantaAngelaApiClient({ resolver: resolverWith(cfg), fetchImpl, timeoutMs: 10 });
  const r = await client.fetchLeads('t1');
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/timeout/);
});
