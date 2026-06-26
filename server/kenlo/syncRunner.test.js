import { describe, it, expect, vi } from 'vitest';
import { createSyncRunner } from './syncRunner.js';

const silentLogger = { error() {} };
// Esgota a fila de microtasks: a invocação do sync e o .finally são diferidos.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createSyncRunner', () => {
  it('trigger() trava a guarda na hora e dispara o sync sem esperar terminar', async () => {
    let resolveSync;
    const syncService = { syncAllTenants: vi.fn(() => new Promise((r) => { resolveSync = r; })) };
    const runner = createSyncRunner(syncService, { logger: silentLogger });

    const r = runner.trigger();

    expect(r).toEqual({ started: true, alreadyRunning: false });
    expect(runner.isRunning()).toBe(true); // guarda trava síncrona, sem bloquear

    await flush();
    expect(syncService.syncAllTenants).toHaveBeenCalledOnce();
    expect(runner.isRunning()).toBe(true); // ainda rodando (sync não resolveu)
    resolveSync([]);
  });

  it('guarda de reentrância: 2º trigger é ignorado enquanto o 1º roda', async () => {
    let resolveFirst;
    const syncService = { syncAllTenants: vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValue([]) };
    const runner = createSyncRunner(syncService, { logger: silentLogger });

    expect(runner.trigger()).toEqual({ started: true, alreadyRunning: false });
    expect(runner.trigger()).toEqual({ started: false, alreadyRunning: true });

    await flush();
    expect(syncService.syncAllTenants).toHaveBeenCalledTimes(1);
    resolveFirst([]);
  });

  it('libera a guarda após o run terminar, permitindo um novo trigger', async () => {
    const syncService = { syncAllTenants: vi.fn().mockResolvedValue([]) };
    const runner = createSyncRunner(syncService, { logger: silentLogger });

    runner.trigger();
    await flush();
    expect(runner.isRunning()).toBe(false);
    expect(runner.trigger()).toEqual({ started: true, alreadyRunning: false });
  });

  it('falha (rejeição) no sync não deixa a guarda travada', async () => {
    const syncService = { syncAllTenants: vi.fn().mockRejectedValue(new Error('boom')) };
    const runner = createSyncRunner(syncService, { logger: silentLogger });

    runner.trigger();
    await flush();
    expect(runner.isRunning()).toBe(false);
  });

  it('throw SÍNCRONO de syncAllTenants não trava a guarda nem propaga', async () => {
    const syncService = { syncAllTenants: vi.fn(() => { throw new Error('síncrono'); }) };
    const runner = createSyncRunner(syncService, { logger: silentLogger });

    expect(() => runner.trigger()).not.toThrow();
    await flush();
    expect(runner.isRunning()).toBe(false);
  });
});
