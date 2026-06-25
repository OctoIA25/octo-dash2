/**
 * 🎯 Orquestração do Agente Disparador (lógica pura, sem HTTP).
 *
 * Duas operações, separadas de propósito (proteção contra disparo acidental):
 *
 *   previewOperation()  — interpreta o comando, resolve o segmento, calcula
 *                         elegibilidade/exclusões e PERSISTE um run 'pending'.
 *                         NÃO envia nada. Devolve o previewToken (= run.id) e as
 *                         contagens que o usuário precisa confirmar.
 *
 *   confirmOperation()  — recebe o previewToken, valida (run existe, está
 *                         'pending', mesmo tenant/usuário), enfileira 1 item por
 *                         destinatário elegível e marca o run 'running'. O worker
 *                         drena depois. Idempotente: confirmar 2x não reenfileira
 *                         (a transição pending→running só vence uma vez).
 *
 * Tudo recebe supabase + deps por parâmetro → testável sem rede/LLM.
 */

import crypto from 'crypto';
import { interpretCommand } from './interpreter.js';
import { resolveSegment, resolveSegmentDual } from './segmentResolver.js';
import { getAction } from './actionRegistry.js';
import { validateSegment } from './segmentSchema.js';

const RUNS_TABLE = 'agent_action_runs';
const QUEUE_TABLE = 'agent_action_queue';

// Teto de destinatários por operação (anti-spam / proteção operacional).
// Override por tenant é possível no futuro; default conservador aqui.
const DEFAULT_MAX_RECIPIENTS = 500;

/** Roles que podem disparar em massa (segmentos amplos). */
const MASS_ROLES = new Set(['owner', 'admin', 'team_leader']);

/**
 * Constrói a prévia da operação e persiste o run 'pending'.
 *
 * @param supabase client (service_role)
 * @param input { command, tenantId, user: { id, email, role, brokerName? } }
 * @param deps  { interpret?, resolve?, nowMs?, maxRecipients?, interpretOpts? }
 *              interpretOpts é repassado ao interpreter (webhookUrl/usuario do n8n).
 */
