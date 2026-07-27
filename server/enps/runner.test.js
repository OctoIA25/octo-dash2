import { describe, it, expect, vi } from 'vitest';
import { makeEnpsRunner } from './runner.js';

// Relógio fixo: dia 3 do mês (>1 → não é o dia de abertura; dentro da janela).
const NOW = new Date('2026-03-03T09:00:00Z');
const CYCLE = { id: 'cyc1', period_start: '2026-03-01', status: 'open', tenant_id: 't1' };

function baseDeps(overrides = {}) {
  return {
    now: () => NOW,
    listActiveTenants: vi.fn(async () => [{ tenant_id: 't1' }]),
    getDeletedTenantIds: vi.fn(async () => new Set()),
    loadSurvey: vi.fn(async () => ({ id: 'srv-enps', reminder_every_days: 3, cycle_closes_day: 15, channels: ['email'], questions: [{ key: 'q_empresa' }] })),
    upsertCycle: vi.fn(async () => CYCLE),
    getActiveCorretores: vi.fn(async () => [{ userId: 'u1', leaderUserId: 'g1', email: 'u1@x.com', phone: null }]),
    listDispatches: vi.fn(async () => []),
    claimDispatch: vi.fn(async () => ({ id: 'd1', respondent_user_id: 'u1' })),
    markDispatch: vi.fn(async () => {}),
    claimReminder: vi.fn(async () => null),
    closeCycle: vi.fn(async () => {}),
    sendSurvey: vi.fn(async () => ({ ok: true, status: 'sent', messageId: 'm1', transport: 'smtp' })),
    recordHeartbeat: vi.fn(async () => {}),
    buildContent: () => ({ subject: 's', html: 'h', text: 't' }),
    ...overrides,
  };
}

describe('enps runner — envio inicial (claim-before-send)', () => {
  it('corretor sem dispatch: claima a linha, ENVIA, e marca sent/sends_count=1', async () => {
    const deps = baseDeps();
    const runner = makeEnpsRunner({}, deps);
    await runner.trigger();
    await vi.waitFor(() => expect(deps.sendSurvey).toHaveBeenCalledTimes(1));
    expect(deps.claimDispatch).toHaveBeenCalledBefore(deps.sendSurvey);
    expect(deps.markDispatch).toHaveBeenCalledWith('d1', expect.objectContaining({ status: 'sent', sends_count: 1 }));
  });

  it('DOIS pods: o 2º perde o claim (upsert devolve null) e NÃO envia', async () => {
    // Dois pods reais = duas INSTÂNCIAS separadas do runner (cada uma tem seu
    // próprio Set inFlight). A guarda em-processo NÃO protege entre processos;
    // quem protege é o claim no banco (claimDispatch): o 2º pod recebe null no
    // conflito do UNIQUE e não envia. (Duas chamadas trigger() na MESMA instância
    // seriam puladas pelo Set — não é o cenário cross-pod.)
    let calls = 0;
    const deps = baseDeps({ claimDispatch: vi.fn(async () => (++calls === 1 ? { id: 'd1', respondent_user_id: 'u1' } : null)) });
    const podA = makeEnpsRunner({}, deps);
    const podB = makeEnpsRunner({}, deps);
    await Promise.all([podA.trigger(), podB.trigger()]);
    await vi.waitFor(() => expect(deps.claimDispatch).toHaveBeenCalledTimes(2));
    expect(deps.sendSurvey).toHaveBeenCalledTimes(1); // só o vencedor do claim enviou
  });

  it('send falha: marca failed (não fica falso-sent; próximo tick reavalia)', async () => {
    const deps = baseDeps({ sendSurvey: vi.fn(async () => ({ ok: false, status: 'failed', error: 'x' })) });
    const runner = makeEnpsRunner({}, deps);
    await runner.trigger();
    await vi.waitFor(() => expect(deps.markDispatch).toHaveBeenCalledWith('d1', expect.objectContaining({ status: 'failed' })));
  });

  it('dispatch existente status=pending (throttle no burst do dia-1): reprocessa SEM claimDispatch, marca sent', async () => {
    const pending = { id: 'd1', respondent_user_id: 'u1', channel: 'email', recipient: 'u1@x.com', status: 'pending', has_responded: false, sends_count: 0, last_sent_at: null };
    const deps = baseDeps({ listDispatches: vi.fn(async () => [pending]) });
    const runner = makeEnpsRunner({}, deps);
    await runner.trigger();
    await vi.waitFor(() => expect(deps.sendSurvey).toHaveBeenCalledTimes(1));
    expect(deps.claimDispatch).not.toHaveBeenCalled(); // linha já reservada; upsert de novo daria conflito (null)
    expect(deps.markDispatch).toHaveBeenCalledWith('d1', expect.objectContaining({ status: 'sent', sends_count: 1 }));
  });

  it('dispatch existente status=failed: reprocessa e marca sent na próxima tentativa', async () => {
    const failed = { id: 'd1', respondent_user_id: 'u1', channel: 'email', recipient: 'u1@x.com', status: 'failed', has_responded: false, sends_count: 1, last_sent_at: null };
    const deps = baseDeps({ listDispatches: vi.fn(async () => [failed]) });
    const runner = makeEnpsRunner({}, deps);
    await runner.trigger();
    await vi.waitFor(() => expect(deps.sendSurvey).toHaveBeenCalledTimes(1));
    expect(deps.claimDispatch).not.toHaveBeenCalled();
    expect(deps.markDispatch).toHaveBeenCalledWith('d1', expect.objectContaining({ status: 'sent', sends_count: 2 }));
  });
});

