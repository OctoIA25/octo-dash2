/**
 * 📲 Camada Meta (WhatsApp Cloud API) para templates HSM.
 *
 * Isolada e testável: `fetch` é injetável e toda falha externa vira { ok:false }
 * (nunca lança). Reusa as credenciais de whatsapp_config (WABA + token).
 */

const DEFAULT_GRAPH_VERSION = 'v21.0';

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
    return { ok: true, status: String(row.status || 'pending').toLowerCase(), reason: row.rejected_reason || null };
  } catch (e) {
    return { ok: false, error: 'meta_status_failed', detail: String(e?.message || e || 'unknown') };
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
