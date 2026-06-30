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
          'X-OctoDash-Signature': signature
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(fetchTimeoutMs)
      });

      if (!response.ok) throw new Error(`status ${response.status}`);
    }));

    const blocked = results.filter((r) => r.status === 'fulfilled' && r.value?.blocked).length;
    if (blocked === webhooks.length) {
      console.warn(`Webhook event: todas as ${webhooks.length} subscription(s) bloqueadas por SSRF — nada enviado (tenant ${tenantId}, evento ${event})`);
    }

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      const reason = failures.map(f => f.reason?.message || String(f.reason)).join('; ');
      return { ok: false, error: `${failures.length}/${webhooks.length} falhou: ${reason}` };
    }
    return { ok: true };
  };
}
