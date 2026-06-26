import { describe, it, expect, vi } from 'vitest';
import { startKenloScheduler } from './kenloScheduler.js';

describe('startKenloScheduler', () => {
  it('agenda com o cron configurado e dispara syncAllTenants no tick', async () => {
    let registered = null;
    const cronImpl = { schedule: (expr, fn) => { registered = { expr, fn }; return { stop() {} }; } };
    const syncService = { syncAllTenants: vi.fn().mockResolvedValue([]) };
    await startKenloScheduler({}, { cronImpl, syncService, processEnv: { KENLO_SYNC_SCHEDULER_CRON: '*/5 * * * *' } });
    expect(registered.expr).toBe('*/5 * * * *');
    await registered.fn();
    expect(syncService.syncAllTenants).toHaveBeenCalledOnce();
  });

  it('guarda de reentrância: tick não roda se o anterior ainda está em andamento', async () => {
    let registered = null;
    const cronImpl = { schedule: (expr, fn) => { registered = { expr, fn }; return { stop() {} }; } };
    let resolveFirst;
    const syncService = { syncAllTenants: vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValue([]) };
    await startKenloScheduler({}, { cronImpl, syncService, processEnv: {} });
    registered.fn();        // 1º tick: trava
    registered.fn();        // 2º tick: deve pular
    expect(syncService.syncAllTenants).toHaveBeenCalledTimes(1);
    resolveFirst([]);
  });
});
