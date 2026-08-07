import { describe, it, expect, vi } from 'vitest';
import { startMetaLeadgenScheduler } from './scheduler.js';

// Helper: cronImpl fake que guarda o callback do tick em vez de agendar de verdade.
function fakeCron() {
  const scheduled = [];
  const cronImpl = { schedule: vi.fn((expr, fn) => { scheduled.push({ expr, fn }); return { stop() {} }; }) };
  return { cronImpl, scheduled };
}

// Captura o upsert em job_heartbeats.
function fakeSupabase() {
  const beats = [];
  return { beats, from: () => ({ upsert: async (row) => { beats.push(row); return { error: null }; } }) };
}

describe('startMetaLeadgenScheduler', () => {
  // Sem heartbeat, META_LEADGEN_PROCESSOR esquecido no deploy é silêncio total.
  it('registra heartbeat ao fim do ciclo', async () => {
    const { cronImpl, scheduled } = fakeCron();
    const supabase = fakeSupabase();
    const processor = { processPending: vi.fn(async () => ({ processed: 1, done: 1, retry: 0, failed: 0 })) };

    await startMetaLeadgenScheduler(supabase, { cronImpl, processor, processEnv: {} });
    await scheduled[0].fn();

    expect(supabase.beats).toHaveLength(1);
    expect(supabase.beats[0].job_name).toBe('meta_leadgen');
    expect(supabase.beats[0].last_result.ok).toBe(true);
  });

  it('ciclo que estoura vira heartbeat de falha', async () => {
    const { cronImpl, scheduled } = fakeCron();
    const supabase = fakeSupabase();
    const processor = { processPending: vi.fn(async () => { throw new Error('boom'); }) };

    await startMetaLeadgenScheduler(supabase, { cronImpl, processor, processEnv: {} });
    await scheduled[0].fn();

    expect(supabase.beats[0].last_result.ok).toBe(false);
  });

  it('um tick chama processPending uma vez', async () => {
    const { cronImpl, scheduled } = fakeCron();
    const processor = { processPending: vi.fn(async () => {}) };

    await startMetaLeadgenScheduler({}, { cronImpl, processor, processEnv: {} });
    await scheduled[0].fn();

    expect(processor.processPending).toHaveBeenCalledTimes(1);
  });

  it('guarda de reentrância: dois ticks disparados enquanto o primeiro ainda roda resultam em UMA chamada', async () => {
    const { cronImpl, scheduled } = fakeCron();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const processor = { processPending: vi.fn(async () => { await gate; }) };

    await startMetaLeadgenScheduler({}, { cronImpl, processor, processEnv: {} });

    const tick = scheduled[0].fn;
    const first = tick(); // entra, fica preso no gate
    const second = tick(); // deve ser ignorado — emVoo já true

    expect(processor.processPending).toHaveBeenCalledTimes(1);

    release();
    await first;
    await second;
  });

  it('depois que o primeiro ciclo termina, um tick novo volta a executar', async () => {
    const { cronImpl, scheduled } = fakeCron();
    const processor = { processPending: vi.fn(async () => {}) };

    await startMetaLeadgenScheduler({}, { cronImpl, processor, processEnv: {} });

    const tick = scheduled[0].fn;
    await tick();
    await tick();

    expect(processor.processPending).toHaveBeenCalledTimes(2);
  });

  it('processPending lançando não trava a guarda — um tick posterior ainda executa', async () => {
    const { cronImpl, scheduled } = fakeCron();
    const processor = {
      processPending: vi.fn()
        .mockRejectedValueOnce(new Error('graph explodiu'))
        .mockResolvedValueOnce(undefined),
    };

    await startMetaLeadgenScheduler({}, { cronImpl, processor, processEnv: {} });

    const tick = scheduled[0].fn;
    await tick(); // erro — não deve propagar nem travar emVoo
    await tick(); // deve executar de novo

    expect(processor.processPending).toHaveBeenCalledTimes(2);
  });

  it('sem node-cron instalado, loga aviso, devolve null e NÃO derruba o processo', async () => {
    vi.resetModules();
    vi.doMock('node-cron', () => { throw new Error('Cannot find module node-cron'); });
    const avisos = [];
    const warnOriginal = console.warn;
    console.warn = (msg) => avisos.push(String(msg));
    try {
      const { startMetaLeadgenScheduler: start } = await import('./scheduler.js');
      const resultado = await start({}, { processEnv: {} });
      expect(resultado).toBeNull();
      expect(avisos.some((m) => m.includes('node-cron'))).toBe(true);
    } finally {
      console.warn = warnOriginal;
      vi.doUnmock('node-cron');
      vi.resetModules();
    }
  });
});
