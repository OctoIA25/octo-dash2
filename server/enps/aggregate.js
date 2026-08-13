/**
 * GET /api/v1/enps — agregação oficial do eNPS, tudo pré-calculado no servidor.
 * GET /api/v1/enps/cycle/:cycleId — bootstrap da página de resposta.
 *
 * DOIS eNPS distintos (empresa via enps_empresa, gestor via enps_gestor), lidos
 * das COLUNAS GERADAS.
 *
 * PRIVACIDADE (migration 20260812): as respostas são IDENTIFICADAS — daí os
 * filtros ?team= e ?corretor=. O N-MÍNIMO sobrou SÓ para os comentários, que
 * continuam anônimos (tabela survey_comments, sem vínculo com o autor): com
 * poucas respostas na equipe, o próprio texto entrega quem escreveu.
 *
 * Ranking em JS (PostgREST não faz GROUP BY): exclui só o leader NULL.
 *
 * O ciclo é resolvido por survey_id (via loadEnpsSurvey), pois `kind` vive em
 * `surveys`, não em `survey_cycles`.
 */
import { summarize } from './calc.js';
// Mesma resolução de tenant dos KPIs (era uma cópia idêntica aqui): owner impersona
// via ?tenantId=, os demais derivam da membership, tenant soft-deletado é 403.
import { resolveTenant } from '../kpis/index.js';
import { loadEnpsSurvey as defaultLoadEnpsSurvey } from './runnerDb.js';

const RESPONSES = 'survey_responses';
const DISPATCHES = 'survey_dispatches';
const CYCLES = 'survey_cycles';
const COMMENTS = 'survey_comments';

/** Massa mínima de respostas na equipe para liberar os comentários (único bloco anônimo). */
const MIN_RESPONSES = Number(process.env.ENPS_MIN_RESPONSES) || 5;
const INSUFFICIENT = { insufficient: true };

// Mesmo helper duplicado nos outros módulos do server (kpis, kenlo, zap...).
const PLATFORM_OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
const isPlatformOwner = (email) => (email || '').toLowerCase() === PLATFORM_OWNER_EMAIL;

/**
 * Escopo de equipe efetivo do requisitante. Owner/admin: livre (dropdown +
 * ?team opcional). team_leader: TRAVADO nas equipes que lidera (ignora ?team).
 * Nunca vaza outro tenant: a query de teams é sempre .eq('tenant_id', tenantId).
 * Devolve targetLeaderIds (null = sem filtro) + scope para a UI +
 * canFilterCorretor (quem pode usar ?corretor= — gestão, não o próprio corretor).
 */
export async function resolveTeamScope(supabase, req, tenantId) {
  const owner = isPlatformOwner(req.userEmail);

  // Role do requisitante neste tenant (middleware só dá userId/email).
  let role = null;
  if (!owner) {
    const { data: m, error } = await supabase
      .from('tenant_memberships').select('role')
      .eq('tenant_id', tenantId).eq('user_id', req.userId).maybeSingle();
    if (error) throw error;
    role = m?.role ?? null;
  }

  const requestedTeam = typeof req.query?.team === 'string' ? req.query.team.trim() : '';
  const emptyScope = { locked: false, teamId: null, teamName: null, teams: [] };

  // team_leader: travado nas equipes que lidera.
  if (role === 'team_leader') {
    const { data: led, error } = await supabase
      .from('teams').select('id, name, color, leader_user_id')
      .eq('tenant_id', tenantId).eq('leader_user_id', req.userId);
    if (error) throw error;
    const rows = led || [];
    const targetLeaderIds = [...new Set(rows.map((t) => t.leader_user_id).filter(Boolean))];
    const teamName = rows.length === 1 ? rows[0].name : null;
    return { targetLeaderIds, canFilterCorretor: true, scope: { locked: true, teamId: rows.length === 1 ? rows[0].id : null, teamName, teams: [] } };
  }

  // Owner ou admin: livre, com dropdown.
  if (owner || role === 'admin') {
    const { data: all, error } = await supabase
      .from('teams').select('id, name, color, leader_user_id').eq('tenant_id', tenantId);
    if (error) throw error;
    const teams = (all || []).map((t) => ({ id: t.id, name: t.name, color: t.color }));
    if (requestedTeam) {
      const match = (all || []).find((t) => t.id === requestedTeam);
      if (match && match.leader_user_id) {
        return { targetLeaderIds: [match.leader_user_id], canFilterCorretor: true, scope: { locked: false, teamId: match.id, teamName: match.name, teams } };
      }
      // team inválido/outro tenant: trata como "todas" (nunca vaza).
    }
    return { targetLeaderIds: null, canFilterCorretor: true, scope: { locked: false, teamId: null, teamName: null, teams } };
  }

  // corretor / sem membership: comportamento atual (sem filtro) e SEM recorte por
  // pessoa — ver a nota individual do colega é da gestão, não de um par.
  return { targetLeaderIds: null, canFilterCorretor: false, scope: emptyScope };
}

