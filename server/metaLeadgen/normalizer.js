/**
 * field_data da Meta → payload de POST /api/v1/leads.
 *
 * Função pura, sem HTTP e sem banco: é a peça mais provável de precisar de
 * ajuste quando aparecer formulário com pergunta nova, e ajustar com teste
 * unitário é barato.
 *
 * As perguntas do formulário NÃO são hardcoded: só os três campos padrão da
 * Meta são mapeados, o resto é preservado. Formulário novo com pergunta nova
 * não quebra a integração.
 */
const STANDARD = new Set(['full_name', 'email', 'phone_number']);

// Standard fields always scalar (first value only): name/email/phone are single-value by nature.
function firstValue(v) {
  return Array.isArray(v) ? v[0] : (v ?? null);
}

export function normalizeLeadgen(lead = {}, ctx = {}) {
  // O default só cobre `undefined`; `null` chega aqui se o Graph devolver 2xx
  // com corpo vazio. Cinto e suspensório — o graphClient já recusa esse caso.
  if (!lead) lead = {};
  // ponytail: preserve all field responses (standard + custom) in raw_data.fields for audit fidelity.
  // last write wins for duplicate field names (rare from Meta).
  const allFields = {};

  for (const f of lead.field_data || []) {
    const values = Array.isArray(f?.values) ? f.values : [f?.values];
    const filtered = values.filter(v => v !== undefined && v !== null && v !== '');
    if (!filtered.length) continue;

    // Preserve all values: array if multiple, scalar if single.
    allFields[f.name] = filtered.length === 1 ? filtered[0] : filtered;
  }

  const custom = Object.entries(allFields).filter(([name]) => !STANDARD.has(name));

  return {
    name: firstValue(allFields.full_name),
    email: firstValue(allFields.email),
    phone: firstValue(allFields.phone_number),
    // `portal`, não `source`: a rota faz `source: portal || 'API'`. Mandar
    // `source` seria silenciosamente ignorado e todo lead viraria origem "API".
    portal: lead.platform === 'ig' ? 'Instagram' : 'Facebook',
    // As respostas customizadas viram texto no card do lead — sem isso o
    // corretor teria que abrir o JSON para ver o que a pessoa respondeu.
    // Renderize múltiplos valores separados por vírgula (ex: "Apartamento, Casa").
    message: custom.length ? custom.map(([k, v]) => {
      const rendered = Array.isArray(v) ? v.join(', ') : v;
      return `${k}: ${rendered}`;
    }).join('\n') : null,
    // Único campo do chamador que a rota preserva dentro de custom_fields.
    // allFields contém todas as respostas (padrão + customizadas) — fonte bruta para auditoria.
    raw_data: {
      meta: {
        // O leadgen_id do EVENTO (webhook) é a fonte de verdade: é ele que a
        // checagem de duplicidade em processEvent compara. Usar `lead.id` (a
        // resposta do Graph) faria o invariante anti-duplicação depender de
        // duas fontes coincidirem.
        leadgen_id: ctx.leadgenId ?? lead.id ?? null,
        page_id: ctx.pageId ?? null,
        form_id: ctx.formId ?? lead.form_id ?? null,
        ad_id: ctx.adId ?? lead.ad_id ?? null,
        created_time: lead.created_time ?? null,
        platform: lead.platform ?? null,
      },
      fields: allFields,
    },
  };
}
