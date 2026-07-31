import { describe, it, expect, vi } from 'vitest';
import { ingestMaxUsage } from './ingest.js';

function fakeSupabase(row) {
  const store = { t1: row };
  const api = {
    _store: store,
    from() { return api; }, select() { return api; },
    eq(_c, v) { api._t = v; return api; },
    async maybeSingle() { return { data: store[api._t] ?? null, error: null }; },
    async upsert(p) { store[p.tenant_id] = { ...store[p.tenant_id], ...p }; return { error: null }; },
  };
  return api;
}
const maxCfg = { tenantId: 't1', mode: 'max', alertThresholdBps: 1430 };
function deps(cfg, extra = {}) {
  return {
    resolver: { resolveConfig: async () => cfg, invalidate() {} },
    checkAndSendOwnerAlert: vi.fn().mockResolvedValue({ alerted: false }),
    now: () => Date.parse('2026-07-30T12:00:00.000Z'),
    ...extra,
  };
}

describe('ingestMaxUsage — validação', () => {
  it.each([[-1], [101], ['abc'], [undefined]])('week_pct inválido %s → invalid_payload', async (bad) => {
    const r = await ingestMaxUsage(fakeSupabase({}), 't1', { week_pct: bad }, deps(maxCfg));
    expect(r).toEqual({ ok: false, code: 'invalid_payload' });
  });
  it('tenant em modo api → mode_not_max', async () => {
    const r = await ingestMaxUsage(fakeSupabase({}), 't1', { week_pct: 10 }, deps({ ...maxCfg, mode: 'api' }));
    expect(r).toEqual({ ok: false, code: 'mode_not_max' });
  });
  it('tenant sem linha → mode_not_max', async () => {
    const r = await ingestMaxUsage(fakeSupabase({}), 't1', { week_pct: 10 }, deps(null));
    expect(r).toEqual({ ok: false, code: 'mode_not_max' });
  });
});

describe('ingestMaxUsage — snapshot e alerta', () => {
  it('grava snapshot MAX (sem USD) e devolve o estado', async () => {
    const sb = fakeSupabase({ tenant_id: 't1', mode: 'max', last_state: 'normal' });
    const d = deps(maxCfg);
    const r = await ingestMaxUsage(sb, 't1', { week_pct: 10.5, resets_at: '2026-08-06T00:00:00.000Z' }, d);
    expect(r).toEqual({ ok: true, status: 'normal' });
    const row = sb._store.t1;
    expect(row.last_percentage).toBe(10.5);
    expect(row.last_state).toBe('normal');
    expect(row.last_usage_usd).toBeNull();
    expect(row.weekly_limit_usd).toBeNull();
    expect(row.last_window_end).toBe('2026-08-06T00:00:00.000Z');
    expect(row.last_window_start).toBe('2026-07-30T00:00:00.000Z');
  });
  it('resets_at epoch em segundos também funciona', async () => {
    const sb = fakeSupabase({ tenant_id: 't1', mode: 'max' });
    await ingestMaxUsage(sb, 't1', { week_pct: 5, resets_at: 1785974400 }, deps(maxCfg)); // 2026-08-06T00:00:00Z
    expect(sb._store.t1.last_window_end).toBe('2026-08-06T00:00:00.000Z');
  });
  it('pct ≥ limiar → warning + alerta com prevState lido ANTES do upsert', async () => {
    const sb = fakeSupabase({ tenant_id: 't1', mode: 'max', last_state: 'normal' });
    const d = deps(maxCfg);
    const r = await ingestMaxUsage(sb, 't1', { week_pct: 15.2 }, d);
    expect(r.status).toBe('warning');
    expect(d.checkAndSendOwnerAlert).toHaveBeenCalledOnce();
    const arg = d.checkAndSendOwnerAlert.mock.calls[0][1];
    expect(arg.prevState).toBe('normal');       // lido antes do upsert
    expect(arg.dto.status).toBe('warning');
    expect(arg.dto.usage.percentage).toBe(15.2);
  });
  it('usa o limiar do tenant', async () => {
    const sb = fakeSupabase({ tenant_id: 't1', mode: 'max' });
    const r = await ingestMaxUsage(sb, 't1', { week_pct: 15.2 }, deps({ ...maxCfg, alertThresholdBps: 2000 }));
    expect(r.status).toBe('normal'); // 1520 < 2000
  });
});
