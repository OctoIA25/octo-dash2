/**
 * 📲 Envio de recomendação por WhatsApp via Meta Cloud API (template/HSM).
 *
 * Mensagens iniciadas pela empresa (fora da janela de 24h) EXIGEM um template
 * aprovado — não há texto livre. Por isso enviamos um template configurado por
 * tenant (nome + idioma), com parâmetros do corpo (ex.: nome do lead, qtd de
 * imóveis). As credenciais Meta vêm de whatsapp_config (reuso — não duplicamos).
 *
 * `fetchImpl` é injetável para testes (sem rede).
 */

const DEFAULT_GRAPH_VERSION = 'v21.0';

/**
 * Carrega as credenciais Meta + template do tenant.
 * @returns {{ ok: true, config, template } | { ok: false, error }}
 */
export async function loadWhatsappContext(supabase, tenantId, processEnv = process.env) {
  const { data: config, error: cfgErr } = await supabase
    .from('whatsapp_config')
    .select('phone_number_id, access_token, is_active')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (cfgErr) return { ok: false, error: 'whatsapp_config_error' };
  if (!config || !config.is_active) return { ok: false, error: 'whatsapp_not_configured' };

  const { data: rec } = await supabase
    .from('tenant_recommendation_config')
    .select('whatsapp_template_name, whatsapp_template_language')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!rec?.whatsapp_template_name) return { ok: false, error: 'whatsapp_template_missing' };

  return {
    ok: true,
    config,
    template: {
      name: rec.whatsapp_template_name,
      language: rec.whatsapp_template_language || 'pt_BR',
    },
    graphVersion: processEnv.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION,
  };
}

/**
 * Envia o template para um número. Retorna { messageId } ou lança Error.
 * Não persiste nada — quem chama decide a persistência (lead_recommendations).
 */
export async function sendWhatsappTemplate({
  config,
  template,
  to,
  params = [],
  graphVersion = DEFAULT_GRAPH_VERSION,
  fetchImpl,
}) {
  const doFetch = fetchImpl || fetch;
  const url = `https://graph.facebook.com/${graphVersion}/${config.phone_number_id}/messages`;

  const components =
    params.length > 0
      ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p) })) }]
      : undefined;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language },
      ...(components ? { components } : {}),
    },
  };

  const response = await doFetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg = json?.error?.message || `Meta API HTTP ${response.status}`;
    throw new Error(msg);
  }
  return { messageId: json?.messages?.[0]?.id ?? null };
}
