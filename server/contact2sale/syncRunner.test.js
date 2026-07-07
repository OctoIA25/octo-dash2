import { describe, it, expect, vi } from 'vitest';
import { createC2sSyncRunner } from './syncRunner.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const noopLogger = { error: vi.fn() };

function engineStub({ tenants, cycleImpl }) {
  return {
    listActiveIntegrations: vi.fn(async () => tenants.map((t) => ({ tenant_id: t }))),
    runTenantCycle: vi.fn(cycleImpl),
  };
}

describe('createC2sSyncRunner — guarda de reentrância POR TENANT', () => {
  it('tenant em voo é pulado no próximo tick; os DEMAIS seguem (backfill longo não adia o LIVE alheio)', async () => {
    const gate = deferred();
    const engine = engineStub({
      tenants: ['t-lento', 't-rapido'],
      cycleImpl: (integ) => (integ.tenant_id === 't-lento' ? gate.promise : Promise.resolve({ saved: 1 })),
    });
    const runner = createC2sSyncRunner(engine, { logger: noopLogger });

    const r1 = await runner.trigger();
    expect(r1).toMatchObject({ started: 2, skipped: 0 });
    await tick();

    // t-lento continua rodando; t-rapido terminou → novo tick roda só t-rapido
    const r2 = await runner.trigger();
    expect(r2).toMatchObject({ started: 1, skipped: 1 });
    expect(runner.isRunning('t-lento')).toBe(true);

    gate.resolve({ saved: 99 });
    await tick();
    expect(runner.isRunning('t-lento')).toBe(false);
  });

  it('teto de concorrência: no máximo N ciclos simultâneos no processo', async () => {
    let ativos = 0;
    let pico = 0;
    const engine = engineStub({
      tenants: ['a', 'b', 'c', 'd'],
      cycleImpl: async () => {
        ativos++; pico = Math.max(pico, ativos);
        await tick();
        ativos--;
      },
    });
    const runner = createC2sSyncRunner(engine, { logger: noopLogger, maxConcurrentTenants: 2 });
    await runner.trigger();
    while (runner.isRunning()) await tick();
    expect(engine.runTenantCycle).toHaveBeenCalledTimes(4); // todos rodaram...
    expect(pico).toBeLessThanOrEqual(2);                    // ...mas nunca mais de 2 juntos
  });

  it('teto é global entre triggers: novo trigger entra na fila sem criar outro pool', async () => {
    const gates = [deferred(), deferred(), deferred(), deferred()];
    let ativos = 0;
    let pico = 0;
    let call = 0;
    let gateIndex = 0;
    const engine = {
      listActiveIntegrations: vi.fn(async () => {
        call++;
        return call === 1
          ? [{ tenant_id: 'a' }, { tenant_id: 'b' }]
          : [{ tenant_id: 'c' }, { tenant_id: 'd' }];
      }),
      runTenantCycle: vi.fn(async () => {
        const gate = gates[gateIndex++];
        ativos++; pico = Math.max(pico, ativos);
        await gate.promise;
        ativos--;
      }),
    };
    const runner = createC2sSyncRunner(engine, { logger: noopLogger, maxConcurrentTenants: 2 });

    expect(await runner.trigger()).toMatchObject({ started: 2, skipped: 0 });
    await tick();
    expect(await runner.trigger()).toMatchObject({ started: 2, skipped: 0 });
    await tick();

    expect(engine.runTenantCycle).toHaveBeenCalledTimes(2);
    gates[0].resolve();
    gates[1].resolve();
    await tick();
    expect(engine.runTenantCycle).toHaveBeenCalledTimes(4);
    gates[2].resolve();
    gates[3].resolve();
    while (runner.isRunning()) await tick();

    expect(pico).toBeLessThanOrEqual(2);
  });

  it('erro num ciclo não vaza, é logado e LIBERA a guarda do tenant', async () => {
    const logger = { error: vi.fn() };
    const engine = engineStub({ tenants: ['t1'], cycleImpl: async () => { throw new Error('boom'); } });
    const runner = createC2sSyncRunner(engine, { logger });
    await runner.trigger();
    while (runner.isRunning()) await tick();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('t1'));
    expect(runner.isRunning('t1')).toBe(false);

    const r = await runner.trigger(); // guarda liberada: roda de novo
    expect(r.started).toBe(1);
  });

  it('trigger({ tenantId }) mira só o tenant pedido', async () => {
    const engine = engineStub({ tenants: ['t1', 't2'], cycleImpl: async () => ({}) });
    const runner = createC2sSyncRunner(engine, { logger: noopLogger });
    await runner.trigger({ tenantId: 't2' });
    while (runner.isRunning()) await tick();
    expect(engine.runTenantCycle).toHaveBeenCalledTimes(1);
    expect(engine.runTenantCycle.mock.calls[0][0]).toEqual({ tenant_id: 't2' });
  });

  it('falha ao listar integrações → não inicia nada e reporta erro', async () => {
    const engine = { listActiveIntegrations: vi.fn(async () => null), runTenantCycle: vi.fn() };
    const runner = createC2sSyncRunner(engine, { logger: noopLogger });
    const r = await runner.trigger();
    expect(r.started).toBe(0);
    expect(r.error).toBeTruthy();
    expect(engine.runTenantCycle).not.toHaveBeenCalled();
  });

  it('exceção em listActiveIntegrations é capturada pelo trigger', async () => {
    const logger = { error: vi.fn() };
    const engine = { listActiveIntegrations: vi.fn(async () => { throw new Error('db down'); }), runTenantCycle: vi.fn() };
    const runner = createC2sSyncRunner(engine, { logger });
    await expect(runner.trigger()).resolves.toMatchObject({ started: 0, skipped: 0, error: expect.any(String) });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('db down'));
    expect(engine.runTenantCycle).not.toHaveBeenCalled();
  });
});