describe('enps runner — lembrete (UPDATE ... RETURNING guarda o efeito)', () => {
  const older = { id: 'd1', respondent_user_id: 'u1', channel: 'email', status: 'sent', has_responded: false, last_sent_at: '2026-02-20T09:00:00Z' };
  it('dispatch vencido: claimReminder devolve linha → envia UMA vez', async () => {
    const deps = baseDeps({ listDispatches: vi.fn(async () => [older]), claimReminder: vi.fn(async () => ({ id: 'd1' })) });
    const runner = makeEnpsRunner({}, deps);
    await runner.trigger();
    await vi.waitFor(() => expect(deps.sendSurvey).toHaveBeenCalledTimes(1));
    expect(deps.claimDispatch).not.toHaveBeenCalled();
  });

  it('DOIS ticks concorrentes no lembrete: só um recebe a linha → 1 envio', async () => {
    let calls = 0;
    const deps = baseDeps({
      listActiveTenants: vi.fn(async () => [{ tenant_id: 't1' }, { tenant_id: 't2' }]),
      listDispatches: vi.fn(async () => [older]),
      claimReminder: vi.fn(async () => (++calls === 1 ? { id: 'd1' } : null)),
    });
    const runner = makeEnpsRunner({}, deps);
    await runner.trigger();
    await vi.waitFor(() => expect(deps.claimReminder).toHaveBeenCalledTimes(2));
    expect(deps.sendSurvey).toHaveBeenCalledTimes(1);
  });

  it('respondido (has_responded=true) não gera lembrete', async () => {
    const deps = baseDeps({ listDispatches: vi.fn(async () => [{ ...older, has_responded: true }]) });
    const runner = makeEnpsRunner({}, deps);
    await runner.trigger();
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.claimReminder).not.toHaveBeenCalled();
  });
});

describe('enps runner — fechamento e reentrância', () => {
  it('hoje > cycle_closes_day: fecha o ciclo e não envia', async () => {
    const deps = baseDeps({ now: () => new Date('2026-03-20T09:00:00Z') });
    const runner = makeEnpsRunner({}, deps);
    await runner.trigger();
    await vi.waitFor(() => expect(deps.closeCycle).toHaveBeenCalledWith('cyc1'));
    expect(deps.sendSurvey).not.toHaveBeenCalled();
  });

  it('tenant já em voo é pulado (skipped)', async () => {
    let resolveTick;
    const deps = baseDeps({ upsertCycle: vi.fn(() => new Promise((r) => { resolveTick = () => r(CYCLE); })) });
    const runner = makeEnpsRunner({}, deps);
    const r1 = await runner.trigger();
    const r2 = await runner.trigger();
    expect(r1.started).toBe(1);
    expect(r2.skipped).toBe(1);
    resolveTick();
  });

  it('tenant soft-deletado é excluído do tick', async () => {
    const deps = baseDeps({ getDeletedTenantIds: vi.fn(async () => new Set(['t1'])) });
    const runner = makeEnpsRunner({}, deps);
    const r = await runner.trigger();
    expect(r.started).toBe(0);
    expect(deps.upsertCycle).not.toHaveBeenCalled();
  });
});
