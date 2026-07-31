import { describe, it, expect } from 'vitest';
import { createAnthropicService, weekWindow } from './service.js';
import { AnthropicApiError } from './client.js';

const FIXED_NOW = Date.parse('2026-07-29T12:00:00.000Z');

function fakeSupabase() {
  const store = {};
  const api = { _store: store, from() { return api; }, select() { return api; }, eq(_c, v) { api._t = v; return api; },
    async upsert(p) { store[p.tenant_id] = { ...store[p.tenant_id], ...p }; return { error: null }; },
    async maybeSingle() { return { data: store[api._t] ?? null, error: null }; } };
  return api;
}
const bucket = (...cents) => ({ results: cents.map((a) => ({ amount: String(a), currency: 'USD' })) });

function svc({ cfg, clientImpl, env = { ANTHROPIC_WEEKLY_BUDGET_USD: '500' } }) {
  const resolver = { resolveConfig: async () => cfg, saveConfig: async () => ({ ok: true }), invalidate() {} };
  const supabase = fakeSupabase();
  const service = createAnthropicService({ supabase, resolver, clientImpl, processEnv: env, now: () => FIXED_NOW });
  return { service, supabaseStore: supabase._store };
}

describe('weekWindow', () => {
  it('janela de 7 dias, startsAt no início do dia UTC', () => {
    const w = weekWindow(FIXED_NOW);
    expect(w.startsAt).toBe('2026-07-22T00:00:00.000Z');
    expect(w.endsAt).toBe('2026-07-29T12:00:00.000Z');
  });
});

describe('getWeeklyUsage', () => {
  it('sem key → not_configured', async () => {
    const { service } = svc({ cfg: { apiKey: null, alertThresholdBps: 1430 } });
    const dto = await service.getWeeklyUsage('t1');
    expect(dto.status).toBe('not_configured');
  });

  it('key sem budget no env → insufficient_data SEM chamar o client', async () => {
    let called = 0;
    const clientImpl = async () => { called += 1; return []; };
    const { service } = svc({ cfg: { apiKey: 'k', alertThresholdBps: 1430 }, clientImpl, env: {} });
    const dto = await service.getWeeklyUsage('t1');
    expect(dto.status).toBe('insufficient_data');
    expect(called).toBe(0);
  });

  it('uso normal → percentual contra o budget do env; limit no DTO = budget', async () => {
    const clientImpl = async () => [bucket(6420)]; // 64.20 / 500 = 12.84%
    const { service } = svc({ cfg: { apiKey: 'k', alertThresholdBps: 1430 }, clientImpl });
    const dto = await service.getWeeklyUsage('t1');
    expect(dto.status).toBe('normal');
    expect(dto.usage.limit).toBe(500);
    expect(dto.usage.percentage).toBe(12.84);
  });

  it('usa o alertThresholdBps do tenant', async () => {
    const clientImpl = async () => [bucket(7600)]; // 15.2%
    const a = await svc({ cfg: { apiKey: 'k', alertThresholdBps: 2000 }, clientImpl }).service.getWeeklyUsage('t1');
    expect(a.status).toBe('normal');   // 1520 < 2000
    const b = await svc({ cfg: { apiKey: 'k', alertThresholdBps: 1430 }, clientImpl }).service.getWeeklyUsage('t1');
    expect(b.status).toBe('warning');  // 1520 >= 1430
  });

  it('snapshot grava o denominador usado em weekly_limit_usd (repurpose)', async () => {
    const clientImpl = async () => [bucket(6420)];
    const { service, supabaseStore } = svc({ cfg: { apiKey: 'k', alertThresholdBps: 1430 }, clientImpl });
    await service.getWeeklyUsage('t1');
    expect(supabaseStore.t1.weekly_limit_usd).toBe(500);
  });

  it('erro do client → error (sem vazar detalhe além do code)', async () => {
    const clientImpl = async () => { throw new AnthropicApiError('rate_limited'); };
    const { service, supabaseStore } = svc({ cfg: { apiKey: 'k', alertThresholdBps: 1430 }, clientImpl });
    const dto = await service.getWeeklyUsage('t1');
    expect(dto.status).toBe('error');
    expect(dto.usage.percentage).toBeNull();
    // Assert the persisted snapshot carries only the error code, nothing else
    expect(supabaseStore['t1'].last_error).toBe('rate_limited');
  });

  it('recalcular com o mesmo uso é idempotente (mesmo estado warning)', async () => {
    const clientImpl = async () => [bucket(7600)];
    const { service } = svc({ cfg: { apiKey: 'k', alertThresholdBps: 1430 }, clientImpl });
    const a = await service.getWeeklyUsage('t1');
    const b = await service.getWeeklyUsage('t1');
    expect(a.status).toBe('warning');
    expect(b.status).toBe('warning');
    expect(a.usage.percentage).toBe(b.usage.percentage);
  });

  it('modo max: espelha o snapshot SEM persistir nem chamar o client', async () => {
    let called = 0;
    const clientImpl = async () => { called += 1; return []; };
    const resolver = { resolveConfig: async () => ({ tenantId: 't1', mode: 'max', apiKey: null, alertThresholdBps: 1430 }), saveConfig: async () => ({ ok: true }), invalidate() {} };
    const supabase = fakeSupabase();
    supabase._store.t1 = { tenant_id: 't1', last_state: 'warning', last_percentage: 41, last_window_start: 'ws', last_window_end: 'we', last_synced_at: 'ts' };
    const before = JSON.stringify(supabase._store.t1);
    const service = createAnthropicService({ supabase, resolver, clientImpl, processEnv: { ANTHROPIC_WEEKLY_BUDGET_USD: '500' }, now: () => FIXED_NOW });
    const dto = await service.getWeeklyUsage('t1');
    expect(called).toBe(0);
    expect(dto.status).toBe('warning');
    expect(dto.usage.percentage).toBe(41);
    expect(dto.usage.limit).toBeNull();
    expect(JSON.stringify(supabase._store.t1)).toBe(before); // nada persistido
  });
  it('modo max sem linha → not_configured, sem persistir', async () => {
    const resolver = { resolveConfig: async () => ({ tenantId: 't1', mode: 'max' }), saveConfig: async () => ({ ok: true }), invalidate() {} };
    const supabase = fakeSupabase();
    const service = createAnthropicService({ supabase, resolver, clientImpl: async () => [], processEnv: {}, now: () => FIXED_NOW });
    const dto = await service.getWeeklyUsage('t1');
    expect(dto.status).toBe('not_configured');
    expect(supabase._store.t1).toBeUndefined();
  });
});
