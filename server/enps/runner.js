/**
 * Runner do eNPS: por tick, para cada tenant não soft-deletado, garante o ciclo
 * do mês, envia no dia 1 (claim-before-send), lembra a cada N dias quem não
 * respondeu, e fecha o ciclo passado o dia de fechamento.
 *
 * Reentrância POR TENANT (igual C2S/syncRunner): tick pesado de um tenant não
 * adia os demais; tenant em voo é pulado. A corretude ENTRE processos (deploy
 * rolling / 2 pods) vem do CLAIM no banco, não do Set em memória.
 *
 * IDEMPOTÊNCIA — "tem linha" ≠ "foi enviado":
 *  - Envio inicial: upsert ignoreDuplicates é o CLAIM. Linha 'pending' ANTES do
 *    transporte. Conflito → PULA. Enviou → 'sent'. Falhou → 'failed' (reavalia).
 *  - Lembrete: RPC enps_claim_reminder (UPDATE...RETURNING). Linha de volta =
 *    venceu → envia. sends_count+1 atômico no SQL evita lost-update entre pods.
 *
 * ponytail: sem fila durável; o UNIQUE vira o claim (custo zero).
 * ponytail: scan "todo tenant × todo corretor" é O(t×c) — ok até ~500 tenants;
 * acima, migrar p/ due-work-queue (next_action_at + LIMIT). Não agora.
 */
import { getActiveCorretores as defaultGetActiveCorretores } from './roster.js';
import { getDeletedTenantIds as defaultGetDeletedTenantIds } from '../utils/tenantSoftDelete.js';
import { recordHeartbeat as defaultRecordHeartbeat } from '../observability/heartbeat.js';
import { makeSendSurvey } from './sender.js';
import * as db from './runnerDb.js';

const dayOfMonth = (d) => d.getUTCDate();
function msSince(lastSentAt, now) {
  if (!lastSentAt) return null;
  return now.getTime() - new Date(lastSentAt).getTime();
}

