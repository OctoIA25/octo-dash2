import { describe, it, expect } from 'vitest';
import { makePendingHandler } from './aggregate.js';

function makeRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
const req = () => ({ userId: 'u1', userEmail: 'c@imob.com' });

/**
 * Fake supabase para o pending handler:
 *  - survey_dispatches: .select('cycle_id').eq(resp).eq(has_responded).in(status) → dispatchRows
 *  - survey_cycles: .select().in(ids).eq('status','open').order().limit().maybeSingle() → openCycle
 */
function makeSupabase({ dispatchRows = [], openCycle = null } = {}) {
  return {
    from(table) {
      if (table === 'survey_dispatches') {
        return { select: () => ({ eq: () => ({ eq: () => ({ in: async () => ({ data: dispatchRows, error: null }) }) }) }) };
      }
      if (table === 'survey_cycles') {
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: async () => ({ data: openCycle, error: null }) }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}

describe('GET /enps/pending', () => {
  it('sem dispatch não respondido → pending:false (não consulta ciclos)', async () => {
    const supabase = makeSupabase({ dispatchRows: [] });
    const res = makeRes();
    await makePendingHandler(supabase)(req(), res);
    expect(res.body).toEqual({ ok: true, pending: false });
  });

  it('tem dispatch não respondido mas nenhum ciclo aberto → pending:false', async () => {
    const supabase = makeSupabase({ dispatchRows: [{ cycle_id: 'cyc-old' }], openCycle: null });
    const res = makeRes();
    await makePendingHandler(supabase)(req(), res);
    expect(res.body).toEqual({ ok: true, pending: false });
  });

  it('tem dispatch não respondido em ciclo aberto → pending:true com cycleId e periodStart', async () => {
    const supabase = makeSupabase({
      dispatchRows: [{ cycle_id: 'cyc1' }],
      openCycle: { id: 'cyc1', period_start: '2026-07-01' },
    });
    const res = makeRes();
    await makePendingHandler(supabase)(req(), res);
    expect(res.body).toEqual({ ok: true, pending: true, cycleId: 'cyc1', periodStart: '2026-07-01' });
  });

  it('erro no banco → 500 (não vaza detalhe)', async () => {
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ in: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }),
    };
    const res = makeRes();
    await makePendingHandler(supabase)(req(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ ok: false, error: 'enps_internal_error' });
  });
});
