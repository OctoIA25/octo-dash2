// server/anthropic/scheduler.test.js
import { describe, it, expect, vi } from 'vitest';
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

describe('runAll — alerta na transição p/ warning', () => {
  const dtoW = { status: 'warning', window: { startsAt: 'w1', endsAt: 'w2' }, usage: { current: 76, limit: 500, percentage: 15.2 }, fetchedAt: 'f1' };

  function alertSpies(checkImpl) {
    return { checkAndSendOwnerAlert: vi.fn(checkImpl) };
  }

  it('prev normal + novo warning → 1 alerta, helper chamado com dto/prevState/tenantId', async () => {
    const spies = alertSpies(async () => ({ alerted: true }));
    const runner = makeAnthropicRunner({}, {
      listConfiguredTenants: async () => ['t1'],
      readPrevState: async () => 'normal',
      service: { getWeeklyUsage: async () => dtoW },
      recordHeartbeatImpl: async () => {},
      alertsImpl: spies,
      processEnv: { ANTHROPIC_WEEKLY_BUDGET_USD: '500' },
    });
    const r = await runner.runAll();
    expect(r.alerts).toBe(1);
    expect(spies.checkAndSendOwnerAlert).toHaveBeenCalledOnce();
    const [, args] = spies.checkAndSendOwnerAlert.mock.calls[0];
    expect(args).toMatchObject({ dto: dtoW, prevState: 'normal', tenantId: 't1' });
  });

  it('prev warning + novo warning → 0 alertas (dedup)', async () => {
    const spies = alertSpies(async () => ({ alerted: false }));
    const runner = makeAnthropicRunner({}, {
      listConfiguredTenants: async () => ['t1'],
      readPrevState: async () => 'warning',
      service: { getWeeklyUsage: async () => dtoW },
      recordHeartbeatImpl: async () => {},
      alertsImpl: spies,
    });
    const r = await runner.runAll();
    expect(r.alerts).toBe(0);
  });

  it('falha no envio do alerta não derruba o tick nem os demais tenants', async () => {
    const spies = alertSpies(async () => { throw new Error('boom'); });
    const runner = makeAnthropicRunner({}, {
      listConfiguredTenants: async () => ['t1', 't2'],
      readPrevState: async () => 'normal',
      service: { getWeeklyUsage: async () => dtoW },
      recordHeartbeatImpl: async () => {},
      alertsImpl: spies,
    });
    const r = await runner.runAll();
    expect(r.processed).toBe(2);
  });
});

describe('defaultListConfiguredTenants — só mode=api', () => {
  it('filtra admin_api_key não-nula E mode=api', async () => {
    const calls = [];
    const supabase = {
      from() { return supabase; }, select() { return supabase; },
      not(c, op, v) { calls.push(['not', c, op, v]); return supabase; },
      eq(c, v) { calls.push(['eq', c, v]); return Promise.resolve({ data: [{ tenant_id: 't1' }], error: null }); },
    };
    const runner = makeAnthropicRunner(supabase, {
      readPrevState: async () => null,
      service: { getWeeklyUsage: async () => ({ status: 'normal', window: {}, usage: {} }) },
      recordHeartbeatImpl: async () => {},
      alertsImpl: { checkAndSendOwnerAlert: async () => ({ alerted: false }) },
    });
    const r = await runner.runAll();
    expect(r.processed).toBe(1);
    expect(calls).toContainEqual(['eq', 'mode', 'api']);
  });
});
