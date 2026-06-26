import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do supabase client (sessão com access_token).
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt-token' } } })),
    },
  },
}));

import { previewDisparo, confirmDisparo, getRunReport } from './disparadorService';

describe('disparadorService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('previewDisparo posta comando com Authorization Bearer', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ ok: true, previewToken: 'tok', preview: { foundCount: 3 } }),
    } as Response);

    const r = await previewDisparo('t1', 'arquivados');
    expect(r.ok).toBe(true);
    expect(r.previewToken).toBe('tok');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/v1/communication/dispatch/preview');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer jwt-token');
    expect(JSON.parse(init?.body as string)).toEqual({ tenantId: 't1', command: 'arquivados' });
  });

  it('confirmDisparo envia previewToken e mensagem', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ ok: true, enqueued: 2, runId: 'run-1' }),
    } as Response);

    const r = await confirmDisparo('t1', 'tok', 'Olá!');
    expect(r).toEqual({ ok: true, enqueued: 2, runId: 'run-1' });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body).toEqual({ tenantId: 't1', previewToken: 'tok', message: 'Olá!' });
  });

  it('getRunReport monta querystring com tenant e runId', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ ok: true, run: { id: 'run-1', sent_count: 2 } }),
    } as Response);

    await getRunReport('t1', 'run-1');
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/api/v1/communication/dispatch/runs/run-1');
    expect(url).toContain('tenantId=t1');
  });

  it('previewDisparo envia audienceId quando fornecido (sem command)', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, previewToken: 'tok', preview: { foundCount: 5 } }) } as Response);
    await previewDisparo('t1', undefined, 'aud-1');
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ tenantId: 't1', audienceId: 'aud-1' });
  });
  it('confirmDisparo envia templateName quando fornecido', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, runId: 'r' }) } as Response);
    await confirmDisparo('t1', 'tok', 'Olá', 'promo');
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toEqual({ tenantId: 't1', previewToken: 'tok', message: 'Olá', templateName: 'promo' });
  });
  it('confirmDisparo envia variableMapping quando fornecido', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue({ json: async () => ({ ok: true, runId: 'r' }) } as Response);
    const mapping = { 1: { type: 'lead_field' as const, value: 'name' } };
    await confirmDisparo('t1', 'tok', 'Olá', 'promo', mapping);
    expect(JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)).toEqual({ tenantId: 't1', previewToken: 'tok', message: 'Olá', templateName: 'promo', variableMapping: mapping });
  });
});
