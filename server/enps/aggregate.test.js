import { describe, it, expect, vi } from 'vitest';
import { makeAggregateHandler, makeCycleContextHandler, resolveTeamScope } from './aggregate.js';

function makeRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}
// Fake supabase parametrizado por tabela; survey_id resolvido por loadEnpsSurvey mockado via deps.
// brokers/profiles alimentam a resolução de leaderName no ranking (loadLeaderNames).
// role: linha de tenant_memberships p/ o lookup de resolveTeamScope (default: sem role, sem filtro).
// teams: linhas de `teams` p/ resolveTeamScope (owner/admin: dropdown; team_leader: travado).
function makeSupabase({ responses = [], cycle = { id: 'cyc1', status: 'open' }, dispatches = [], members = [], brokers = [], profiles = [], role = null, teams = [], comments = [] } = {}) {
  return {
    from(table) {
      if (table === 'tenant_memberships') {
        return { select: () => ({ eq: (col, val) => {
          // resolveTenant: .eq('user_id', u) — awaited direto (dá o tenant_id do membership).
          if (col === 'user_id') return { data: [{ tenant_id: 't1' }], error: null };
          // col === 'tenant_id': ramifica pelo 2º .eq() —
          //   .eq('role', 'corretor')        → membros do time (awaited)
          //   .eq('user_id', u).maybeSingle() → role do requisitante (resolveTeamScope)
          return { eq: (col2) => {
            if (col2 === 'role') return { data: members, error: null };
            return { maybeSingle: async () => ({ data: role ? { role } : null, error: null }) };
          } };
        } }) };
      }
      // .eq() encadeável e thenable: admin usa 1 eq (tenant), team_leader usa 2 (tenant + líder).
      if (table === 'teams') {
        const chain = { eq: () => chain, then: (r) => Promise.resolve({ data: teams, error: null }).then(r) };
        return { select: () => chain };
      }
      if (table === 'survey_cycles') {
        return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cycle, error: null }) }) }) }) }) };
      }
      if (table === 'survey_responses') return { select: () => ({ eq: async () => ({ data: responses, error: null }) }) };
      if (table === 'survey_dispatches') return { select: () => ({ eq: async () => ({ data: dispatches, error: null }) }) };
      if (table === 'survey_comments') return { select: () => ({ eq: async () => ({ data: comments, error: null }) }) };
      if (table === 'tenant_brokers') return { select: () => ({ eq: () => ({ in: async () => ({ data: brokers, error: null }) }) }) };
      if (table === 'user_profiles') return { select: () => ({ in: async () => ({ data: profiles, error: null }) }) };
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}
const req = (query = {}) => ({ userId: 'u1', userEmail: 'c@imob.com', query: { period: '2026-03-01', ...query } });
const rows = (n, { empresa = 9, gestor = 9, leader = null, respondent = null } = {}) =>
  Array.from({ length: n }, () => ({ enps_empresa: empresa, enps_gestor: gestor, subject_leader_user_id: leader, respondent_user_id: respondent }));
// deps injetável p/ loadEnpsSurvey (resolve survey_id sem tocar 'surveys')
const deps = { loadEnpsSurvey: async () => ({ id: 'srv-enps' }) };

