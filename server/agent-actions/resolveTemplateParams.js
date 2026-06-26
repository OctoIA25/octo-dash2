/**
 * Resolve as variáveis posicionais ({{1}},{{2}}…) de um template HSM por lead.
 * Cada variável vem de um campo do lead (name/phone/assignedAgent) ou um valor fixo.
 * Puro/testável; o caller (buildPayload) injeta no envio sem duplicar o caminho.
 */

/** Campos do lead que podem alimentar uma variável (os disponíveis sem query extra). */
export const LEAD_FIELDS = { name: true, phone: true, assignedAgent: true };

/** Valor de uma entrada do mapa para um lead. Desconhecido/ausente → ''. */
function resolveEntry(entry, lead) {
  if (!entry || typeof entry !== 'object') return '';
  if (entry.type === 'fixed') return String(entry.value ?? '');
  if (entry.type === 'lead_field' && LEAD_FIELDS[entry.value]) return String(lead?.[entry.value] ?? '');
  return '';
}

/** Array posicional na ordem de templateVariables. */
export function resolveTemplateParams(variableMapping, templateVariables, lead) {
  const vars = Array.isArray(templateVariables) ? templateVariables : [];
  const map = variableMapping && typeof variableMapping === 'object' ? variableMapping : {};
  return vars.map((v) => resolveEntry(map[v], lead));
}

/** Toda variável do template tem entrada com valor utilizável? Vazio → ok. */
export function validateMapping(variableMapping, templateVariables) {
  const vars = Array.isArray(templateVariables) ? templateVariables : [];
  const map = variableMapping && typeof variableMapping === 'object' ? variableMapping : {};
  const missing = [];
  for (const v of vars) {
    const e = map[v];
    const valid =
      e && typeof e === 'object' &&
      ((e.type === 'fixed' && String(e.value ?? '').trim() !== '') ||
        (e.type === 'lead_field' && LEAD_FIELDS[e.value]));
    if (!valid) missing.push(v);
  }
  return { ok: missing.length === 0, missing };
}
