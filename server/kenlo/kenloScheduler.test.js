import { describe, it, expect, vi } from 'vitest';
import { startKenloScheduler } from './kenloScheduler.js';

describe('startKenloScheduler', () => {
  it('agenda com o cron configurado e dispara o runner no tick', async () => {
    let registered = null;
    const cronImpl = { schedule: (expr, fn) => { registered = { expr, fn }; return { stop() {} }; } };
    const runner = { trigger: vi.fn() };
    await startKenloScheduler({}, { cronImpl, runner, processEnv: { KENLO_SYNC_SCHEDULER_CRON: '*/5 * * * *' } });
    expect(registered.expr).toBe('*/5 * * * *');
    registered.fn();
    expect(runner.trigger).toHaveBeenCalledOnce();
  });
});