export async function previewOperation(supabase, input, deps = {}) {
  const { command, audienceId, tenantId, mode, user = {} } = input;
  const {
    interpret = interpretCommand,
    resolve = resolveSegmentDual,
    nowMs = Date.now(),
    maxRecipients = DEFAULT_MAX_RECIPIENTS,
  } = deps;

  if (!tenantId) return { ok: false, error: 'tenant_required' };

  // 1) Deriva a `operation` — por audienceId (público salvo) ou por command (n8n).
  let operation;
  if (audienceId) {
    const { data: aud, error: audErr } = await supabase
      .from('audiences').select('segment').eq('id', audienceId).eq('tenant_id', tenantId).maybeSingle();
    if (audErr) return { ok: false, error: 'audience_lookup_failed', detail: audErr.message };
    if (!aud) return { ok: false, error: 'audience_not_found' };
    const segCheck = validateSegment(aud.segment);
    if (!segCheck.ok) return { ok: false, error: 'invalid_segment' };
    operation = { action: 'send_whatsapp', segment: segCheck.segment, params: { message: '' }, needsMessage: true };
  } else {
    if (!command || !String(command).trim()) return { ok: false, error: 'empty_command' };
    const interpreted = await interpret(command, deps.interpretOpts || {});
    if (!interpreted.ok) {
      return { ok: false, error: interpreted.error, clarification: interpreted.clarification || null };
    }
    operation = interpreted.operation;
  }

  const action = getAction(operation.action);
  if (!action) return { ok: false, error: `unsupported_action:${operation.action}` };

  // 2) Permissão: corretor só dispara para os próprios leads. Forçamos o escopo
  //    de corretor no resolver; sem nome de corretor resolvível, bloqueia.
  const isMass = MASS_ROLES.has(user.role);
  let brokerScope = null;
  if (!isMass) {
    if (!user.brokerName) return { ok: false, error: 'forbidden_no_broker_identity' };
    brokerScope = user.brokerName;
  }

  // 3) Resolve o segmento (reusa a camada de leads, sempre tenant-scoped).
  //    `mode` vem do input (injetado pela rota via config de tenant). Se ausente,
  //    resolveSegmentDual cai em kenlo_only por default — comportamento idêntico ao atual.
  const resolved = await resolve(supabase, operation.segment, { tenantId, brokerScope, nowMs, mode });
  if (!resolved.ok) return { ok: false, error: resolved.error, detail: resolved.detail };

  const found = resolved.rows;

  // 4) Elegibilidade por destinatário (ex.: WhatsApp exige telefone válido) +
  //    dedup interno (mesmo lead aparecendo 2x no segmento).
  const seen = new Set();
  const eligible = [];
  let noWhatsapp = 0;
  for (const lead of found) {
    if (seen.has(lead.id)) continue;
    seen.add(lead.id);
    const elig = action.checkEligibility(lead, operation.params);
    if (!elig.eligible) {
      if (elig.reason === 'no_whatsapp') noWhatsapp += 1;
      continue;
    }
    eligible.push(lead);
  }

  // 5) Limite de envio (anti-spam): excedente é excluído e sinalizado.
  let excluded = 0;
  let capped = eligible;
  if (eligible.length > maxRecipients) {
    capped = eligible.slice(0, maxRecipients);
    excluded = eligible.length - maxRecipients;
  }

  // 6) Persiste o run 'pending' (cabeçalho de auditoria + alvo da confirmação).
  const previewToken = crypto.randomUUID();
  const nowIso = new Date(nowMs).toISOString();
  const { error: insErr } = await supabase.from(RUNS_TABLE).insert({
    id: previewToken,
    tenant_id: tenantId,
    action_type: operation.action,
    command_text: command != null ? String(command) : null,
    segment: operation.segment,
    found_count: found.length,
    eligible_count: capped.length,
    no_whatsapp_count: noWhatsapp,
    excluded_count: excluded,
    status: 'pending',
    requested_by_user_id: user.id || null,
    requested_by_email: user.email || null,
    requested_by_role: user.role || null,
    created_at: nowIso,
    // Campos de diagnóstico dual-source (defensivos: undefined → null para fakes antigos).
    primary_source: resolved.primarySource ?? null,
    public_source_diagnostic: resolved.diagnostic ?? null,
  });
  if (insErr) return { ok: false, error: 'persist_failed', detail: insErr.message };

  // Guarda os elegíveis no payload do run não — para evitar duplicar dados
  // sensíveis e divergência, a confirmação RE-RESOLVE o segmento. Ver confirm.

  // Monta sourceComparison apenas quando há diagnostic (shadow/dual mode).
  // Se diagnostic for { truncated: true }, repassa truncado. Nenhum telefone exposto.
  let sourceComparison;
  const diag = resolved.diagnostic;
  if (diag !== undefined && diag !== null) {
    if (diag.truncated) {
      sourceComparison = { truncated: true };
    } else {
      sourceComparison = {
        primaryCount: diag.primaryCount,
        secondaryCount: diag.secondaryCount,
        inBoth: diag.inBoth,
        onlyInPrimary: diag.onlyInPrimary,
        onlyInSecondary: diag.onlyInSecondary,
        divergent: (diag.onlyInPrimary > 0 || diag.onlyInSecondary > 0),
      };
    }
  }

  return {
    ok: true,
    previewToken,
    needsMessage: operation.needsMessage,
    preview: {
      action: operation.action,
      segment: operation.segment,
      foundCount: found.length,
      eligibleCount: capped.length,
      noWhatsappCount: noWhatsapp,
      excludedCount: excluded,
      message: operation.params.message,
      // amostra de nomes para a UI ("João Silva, Maria..."), sem expor telefones.
      sampleNames: capped.slice(0, 10).map((l) => l.name).filter(Boolean),
    },
    // Presente apenas quando o modo é dual-source (shadow/leads_primary).
    // Ausente em kenlo_only / leads_only (sem diagnóstico).
    ...(sourceComparison !== undefined ? { sourceComparison } : {}),
  };
}

/**
 * Confirma e enfileira a operação previamente apresentada.
 *
 * RE-RESOLVE o segmento no momento da confirmação (fonte de verdade fresca) e
 * enfileira os elegíveis. A mensagem efetiva vem do confirm (o usuário pode tê-la
 * fornecido só agora, se needsMessage era true).
 *
 * @param input { previewToken, tenantId, message, user: { id, email, role, brokerName? } }
 */