export function makeEnpsRunner(supabase, options = {}) {
  const logger = options.logger || console;
  const now = options.now || (() => new Date());
  const sendSurvey = options.sendSurvey || makeSendSurvey(supabase, options);

  const deps = {
    listActiveTenants: options.listActiveTenants || (() => db.listActiveTenants(supabase)),
    getDeletedTenantIds: options.getDeletedTenantIds || ((ids) => defaultGetDeletedTenantIds(supabase, ids)),
    loadSurvey: options.loadSurvey || ((tenantId) => db.loadEnpsSurvey(supabase, tenantId)),
    upsertCycle: options.upsertCycle || ((a) => db.upsertCycle(supabase, a)),
    getActiveCorretores: options.getActiveCorretores || ((tenantId) => defaultGetActiveCorretores(supabase, tenantId)),
    listDispatches: options.listDispatches || ((cid) => db.listCycleDispatches(supabase, cid)),
    claimDispatch: options.claimDispatch || ((a) => db.claimDispatch(supabase, a)),
    markDispatch: options.markDispatch || ((id, patch) => db.markDispatch(supabase, id, patch)),
    claimReminder: options.claimReminder || ((a) => db.claimReminder(supabase, a)),
    closeCycle: options.closeCycle || ((cid) => db.closeCycle(supabase, cid)),
    recordHeartbeat: options.recordHeartbeat || ((k, m) => defaultRecordHeartbeat(supabase, k, m)),
    buildContent: options.buildContent || db.buildContent,
  };

  const inFlight = new Set();

  function resolveChannel(corretor, survey) {
    const channels = Array.isArray(survey.channels) ? survey.channels : ['email'];
    if (channels.includes('email') && corretor.email) return { channel: 'email', recipient: corretor.email };
    if (channels.includes('whatsapp') && corretor.phone) return { channel: 'whatsapp', recipient: corretor.phone };
    return { channel: 'email', recipient: corretor.email || null };
  }

  async function sendInitial({ tenantId, cycle, corretor, survey }) {
    const { channel, recipient } = resolveChannel(corretor, survey);
    if (!recipient) {
      await deps.claimDispatch({ tenantId, cycleId: cycle.id, respondentUserId: corretor.userId, channel, recipient: null, status: 'skipped_no_contact' });
      return;
    }
    const claimed = await deps.claimDispatch({ tenantId, cycleId: cycle.id, respondentUserId: corretor.userId, channel, recipient, status: 'pending' });
    if (!claimed) return; // conflito → outra instância/tick já reservou; NÃO envia.

    const content = deps.buildContent({ survey, cycle, corretor });
    const params = [corretor.email || 'corretor', `${db.responderLink(cycle.id)}`];
    const r = await sendSurvey({ tenantId, channel, recipient, content, params });

    if (r.status === 'sent') {
      await deps.markDispatch(claimed.id, { status: 'sent', sends_count: 1, last_sent_at: now().toISOString(), error: null });
    } else if (r.status === 'throttled') {
      logger.log?.(`[enps] throttled tenant=${tenantId} user=${corretor.userId} — pending p/ próximo tick`);
    } else if (r.status === 'skipped_no_contact') {
      await deps.markDispatch(claimed.id, { status: 'skipped_no_contact', error: r.error || null });
    } else {
      await deps.markDispatch(claimed.id, { status: 'failed', error: r.error || 'falha no envio' });
    }
  }

  async function sendReminder({ tenantId, cycle, dispatch, survey, corretor }) {
    const won = await deps.claimReminder({ dispatchId: dispatch.id, reminderEveryDays: survey.reminder_every_days, nowIso: now().toISOString() });
    if (!won) return;
    const content = deps.buildContent({ survey, cycle, corretor });
    const params = [dispatch.recipient || 'corretor', `${db.responderLink(cycle.id)}`];
    const r = await sendSurvey({ tenantId, channel: dispatch.channel, recipient: dispatch.recipient, content, params });
    if (r.status !== 'sent') logger.log?.(`[enps] lembrete não enviado tenant=${tenantId} dispatch=${dispatch.id} status=${r.status}`);
  }

  async function runTenantTick(tenant) {
    const tenantId = tenant.tenant_id;
    const today = now();
    const survey = await deps.loadSurvey(tenantId);
    if (!survey) return;

    const periodStart = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const cycle = await deps.upsertCycle({ tenantId, surveyId: survey.id, periodStart });
    if (!cycle) return;

    if (dayOfMonth(today) > survey.cycle_closes_day) {
      if (cycle.status !== 'closed') await deps.closeCycle(cycle.id);
      return;
    }
    if (cycle.status === 'closed') return;

    const [corretores, dispatches] = await Promise.all([deps.getActiveCorretores(tenantId), deps.listDispatches(cycle.id)]);
    const dispatchByUser = new Map(dispatches.map((d) => [d.respondent_user_id, d]));

    for (const corretor of corretores) {
      const existing = dispatchByUser.get(corretor.userId);
      if (!existing) { await sendInitial({ tenantId, cycle, corretor, survey }); continue; }
      if (existing.status === 'sent' && existing.has_responded === false) {
        const elapsed = msSince(existing.last_sent_at, today);
        const dueMs = survey.reminder_every_days * 24 * 60 * 60 * 1000;
        if (elapsed == null || elapsed >= dueMs) await sendReminder({ tenantId, cycle, dispatch: existing, survey, corretor });
      }
    }
  }

  async function processTenant(tenant) {
    const started = Date.now();
    try {
      await runTenantTick(tenant);
      await deps.recordHeartbeat('enps_scheduler', { ok: true, durationMs: Date.now() - started });
    } catch (e) {
      logger.error?.(`[enps] tick do tenant=${tenant.tenant_id} falhou: ${e?.message}`);
      await deps.recordHeartbeat('enps_scheduler', { result: { error: e?.message }, ok: false, durationMs: Date.now() - started });
    } finally {
      inFlight.delete(tenant.tenant_id);
    }
  }

  async function trigger({ tenantId = null } = {}) {
    let tenants;
    try { tenants = await deps.listActiveTenants(); }
    catch (e) { logger.error?.(`[enps] listar tenants falhou: ${e?.message}`); return { started: 0, skipped: 0, error: 'falha ao listar tenants' }; }
    const ids = (tenants || []).map((t) => t.tenant_id).filter(Boolean);
    const deleted = await deps.getDeletedTenantIds(ids);
    const targets = (tenants || []).filter((t) => t.tenant_id && !deleted.has(t.tenant_id) && (!tenantId || t.tenant_id === tenantId));

    let started = 0, skipped = 0;
    const runs = [];
    for (const t of targets) {
      if (inFlight.has(t.tenant_id)) { skipped++; continue; }
      inFlight.add(t.tenant_id); started++; runs.push(processTenant(t));
    }
    Promise.allSettled(runs); // fire-and-report (mesma forma do syncRunner)
    return { started, skipped };
  }

  return { trigger, isRunning: (id) => (id ? inFlight.has(id) : inFlight.size > 0), runTenantTick };
}
