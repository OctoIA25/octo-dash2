import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordHeartbeat, __resetHeartbeatState } from './heartbeat.js';

// Supabase mock: captura o payload do upsert e permite simular erro do banco.
function makeSupabase({ error = null } = {}) {
  const calls = [];
  return {
    calls,
    from: (table) => ({
      upsert: (payload, opts) => {
        calls.push({ table, payload, opts });
        return Promise.resolve({ error });
      },
    }),
  };
}

beforeEach(() => {
  __resetHeartbeatState();
  delete process.env.HC_OUTBOX_WORKER_URL;
  delete process.env.HC_KENLO_SYNC_URL;
});

describe('recordHeartbeat', () => {
  it('faz UPSERT com job_name, last_run_at e last_result', async () => {
    const supabase = makeSupabase();
    await recordHeartbeat(supabase, 'kenlo_sync', { result: { fetched: 3 }, durationMs: 120, now: 1000 });

    expect(supabase.calls).toHaveLength(1);
    const { table, payload, opts } = supabase.calls[0];
    expect(table).toBe('job_heartbeats');
    expect(opts).toEqual({ onConflict: 'job_name' });
    expect(payload.job_name).toBe('kenlo_sync');
    expect(payload.last_run_at).toBe(new Date(1000).toISOString());
    expect(payload.last_result).toMatchObject({
      summary: { fetched: 3 }, duration_ms: 120, ok: true, consecutive_failures: 0,
    });
  });

  it('nunca lança — erro do banco vira warn, não propaga', async () => {
    const supabase = makeSupabase({ error: { message: 'db down' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(recordHeartbeat(supabase, 'kenlo_sync', { now: 1 })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('nunca lança — supabase que estoura exceção é absorvido', async () => {
    const supabase = { from: () => { throw new Error('boom'); } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(recordHeartbeat(supabase, 'c2s_sync', { now: 1 })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('Healthchecks falhando não quebra o heartbeat', async () => {
    process.env.HC_KENLO_SYNC_URL = 'https://hc-ping.com/uuid';
    const supabase = makeSupabase();
    const fetchImpl = vi.fn(() => Promise.reject(new Error('rede fora')));
    await expect(
      recordHeartbeat(supabase, 'kenlo_sync', { ok: true, now: 1, fetchImpl }),
    ).resolves.toBeUndefined();
    expect(supabase.calls).toHaveLength(1); // upsert ocorreu apesar do ping falhar
  });

  it('não pinga Healthchecks quando o ciclo falhou (ok=false)', async () => {
    process.env.HC_KENLO_SYNC_URL = 'https://hc-ping.com/uuid';
    const supabase = makeSupabase();
    const fetchImpl = vi.fn(() => Promise.resolve({ ok: true }));
    await recordHeartbeat(supabase, 'kenlo_sync', { ok: false, now: 1, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('incrementa consecutive_failures em falhas seguidas e zera no sucesso', async () => {
    const supabase = makeSupabase();
    await recordHeartbeat(supabase, 'c2s_sync', { ok: false, now: 1 });
    await recordHeartbeat(supabase, 'c2s_sync', { ok: false, now: 2 });
    await recordHeartbeat(supabase, 'c2s_sync', { ok: true, now: 3 });
    const results = supabase.calls.map((c) => c.payload.last_result.consecutive_failures);
    expect(results).toEqual([1, 2, 0]);
  });

  describe('throttle do outbox_worker', () => {
    it('amostra ~1x/min: segundo tick dentro da janela é ignorado', async () => {
      const supabase = makeSupabase();
      await recordHeartbeat(supabase, 'outbox_worker', { ok: true, now: 0 });
      await recordHeartbeat(supabase, 'outbox_worker', { ok: true, now: 5_000 });  // +5s: dentro da janela
      expect(supabase.calls).toHaveLength(1);
    });

    it('grava de novo após a janela de 60s', async () => {
      const supabase = makeSupabase();
      await recordHeartbeat(supabase, 'outbox_worker', { ok: true, now: 0 });
      await recordHeartbeat(supabase, 'outbox_worker', { ok: true, now: 61_000 });
      expect(supabase.calls).toHaveLength(2);
    });

    it('falha (ok=false) ignora o throttle — degradação nunca é suprimida', async () => {
      const supabase = makeSupabase();
      await recordHeartbeat(supabase, 'outbox_worker', { ok: true, now: 0 });
      await recordHeartbeat(supabase, 'outbox_worker', { ok: false, now: 1_000 });
      expect(supabase.calls).toHaveLength(2);
    });

    it('outros jobs NÃO são throttled', async () => {
      const supabase = makeSupabase();
      await recordHeartbeat(supabase, 'kenlo_sync', { ok: true, now: 0 });
      await recordHeartbeat(supabase, 'kenlo_sync', { ok: true, now: 1_000 });
      expect(supabase.calls).toHaveLength(2);
    });
  });
});
