import { describe, it, expect, vi } from 'vitest';
import { runDueCampaigns } from './campaignScheduler.js';
import { computeNextOccurrence } from './recurrence.js';

// Fake supabase: select das due + update do claim + update de erro.
// calls.updates: lista plana de patches (compatibilidade com testes existentes).
// calls.updateEqs: lista de { patch, eqs: [[col, val], ...] } por chamada de update().
function makeSupabase({ dueRows, claimWins = true }) {
  const calls = { updates: [], updateEqs: [] };
  return {
    calls,
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        lte() { return this; },
        order() { return this; },
        limit: async () => ({ data: dueRows, error: null }),
        // claim/erro: update().eq().eq().select()
        update(patch) {
          calls.updates.push(patch);
          const entry = { patch, eqs: [] };
          calls.updateEqs.push(entry);
          const chain = {
            eq(col, val) { entry.eqs.push([col, val]); return chain; },
            select: async () => ({ data: claimWins ? [{ id: 'x' }] : [], error: null }),
            then(resolve) { return Promise.resolve(undefined).then(resolve); },
          };
          return chain;
        },
      };
    },
  };
}
const okExec = vi.fn(async () => ({ ok: true, runId: 'r', enqueued: 2 }));

describe('runDueCampaigns', () => {
  const deps = () => ({ executeCampaignDispatch: okExec, nowMs: 1750000000000 });
  it('dispara cada campanha due e marca o claim (status dispatched)', async () => {
    okExec.mockClear();
    const supabase = makeSupabase({ dueRows: [{ id: 'c1', tenant_id: 't1', audience_id: 'a', template_id: 'tp', max_recipients: null, variable_mapping: {} }] });
    const r = await runDueCampaigns(supabase, deps());
    expect(r.dispatched).toBe(1);
    expect(okExec).toHaveBeenCalledTimes(1);
    // o claim gravou schedule_status: 'dispatched'
    expect(supabase.calls.updates.some((u) => u.schedule_status === 'dispatched')).toBe(true);
  });
  it('claim perdido (outra instância) → não dispara', async () => {
    okExec.mockClear();
    const supabase = makeSupabase({ dueRows: [{ id: 'c1', tenant_id: 't1' }], claimWins: false });
    const r = await runDueCampaigns(supabase, deps());
    expect(okExec).not.toHaveBeenCalled();
    expect(r.dispatched).toBe(0);
  });
  it('dispatch falha → grava schedule_status error + motivo', async () => {
    const failExec = vi.fn(async () => ({ ok: false, error: 'template_not_approved' }));
    const supabase = makeSupabase({ dueRows: [{ id: 'c1', tenant_id: 't1' }] });
    const r = await runDueCampaigns(supabase, { executeCampaignDispatch: failExec, nowMs: 1 });
    expect(r.failed).toBe(1);
    expect(supabase.calls.updates.some((u) => u.schedule_status === 'error' && u.schedule_error === 'template_not_approved')).toBe(true);
  });
  it('nenhuma due → processed 0, nunca lança', async () => {
    const supabase = makeSupabase({ dueRows: [] });
    const r = await runDueCampaigns(supabase, deps());
    expect(r).toEqual({ processed: 0, dispatched: 0, failed: 0 });
  });
});

describe('runDueCampaigns recorrência', () => {
  it('campanha recorrente: após sucesso, reagenda (scheduled_at futuro, status scheduled)', async () => {
    const okExec = vi.fn(async () => ({ ok: true, runId: 'r', enqueued: 1 }));
    const nowMs = Date.parse('2026-07-08T12:00:00Z');
    const recurrence = { frequency: 'daily', time: '09:00' };
    const supabase = makeSupabase({ dueRows: [{ id: 'c1', tenant_id: 't1', recurrence }] });
    const r = await runDueCampaigns(supabase, { executeCampaignDispatch: okExec, nowMs });
    expect(r.dispatched).toBe(1);
    // o claim gravou 'dispatched', e depois o reagendamento gravou 'scheduled' + scheduled_at = próxima
    const resched = supabase.calls.updates.find((u) => u.schedule_status === 'scheduled' && u.scheduled_at);
    expect(resched).toBeTruthy();
    expect(resched.scheduled_at).toBe(computeNextOccurrence(recurrence, nowMs));
  });
  it('campanha pontual (sem recurrence): fica dispatched, NÃO reagenda', async () => {
    const okExec = vi.fn(async () => ({ ok: true, runId: 'r', enqueued: 1 }));
    const supabase = makeSupabase({ dueRows: [{ id: 'c1', tenant_id: 't1', recurrence: null }] });
    await runDueCampaigns(supabase, { executeCampaignDispatch: okExec, nowMs: 1 });
    // só o claim 'dispatched'; nenhum update com schedule_status 'scheduled' + scheduled_at
    expect(supabase.calls.updates.some((u) => u.schedule_status === 'scheduled' && u.scheduled_at)).toBe(false);
  });
  it('recorrente que FALHA não reagenda (fica error)', async () => {
    const failExec = vi.fn(async () => ({ ok: false, error: 'template_not_approved' }));
    const supabase = makeSupabase({ dueRows: [{ id: 'c1', tenant_id: 't1', recurrence: { frequency: 'daily', time: '09:00' } }] });
    const r = await runDueCampaigns(supabase, { executeCampaignDispatch: failExec, nowMs: 1 });
    expect(r.failed).toBe(1);
    expect(supabase.calls.updates.some((u) => u.schedule_status === 'error')).toBe(true);
    expect(supabase.calls.updates.some((u) => u.schedule_status === 'scheduled' && u.scheduled_at)).toBe(false);
  });
  it('reagendamento de recorrente filtra por schedule_status dispatched (não ressuscita cancelada)', async () => {
    const okExec = vi.fn(async () => ({ ok: true, runId: 'r', enqueued: 1 }));
    const nowMs = Date.parse('2026-07-08T12:00:00Z');
    const supabase = makeSupabase({ dueRows: [{ id: 'c1', tenant_id: 't1', recurrence: { frequency: 'daily', time: '09:00' } }] });
    const r = await runDueCampaigns(supabase, { executeCampaignDispatch: okExec, nowMs });
    expect(r.dispatched).toBe(1);
    // encontra o update que volta a 'scheduled' (o reagendamento)
    const reschedEntry = supabase.calls.updateEqs.find((e) => e.patch.schedule_status === 'scheduled' && e.patch.scheduled_at);
    expect(reschedEntry).toBeTruthy();
    // deve ter a condição .eq('schedule_status', 'dispatched') para não ressuscitar canceladas
    const hasDispatchedGuard = reschedEntry.eqs.some(([col, val]) => col === 'schedule_status' && val === 'dispatched');
    expect(hasDispatchedGuard).toBe(true);
  });
});
