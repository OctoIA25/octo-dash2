/**
 * Envio de UMA pesquisa por UM canal (e-mail | whatsapp), reusando os
 * transportes já prontos e per-tenant das recomendações + o rate limiter do
 * outbox. NÃO reusa deliverRecommendation (grava lead_recommendations e exige
 * lead.id): eNPS envia a USUÁRIOS, não a leads. O throttle é reservado ANTES do
 * transporte (integra-se ao claim-before-send do runner, §6).
 *
 * ponytail: wrapper fino — token + 1 send + timeout. Sem provedor novo, sem fila.
 */
import { makeResolveTenantTransport, makeDefaultSendWhatsapp } from '../recommendations/index.js';
import { createTenantRateLimiter } from '../communication/rateLimiter.js';

const DEFAULT_SEND_TIMEOUT_MS = 15_000;

/** Corrida contra um relógio: um provedor morto não pode travar o tick. */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout após ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function makeSendSurvey(supabase, options = {}) {
  const resolveTransport = options.resolveTransport || makeResolveTenantTransport(supabase, options);
  const sendWhatsapp = options.sendWhatsapp || makeDefaultSendWhatsapp(supabase, options);
  const rateLimiter =
    options.rateLimiter ||
    createTenantRateLimiter({
      ratePerSec: Number(options.processEnv?.ENPS_RATE_PER_SEC ?? process.env.ENPS_RATE_PER_SEC) || 10,
      burst: Number(options.processEnv?.ENPS_RATE_BURST ?? process.env.ENPS_RATE_BURST) || 20,
    });
  const sendTimeoutMs = options.sendTimeoutMs || DEFAULT_SEND_TIMEOUT_MS;

  return async function sendSurvey({ tenantId, channel, recipient, content = {}, params, templateName }) {
    // 1. Token do tenant ANTES do transporte. Sem token → deixa a linha pending
    //    (o runner não marca 'sent'); o próximo tick tenta de novo.
    if (!rateLimiter.tryRemove(tenantId)) {
      return { ok: false, status: 'throttled', throttled: true, messageId: null, transport: channel, error: null };
    }
    try {
      if (channel === 'email') {
        const { transport, from } = await resolveTransport(tenantId);
        const r = await withTimeout(
          transport.send({ from, to: recipient, subject: content.subject, html: content.html, text: content.text }),
          sendTimeoutMs, 'email',
        );
        return { ok: true, status: 'sent', messageId: r.messageId ?? null, transport: r.transport || 'smtp', error: null };
      }
      const r = await withTimeout(sendWhatsapp({ tenantId, to: recipient, params, templateName }), sendTimeoutMs, 'whatsapp');
      return { ok: true, status: 'sent', messageId: r.messageId ?? null, transport: 'whatsapp', error: null };
    } catch (err) {
      // Sem template Meta aprovado NÃO é falha operacional — é canal indisponível
      // p/ este tenant. Vira skipped_no_contact (o e-mail cobre o corretor).
      if (err?.code === 'whatsapp_template_missing') {
        return { ok: false, status: 'skipped_no_contact', messageId: null, transport: 'whatsapp', error: err.code };
      }
      return { ok: false, status: 'failed', messageId: null, transport: channel, error: err?.message || 'erro no envio' };
    }
  };
}
