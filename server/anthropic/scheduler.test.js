// server/anthropic/scheduler.test.js
import { describe, it, expect } from 'vitest';
import { makeAnthropicRunner } from './scheduler.js';
import { loadAnthropicEnv } from './config.js';

describe('loadAnthropicEnv', () => {
  it('cron default de hora em hora', () => {
    expect(loadAnthropicEnv({}).cron).toBe('0 * * * *');
  });
  it('respeita ANTHROPIC_USAGE_CRON', () => {
    expect(loadAnthropicEnv({ ANTHROPIC_USAGE_CRON: '*/30 * * * *' }).cron).toBe('*/30 * * * *');
  });
});

describe('makeAnthropicRunner.runAll', () => {
  it('chama getWeeklyUsage para cada tenant configurado', async () => {
    const called = [];
    // supabase fake: lista tenants com key+limite não nulos.
    const supabase = {
      from() { return supabase; },
      select() { return supabase; },
      not() { return supabase; },
      async then() {}, // não usado
    };
    // injeta a lista e o service via options
    const runner = makeAnthropicRunner(supabase, {
      listConfiguredTenants: async () => ['t1', 't2'],
      service: { getWeeklyUsage: async (t) => { called.push(t); return { status: 'normal' }; } },
      recordHeartbeatImpl: async () => {},
    });
    const r = await runner.runAll();
    expect(called).toEqual(['t1', 't2']);
    expect(r.processed).toBe(2);
  });

  it('um tenant que lança não derruba os demais', async () => {
    const called = [];
    const runner = makeAnthropicRunner({}, {
      listConfiguredTenants: async () => ['t1', 't2'],
      service: { getWeeklyUsage: async (t) => { called.push(t); if (t === 't1') throw new Error('boom'); return { status: 'normal' }; } },
      recordHeartbeatImpl: async () => {},
    });
    const r = await runner.runAll();
    expect(called).toEqual(['t1', 't2']);
    expect(r.processed).toBe(2);
    expect(r.errors).toBe(1);
  });
});
