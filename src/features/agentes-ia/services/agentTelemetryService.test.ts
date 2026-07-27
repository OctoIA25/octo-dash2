import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do supabase client usado pelo authedFetch (sessão com access_token).
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt-token' } } })),
      refreshSession: vi.fn(async () => ({ error: null })),
    },
  },
}));

import { emitChatTelemetry, chatStatusFrom } from './agentTelemetryService';

const TENANT = '33bf7e62-78ea-44fb-a047-c7b13d9a9d7f';

describe('chatStatusFrom — retorno do webhook → status do evento', () => {
  it('resposta com texto é ok; vazia/whitespace é empty_response; falha é error', () => {
    expect(chatStatusFrom({ success: true, response: 'Olá!' })).toBe('ok');
    expect(chatStatusFrom({ success: true, response: '' })).toBe('empty_response');
    expect(chatStatusFrom({ success: true, response: '   ' })).toBe('empty_response');
    expect(chatStatusFrom({ success: true })).toBe('empty_response');
    expect(chatStatusFrom({ success: false, error: 'HTTP 500' })).toBe('error');
  });
});

describe('emitChatTelemetry — POST ao ingest, fire-and-forget', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('posta evento único com Bearer, tenant e campos do evento', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ status: 200 } as Response);

    await emitChatTelemetry({
      tenantId: TENANT,
      agentSlug: 'elaine',
      conversationId: 'conv-1',
      status: 'ok',
      durationMs: 1234,
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/v1/agent-telemetry/events');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer jwt-token');
    expect(init?.keepalive).toBe(true);
    expect(JSON.parse(init?.body as string)).toEqual({
      tenant_id: TENANT,
      agent_slug: 'elaine',
      source: 'crm_web',
      event_type: 'execution',
      status: 'ok',
      execution_id: 'conv-1',
      error_message: null,
      duration_ms: 1234,
    });
  });

  it('sem tenantId não chama a rede (ingest exige tenant uuid)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ status: 200 } as Response);

    await emitChatTelemetry({ agentSlug: 'caio', status: 'ok' });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falha de rede é silenciosa — nunca lança para o chat', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(
      emitChatTelemetry({ tenantId: TENANT, agentSlug: 'caio', status: 'error', errorMessage: 'HTTP 500' }),
    ).resolves.toBeUndefined();
  });
});
