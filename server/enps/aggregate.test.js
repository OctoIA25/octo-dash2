import { describe, it, expect, vi } from 'vitest';
import { makeAggregateHandler, makeCycleContextHandler } from './aggregate.js';

function makeRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
// Fake supabase parametrizado por tabela; survey_id resolvido por loadEnpsSurvey mockado via deps.
// brokers/profiles alimentam a resolução de leaderName no ranking (loadLeaderNames).
function makeSupabase({ responses = [], cycle = { id: 'cyc1', status: 'open' }, dispatches = [], members = [], brokers = [], profiles = [] } = {}) {
  return {
    from(table) {
      if (table === 'tenant_memberships') {
        return { select: () => ({ eq: (col, val) => {
          if (col === 'user_id') return { data: [{ tenant_id: 't1' }], error: null };
          return { eq: async () => ({ data: members, error: null }) };
        } }) };
      }
      if (table === 'survey_cycles') {
        return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cycle, error: null }) }) }) }) }) };
      }
      if (table === 'survey_responses') return { select: () => ({ eq: async () => ({ data: responses, error: null }) }) };
      if (table === 'survey_dispatches') return { select: () => ({ eq: async () => ({ data: dispatches, error: null }) }) };
      if (table === 'tenant_brokers') return { select: () => ({ eq: () => ({ in: async () => ({ data: brokers, error: null }) }) }) };
      if (table === 'user_profiles') return { select: () => ({ in: async () => ({ data: profiles, error: null }) }) };
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}
const req = (query = {}) => ({ userId: 'u1', userEmail: 'c@imob.com', query: { period: '2026-03-01', ...query } });
const rows = (n, { empresa = 9, gestor = 9, leader = null } = {}) =>
  Array.from({ length: n }, () => ({ enps_empresa: empresa, enps_gestor: gestor, subject_leader_user_id: leader, answers: {} }));
// deps injetável p/ loadEnpsSurvey (resolve survey_id sem tocar 'surveys')
const deps = { loadEnpsSurvey: async () => ({ id: 'srv-enps' }) };

describe('agregação eNPS — N-mínimo global', () => {
  it('menos de N respostas: TODO bloco derivado devolve insufficient', async () => {
    const supabase = makeSupabase({ responses: rows(3) });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.geral.empresa).toEqual({ insufficient: true });
    expect(res.body.geral.gestor).toEqual({ insufficient: true });
    expect(res.body.distribuicao).toEqual({ insufficient: true });
    expect(res.body.comentarios).toEqual({ insufficient: true });
  });

  it('participação SEMPRE sai (contagem) mesmo abaixo de N', async () => {
    const supabase = makeSupabase({ responses: rows(2), dispatches: [{ status: 'sent', has_responded: true }, { status: 'sent', has_responded: false }] });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req(), res);
    expect(res.body.participacao).toMatchObject({ sent: 2, responded: 1, pending: 1 });
  });
});

describe('agregação eNPS — dois scores separados', () => {
  it('empresa e gestor de colunas distintas', async () => {
    const supabase = makeSupabase({ responses: rows(5, { empresa: 9, gestor: 0 }) });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req(), res);
    expect(res.body.geral.empresa.enps).toBe(100);
    expect(res.body.geral.gestor.enps).toBe(-100);
  });
});

describe('agregação eNPS — distribuição (ambos os scores)', () => {
  it('N suficiente: devolve buckets 0..10 p/ empresa E gestor, label é a string da nota', async () => {
    const supabase = makeSupabase({ responses: rows(5, { empresa: 9, gestor: 0 }) });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req(), res);
    expect(res.body.distribuicao.empresa).toHaveLength(11);
    expect(res.body.distribuicao.gestor).toHaveLength(11);
    expect(res.body.distribuicao.empresa.find((b) => b.label === '9')).toMatchObject({ label: '9', count: 5 });
    expect(res.body.distribuicao.gestor.find((b) => b.label === '0')).toMatchObject({ label: '0', count: 5 });
  });
});

describe('agregação eNPS — comentários', () => {
  it('N suficiente: array de {text}, não {items,count}', async () => {
    const supabase = makeSupabase({
      responses: Array.from({ length: 5 }, (_, i) => ({ enps_empresa: 9, enps_gestor: 9, subject_leader_user_id: null, answers: { q_comentario: `c${i}` } })),
    });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req(), res);
    expect(Array.isArray(res.body.comentarios)).toBe(true);
    expect(res.body.comentarios).toContainEqual({ text: 'c0' });
    expect(res.body.comentarios).toHaveLength(5);
  });
});

describe('agregação eNPS — ranking', () => {
  it('exclui NULL e exige N≥5 + time mínimo; leaderName resolvido (tenant_brokers → user_profiles)', async () => {
    const supabase = makeSupabase({
      responses: [...rows(5, { gestor: 10, leader: 'g1' }), ...rows(5, { gestor: 3, leader: 'g2' }), ...rows(4, { leader: null })],
      members: [...Array.from({ length: 6 }, () => ({ leader_user_id: 'g1' })), ...Array.from({ length: 2 }, () => ({ leader_user_id: 'g2' }))],
      brokers: [{ auth_user_id: 'g1', name: 'Gestor Um' }],
    });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req(), res);
    const leaders = res.body.ranking.map((r) => r.leaderUserId);
    expect(leaders).toContain('g1');
    expect(leaders).not.toContain('g2');
    expect(leaders).not.toContain(null);
    const g1Row = res.body.ranking.find((r) => r.leaderUserId === 'g1');
    expect(g1Row.leaderName).toBe('Gestor Um');
  });
});

describe('bootstrap do responder — GET /enps/cycle/:id', () => {
  it('devolve status, hasLeader e alreadyResponded do dispatch do jwt-user', async () => {
    const supabase = {
      from(table) {
        if (table === 'survey_cycles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'cyc1', status: 'open', survey_id: 'srv-enps' }, error: null }) }) }) };
        if (table === 'surveys') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { questions: [{ key: 'q_empresa' }] }, error: null }) }) }) };
        if (table === 'survey_dispatches') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'd1', has_responded: false }, error: null }) }) }) }) };
        if (table === 'tenant_memberships') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { leader_user_id: 'g1' }, error: null }) }) }) };
        throw new Error(table);
      },
    };
    const res = makeRes();
    await makeCycleContextHandler(supabase)({ userId: 'u1', params: { cycleId: 'cyc1' } }, res);
    expect(res.statusCode).toBe(200); // json() sem status() → 200
    expect(res.body).toMatchObject({ ok: true, cycle: { id: 'cyc1', status: 'open' }, hasLeader: true, alreadyResponded: false });
    expect(res.body.questions).toHaveLength(1);
  });

  it('sem dispatch do jwt-user no ciclo → 403 (não vaza o ciclo de outro tenant)', async () => {
    const supabase = {
      from(table) {
        if (table === 'survey_cycles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'cyc1', status: 'open', survey_id: 'srv-enps' }, error: null }) }) }) };
        if (table === 'survey_dispatches') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };
        throw new Error(table);
      },
    };
    const res = makeRes();
    await makeCycleContextHandler(supabase)({ userId: 'u1', params: { cycleId: 'cyc1' } }, res);
    expect(res.statusCode).toBe(403);
  });
});
