/**
 * ♻️ Worker do Agente de Recuperação.
 *
 * Drena a fila `recovery_queue` (preenchida pelo trigger de banco ao arquivar um
 * lead do CRM) e, para cada item, envia ao cliente a mensagem + a lista FIXA de
 * imóveis configuradas pelo tenant — reutilizando o MESMO núcleo de entrega do
 * envio manual e do agendamento (`deliverRecommendation`): idempotência,
 * proteção de ambiente e histórico/auditoria em `lead_recommendations`.
 *
 * Não duplica nenhuma lógica de envio: recebe as mesmas dependências do
 * scheduler (via `makeSchedulerDeps`) e apenas decide O QUE enfileirado vira
 * envio. Determinístico e testável — `nowMs` e todas as dependências (supabase,
 * deliver, resolveDelivery, sendWhatsapp, resolveTransport, findDuplicate,
 * getEnvironment) são injetáveis.
 *
 * Canal do MVP: WhatsApp (decisão de produto). O corpo configurável vira o
 * parâmetro do template HSM aprovado pela Meta (não há texto livre fora da
 * janela de 24h — ver whatsappSender.js).
 */

const QUEUE_TABLE = 'recovery_queue';
const CONFIG_TABLE = 'tenant_recommendation_config';
const RECOVERY_CHANNEL = 'whatsapp';

/** Sanitiza o snapshot de imóveis da config (mesmo shape de sanitizeProperties). */
function sanitizeProperties(properties) {
  if (!Array.isArray(properties)) return [];
  return properties.slice(0, 50).map((p) => ({
    referencia: String(p?.referencia ?? ''),
    titulo: String(p?.titulo ?? ''),
    localizacao: p?.localizacao ? String(p.localizacao) : undefined,
    preco: p?.preco ?? null,
    score: typeof p?.score === 'number' ? p.score : undefined,
  }));
}

/**
 * Reivindica (claim) atomicamente UM item pendente: muda pending → processing e
 * devolve a linha. Garante que ticks sobrepostos do cron não peguem o mesmo
 * item. Retorna null quando não há mais nada a processar.
 */
async function claimNextPending(supabase, nowIso) {
  // Seleciona o mais antigo pendente.
  const { data: candidate, error: selErr } = await supabase
    .from(QUEUE_TABLE)
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selErr || !candidate) return null;

  // Claim atômico: só vence quem ainda vê status='pending'.
  const { data: claimed, error: updErr } = await supabase
    .from(QUEUE_TABLE)
    .update({ status: 'processing', attempts: (candidate.attempts || 0) + 1 })
    .eq('id', candidate.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (updErr || !claimed) return null; // outro tick reivindicou primeiro.
  return claimed;
}

/** Marca o desfecho final de um item da fila (done | skipped | failed). */
async function finalize(supabase, id, status, nowIso, error = null) {
  await supabase
    .from(QUEUE_TABLE)
    .update({ status, error, processed_at: nowIso })
    .eq('id', id);
}

/**
 * Processa a fila de recuperação.
 * @returns {{ processed, sent, skipped, failed, results }}
 */
export async function runDueRecovery(supabase, deps) {
  const {
    nowMs = Date.now(),
    deliver, // deliverRecommendation
    resolveDelivery,
    resolveTransport,
    sendWhatsapp,
    findDuplicate,
    getEnvironment,
    limit = 100,
    logger = console,
  } = deps;

  const nowIso = new Date(nowMs).toISOString();
  const summary = { processed: 0, sent: 0, skipped: 0, failed: 0, results: [] };
  const environment = getEnvironment();

  for (let i = 0; i < limit; i += 1) {
    const item = await claimNextPending(supabase, nowIso);
    if (!item) break; // fila vazia.

    summary.processed += 1;

    try {
      // 1) Config do tenant (mensagem, lista fixa de imóveis, habilitação).
      const { data: cfg } = await supabase
        .from(CONFIG_TABLE)
        .select('recovery_agent_enabled, recovery_message, recovery_properties, company_name')
        .eq('tenant_id', item.tenant_id)
        .maybeSingle();

      // 2) Agente desabilitado → pula (sem envio, sem retry).
      if (!cfg?.recovery_agent_enabled) {
        await finalize(supabase, item.id, 'skipped', nowIso, 'recovery_agent_disabled');
        summary.skipped += 1;
        summary.results.push({ id: item.id, action: 'skipped', reason: 'recovery_agent_disabled' });
        continue;
      }

      const sanitizedProps = sanitizeProperties(cfg.recovery_properties);
      if (sanitizedProps.length === 0) {
        await finalize(supabase, item.id, 'skipped', nowIso, 'no_properties_configured');
        summary.skipped += 1;
        summary.results.push({ id: item.id, action: 'skipped', reason: 'no_properties_configured' });
        continue;
      }

      // 3) Resolução de entrega (proteção de ambiente, por canal). WhatsApp sem
      //    telefone → recipient null → pula.
      const delivery = resolveDelivery({
        channel: RECOVERY_CHANNEL,
        environment,
        leadPhone: item.lead_phone,
        isTest: false,
      });
      if (!delivery.recipient) {
        await finalize(supabase, item.id, 'skipped', nowIso, delivery.reason);
        summary.skipped += 1;
        summary.results.push({ id: item.id, action: 'skipped', reason: delivery.reason });
        continue;
      }

      const lead = {
        id: item.lead_id,
        source: item.lead_source || 'crm',
        name: item.lead_name,
        email: null,
        phone: item.lead_phone,
      };

      // 4) Envio pelo MESMO núcleo do envio manual/agendado.
      const result = await deliver(
        supabase,
        {
          tenantId: item.tenant_id,
          channel: RECOVERY_CHANNEL,
          lead,
          delivery,
          content: { whatsappBody: cfg.recovery_message || '' },
          sanitizedProps,
          isTest: false,
          sentBy: { userId: null, email: 'recovery-agent' },
        },
        { resolveTransport, sendWhatsapp, findDuplicate },
      );

      if (result.status === 'failed') {
        await finalize(supabase, item.id, 'failed', nowIso, result.errorMessage || 'send_failed');
        summary.failed += 1;
        summary.results.push({ id: item.id, status: 'failed', error: result.errorMessage });
      } else {
        await finalize(supabase, item.id, 'done', nowIso, null);
        summary.sent += 1;
        summary.results.push({ id: item.id, status: result.status, deduplicated: result.deduplicated });
      }
    } catch (err) {
      logger.error?.('[recovery] erro ao processar item', item.id, err?.message);
      await finalize(supabase, item.id, 'failed', nowIso, err?.message || 'unexpected_error');
      summary.failed += 1;
      summary.results.push({ id: item.id, status: 'failed', error: err?.message });
    }
  }

  if (summary.processed > 0) {
    logger.log?.(
      `[recovery] processados=${summary.processed} enviados=${summary.sent} pulados=${summary.skipped} falhas=${summary.failed} (ambiente=${environment})`,
    );
  }
  return summary;
}
