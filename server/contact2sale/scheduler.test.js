import { describe, it, expect, vi } from 'vitest';
import { startC2sScheduler } from './scheduler.js';

describe('startC2sScheduler', () => {
  it('agenda o cron configurado e o tick dispara runner.trigger()', async () => {
    const scheduled = [];
    const cronImpl = { schedule: vi.fn((expr, fn) => { scheduled.push({ expr, fn }); return { stop() {} }; }) };
    const runner = { trigger: vi.fn(async () => ({ started: 0, skipped: 0 })) };

    await startC2sScheduler({}, { cronImpl, runner, processEnv: { C2S_SYNC_SCHEDULER_CRON: '*/2 * * * *' } });

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].expr).toBe('*/2 * * * *');
    scheduled[0].fn();
    expect(runner.trigger).toHaveBeenCalledTimes(1);
  });

  it('default do cron é a cada 1 minuto (frescor dos leads ~1 min; granularidade mínima do cron)', async () => {
    const cronImpl = { schedule: vi.fn(() => ({ stop() {} })) };
    await startC2sScheduler({}, { cronImpl, runner: { trigger: vi.fn() }, processEnv: {} });
    expect(cronImpl.schedule.mock.calls[0][0]).toBe('*/1 * * * *');
  });
});
