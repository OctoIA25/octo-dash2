import { describe, it, expect, vi } from 'vitest';
import { makeSubmitHandler } from './submitHandler.js';

function makeRes() {
  return { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
function makeSupabase({ dispatch, claimRows = [{ id: 'd1' }], onInsert } = {}) {
  const inserted = [];
  return {
    inserted,
    from(table) {
      if (table === 'survey_dispatches') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: dispatch, error: null }) }) }) }),
          update: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: claimRows, error: null }) }) }) }) }),
        };
      }
      if (table === 'survey_responses') {
        return { insert: (row) => { inserted.push(row); onInsert?.(row); return { select: () => ({ single: async () => ({ data: { id: 'r1' }, error: null }) }) }; } };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}
const baseReq = (overrides = {}) => ({ userId: 'u1', userEmail: 'c@imob.com', body: { cycle_id: 'cyc1', answers: { q_empresa: 9, q_gestor: 8, q_comentario: 'ok' }, ...overrides } });
const dispatchOf = (o = {}) => ({ id: 'd1', tenant_id: 'tenant-A', cycle_id: 'cyc1', respondent_user_id: 'u1', has_responded: false, subject_leader_user_id: 'g1', ...o });

describe('submit eNPS — anti-IDOR + atômico', () => {
  it('sem dispatch p/ (cycle, jwt.uid) → 403', async () => {
    const supabase = makeSupabase({ dispatch: null });
    const res = makeRes();
    await makeSubmitHandler(supabase)(baseReq(), res);
    expect(res.statusCode).toBe(403);
    expect(supabase.inserted).toHaveLength(0);
  });

  it('anônimo: grava respondent_user_id NULL e tenant do DISPATCH (não do body)', async () => {
    const supabase = makeSupabase({ dispatch: dispatchOf() });
    const res = makeRes();
    await makeSubmitHandler(supabase)(baseReq({ tenant_id: 'tenant-HACK' }), res);
    expect(res.statusCode).toBe(200);
    expect(supabase.inserted[0]).toMatchObject({ tenant_id: 'tenant-A', cycle_id: 'cyc1', respondent_user_id: null, subject_leader_user_id: 'g1' });
    expect(supabase.inserted[0].answers).toMatchObject({ q_empresa: 9, q_gestor: 8 });
  });

  it('com allow_individual=true: respondent_user_id = jwt.uid (self-only)', async () => {
    const supabase = makeSupabase({ dispatch: dispatchOf() });
    const res = makeRes();
    await makeSubmitHandler(supabase)(baseReq({ allow_individual: true }), res);
    expect(supabase.inserted[0].respondent_user_id).toBe('u1');
  });

  it('2ª submissão: UPDATE afeta 0 linhas → 409, sem 2ª resposta', async () => {
    const supabase = makeSupabase({ dispatch: dispatchOf(), claimRows: [] });
    const res = makeRes();
    await makeSubmitHandler(supabase)(baseReq(), res);
    expect(res.statusCode).toBe(409);
    expect(supabase.inserted).toHaveLength(0);
  });

  it('dispatch já respondido → 409 antes do UPDATE', async () => {
    const supabase = makeSupabase({ dispatch: dispatchOf({ has_responded: true }) });
    const res = makeRes();
    await makeSubmitHandler(supabase)(baseReq(), res);
    expect(res.statusCode).toBe(409);
    expect(supabase.inserted).toHaveLength(0);
  });

  it('answers ausente → 400', async () => {
    const supabase = makeSupabase({ dispatch: dispatchOf() });
    const res = makeRes();
    await makeSubmitHandler(supabase)(baseReq({ answers: undefined }), res);
    expect(res.statusCode).toBe(400);
  });

  it('nota fora de 0–10 → 400', async () => {
    const supabase = makeSupabase({ dispatch: dispatchOf() });
    const res = makeRes();
    await makeSubmitHandler(supabase)(baseReq({ answers: { q_empresa: 47 } }), res);
    expect(res.statusCode).toBe(400);
  });
});
