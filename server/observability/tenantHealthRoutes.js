/**
 * P2 — Status do Tenant: endpoint agregado (I/O + montagem).
 * Spec: docs/superpowers/specs/2026-07-11-status-do-tenant-design.md
 *
 * GET /api/v1/health/tenant/:tenantId — owner-only. Lê estado JÁ persistido de
 * cada integração por tenant + liveness global dos jobs (job_heartbeats da P1) e
 * devolve cards prontos. SÓ LEITURA — não chama engines nem serviços externos.
 *
 * Todas as leituras por-tenant são independentes → Promise.allSettled: uma falha
 * vira card `available:false`, nunca derruba a página (é ferramenta de diagnóstico,
 * não pode cair na presença do defeito que deveria medir). Sempre 200 se a auth passa.
 *
 * A derivação de status/classificação vive em tenantHealthLogic.js (puro/testável).
 */
import { makeRequireOwner } from '../utils/ownerAuth.js';
import { JOB_LIMITS } from './healthRoutes.js';
import {
  deriveSyncCard, deriveOutboxCard, deriveWebhooksCard, deriveWhatsappCard, unavailableCard,
  deriveLiaCard, deriveAnthropicCard,
} from './tenantHealthLogic.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEBHOOK_WINDOW_MS = 24 * 60 * 60 * 1000; // "falhas recentes" = últimas 24h (usa índice de created_at).

// Conta linhas por tenant+status sem trazê-las (head:true) — mesmo padrão de
// agent-actions/routes.js:393, já em produção. Erra p/ null → o card lida.
async function countBy(supabase, table, filters) {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count || 0;
}

// Último erro recente de uma tabela (p/ classificar origem). Best-effort.
async function lastErrorFrom(supabase, table, tenantId, errorCol, statusCol, statusVal) {
  const { data } = await supabase
    .from(table).select(`${errorCol}`)
    .eq('tenant_id', tenantId).eq(statusCol, statusVal)
    .order('created_at', { ascending: false }).limit(1);
  return data?.[0]?.[errorCol] || null;
}