describe('agregação eNPS — N-mínimo (só comentários)', () => {
  // Respostas viraram identificadas: o gate sobrou só para o texto livre anônimo.
  it('menos de N respostas: scores saem, comentários ficam retidos', async () => {
    const supabase = makeSupabase({ responses: rows(3), comments: [{ text: 'c', subject_leader_user_id: null }] });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.geral.empresa.enps).toBe(10);
    expect(res.body.distribuicao).not.toEqual({ insufficient: true });
    expect(res.body.comentarios).toEqual({ insufficient: true });
  });

  it('zero respostas: score e distribuição não têm o que exibir', async () => {
    const supabase = makeSupabase({ responses: [] });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req(), res);
    expect(res.body.geral.empresa).toEqual({ insufficient: true });
    expect(res.body.distribuicao).toEqual({ insufficient: true });
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
    expect(res.body.geral.empresa.enps).toBe(10);
    expect(res.body.geral.gestor.enps).toBe(0);
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

describe('agregação eNPS — comentários (tabela anônima)', () => {
  it('N suficiente: array de {text} vindo de survey_comments', async () => {
    const supabase = makeSupabase({
      responses: rows(5),
      comments: Array.from({ length: 3 }, (_, i) => ({ text: `c${i}`, subject_leader_user_id: null })),
    });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req(), res);
    expect(Array.isArray(res.body.comentarios)).toBe(true);
    expect(res.body.comentarios).toContainEqual({ text: 'c0' });
    expect(res.body.comentarios).toHaveLength(3);
  });
});

describe('agregação eNPS — ranking', () => {
  it('exclui NULL leader; leaderName resolvido (tenant_brokers → user_profiles)', async () => {
    const supabase = makeSupabase({
      responses: [...rows(5, { gestor: 10, leader: 'g1' }), ...rows(2, { gestor: 3, leader: 'g2' }), ...rows(4, { leader: null })],
      members: [...Array.from({ length: 6 }, () => ({ leader_user_id: 'g1' })), ...Array.from({ length: 2 }, () => ({ leader_user_id: 'g2' }))],
      brokers: [{ auth_user_id: 'g1', name: 'Gestor Um' }],
    });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req(), res);
    const leaders = res.body.ranking.map((r) => r.leaderUserId);
    expect(leaders).toEqual(['g1', 'g2']);   // sem gate de N: g2 entra, ordenado por eNPS
    expect(leaders).not.toContain(null);
    expect(res.body.ranking.find((r) => r.leaderUserId === 'g1').leaderName).toBe('Gestor Um');
  });
});

describe('agregação eNPS — filtro por corretor (?corretor=)', () => {
  const base = {
    role: 'admin',
    responses: [...rows(3, { empresa: 10, respondent: 'c1' }), ...rows(3, { empresa: 0, respondent: 'c2' })],
    members: [{ user_id: 'c1', leader_user_id: 'lead-red' }, { user_id: 'c2', leader_user_id: 'lead-blue' }],
    brokers: [{ auth_user_id: 'c1', name: 'Ana' }, { auth_user_id: 'c2', name: 'Bruno' }],
  };

  it('admin: recorta as notas no corretor pedido e devolve o dropdown', async () => {
    const res = makeRes();
    await makeAggregateHandler(makeSupabase(base), deps)(req({ corretor: 'c1' }), res);
    expect(res.body.scope.corretorId).toBe('c1');
    expect(res.body.scope.corretores).toEqual([{ id: 'c1', name: 'Ana' }, { id: 'c2', name: 'Bruno' }]);
    expect(res.body.geral.empresa.count).toBe(3);
    expect(res.body.geral.empresa.enps).toBe(10);
  });

  it('id de corretor fora do tenant/escopo é ignorado (não vaza, não quebra)', async () => {
    const res = makeRes();
    await makeAggregateHandler(makeSupabase(base), deps)(req({ corretor: 'c-de-outro-tenant' }), res);
    expect(res.body.scope.corretorId).toBeNull();
    expect(res.body.geral.empresa.count).toBe(6);
  });

  it('corretor comum não recebe dropdown nem consegue filtrar colega', async () => {
    const res = makeRes();
    await makeAggregateHandler(makeSupabase({ ...base, role: 'corretor' }), deps)(req({ corretor: 'c1' }), res);
    expect(res.body.scope.corretores).toEqual([]);
    expect(res.body.scope.corretorId).toBeNull();
    expect(res.body.geral.empresa.count).toBe(6);
  });

  it('team_leader: dropdown só com os corretores da própria equipe', async () => {
    const supabase = makeSupabase({
      ...base,
      role: 'team_leader',
      teams: [{ id: 'te-red', name: 'Vermelha', color: 'red', leader_user_id: 'lead-red' }],
    });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req(), res);
    expect(res.body.scope.corretores).toEqual([{ id: 'c1', name: 'Ana' }]);
  });

  // O gate do texto livre olha a EQUIPE, não o recorte por pessoa — senão filtrar
  // um corretor esconderia comentários que ele nem escreveu.
  it('comentários não são recortados pelo corretor filtrado', async () => {
    const supabase = makeSupabase({
      ...base,
      responses: [...rows(5, { respondent: 'c1' }), ...rows(1, { respondent: 'c2' })],
      comments: [{ text: 'time bom', subject_leader_user_id: null }],
    });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req({ corretor: 'c2' }), res);
    expect(res.body.geral.empresa.count).toBe(1);
    expect(res.body.comentarios).toEqual([{ text: 'time bom' }]);
  });
});