/** Sem resposta nenhuma o score é null (calc.js) — não há o que exibir. */
function npsBlock(scores) {
  if (scores.length === 0) return INSUFFICIENT;
  return summarize(scores);
}
/** Um bloco {label,count} por score 0..10 — label é a STRING da nota (contrato do front). */
function distBuckets(scores) {
  const buckets = Array.from({ length: 11 }, (_, i) => ({ label: String(i), count: 0 }));
  for (const s of scores) if (s >= 0 && s <= 10) buckets[s].count += 1;
  return buckets;
}
/** Ambos os scores saem juntos ou nenhum (o gate é o total de respostas do recorte). */
function distributionBlock(responseCount, empresaScores, gestorScores) {
  if (responseCount === 0) return INSUFFICIENT;
  return { empresa: distBuckets(empresaScores), gestor: distBuckets(gestorScores) };
}
function rankingBlock(responses) {
  const byLeader = new Map();
  for (const r of responses) {
    const leader = r.subject_leader_user_id;
    if (!leader || r.enps_gestor == null) continue;
    if (!byLeader.has(leader)) byLeader.set(leader, []);
    byLeader.get(leader).push(r.enps_gestor);
  }
  const out = [];
  for (const [leader, scores] of byLeader) {
    const s = summarize(scores);
    out.push({ leaderUserId: leader, enps: s.enps, count: s.count });
  }
  return out.sort((a, b) => b.enps - a.enps);
}

/**
 * Nomes dos usuários exibidos (líderes do ranking + corretores do dropdown).
 * Mesmo padrão de roster.js/leadAssignment.js: tenant_brokers (name, por
 * auth_user_id) é primário, user_profiles (full_name, por id) é fallback.
 */
async function loadUserNames(supabase, tenantId, userIds) {
  const nameMap = new Map();
  if (userIds.length === 0) return nameMap;

  const { data: brokers, error: bErr } = await supabase
    .from('tenant_brokers').select('auth_user_id, name')
    .eq('tenant_id', tenantId).in('auth_user_id', userIds);
  if (bErr) throw bErr;
  for (const b of brokers || []) if (b.auth_user_id && b.name) nameMap.set(b.auth_user_id, b.name);

  const missingIds = userIds.filter((id) => !nameMap.has(id));
  if (missingIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from('user_profiles').select('id, full_name').in('id', missingIds);
    if (pErr) throw pErr;
    for (const p of profiles || []) if (p.full_name) nameMap.set(p.id, p.full_name);
  }
  return nameMap;
}

