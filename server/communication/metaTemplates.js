/**
 * 📲 Camada Meta (WhatsApp Cloud API) para templates HSM.
 *
 * Isolada e testável: `fetch` é injetável e toda falha externa vira { ok:false }
 * (nunca lança). Reusa as credenciais de whatsapp_config (WABA + token).
 */

const DEFAULT_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

/**
 * Converte o corpo amigável ({{nome}}) para o formato numerado da Meta ({{1}}).
 * Numera por 1ª aparição; repetições reusam o mesmo índice. Retorna a lista
 * ordenada de nomes únicos (para montar o `example` e exibir as variáveis).
 * @param {string} body
 * @returns {{ text: string, variables: string[] }}
 */
export async function submitTemplate({ wabaId, accessToken, name, language, category, body, exampleValues = [], graphVersion = DEFAULT_GRAPH_VERSION, fetchImpl }) {
  const doFetch = fetchImpl || fetch;
  try {
    const { text } = toMetaBody(body);
    const component = { type: 'BODY', text };
    // A Meta exige `example.body_text` quando há variáveis.
    if (exampleValues.length > 0) component.example = { body_text: [exampleValues] };
    const payload = { name, language, category, components: [component] };
    const res = await doFetch(`https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      return { ok: false, error: 'meta_submit_failed', detail: json?.error?.message || `http_${res.status}` };
    }
    return { ok: true, providerTemplateId: json.id || null, status: String(json.status || 'pending').toLowerCase() };
  } catch (e) {
    return { ok: false, error: 'meta_submit_failed', detail: String(e?.message || e || 'unknown') };
  }
}

export async function fetchTemplateStatus({ wabaId, accessToken, name, graphVersion = DEFAULT_GRAPH_VERSION, fetchImpl }) {
  const doFetch = fetchImpl || fetch;
  try {
    const url = `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`;
    const res = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) return { ok: false, error: 'meta_status_failed', detail: json?.error?.message || `http_${res.status}` };
    const row = (json.data || []).find((t) => t.name === name);
    if (!row) return { ok: true, status: 'pending', reason: null };
    const KNOWN = ['approved', 'pending', 'rejected'];
    const raw = String(row.status || 'pending').toLowerCase();
    const status = KNOWN.includes(raw) ? raw : 'rejected';
    // Estados bloqueantes da Meta (paused/disabled/in_appeal/etc.) viram 'rejected'
    // no nosso domínio, mas preservamos o estado real no motivo p/ o usuário entender.
    const reason = row.rejected_reason || (!KNOWN.includes(raw) ? raw.toUpperCase() : null);
    return { ok: true, status, reason: reason || null };
  } catch (e) {
    return { ok: false, error: 'meta_status_failed', detail: String(e?.message || e || 'unknown') };
  }
}

/**
 * Extrai o corpo (component BODY) e as variáveis numeradas ({{N}}) de um array
 * de components retornado pela Meta. Variáveis são posicionais (strings "1","2").
 */
export function extractBodyFromComponents(components) {
  const list = Array.isArray(components) ? components : [];
  const bodyComp = list.find((c) => String(c?.type || '').toUpperCase() === 'BODY');
  const body = bodyComp?.text || '';
  const variables = [];
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (!variables.includes(m[1])) variables.push(m[1]);
  }
  return { body, variables };
}

/** Normaliza um template da Meta para o shape de communication_templates. */
export function mapMetaTemplateToRow(metaTpl) {
  const { body, variables } = extractBodyFromComponents(metaTpl?.components);
  const category = metaTpl?.category === 'UTILITY' ? 'UTILITY' : 'MARKETING';
  return {
    name: metaTpl?.name,
    language: metaTpl?.language || 'pt_BR',
    category,
    body,
    variables,
    provider_template_id: metaTpl?.id || null,
  };
}

export async function listApprovedTemplates({ wabaId, accessToken, graphVersion = DEFAULT_GRAPH_VERSION, fetchImpl }) {
  const doFetch = fetchImpl || fetch;
  try {
    const url = `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates?limit=200`;
    const res = await doFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) return { ok: false, error: 'meta_list_failed', detail: json?.error?.message || `http_${res.status}` };
    const templates = (json.data || []).filter((t) => t.status === 'APPROVED');
    return { ok: true, templates };
  } catch (e) {
    return { ok: false, error: 'meta_list_failed', detail: String(e?.message || e || 'unknown') };
  }
}

export function toMetaBody(body) {
  const variables = [];
  const text = String(body || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    let idx = variables.indexOf(name);
    if (idx === -1) { variables.push(name); idx = variables.length - 1; }
    return `{{${idx + 1}}}`;
  });
  return { text, variables };
}
