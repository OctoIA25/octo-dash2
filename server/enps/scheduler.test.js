import { describe, it, expect, vi } from 'vitest';
import { startEnpsScheduler } from './scheduler.js';

describe('startEnpsScheduler', () => {
  it('agenda o cron configurado e o tick dispara runner.trigger()', async () => {
    const scheduled = [];
    const cronImpl = { schedule: vi.fn((expr, fn) => { scheduled.push({ expr, fn }); return { stop() {} }; }) };
    const runner = { trigger: vi.fn(async () => ({ started: 1, skipped: 0 })) };
    await startEnpsScheduler({}, { cronImpl, runner, processEnv: { ENPS_SCHEDULER_CRON: '0 8 1-28 * *' } });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].expr).toBe('0 8 1-28 * *');
    scheduled[0].fn();
    expect(runner.trigger).toHaveBeenCalledTimes(1);
  });

  it('default do cron é 0 9 1-28 * * (checa de manhã; a lógica de dia é do runner)', async () => {
    const cronImpl = { schedule: vi.fn(() => ({ stop() {} })) };
    await startEnpsScheduler({}, { cronImpl, runner: { trigger: vi.fn() }, processEnv: {} });
    expect(cronImpl.schedule.mock.calls[0][0]).toBe('0 9 1-28 * *');
  });

  it('sem cronImpl injetado, usa o node-cron instalado e agenda (não quebra)', async () => {
    // node-cron É dependência real do repo (package.json / server/package.json),
    // então sem cronImpl o import dinâmico resolve e o scheduler agenda de verdade
    // (task não-null). O catch defensivo que retorna null vive no código para o
    // caso do pacote faltar, mas não é exercitável aqui (não dá p/ desinstalar a
    // dep no meio do teste). Paramos a task para não vazar timer.
    const task = await startEnpsScheduler({}, { runner: { trigger: vi.fn() }, processEnv: {} });
    expect(task).not.toBeNull();
    task?.stop?.();
  });
});
