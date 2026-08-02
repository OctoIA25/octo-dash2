import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebhookDispatcher } from './webhookDispatch.js';

// Helpers para montar o dispatcher com dependências mockadas
function makeSupabase({ webhooks = [], error = null } = {}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            contains: () => Promise.resolve({ data: webhooks, error })
          })
        })
      })
    })
  };
}

function makeSafeUrl(ok = true) {
  return () => Promise.resolve(ok ? { ok: true } : { ok: false, reason: 'private-ip' });
}

const ONE_WEBHOOK = [{ id: 'wh-1', url: 'https://n8n.example.com/hook', secret: 'segredo', events: ['lead.created'] }];

describe('createWebhookDispatcher', () => {
  // ── Testes existentes (atualizados para incluir text() nos mocks) ──────────

  it('retorna ok:true quando não há subscriptions', async () => {
    const dispatcher = createWebhookDispatcher({
      supabase: makeSupabase({ webhooks: [] }),
      fetchImpl: vi.fn(),
      assertSafeHttpUrl: makeSafeUrl(),
      fetchTimeoutMs: 5000,
      summarizeError: String
    });

    const result = await dispatcher('tenant-1', 'lead.created', {});
    expect(result).toEqual({ ok: true });
  });

  it('retorna ok:false quando supabase lança erro de lookup', async () => {
    const dispatcher = createWebhookDispatcher({
      supabase: makeSupabase({ error: { message: 'connection refused' } }),
      fetchImpl: vi.fn(),
      assertSafeHttpUrl: makeSafeUrl(),
      fetchTimeoutMs: 5000,
      summarizeError: (e) => e.message
    });

    const result = await dispatcher('tenant-1', 'lead.created', {});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch('lookup');
  });

  it('não conta como falha quando URL é bloqueada por SSRF', async () => {
    const dispatcher = createWebhookDispatcher({
      supabase: makeSupabase({ webhooks: ONE_WEBHOOK }),
      fetchImpl: vi.fn(),
      assertSafeHttpUrl: makeSafeUrl(false),
      fetchTimeoutMs: 5000,
      summarizeError: String
    });

    const result = await dispatcher('tenant-1', 'lead.created', {});
    expect(result.ok).toBe(true);
  });

  // ── Testes novos: status + corpo da resposta ───────────────────────────────

  it('sucesso: retorna responseStatus e responseBody', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'OK' });
    const dispatcher = createWebhookDispatcher({
      supabase: makeSupabase({ webhooks: ONE_WEBHOOK }),
      fetchImpl,
      assertSafeHttpUrl: makeSafeUrl(),
      fetchTimeoutMs: 5000,
      summarizeError: String
    });

    const result = await dispatcher('tenant-1', 'lead.created', {});
    expect(result.ok).toBe(true);
    expect(result.responseStatus).toBe(200);
    expect(result.responseBody).toBe('OK');
  });

  // Antes isso era conferido lendo o texto de proxy-production.js; agora o dispatch
  // vive aqui, então dá para checar o comportamento real em vez do código-fonte.
  it('o fetch usa timeout e não segue redirects (anti-SSRF por redirect)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'OK' });
    const dispatcher = createWebhookDispatcher({
      supabase: makeSupabase({ webhooks: ONE_WEBHOOK }),
      fetchImpl,
      assertSafeHttpUrl: makeSafeUrl(),
      fetchTimeoutMs: 5000,
      summarizeError: String
    });

    await dispatcher('tenant-1', 'lead.created', {});
    const [, options] = fetchImpl.mock.calls[0];
    expect(options.redirect).toBe('manual');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('falha: retorna responseStatus e responseBody mesmo em erro HTTP', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'not found' });
    const dispatcher = createWebhookDispatcher({
      supabase: makeSupabase({ webhooks: ONE_WEBHOOK }),
      fetchImpl,
      assertSafeHttpUrl: makeSafeUrl(),
      fetchTimeoutMs: 5000,
      summarizeError: String
    });

    const result = await dispatcher('tenant-1', 'lead.created', {});
    expect(result.ok).toBe(false);
    expect(result.responseStatus).toBe(404);
    expect(result.responseBody).toBe('not found');
    expect(result.error).toMatch('404');
  });

  it('corpo truncado a 1000 chars quando a resposta é longa', async () => {
    const longBody = 'x'.repeat(5000);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => longBody });
    const dispatcher = createWebhookDispatcher({
      supabase: makeSupabase({ webhooks: ONE_WEBHOOK }),
      fetchImpl,
      assertSafeHttpUrl: makeSafeUrl(),
      fetchTimeoutMs: 5000,
      summarizeError: String
    });

    const result = await dispatcher('tenant-1', 'lead.created', {});
    expect(result.ok).toBe(true);
    expect(result.responseBody.length).toBe(1000);
  });

  it('sem subscription: ok:true sem responseStatus', async () => {
    const dispatcher = createWebhookDispatcher({
      supabase: makeSupabase({ webhooks: [] }),
      fetchImpl: vi.fn(),
      assertSafeHttpUrl: makeSafeUrl(),
      fetchTimeoutMs: 5000,
      summarizeError: String
    });

    const result = await dispatcher('tenant-1', 'lead.created', {});
    expect(result.ok).toBe(true);
    expect(result.responseStatus).toBeUndefined();
  });
});
