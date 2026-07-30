import { describe, it, expect } from 'vitest';
import { createAnthropicService, weekWindow } from './service.js';
import { AnthropicApiError } from './client.js';

const FIXED_NOW = Date.parse('2026-07-29T12:00:00.000Z');

function fakeSupabase() {
  const store = {};
  const api = { _store: store, from() { return api; }, eq(_c, v) { api._t = v; return api; },
    async upsert(p) { store[p.tenant_id] = { ...store[p.tenant_id], ...p }; return { error: null }; } };
  return api;
}
const bucket = (...cents) => ({ results: cents.map((a) => ({ amount: String(a), currency: 'USD' })) });

function svc({ cfg, clientImpl }) {
  const resolver = { resolveConfig: async () => cfg, saveConfig: async () => ({ ok: true }), invalidate() {} };
  const supabase = fakeSupabase();
  return {
    service: createAnthropicService({ supabase, resolver, clientImpl, now: () => FIXED_NOW }),
    supabaseStore: supabase._store
  };
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
    const { service } = svc({ cfg: { apiKey: null, weeklyLimitUsd: 500 } });
    const dto = await service.getWeeklyUsage('t1');
    expect(dto.status).toBe('not_configured');
    expect(dto.usage.percentage).toBeNull();
  });

  it('sem limite → not_configured', async () => {
    const { service } = svc({ cfg: { apiKey: 'k', weeklyLimitUsd: null } });
    const dto = await service.getWeeklyUsage('t1');
    expect(dto.status).toBe('not_configured');
  });

  it('uso normal → normal + percentual correto', async () => {
    const clientImpl = async () => [bucket(6420)]; // 64.20 USD
    const { service } = svc({ cfg: { apiKey: 'k', weeklyLimitUsd: 500 }, clientImpl });
    const dto = await service.getWeeklyUsage('t1');
    expect(dto.status).toBe('normal');
    expect(dto.usage.current).toBeCloseTo(64.2, 5);
    expect(dto.usage.percentage).toBe(12.84);
  });

  it('uso ≥ 14,30% → warning', async () => {
    const clientImpl = async () => [bucket(7600)]; // 76.00 / 500 = 15.2%
    const { service } = svc({ cfg: { apiKey: 'k', weeklyLimitUsd: 500 }, clientImpl });
    const dto = await service.getWeeklyUsage('t1');
    expect(dto.status).toBe('warning');
    expect(dto.usage.percentage).toBe(15.2);
  });

  it('erro do client → error (sem vazar detalhe além do code)', async () => {
    const clientImpl = async () => { throw new AnthropicApiError('rate_limited'); };
    const { service, supabaseStore } = svc({ cfg: { apiKey: 'k', weeklyLimitUsd: 500 }, clientImpl });
    const dto = await service.getWeeklyUsage('t1');
    expect(dto.status).toBe('error');
    expect(dto.usage.percentage).toBeNull();
    // Assert the persisted snapshot carries only the error code, nothing else
    expect(supabaseStore['t1'].last_error).toBe('rate_limited');
  });

  it('recalcular com o mesmo uso é idempotente (mesmo estado warning)', async () => {
    const clientImpl = async () => [bucket(7600)];
    const { service } = svc({ cfg: { apiKey: 'k', weeklyLimitUsd: 500 }, clientImpl });
    const a = await service.getWeeklyUsage('t1');
    const b = await service.getWeeklyUsage('t1');
    expect(a.status).toBe('warning');
    expect(b.status).toBe('warning');
    expect(a.usage.percentage).toBe(b.usage.percentage);
  });
});