export function makeAggregateHandler(supabase, deps = {}) {
  const loadEnpsSurvey = deps.loadEnpsSurvey || ((tenantId) => defaultLoadEnpsSurvey(supabase, tenantId));
  return async function aggregateHandler(req, res) {
    try {
      const resolved = await resolveTenant(supabase, req);
      if (resolved.error) return res.status(resolved.status).json({ ok: false, error: resolved.error });
      const { tenantId } = resolved;
      const { targetLeaderIds, canFilterCorretor, scope } = await resolveTeamScope(supabase, req, tenantId);

      const period = typeof req.query?.period === 'string' ? req.query.period : null;
      const periodStart = period || `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}-01`;

      const survey = await loadEnpsSurvey(tenantId);
      const emptyEnvelope = {
        ok: true,
        scope: { ...scope, corretores: [], corretorId: null },
        geral: { empresa: INSUFFICIENT, gestor: INSUFFICIENT },
        evolucao: [],
        participacao: { sent: 0, responded: 0, pending: 0, rate: 0 },
        ranking: [],
        distribuicao: INSUFFICIENT,
        comentarios: INSUFFICIENT,
      };
      if (!survey) return res.json(emptyEnvelope);

      // Ciclo por survey_id (não por kind — kind vive em surveys).
      const { data: cycle, error: cErr } = await supabase
        .from(CYCLES).select('id, status, period_start')
        .eq('tenant_id', tenantId).eq('survey_id', survey.id).eq('period_start', periodStart)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!cycle) return res.json(emptyEnvelope);

      const [{ data: responses, error: rErr }, { data: dispatches, error: dErr }, { data: members, error: mErr }, { data: comments, error: coErr }] = await Promise.all([
        supabase.from(RESPONSES).select('enps_empresa, enps_gestor, subject_leader_user_id, respondent_user_id').eq('cycle_id', cycle.id),
        supabase.from(DISPATCHES).select('status, has_responded, respondent_user_id').eq('cycle_id', cycle.id),
        supabase.from('tenant_memberships').select('user_id, leader_user_id').eq('tenant_id', tenantId).eq('role', 'corretor'),
        supabase.from(COMMENTS).select('text, subject_leader_user_id').eq('cycle_id', cycle.id),
      ]);
      if (rErr) throw rErr; if (dErr) throw dErr; if (mErr) throw mErr; if (coErr) throw coErr;

      let rows = responses || [];
      let disp = dispatches || [];
      let cmts = comments || [];
      const leaderSet = targetLeaderIds === null ? null : new Set(targetLeaderIds);
      if (leaderSet) {
        rows = rows.filter((r) => leaderSet.has(r.subject_leader_user_id));
        cmts = cmts.filter((c) => leaderSet.has(c.subject_leader_user_id));
        // Participação escopada: dispatches dos corretores cujo líder está no alvo.
        const teamMemberIds = new Set(
          (members || []).filter((m) => leaderSet.has(m.leader_user_id)).map((m) => m.user_id),
        );
        disp = disp.filter((d) => teamMemberIds.has(d.respondent_user_id));
      }

      // Gate dos comentários: massa de respostas da EQUIPE, medida ANTES do recorte
      // por corretor (filtrar uma pessoa não estreita o conjunto de quem escreveu).
      const comentarios = rows.length < MIN_RESPONSES ? INSUFFICIENT : cmts.map((c) => ({ text: c.text }));

      // Filtro por corretor (?corretor=): só p/ gestão e só sobre corretores DENTRO
      // do escopo de equipe já resolvido. Id de fora → ignorado (nunca vaza).
      const corretorIds = canFilterCorretor
        ? (members || []).filter((m) => !leaderSet || leaderSet.has(m.leader_user_id)).map((m) => m.user_id)
        : [];
      const requestedCorretor = typeof req.query?.corretor === 'string' ? req.query.corretor.trim() : '';
      const corretorId = corretorIds.includes(requestedCorretor) ? requestedCorretor : null;
      if (corretorId) {
        rows = rows.filter((r) => r.respondent_user_id === corretorId);
        disp = disp.filter((d) => d.respondent_user_id === corretorId);
      }

      const empresaScores = rows.map((r) => r.enps_empresa).filter((n) => n != null);
      const gestorScores = rows.map((r) => r.enps_gestor).filter((n) => n != null);

      const sent = disp.filter((d) => d.status === 'sent').length;
      const responded = disp.filter((d) => d.has_responded).length;
      const pending = disp.filter((d) => d.status === 'sent' && !d.has_responded).length;
      const participacao = { sent, responded, pending, rate: sent ? Math.round((responded / sent) * 100) : 0 };

      const ranking = rankingBlock(rows);
      // Um lookup só para os dois usos (ranking + dropdown de corretores).
      const nameMap = await loadUserNames(supabase, tenantId, [...new Set([...corretorIds, ...ranking.map((r) => r.leaderUserId)])]);
      const rankingWithNames = ranking.map((r) => ({ ...r, leaderName: nameMap.get(r.leaderUserId) ?? 'Gestor' }));
      const corretores = corretorIds
        .map((id) => ({ id, name: nameMap.get(id) ?? 'Corretor' }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      return res.json({
        ok: true,
        scope: { ...scope, corretores, corretorId },
        geral: { empresa: npsBlock(empresaScores), gestor: npsBlock(gestorScores) },
        evolucao: [],
        participacao,
        ranking: rankingWithNames,
        distribuicao: distributionBlock(rows.length, empresaScores, gestorScores),
        comentarios,
      });
    } catch (err) {
      console.error('[enps] erro na agregação:', err);
      return res.status(500).json({ ok: false, error: 'enps_internal_error' });
    }
  };
}

/**
 * GET /api/v1/enps/cycle/:cycleId — bootstrap da página de resposta.
 * Autorização = existência de dispatch para (cycle_id, jwt.uid): 403 se ausente
 * (não vaza status/perguntas de um ciclo de outro tenant). Devolve status,
 * questions, hasLeader (controla a Q2) e alreadyResponded (curto-circuito).
 */
export function makeCycleContextHandler(supabase) {
  return async function cycleContextHandler(req, res) {
    try {
      const userId = req.userId;
      const cycleId = req.params?.cycleId;
      if (!cycleId) return res.status(400).json({ ok: false, error: 'missing_cycle_id' });

      const { data: cycle, error: cErr } = await supabase
        .from(CYCLES).select('id, status, survey_id').eq('id', cycleId).maybeSingle();
      if (cErr) throw cErr;
      if (!cycle) return res.status(404).json({ ok: false, error: 'cycle_not_found' });

      // Autorização: o jwt-user tem dispatch neste ciclo?
      const { data: dispatch, error: dErr } = await supabase
        .from(DISPATCHES).select('id, has_responded, tenant_id').eq('cycle_id', cycleId).eq('respondent_user_id', userId).maybeSingle();
      if (dErr) throw dErr;
      if (!dispatch) return res.status(403).json({ ok: false, error: 'no_dispatch_for_user' });

      // Perguntas do survey do ciclo.
      const { data: survey, error: sErr } = await supabase
        .from('surveys').select('questions').eq('id', cycle.survey_id).maybeSingle();
      if (sErr) throw sErr;

      // hasLeader: o corretor tem leader_user_id NESTE tenant. O filtro por tenant é
      // obrigatório: quem é membro de 2+ tenants faria maybeSingle() estourar PGRST116
      // ("multiple rows") → 500. tenant_id vem da linha do dispatch (mesmo padrão do submit).
      const { data: membership, error: mErr } = await supabase
        .from('tenant_memberships').select('leader_user_id')
        .eq('user_id', userId).eq('tenant_id', dispatch.tenant_id).maybeSingle();
      if (mErr) throw mErr;

      return res.json({
        ok: true,
        cycle: { id: cycle.id, status: cycle.status },
        questions: survey?.questions ?? [],
        hasLeader: Boolean(membership?.leader_user_id),
        alreadyResponded: Boolean(dispatch.has_responded),
      });
    } catch (err) {
      console.error('[enps] erro no bootstrap do ciclo:', err);
      return res.status(500).json({ ok: false, error: 'enps_internal_error' });
    }
  };
}

/**
 * GET /api/v1/enps/pending — "eu tenho uma pesquisa pendente?" para o banner da dash.
 * Self-scoped: olha SÓ os dispatches do próprio jwt-user com has_responded=false,
 * e devolve o primeiro cujo ciclo ainda está 'open'. Anonimato preservado — ninguém
 * vê a pendência de outro corretor. Sem cycleId na URL (a dash não o conhece).
 * Resposta: { ok, pending: false } ou { ok, pending: true, cycleId, periodStart }.
 * O front formata o rótulo do período (mesmo padrão do useEnps).
 */
export function makePendingHandler(supabase) {
  return async function pendingHandler(req, res) {
    try {
      const userId = req.userId;
      // Dispatches não respondidos do próprio corretor. 'sent' = recebeu e não
      // respondeu; 'pending' = throttled no dia-1, ainda vale responder.
      const { data: dispatches, error: dErr } = await supabase
        .from(DISPATCHES)
        .select('cycle_id')
        .eq('respondent_user_id', userId)
        .eq('has_responded', false)
        .in('status', ['pending', 'sent']);
      if (dErr) throw dErr;
      if (!dispatches || dispatches.length === 0) return res.json({ ok: true, pending: false });

      const cycleIds = dispatches.map((d) => d.cycle_id);
      const { data: openCycle, error: cErr } = await supabase
        .from(CYCLES)
        .select('id, period_start')
        .in('id', cycleIds)
        .eq('status', 'open')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!openCycle) return res.json({ ok: true, pending: false });

      return res.json({ ok: true, pending: true, cycleId: openCycle.id, periodStart: openCycle.period_start });
    } catch (err) {
      console.error('[enps] erro ao checar pendência:', err);
      return res.status(500).json({ ok: false, error: 'enps_internal_error' });
    }
  };
}
