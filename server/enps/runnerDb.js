/**
 * Camada de acesso ao banco do runner eNPS. Isolada p/ o runner.js ser testável
 * com helpers injetados. Aqui vive a SEMÂNTICA do claim-before-send.
 */
const DISPATCHES = 'survey_dispatches';
const CYCLES = 'survey_cycles';
const SURVEYS = 'surveys';

/**
 * Domínio do app em produção. Fallback porque link SEM host não é degradação, é
 * e-mail quebrado: o Gmail transforma "/enps/responder?..." em "http:///enps/..."
 * e o corretor bate em "Redirect Notice".
 */
const DEFAULT_PUBLIC_URL = 'https://octodash.octoia.org';

/**
 * Base pública do app = a PRIMEIRA origem de `CORS_ORIGINS` (a env que já declara
 * onde o app é servido). Sem env nova: o domínio do app mora num lugar só.
 */
export function publicBaseUrl(env = process.env) {
  const first = (env.CORS_ORIGINS || '').split(',')[0].trim().replace(/\/+$/, '');
  if (!first) return DEFAULT_PUBLIC_URL;
  return /^https?:\/\//i.test(first) ? first : `https://${first}`;
}

export function responderLink(cycleId) {
  return `${publicBaseUrl()}/enps/responder?cycle=${cycleId}`;
}

export function buildContent({ survey, cycle }) {
  const link = responderLink(cycle.id);
  const title = survey.title || 'Pesquisa de satisfação (eNPS)';
  return {
    subject: title,
    // A copy tem que bater com o que o banco faz: notas identificadas, texto livre anônimo.
    html: `<p>Olá! Responda em 1 minuto: <a href="${link}">${title}</a>.</p><p>As notas ficam identificadas; o campo de comentário é anônimo.</p>`,
    text: `${title}: ${link} (notas identificadas; comentário anônimo)`,
  };
}

/** Tenants candidatos: todos os que têm membership de corretor. Distinct em JS. */
export async function listActiveTenants(supabase) {
  const { data, error } = await supabase.from('tenant_memberships').select('tenant_id').eq('role', 'corretor');
  if (error) throw error;
  const seen = new Set(); const out = [];
  for (const r of data || []) if (r.tenant_id && !seen.has(r.tenant_id)) { seen.add(r.tenant_id); out.push({ tenant_id: r.tenant_id }); }
  return out;
}

/** Definição eNPS: template do tenant, senão o global (tenant_id NULL). */
export async function loadEnpsSurvey(supabase, tenantId) {
  const { data, error } = await supabase
    .from(SURVEYS)
    .select('id, title, questions, reminder_every_days, cycle_closes_day, channels, tenant_id, active')
    .eq('kind', 'enps').eq('active', true)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
  if (error) throw error;
  const rows = data || [];
  return rows.find((r) => r.tenant_id === tenantId) || rows.find((r) => r.tenant_id == null) || null;
}

/** Ciclo do mês: idempotente por UNIQUE(tenant,survey,period_start). */
export async function upsertCycle(supabase, { tenantId, surveyId, periodStart }) {
  const { data, error } = await supabase
    .from(CYCLES)
    .upsert({ tenant_id: tenantId, survey_id: surveyId, period_start: periodStart, status: 'open' },
      { onConflict: 'tenant_id,survey_id,period_start', ignoreDuplicates: false })
    .select('id, status, period_start, tenant_id').maybeSingle();
  if (error) throw error;
  return data;
}

export async function listCycleDispatches(supabase, cycleId) {
  const { data, error } = await supabase
    .from(DISPATCHES).select('id, respondent_user_id, channel, recipient, status, has_responded, last_sent_at, sends_count')
    .eq('cycle_id', cycleId);
  if (error) throw error;
  return data || [];
}

/** CLAIM do envio inicial. upsert ignoreDuplicates: linha nova → linha; conflito → null. */
export async function claimDispatch(supabase, { tenantId, cycleId, respondentUserId, channel, recipient, status }) {
  const { data, error } = await supabase
    .from(DISPATCHES)
    .upsert({ tenant_id: tenantId, cycle_id: cycleId, respondent_user_id: respondentUserId, channel, recipient, status, sends_count: 0 },
      { onConflict: 'cycle_id,respondent_user_id', ignoreDuplicates: true })
    .select('id, respondent_user_id').maybeSingle();
  if (error) throw error;
  return data; // null = conflito → já reservado
}

export async function markDispatch(supabase, id, patch) {
  const { error } = await supabase.from(DISPATCHES).update(patch).eq('id', id);
  if (error) throw error;
}

/** CLAIM do lembrete via RPC enps_claim_reminder (Task 1): UPDATE...RETURNING atômico. */
export async function claimReminder(supabase, { dispatchId, reminderEveryDays, nowIso }) {
  const { data, error } = await supabase.rpc('enps_claim_reminder', { p_dispatch_id: dispatchId, p_reminder_days: reminderEveryDays, p_now: nowIso });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function closeCycle(supabase, cycleId) {
  const { error } = await supabase.from(CYCLES).update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', cycleId).eq('status', 'open');
  if (error) throw error;
}
