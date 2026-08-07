import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMetaConfig, saveMetaConfig } from '../metaLeadgenService';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt-valido' } } }) },
  },
}));

describe('metaLeadgenService', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('lê via POST /config/get com o tenantId no corpo, e manda o JWT', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, config: null }) }));
    vi.stubGlobal('fetch', f);
    await getMetaConfig('t1');
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/integrations/meta/config/get');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ tenantId: 't1' });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-valido');
  });

  it('devolve a config quando o backend responde ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, config: { pageId: 'p1', status: 'active', webhookUrl: 'https://x/y', verifyToken: 'vt' } }),
    })));
    const r = await getMetaConfig('t1');
    expect(r.ok).toBe(true);
    expect(r.config?.webhookUrl).toBe('https://x/y');
  });

  it('propaga a mensagem de erro do gate de API key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: 'api_key_ausente', message: 'Este tenant não tem API key ativa.' }),
    })));
    const r = await saveMetaConfig('t1', { status: 'active' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('API key');
  });

  it('não estoura quando a resposta não é JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => { throw new Error('not json'); },
    })));
    const r = await getMetaConfig('t1');
    expect(r.ok).toBe(false);
  });

  it('só envia os campos preenchidos — campo em branco não apaga segredo salvo', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, config: {} }) }));
    vi.stubGlobal('fetch', f);
    await saveMetaConfig('t1', { pageId: 'p1', appSecret: '', accessToken: undefined });
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.pageId).toBe('p1');
    expect('appSecret' in body).toBe(false);
    expect('accessToken' in body).toBe(false);
  });
});
