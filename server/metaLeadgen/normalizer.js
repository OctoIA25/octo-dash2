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
// A CHAVE do campo é texto livre do anunciante, não um enum da Meta. Os
// formulários antigos vinham com `full_name`/`phone`/`phone_number` (a doc diz
// um, a Japi Lançamentos emitia outro); o formulário "[CAST] Reserva
// Castanheira" da Lótus (set/2026) veio com "Nome Completo" e "Whatsapp" —
// tipos FULL_NAME e PHONE do mesmo jeito, chave em português. Casar só por
// chave exata perdia nome E telefone, e sem os dois a rota recusa o lead com
// 400 "Nome ou telefone é obrigatório": 7 leads pagos perdidos antes de alguém
// notar.
const EXATAS = { full_name: 'name', email: 'email', phone_number: 'phone', phone: 'phone' };

const semAcento = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// ponytail: heurística sobre a chave normalizada. O caminho exato seria ler
// `questions[].type` do formulário no Graph (FULL_NAME/PHONE/EMAIL), mas é uma
// chamada extra por lead mais cache por form_id. Se um formulário real escapar
// daqui, é para lá que se vai.
function porChave(chave) {
  const k = semAcento(chave);
  if (k.includes('mail')) return 'email';
  if (/whats|phone|fone|celular/.test(k)) return 'phone';
  if (/name|nome/.test(k)) return 'name';
  return null;
}

const ehEmail = (v) => typeof v === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
// Só descarta lixo óbvio ("Sim", "80") de uma chave que já parece telefone —
// não tenta validar número brasileiro, que a rota já normaliza depois.
const ehTelefone = (v) => typeof v === 'string' && v.replace(/\D/g, '').length >= 8;

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

  const std = { name: null, email: null, phone: null };
  const consumidas = new Set();
  const atribui = (campo, chave) => {
    if (std[campo] != null) return;
    const v = firstValue(allFields[chave]);
    if (v == null) return;
    if (campo === 'phone' && !ehTelefone(v)) return;
    if (campo === 'email' && !ehEmail(v)) return;
    std[campo] = v;
    consumidas.add(chave);
  };

  const chaves = Object.keys(allFields);
  // Chave exata primeiro: numa colisão ("full_name" e "Seu nome" no mesmo
  // formulário) quem manda é a chave padrão da Meta, não a ordem do field_data.
  for (const c of chaves) if (EXATAS[c]) atribui(EXATAS[c], c);
  for (const c of chaves) { const campo = porChave(c); if (campo) atribui(campo, c); }
  // Rede final só para e-mail: `@` é inequívoco. Não existe equivalente para
  // telefone — um CPF respondido numa pergunta customizada tem 11 dígitos e
  // viraria "telefone" do lead.
  for (const c of chaves) if (!consumidas.has(c)) atribui('email', c);

  const custom = Object.entries(allFields).filter(([name]) => !consumidas.has(name));

  return {
    name: std.name,
    email: std.email,
    phone: std.phone,
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
