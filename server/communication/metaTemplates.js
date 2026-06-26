/**
 * 📲 Camada Meta (WhatsApp Cloud API) para templates HSM.
 *
 * Isolada e testável: `fetch` é injetável e toda falha externa vira { ok:false }
 * (nunca lança). Reusa as credenciais de whatsapp_config (WABA + token).
 */

const DEFAULT_GRAPH_VERSION = 'v21.0'; // eslint-disable-line no-unused-vars

/**
 * Converte o corpo amigável ({{nome}}) para o formato numerado da Meta ({{1}}).
 * Numera por 1ª aparição; repetições reusam o mesmo índice. Retorna a lista
 * ordenada de nomes únicos (para montar o `example` e exibir as variáveis).
 * @param {string} body
 * @returns {{ text: string, variables: string[] }}
 */
export function toMetaBody(body) {
  const variables = [];
  const text = String(body || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    let idx = variables.indexOf(name);
    if (idx === -1) { variables.push(name); idx = variables.length - 1; }
    return `{{${idx + 1}}}`;
  });
  return { text, variables };
}
