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
 * Carrega as credenciais Meta + o template a usar no envio.
 *
 * A Meta só permite mensagens iniciadas pela empresa via TEMPLATE aprovado.
 * Por padrão o template é o FIXO configurado por tenant em
 * tenant_recommendation_config (recomendações automáticas e Agente de
 * Recuperação). `templateNameOverride` permite que UM disparo escolha outro
 * template aprovado (ex.: campanha do Disparador) sem alterar a config do tenant
 * — o idioma ainda vem da config (ou do padrão pt_BR).
 *
 * @param {string|null} templateNameOverride nome de um template aprovado a usar
 *        neste envio. Ausente (null) → comportamento idêntico ao atual (fixo).
 * @returns {{ ok: true, config, template, graphVersion } | { ok: false, error }}
 */
export async function loadWhatsappContext(
  supabase,
  tenantId,
  processEnv = process.env,
  templateNameOverride = null,
) {
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

  // Override por-disparo: usa o template escolhido. O idioma ainda vem da config
  // do tenant (quando houver) ou do padrão — NÃO exige o template fixo.
  // Sem override: comportamento atual (exige o template fixo do tenant).
  let templateName;
  if (templateNameOverride) {
    templateName = templateNameOverride;
  } else {
    if (!rec?.whatsapp_template_name) return { ok: false, error: 'whatsapp_template_missing' };
    templateName = rec.whatsapp_template_name;
  }

  return {
    ok: true,
    config,
    template: {
      name: templateName,
      language: rec?.whatsapp_template_language || 'pt_BR',
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