// Traz valores de UMA coluna (com filtros) — p/ agregados que o PostgREST não faz nativo.
// ponytail: teto de 5000 linhas ok no volume atual (maior tabela lia_* = ~560 linhas);
// se alguma lia_* passar de 5000, interacao_media/leads_qualificados subcontam — subir o limite ou paginar.
async function selectCol(supabase, table, col, filters, limit = 5000) {
  let q = supabase.from(table).select(col).limit(limit);
  for (const [c, v] of Object.entries(filters)) q = q.eq(c, v);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export function registerTenantHealthRoutes(app, supabase) {
  const requireOwner = makeRequireOwner(supabase);

  app.get('/api/v1/health/tenant/:tenantId', requireOwner, async (req, res) => {
    const { tenantId } = req.params;
    if (!UUID_RE.test(tenantId || '')) {
      return res.status(400).json({ error: 'invalid_tenant_id' });
    }
    const now = Date.now();
    
    // Cada thunk é independente. allSettled: falha isolada → card indisponível.
    const [
      c2s, kenlo, ia,
      outboxPending, outboxFailed, outboxErr,
      webhookFailures, webhookErr,
      waConfig, waQueued, waFailed, waErr,
      jobs, tenantRow,
      // LIA (todas filtram por tenant_id):
      liaMsgTotal, liaMsgIA, liaMsgUser, liaLastMsg,
      liaFpending, liaFsent, liaFcancelled, liaFexpired,
      liaPpendente, liaPrespondida, liaRespostas,
      liaVisTotal, liaVisConfirmadas,
      liaInteracoes, liaFatos, liaFactsRows,
      anthropicRes,
    ] = await Promise.allSettled([
      
      supabase.from('tenant_contact2sale_config').select('status,last_sync_at,sync_state').eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('kenlo_integrations').select('status,last_sync_at,leads_count,sync_state').eq('tenant_id', tenantId).maybeSingle(),
      supabase.from('tenant_api_keys').select('provider,model').eq('tenant_id', tenantId).limit(1),
      
      countBy(supabase, 'agent_action_queue', { tenant_id: tenantId, status: 'pending' }),
      countBy(supabase, 'agent_action_queue', { tenant_id: tenantId, status: 'failed' }),
      lastErrorFrom(supabase, 'agent_action_queue', tenantId, 'error', 'status', 'failed'),
      
      // webhooks: falhas na janela recente (índice created_at)
      supabase.from('webhook_events').select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).eq('status', 'failed').gte('created_at', new Date(now - WEBHOOK_WINDOW_MS).toISOString()),
      lastErrorFrom(supabase, 'webhook_events', tenantId, 'last_error', 'status', 'failed'),
      
      supabase.from('whatsapp_config').select('is_active').eq('tenant_id', tenantId).maybeSingle(),
      countBy(supabase, 'whatsapp_messages', { tenant_id: tenantId, status: 'queued' }),
      countBy(supabase, 'whatsapp_messages', { tenant_id: tenantId, status: 'failed' }),
      lastErrorFrom(supabase, 'whatsapp_messages', tenantId, 'error_message', 'status', 'failed'),
      
      supabase.from('job_heartbeats').select('job_name,last_run_at,last_result'),
      // Soft-delete: diagnóstico legítimo p/ owner (não bloqueia — só sinaliza).
      supabase.from('tenants').select('deleted_at').eq('id', tenantId).maybeSingle(),

      // --- LIA (só leitura, agregados; toda query filtra tenant_id) ---
      // NÃO ler colunas mortas de lia_lead_extra (empreendimentos_shown/liked/rejected,
      // search_context, conversation_state, inferred_profile, rejection_count): 0/339
      // populadas em 2026-07-12. Métrica sobre coluna vazia engana — não construir sobre elas.
      countBy(supabase, 'lia_corretor_messages', { tenant_id: tenantId }),
      countBy(supabase, 'lia_corretor_messages', { tenant_id: tenantId, role: 'assistant' }),
      countBy(supabase, 'lia_corretor_messages', { tenant_id: tenantId, role: 'user' }),
      supabase.from('lia_corretor_messages').select('created_at')
        .eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1),
      countBy(supabase, 'lia_followups', { tenant_id: tenantId, status: 'pending' }),
      countBy(supabase, 'lia_followups', { tenant_id: tenantId, status: 'sent' }),
      countBy(supabase, 'lia_followups', { tenant_id: tenantId, status: 'cancelled' }),
      countBy(supabase, 'lia_followups', { tenant_id: tenantId, status: 'expired' }),
      countBy(supabase, 'lia_perguntas_corretor', { tenant_id: tenantId, status: 'pendente' }),
      countBy(supabase, 'lia_perguntas_corretor', { tenant_id: tenantId, status: 'respondida' }),
      selectCol(supabase, 'lia_perguntas_corretor', 'criado_em,respondida_em', { tenant_id: tenantId, status: 'respondida' }),
      countBy(supabase, 'lia_visitas', { tenant_id: tenantId }),
      countBy(supabase, 'lia_visitas', { tenant_id: tenantId, status: 'confirmada' }),
      selectCol(supabase, 'lia_lead_extra', 'interaction_count', { tenant_id: tenantId }),
      countBy(supabase, 'lia_lead_facts', { tenant_id: tenantId }),
      selectCol(supabase, 'lia_lead_facts', 'lead_id', { tenant_id: tenantId }),

      supabase.from('tenant_anthropic_config')
        .select('status,last_state,last_percentage,last_usage_usd,weekly_limit_usd,last_window_start,last_window_end,last_error,last_synced_at')
        .eq('tenant_id', tenantId).maybeSingle(),
    ]);

    // --- Cards por tenant (cada um degrada isolado) ---
    const tenant = {};

    tenant.contact2sale = c2s.status === 'fulfilled' && !c2s.value.error
      ? deriveSyncCard(c2s.value.data, now) : unavailableCard();

    tenant.kenlo = kenlo.status === 'fulfilled' && !kenlo.value.error
      ? deriveSyncCard(kenlo.value.data, now) : unavailableCard();

    tenant.anthropic = anthropicRes.status === 'fulfilled' && !anthropicRes.value.error
      ? deriveAnthropicCard(anthropicRes.value.data) : unavailableCard();

    tenant.outbox = (outboxPending.status === 'fulfilled' && outboxFailed.status === 'fulfilled')
      ? deriveOutboxCard({
          pending: outboxPending.value, failed: outboxFailed.value,
          lastError: outboxErr.status === 'fulfilled' ? outboxErr.value : null,
        })
      : unavailableCard();

    tenant.webhooks = (webhookFailures.status === 'fulfilled' && !webhookFailures.value.error)
      ? deriveWebhooksCard({
          recentFailures: webhookFailures.value.count || 0,
          lastError: webhookErr.status === 'fulfilled' ? webhookErr.value : null,
        })
      : unavailableCard();

    tenant.whatsapp = (waConfig.status === 'fulfilled' && waQueued.status === 'fulfilled' && waFailed.status === 'fulfilled')
      ? deriveWhatsappCard({
          active: !!(waConfig.value.data?.is_active),
          queued: waQueued.value, failed: waFailed.value,
          lastError: waErr.status === 'fulfilled' ? waErr.value : null,
        })
      : unavailableCard();

    // IA + LIA. Card base (provider/model) degrada junto do api_keys; o bloco lia
    // degrada isolado (allSettled). telemetry:'not_instrumented' foi substituído.
    if (ia.status === 'fulfilled' && !ia.value.error) {
      const key = ia.value.data?.[0];
      tenant.ia = { available: true, provider: key?.provider ?? null, model: key?.model ?? null };
    } else {
      tenant.ia = unavailableCard();
    }
    // Bloco lia: exige as leituras essenciais fulfilled; senão indisponível.
    const liaCore = [liaMsgTotal, liaMsgIA, liaMsgUser, liaFpending, liaFsent, liaFcancelled, liaFexpired, liaPpendente, liaPrespondida, liaVisTotal, liaVisConfirmadas, liaFatos];
    const val = (s, d) => (s.status === 'fulfilled' ? s.value : d);
    if (liaCore.every((s) => s.status === 'fulfilled')) {
      tenant.ia.lia = deriveLiaCard({
        totalMensagens: liaMsgTotal.value, msgsIA: liaMsgIA.value, msgsCorretor: liaMsgUser.value,
        ultimaMsgAt: (liaLastMsg.status === 'fulfilled' && !liaLastMsg.value.error) ? (liaLastMsg.value.data?.[0]?.created_at ?? null) : null,
        fPending: liaFpending.value, fSent: liaFsent.value, fCancelled: liaFcancelled.value, fExpired: liaFexpired.value,
        pPendente: liaPpendente.value, pRespondida: liaPrespondida.value,
        respostasRows: val(liaRespostas, []),
        visTotal: liaVisTotal.value, visConfirmadas: liaVisConfirmadas.value,
        interacoes: val(liaInteracoes, []).map((r) => r.interaction_count).filter((n) => typeof n === 'number'),
        fatos: liaFatos.value,
        leadsQualificados: new Set(val(liaFactsRows, []).map((r) => r.lead_id)).size,
        now,
      });
    } else if (tenant.ia.available) {
      tenant.ia.lia = unavailableCard();
    }

    // --- Plataforma: liveness global dos jobs (reusa JOB_LIMITS da P1) ---
    const platform = { jobs: {} };
    if (jobs.status === 'fulfilled' && !jobs.value.error) {
      const byName = new Map((jobs.value.data || []).map((r) => [r.job_name, r]));
      for (const [jobName, limitMs] of Object.entries(JOB_LIMITS)) {
        const row = byName.get(jobName);
        if (!row) { platform.jobs[jobName] = { ok: false, age_s: null }; continue; }
        const ageMs = now - new Date(row.last_run_at).getTime();
        const ok = ageMs <= limitMs && row.last_result?.ok !== false;
        platform.jobs[jobName] = { ok, age_s: Math.round(ageMs / 1000) };
      }
    } else {
      platform.jobs = { available: false };
    }

    // Sinaliza soft-delete/inexistência (diagnóstico, não bloqueio).
    const deletedAt = tenantRow.status === 'fulfilled' ? (tenantRow.value.data?.deleted_at || null) : null;
    const exists = tenantRow.status === 'fulfilled' ? tenantRow.value.data != null : null;

    res.json({ tenantId, exists, deleted_at: deletedAt, tenant, platform });
  });
}
