import { describe, it, expect } from 'vitest';
import { fetchCostReport, AnthropicApiError } from './client.js';

// fetch fake: responde por sequência de páginas
function fakeFetch(pages) {
  let i = 0;
  return async () => {
    const page = pages[i++];
    return {
      ok: page.ok !== false,
      status: page.status ?? 200,
      json: async () => page.body,
    };
  };
}

const okPage = (data, next = null) => ({ body: { data, has_more: Boolean(next), next_page: next } });

describe('fetchCostReport', () => {
  it('agrega buckets de todas as páginas (segue next_page)', async () => {
    const fetchImpl = fakeFetch([
      okPage([{ starting_at: 'a', results: [{ amount: '100', currency: 'USD' }] }], 'p2'),
      okPage([{ starting_at: 'b', results: [{ amount: '200', currency: 'USD' }] }], null),
    ]);
    const buckets = await fetchCostReport({ apiKey: 'sk-ant-admin01-x', startingAt: 's', endingAt: 'e', fetchImpl });
    expect(buckets).toHaveLength(2);
    expect(buckets[0].results[0].amount).toBe('100');
    expect(buckets[1].results[0].amount).toBe('200');
  });

  it('401 → AnthropicApiError code=unauthorized', async () => {
    const fetchImpl = fakeFetch([{ ok: false, status: 401, body: {} }]);
    await expect(fetchCostReport({ apiKey: 'k', startingAt: 's', endingAt: 'e', fetchImpl }))
      .rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('403 → forbidden, 429 → rate_limited, 500 → provider_error', async () => {
    for (const [status, code] of [[403, 'forbidden'], [429, 'rate_limited'], [500, 'provider_error']]) {
      const fetchImpl = fakeFetch([{ ok: false, status, body: {} }]);
      await expect(fetchCostReport({ apiKey: 'k', startingAt: 's', endingAt: 'e', fetchImpl }))
        .rejects.toMatchObject({ code });
    }
  });

  it('body sem data → invalid_response', async () => {
    const fetchImpl = fakeFetch([{ body: { nope: true } }]);
    await expect(fetchCostReport({ apiKey: 'k', startingAt: 's', endingAt: 'e', fetchImpl }))
      .rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('AbortError → timeout', async () => {
    const fetchImpl = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    await expect(fetchCostReport({ apiKey: 'k', startingAt: 's', endingAt: 'e', fetchImpl, timeoutMs: 5 }))
      .rejects.toMatchObject({ code: 'timeout' });
  });
});
