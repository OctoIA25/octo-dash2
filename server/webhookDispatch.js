import crypto from 'node:crypto';

// Dispatcher de webhooks. Dependências por injeção para ser testável sem
// subir o poller. Retorna { ok, error }. "Nenhuma subscription" = ok:true
// (tenant sem Lia: nada a fazer, não re-tentar).
export function createWebhookDispatcher({ supabase, fetchImpl, assertSafeHttpUrl, fetchTimeoutMs, summarizeError }) {
  return async function dispatchWebhookEvent(tenantId, event, data) {
    const { data: webhooks, error } = await supabase
      .from('webhook_subscriptions')
      .select('id, url, secret, events')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .contains('events', [event]);

    if (error) {
      // Erro ao LER as subscriptions é transitório → tratar como falha (re-tenta).
      const msg = summarizeError ? summarizeError(error) : (error.message || String(error));
      return { ok: false, error: `lookup: ${msg}` };
    }

    if (!webhooks || webhooks.length === 0) return { ok: true };

    const results = await Promise.allSettled(webhooks.map(async (webhook) => {
      const safe = await assertSafeHttpUrl(webhook.url);
      if (!safe.ok) {
        // URL insegura é permanente; loga e NÃO conta como falha do evento
        // (não trava os demais webhooks nem dispara retry inútil).
        console.error(`Webhook ${webhook.id} bloqueado por segurança (SSRF: ${safe.reason})`);
        return { blocked: true };
      }

      const payload = { event, timestamp: new Date().toISOString(), webhook_id: webhook.id, data };
      const body = JSON.stringify(payload);
      const signature = `sha256=${crypto.createHmac('sha256', webhook.secret).update(body).digest('hex')}`;

      const response = await fetchImpl(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OctoDash-Event': event,
          'X-OctoDash-Signature': signature,
          // Receptores que não validam HMAC (ex.: Lia) comparam o secret cru.
          // ponytail: valor em claro — os endpoints http:// já expõem o payload; migrar p/ https resolve os dois.
          'x-webhook-secret': webhook.secret
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(fetchTimeoutMs)
      });

      // Ler o corpo UMA VEZ (stream não pode ser relido) e truncar para visibilidade nos logs.
      const responseBody = (await response.text()).slice(0, 1000);
      const responseStatus = response.status;

      if (!response.ok) {
        const err = new Error(`status ${responseStatus}`);
        err.responseStatus = responseStatus;
        err.responseBody = responseBody;
        throw err;
      }
      return { responseStatus, responseBody };
    }));

    const blocked = results.filter((r) => r.status === 'fulfilled' && r.value?.blocked).length;
    if (blocked === webhooks.length) {
      console.warn(`Webhook event: todas as ${webhooks.length} subscription(s) bloqueadas por SSRF — nada enviado (tenant ${tenantId}, evento ${event})`);
    }

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      const reason = failures.map(f => f.reason?.message || String(f.reason)).join('; ');
      // ponytail: N>1 webhooks → status/corpo do PRIMEIRO que falhou; raro na prática (1 por tenant).
      const first = failures[0].reason;
      return { ok: false, error: `${failures.length}/${webhooks.length} falhou: ${reason}`, responseStatus: first.responseStatus ?? null, responseBody: first.responseBody ?? null };
    }

    // ponytail: N>1 webhooks → status/corpo do PRIMEIRO fulfilled não-bloqueado; raro na prática.
    const firstOk = results.find((r) => r.status === 'fulfilled' && !r.value?.blocked);
    return { ok: true, responseStatus: firstOk?.value?.responseStatus ?? null, responseBody: firstOk?.value?.responseBody ?? null };
  };
}