describe('agregação eNPS — filtro de equipe (?team=)', () => {
  it('handler filtra respostas por equipe e devolve scope', async () => {
    const responses = [
      ...Array.from({ length: 6 }, () => ({ enps_empresa: 10, enps_gestor: 10, subject_leader_user_id: 'lead-red', answers: {} })),
      ...Array.from({ length: 6 }, () => ({ enps_empresa: 0, enps_gestor: 0, subject_leader_user_id: 'lead-blue', answers: {} })),
    ];
    const supabase = makeSupabase({
      responses,
      role: 'admin',
      teams: [
        { id: 'te-red', name: 'Vermelha', color: 'red', leader_user_id: 'lead-red' },
        { id: 'te-blue', name: 'Azul', color: 'blue', leader_user_id: 'lead-blue' },
      ],
    });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req({ team: 'te-red' }), res);
    expect(res.body.scope.teamId).toBe('te-red');
    expect(res.body.geral.empresa).not.toEqual({ insufficient: true });
    // 6 notas 10 = todos promotores = 10 na escala 0–10 — só a equipe vermelha entra na conta.
    expect(res.body.geral.empresa.enps).toBe(10);
    expect(res.body.geral.gestor.enps).toBe(10);
  });

  it('owner sem team => sem filtro (comportamento atual preservado)', async () => {
    const responses = [
      ...Array.from({ length: 6 }, () => ({ enps_empresa: 10, enps_gestor: 10, subject_leader_user_id: 'lead-red', answers: {} })),
      ...Array.from({ length: 6 }, () => ({ enps_empresa: 0, enps_gestor: 0, subject_leader_user_id: 'lead-blue', answers: {} })),
    ];
    const supabase = makeSupabase({
      responses,
      role: 'admin',
      teams: [{ id: 'te-red', name: 'Vermelha', color: 'red', leader_user_id: 'lead-red' }],
    });
    const res = makeRes();
    await makeAggregateHandler(supabase, deps)(req(), res);
    expect(res.body.scope.teamId).toBeNull();
    expect(res.body.scope.locked).toBe(false);
    // sem filtro: 6 promotores + 6 detratores de 12 => índice 0, que na escala 0–10 é 5.
    expect(res.body.geral.empresa.enps).toBe(5);
  });
});