export async function confirmOperation(supabase, input, deps = {}) {
  const { previewToken, tenantId, message, user = {} } = input;
  const { resolve = resolveSegmentDual, nowMs = Date.now() } = deps;

  if (!previewToken) return { ok: false, error: 'missing_preview_token' };
  if (!tenantId) return { ok: false, error: 'tenant_required' };

  // 1) Carrega o run e valida posse + estado.
  const { data: run, error: runErr } = await supabase
    .from(RUNS_TABLE)
    .select('*')
    .eq('id', previewToken)
    .eq('tenant_id', tenantId) // tenant-scope: não confirma run de outro tenant
    .maybeSingle();
  if (runErr) return { ok: false, error: 'run_lookup_failed', detail: runErr.message };
  if (!run) return { ok: false, error: 'run_not_found' };
  if (run.status !== 'pending') return { ok: false, error: 'already_confirmed' };
  // posse: só quem pediu (ou owner) confirma.
  if (run.requested_by_user_id && user.id && run.requested_by_user_id !== user.id && user.role !== 'owner') {
    return { ok: false, error: 'forbidden_not_requester' };
  }

  const action = getAction(run.action_type);
  if (!action) return { ok: false, error: `unsupported_action:${run.action_type}` };

  const effectiveMessage = String(message ?? '').trim();
  if (action.type === 'send_whatsapp' && !effectiveMessage) {
    return { ok: false, error: 'message_required' };
  }

  // 2) Claim atômico do run: pending → running. Vence só uma confirmação
  //    concorrente (proteção contra duplo-clique / requests simultâneos).
  const nowIso = new Date(nowMs).toISOString();
  const { data: claimed, error: claimErr } = await supabase
    .from(RUNS_TABLE)
    .update({ status: 'running', confirmed_at: nowIso })
    .eq('id', previewToken)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (claimErr) return { ok: false, error: 'claim_failed', detail: claimErr.message };
  if (!claimed) return { ok: false, error: 'already_confirmed' };

  // 3) Re-resolve o segmento (fresco) com o mesmo escopo de permissão.
  const isMass = MASS_ROLES.has(user.role);
  const brokerScope = isMass ? null : user.brokerName || null;
  if (!isMass && !brokerScope) return { ok: false, error: 'forbidden_no_broker_identity' };

  // Deriva o modo "primary-only" a partir da fonte gravada no run (sem re-rodar shadow/diff).
  // null/legado → kenlo_only (default seguro); 'crm' → leads_only.
  const confirmMode = run.primary_source === 'crm' ? 'leads_only' : 'kenlo_only';

  const resolved = await resolve(supabase, run.segment, { tenantId, brokerScope, nowMs, mode: confirmMode });
  if (!resolved.ok) return { ok: false, error: resolved.error, detail: resolved.detail };

  // 4) Monta os itens elegíveis (dedup + elegibilidade), até o limite gravado.
  // O teto de destinatários da prévia = elegíveis confirmados + excedente
  // cortado. Reaplicar o MESMO teto aqui garante que a confirmação nunca dispare
  // mais do que foi apresentado, mesmo que o segmento tenha crescido nesse meio.
  const recipientCap = (run.eligible_count || 0) + (run.excluded_count || 0);
  const seen = new Set();
  const items = [];
  for (const lead of resolved.rows) {
    if (seen.has(lead.id)) continue;
    seen.add(lead.id);
    const elig = action.checkEligibility(lead, { message: effectiveMessage });
    if (!elig.eligible) continue;
    if (items.length >= recipientCap) break;
    items.push({
      tenant_id: tenantId,
      run_id: previewToken,
      action_type: run.action_type,
      lead_id: String(lead.id),
      lead_source: lead.source || 'crm',
      lead_name: lead.name || null,
      lead_phone: lead.phone || null,
      payload: action.buildPayload({ message: effectiveMessage }, lead),
      status: 'pending',
      idempotency_key: `${tenantId}|${previewToken}|${lead.id}`,
    });
  }

  if (items.length === 0) {
    await supabase
      .from(RUNS_TABLE)
      .update({ status: 'done', completed_at: nowIso, eligible_count: 0 })
      .eq('id', previewToken);
    return { ok: true, enqueued: 0, runId: previewToken };
  }

  // 5) Enfileira. ON CONFLICT (idempotency_key) é coberto pela UNIQUE da tabela:
  //    upsert ignorando conflito garante que reenfileiramentos não dupliquem.
  const { error: enqErr } = await supabase
    .from(QUEUE_TABLE)
    .upsert(items, { onConflict: 'idempotency_key', ignoreDuplicates: true });
  if (enqErr) {
    // Não conseguimos enfileirar: reverte o run para falha explícita.
    await supabase.from(RUNS_TABLE).update({ status: 'failed', error: enqErr.message }).eq('id', previewToken);
    return { ok: false, error: 'enqueue_failed', detail: enqErr.message };
  }

  return { ok: true, enqueued: items.length, runId: previewToken };
}

export const __test__ = { RUNS_TABLE, QUEUE_TABLE, MASS_ROLES, DEFAULT_MAX_RECIPIENTS };
