/**
 * ⏰ Worker de agendamento de recomendações (Fase 2).
 *
 * Percorre os agendamentos ATIVOS e VENCIDOS (next_run_at <= agora) e, para os
 * que ainda estão dentro da JANELA DE INTERESSE, reenvia o conteúdo (snapshot)
 * pelos canais configurados — reutilizando o MESMO núcleo de entrega do envio
 * manual (deliverRecommendation): idempotência, proteção de ambiente, histórico.
 *
 * Determinístico e testável: `nowMs` e todas as dependências são injetáveis.
 */

const SCHEDULES_TABLE = 'recommendation_schedules';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Próxima execução conforme o INTERVALO (em dias) configurado pelo tenant.
 * Aceita número de dias; valores inválidos — ou o legado 'weekly' — caem em 7.
 */
export function computeNextRun(fromMs, intervalDays = 7) {
  const days = Number(intervalDays) > 0 ? Math.floor(Number(intervalDays)) : 7;
  return new Date(fromMs + days * DAY_MS).toISOString();
}

/** Verifica se ainda estamos dentro da janela de interesse do lead. */
export function isWithinInterestWindow(interestAtIso, windowDays, nowMs) {
  if (!interestAtIso) return true; // sem data de interesse → não bloqueia
  const interestMs = new Date(interestAtIso).getTime();
  if (Number.isNaN(interestMs)) return true;
  return nowMs <= interestMs + windowDays * DAY_MS;
}

/**
 * Processa os agendamentos vencidos.
 * @returns {{ processed, sent, failed, skipped, deactivated, results }}
 */
export async function runDueSchedules(supabase, deps) {
  const {
    nowMs = Date.now(),
    deliver, // (supabase, params, sendDeps) => Promise<result>  (deliverRecommendation)
    resolveDelivery,
    resolveTransport,
    sendWhatsapp,
    findDuplicate,
    getEnvironment,
    limit = 200,
    logger = console,
  } = deps;

  const nowIso = new Date(nowMs).toISOString();
  const summary = { processed: 0, sent: 0, failed: 0, skipped: 0, deactivated: 0, results: [] };

  const { data: schedules, error } = await supabase
    .from(SCHEDULES_TABLE)
    .select('*')
    .eq('active', true)
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(limit);

  if (error) {
    logger.error?.('[scheduler] erro ao buscar agendamentos:', error.message);
    return summary;
  }
  if (!schedules || schedules.length === 0) return summary;

  const environment = getEnvironment();
  logger.log?.(
    `📬 [scheduler] ${schedules.length} agendamento(s) vencido(s) — processando (ambiente=${environment})`,
  );

  for (const schedule of schedules) {
    summary.processed += 1;

    // Fora da janela de interesse → desativa e não envia.
    if (!isWithinInterestWindow(schedule.interest_at, schedule.interest_window_days ?? 7, nowMs)) {
      await supabase.from(SCHEDULES_TABLE).update({ active: false }).eq('id', schedule.id);
      summary.deactivated += 1;
      summary.results.push({ scheduleId: schedule.id, action: 'deactivated_out_of_window' });
      continue;
    }

    const channels = Array.isArray(schedule.channels) ? schedule.channels : ['email'];
    const lead = {
      id: schedule.lead_id,
      source: schedule.lead_source,
      name: schedule.lead_name,
      email: schedule.lead_email,
      phone: schedule.lead_phone,
    };
    const sanitizedProps = Array.isArray(schedule.properties) ? schedule.properties : [];

    for (const channel of channels) {
      const delivery = resolveDelivery({
        channel,
        environment,
        leadEmail: schedule.lead_email,
        leadPhone: schedule.lead_phone,
        isTest: false,
      });
      if (!delivery.recipient) {
        summary.skipped += 1;
        summary.results.push({ scheduleId: schedule.id, channel, action: 'skipped', reason: delivery.reason });
        continue;
      }

      const result = await deliver(
        supabase,
        {
          tenantId: schedule.tenant_id,
          channel,
          lead,
          delivery,
          content: {
            subject: schedule.subject,
            message: schedule.custom_message,
            html: schedule.email_html,
            text: schedule.email_text,
            whatsappBody: schedule.whatsapp_body,
          },
          sanitizedProps,
          isTest: false,
          sentBy: { userId: schedule.created_by_user_id, email: schedule.created_by_email },
        },
        { resolveTransport, sendWhatsapp, findDuplicate },
      );

      if (result.status === 'failed') summary.failed += 1;
      else summary.sent += 1;
      summary.results.push({ scheduleId: schedule.id, channel, status: result.status, deduplicated: result.deduplicated });
    }

    // Avança a cadência (sempre — sucesso ou falha; falhas reentram na próxima janela).
    await supabase
      .from(SCHEDULES_TABLE)
      .update({
        last_run_at: nowIso,
        next_run_at: computeNextRun(nowMs, schedule.interval_days),
        run_count: (schedule.run_count || 0) + 1,
      })
      .eq('id', schedule.id);
  }

  logger.log?.(
    `[scheduler] processados=${summary.processed} enviados=${summary.sent} falhas=${summary.failed} pulados=${summary.skipped} desativados=${summary.deactivated}`,
  );
  return summary;
}
