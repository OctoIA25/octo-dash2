import { describe, it, expect, vi } from 'vitest';
import { runDueCampaigns } from './campaignScheduler.js';

// Fake supabase: select das due + update do claim + update de erro.
function makeSupabase({ dueRows, claimWins = true }) {
  const calls = { updates: [] };
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
        update(patch) { calls.updates.push(patch); return { eq() { return this; }, select: async () => ({ data: claimWins ? [{ id: 'x' }] : [], error: null }) }; },
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
