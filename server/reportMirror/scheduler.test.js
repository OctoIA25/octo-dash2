import { describe, it, expect, vi } from 'vitest';
import { startReportMirrorScheduler, makeReportMirrorRunner } from './scheduler.js';

const cronImpl = () => {
  const jobs = [];
  return { impl: { schedule: (expr, fn) => (jobs.push({ expr, fn }), { stop: vi.fn() }) }, jobs };
};

describe('startReportMirrorScheduler', () => {
  it('agenda de hora em hora e dispara o runner', async () => {
    const { impl, jobs } = cronImpl();
    const runner = vi.fn(async () => ({ vendas: 3 }));
    await startReportMirrorScheduler(null, { cronImpl: impl, runner, processEnv: {} });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].expr).toBe('17 * * * *');
    await jobs[0].fn();
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('erro do runner não derruba o processo', async () => {
    const { impl, jobs } = cronImpl();
    const runner = vi.fn(async () => { throw new Error('boom'); });
    await startReportMirrorScheduler(null, { cronImpl: impl, runner, processEnv: {} });
    await expect(jobs[0].fn()).resolves.toBeUndefined();
  });
});

describe('makeReportMirrorRunner', () => {
  it('lança erro claro quando faltam envs obrigatórias', () => {
    expect(() => makeReportMirrorRunner(null, {})).toThrow(/faltam envs/);
  });
});