describe('bootstrap do responder — GET /enps/cycle/:id', () => {
  it('devolve status, hasLeader e alreadyResponded do dispatch do jwt-user', async () => {
    const supabase = {
      from(table) {
        if (table === 'survey_cycles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'cyc1', status: 'open', survey_id: 'srv-enps' }, error: null }) }) }) };
        if (table === 'surveys') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { questions: [{ key: 'q_empresa' }] }, error: null }) }) }) };
        if (table === 'survey_dispatches') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'd1', has_responded: false, tenant_id: 't1' }, error: null }) }) }) }) };
        if (table === 'tenant_memberships') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { leader_user_id: 'g1' }, error: null }) }) }) }) };
        throw new Error(table);
      },
    };
    const res = makeRes();
    await makeCycleContextHandler(supabase)({ userId: 'u1', params: { cycleId: 'cyc1' } }, res);
    expect(res.statusCode).toBe(200); // json() sem status() → 200
    expect(res.body).toMatchObject({ ok: true, cycle: { id: 'cyc1', status: 'open' }, hasLeader: true, alreadyResponded: false });
    expect(res.body.questions).toHaveLength(1);
  });

  // Regressão do 500: corretor membro de 2+ tenants. Sem o .eq('tenant_id'), a query
  // casava 2 linhas e o maybeSingle() devolvia PGRST116 → catch → 500.
  it('corretor em 2+ tenants: filtra membership pelo tenant do dispatch (não estoura 500)', async () => {
    const memberships = [
      { user_id: 'u1', tenant_id: 't1', leader_user_id: 'g1' },
      { user_id: 'u1', tenant_id: 't2', leader_user_id: 'g9' },
    ];
    const supabase = {
      from(table) {
        if (table === 'survey_cycles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'cyc1', status: 'open', survey_id: 'srv-enps' }, error: null }) }) }) };
        if (table === 'surveys') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { questions: [] }, error: null }) }) }) };
        if (table === 'survey_dispatches') return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'd1', has_responded: false, tenant_id: 't1' }, error: null }) }) }) }) };
        if (table === 'tenant_memberships') {
          // Mock fiel ao PostgREST: >1 linha no maybeSingle() vira erro, não data.
          const filtered = (f) => memberships.filter((m) => Object.entries(f).every(([k, v]) => m[k] === v));
          const chain = (f) => ({
            eq: (k, v) => chain({ ...f, [k]: v }),
            maybeSingle: async () => {
              const rows = filtered(f);
              if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
              return { data: rows[0] ?? null, error: null };
            },
          });
          return { select: () => chain({}) };
        }
        throw new Error(table);
      },
    };
    const res = makeRes();
    await makeCycleContextHandler(supabase)({ userId: 'u1', params: { cycleId: 'cyc1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, hasLeader: true });
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

// Fake configurável por tabela p/ resolveTeamScope. Cada tabela devolve linhas fixas.
// Suporta .eq().eq().maybeSingle() (tenant_memberships) e .eq() encadeável/thenable (teams).
function makeScopeSupabase(tables) {
  const q = (rows) => {
    const builder = {
      _rows: rows,
      select() { return builder; },
      eq() { return builder; },
      in() { return builder; },
      maybeSingle: async () => ({ data: builder._rows[0] ?? null, error: null }),
      then(res) { return Promise.resolve({ data: builder._rows, error: null }).then(res); },
    };
    return builder;
  };
  return { from: (name) => q(tables[name] || []) };
}

describe('resolveTeamScope', () => {
  const T = 'tenant-1';

  it('admin sem team => sem filtro, lista equipes p/ dropdown', async () => {
    const supabase = makeScopeSupabase({
      tenant_memberships: [{ role: 'admin' }],
      teams: [{ id: 'te-red', name: 'Vermelha', color: 'red', leader_user_id: 'lead-red' }],
    });
    const req = { userId: 'u-admin', userEmail: 'a@x.com', query: {} };
    const { targetLeaderIds, scope } = await resolveTeamScope(supabase, req, T);
    expect(targetLeaderIds).toBeNull();
    expect(scope.locked).toBe(false);
    expect(scope.teams).toEqual([{ id: 'te-red', name: 'Vermelha', color: 'red' }]);
    expect(scope.teamId).toBeNull();
  });

  it('admin com team válido => filtra pelo líder da equipe', async () => {
    const supabase = makeScopeSupabase({
      tenant_memberships: [{ role: 'admin' }],
      teams: [{ id: 'te-red', name: 'Vermelha', color: 'red', leader_user_id: 'lead-red' }],
    });
    const req = { userId: 'u-admin', userEmail: 'a@x.com', query: { team: 'te-red' } };
    const { targetLeaderIds, scope } = await resolveTeamScope(supabase, req, T);
    expect(targetLeaderIds).toEqual(['lead-red']);
    expect(scope.teamId).toBe('te-red');
    expect(scope.teamName).toBe('Vermelha');
  });

  it('team_leader => travado no próprio líder, IGNORA team da query', async () => {
    const supabase = makeScopeSupabase({
      tenant_memberships: [{ role: 'team_leader' }],
      teams: [{ id: 'te-red', name: 'Vermelha', color: 'red', leader_user_id: 'u-leader' }],
    });
    const req = { userId: 'u-leader', userEmail: 'l@x.com', query: { team: 'te-blue' } };
    const { targetLeaderIds, scope } = await resolveTeamScope(supabase, req, T);
    expect(targetLeaderIds).toEqual(['u-leader']);
    expect(scope.locked).toBe(true);
    expect(scope.teams).toEqual([]);
    expect(scope.teamName).toBe('Vermelha');
  });

  it('team_leader sem equipe => targetLeaderIds vazio (tudo insufficient)', async () => {
    const supabase = makeScopeSupabase({
      tenant_memberships: [{ role: 'team_leader' }],
      teams: [],
    });
    const req = { userId: 'u-leader', userEmail: 'l@x.com', query: {} };
    const { targetLeaderIds, scope } = await resolveTeamScope(supabase, req, T);
    expect(targetLeaderIds).toEqual([]);
    expect(scope.locked).toBe(true);
  });
});
