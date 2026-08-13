import { describe, it, expect, vi } from 'vitest';
import { makeSubmitHandler } from './submitHandler.js';

function makeRes() {
  return { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
function makeSupabase({ dispatch, claimRows = [{ id: 'd1' }], membership = { leader_user_id: 'g1' }, onInsert, commentError = null } = {}) {
  const inserted = [];
  const comments = [];
  return {
    inserted,
    comments,
    from(table) {
      if (table === 'survey_dispatches') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: dispatch, error: null }) }) }) }),
          update: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: claimRows, error: null }) }) }) }) }),
        };
      }
      if (table === 'tenant_memberships') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: membership, error: null }) }) }) }) };
      }
      if (table === 'survey_responses') {
        return { insert: (row) => { inserted.push(row); onInsert?.(row); return { select: () => ({ single: async () => ({ data: { id: 'r1' }, error: null }) }) }; } };
      }
      if (table === 'survey_comments') {
        return { insert: async (row) => { comments.push(row); return { error: commentError }; } };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}
const baseReq = (overrides = {}) => ({ userId: 'u1', userEmail: 'c@imob.com', body: { cycle_id: 'cyc1', answers: { q_empresa: 9, q_gestor: 8, q_comentario: 'ok' }, ...overrides } });
// subject_leader_user_id NÃO é coluna real de survey_dispatches (só de survey_responses) —
// o fake NÃO deve carregá-la; o gestor vem do fake de tenant_memberships acima.
const dispatchOf = (o = {}) => ({ id: 'd1', tenant_id: 'tenant-A', cycle_id: 'cyc1', respondent_user_id: 'u1', has_responded: false, ...o });

describe('submit eNPS — anti-IDOR + atômico', () => {
  it('sem dispatch p/ (cycle, jwt.uid) → 403', async () => {
    const supabase = makeSupabase({ dispatch: null });
    const res = makeRes();
    await makeSubmitHandler(supabase)(baseReq(), res);
    expect(res.statusCode).toBe(403);
    expect(supabase.inserted).toHaveLength(0);
  });

  it('nota é IDENTIFICADA e usa o tenant do DISPATCH (não do body)', async () => {
    const supabase = makeSupabase({ dispatch: dispatchOf() });
    const res = makeRes();
    await makeSubmitHandler(supabase)(baseReq({ tenant_id: 'tenant-HACK' }), res);
    expect(res.statusCode).toBe(200);
    expect(supabase.inserted[0]).toMatchObject({ tenant_id: 'tenant-A', cycle_id: 'cyc1', respondent_user_id: 'u1', subject_leader_user_id: 'g1' });
    expect(supabase.inserted[0].answers).toMatchObject({ q_empresa: 9, q_gestor: 8 });
  });

  // O CONTRATO da mudança de privacidade: o texto livre não pode viajar junto do
  // respondent_user_id — se voltar para answers, ele deixa de ser anônimo.
  it('comentário vai p/ survey_comments SEM autor e some de answers', async () => {
    const supabase = makeSupabase({ dispatch: dispatchOf() });
    const res = makeRes();
    await makeSubmitHandler(supabase)(baseReq(), res);
    expect(supabase.inserted[0].answers).not.toHaveProperty('q_comentario');
    expect(supabase.comments).toHaveLength(1);
    expect(supabase.comments[0]).toEqual({ tenant_id: 'tenant-A', cycle_id: 'cyc1', subject_leader_user_id: 'g1', text: 'ok' });
    expect(supabase.comments[0]).not.toHaveProperty('respondent_user_id');
  });

  it('comentário vazio não vira linha', async () => {
    const supabase = makeSupabase({ dispatch: dispatchOf() });
    const res = makeRes();
    await makeSubmitHandler(supabase)(baseReq({ answers: { q_empresa: 9, q_comentario: '   ' } }), res);
    expect(res.statusCode).toBe(200);
    expect(supabase.comments).toHaveLength(0);
  });

  // Sem transação no PostgREST: falhar aqui só faria o corretor perder TAMBÉM as
  // notas (o dispatch já foi consumido) — a resposta segue 200.
  it('falha ao gravar o comentário não derruba a submissão', async () => {
    const supabase = makeSupabase({ dispatch: dispatchOf(), commentError: { message: 'boom' } });
    const res = makeRes();
    await makeSubmitHandler(supabase)(baseReq(), res);
    expect(res.statusCode).toBe(200);
    expect(supabase.inserted).toHaveLength(1);
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
