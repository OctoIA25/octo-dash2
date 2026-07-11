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
    ]);

    // --- Cards por tenant (cada um degrada isolado) ---
    const tenant = {};

    tenant.contact2sale = c2s.status === 'fulfilled' && !c2s.value.error
      ? deriveSyncCard(c2s.value.data, now) : unavailableCard();

    tenant.kenlo = kenlo.status === 'fulfilled' && !kenlo.value.error
      ? deriveSyncCard(kenlo.value.data, now) : unavailableCard();

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

    if (ia.status === 'fulfilled' && !ia.value.error) {
      const key = ia.value.data?.[0];
      tenant.ia = key
        ? { available: true, provider: key.provider, model: key.model, telemetry: 'not_instrumented' }
        : { available: true, provider: null, model: null, telemetry: 'not_instrumented' };
    } else {
      tenant.ia = unavailableCard();
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
