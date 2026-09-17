/**
 * Utilitários de telefone compartilhados.
 *
 * Extraído de server/proxy-production.js para ser reutilizável
 * por outros módulos do servidor (ex.: comparador de leads).
 */

/**
 * Normaliza um telefone para formato padrão (somente dígitos).
 *
 * Regras:
 *  - Remove qualquer caractere que não seja dígito.
 *  - Remove o DDI brasileiro (55) se presente.
 *  - Se restar 10 dígitos (DDD + 8), insere o 9º dígito após o DDD.
 *  - Se `withCountryCode` for true, adiciona "55" ao início.
 *
 * @param {string} valor - Telefone em qualquer formato.
 * @param {{ withCountryCode?: boolean }} [opts] - Opções de formatação.
 * @returns {string} Telefone normalizado, ou '' se a entrada for vazia/inválida.
 */
export const normalizePhone = (valor, opts = {}) => {
  const { withCountryCode = false } = opts;

  if (!valor) return '';

  let limpo = String(valor).replace(/\D/g, '');

  // Remover DDI 55 se presente (garante base sem código de país)
  if (limpo.length > 11 && limpo.startsWith('55')) {
    limpo = limpo.substring(2);
  }

  // 10 dígitos = DDD + 8 dígitos → celular sem o 9 → inserir 9 após DDD
  if (limpo.length === 10) {
    limpo = limpo.substring(0, 2) + '9' + limpo.substring(2);
  }

  // Adicionar DDI 55 apenas se solicitado e tiver 11 dígitos válidos
  if (withCountryCode && limpo.length === 11) {
    limpo = '55' + limpo;
  }

  return limpo;
};

/**
 * Compara dois telefones ignorando formatação e código de país.
 *
 * @param {string} a - Primeiro telefone.
 * @param {string} b - Segundo telefone.
 * @returns {boolean} true se os telefones forem equivalentes.
 */
export const phonesMatch = (a, b) => {
  if (!a || !b) return false;
  const pa = normalizePhone(a);
  const pb = normalizePhone(b);
  return Boolean(pa && pb && pa === pb);
};

/**
 * Formas equivalentes do mesmo número que podem estar gravadas no banco.
 *
 * O wa_id da Meta às vezes vem sem o 9º dígito, e linhas antigas podem estar
 * sem DDI ou em E.164 com '+'. Quem busca por telefone precisa tentar todas,
 * senão acha a casca vazia em vez da conversa com histórico.
 *
 * Espelha `phoneVariants` de src/features/chat/services/chatService.ts e o
 * trigger da migration 20260702. Estava duplicada em server/whatsapp/index.js;
 * mora aqui para não virar a terceira cópia.
 *
 * @param {string} value - Telefone em qualquer formato.
 * @returns {string[]} Variantes (com e sem '+'), ou [] se a entrada não normaliza.
 */
export const phoneVariants = (value) => {
  const canonical = normalizePhone(value, { withCountryCode: true });
  if (!canonical) return [];
  let forms = [canonical];
  if (/^55\d{2}9\d{8}$/.test(canonical)) {
    const semDdi = canonical.slice(2);
    const semNove = `${semDdi.slice(0, 2)}${semDdi.slice(3)}`;
    forms = [canonical, `55${semNove}`, semDdi, semNove];
  }
  return [...forms, ...forms.map((f) => `+${f}`)];
};

// ---------------------------------------------------------------------------
// Contato do LEAD — classificação e chave de deduplicação.
//
// POR QUE NÃO É O normalizePhone ACIMA. Aquele é o canônico do wa_id/chat: ele
// assume que todo número de 10 dígitos é celular sem o 9º e injeta o 9 — o que
// transforma um FIXO (DDD + 8 dígitos começando em 2-5) num celular que não
// existe. Para comparar leads isso inventaria número, então aqui o 9º dígito só
// entra quando o assinante começa em 6-9, que é a faixa de celular do plano da
// Anatel. As duas convenções coincidem em celular, que é 99% do tráfego.
//
// Espelhado em src/lib/contato.ts (dashboard) e na função SQL lead_phone_key
// (migration 20260917_leads_phone_key). Mudou aqui, muda nos três — os casos de
// teste são os mesmos nos três arquivos.
// ---------------------------------------------------------------------------

/** DDDs que existem no plano de numeração brasileiro. */
const DDD_VALIDO = /^(1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])$/;

/**
 * Classifica um telefone de lead.
 *
 * status:
 *  - 'vazio'        — não veio nada.
 *  - 'valido'       — número brasileiro completo (celular ou fixo).
 *  - 'internacional'— E.164 de outro país (o wa_id da Lia traz esses; +86, +351…).
 *  - 'incompleto'   — dígitos de menos para ser um número ('+5519').
 *  - 'invalido'     — tem dígitos demais, DDD inexistente ou formato impossível.
 *
 * `chave` é a forma canônica para comparar dois leads; é null quando o número
 * não serve como identificador (CA-03/CA-10). NUNCA completa o que não dá para
 * deduzir: dígito faltando ou sobrando devolve 'incompleto'/'invalido'.
 *
 * @param {string} valor
 * @returns {{status: string, chave: string|null, whatsapp: string|null}}
 */
export const classificarTelefone = (valor) => {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  const nada = { status: 'vazio', chave: null, whatsapp: null };
  if (!digitos) return nada;

  // Brasil, com DDI (12-13 dígitos) ou sem (10-11).
  const nacional = /^55\d{10,11}$/.test(digitos)
    ? digitos.slice(2)
    : (/^\d{10,11}$/.test(digitos) ? digitos : null);

  if (nacional) {
    const ddd = nacional.slice(0, 2);
    const assinante = nacional.slice(2);
    if (DDD_VALIDO.test(ddd)) {
      // Celular com o 9º dígito; celular antigo sem ele (o wa_id vem assim, e é
      // o mesmo número); fixo de 8 dígitos.
      if (/^9\d{8}$/.test(assinante)) return valido(`55${ddd}${assinante}`);
      if (/^[6-9]\d{7}$/.test(assinante)) return valido(`55${ddd}9${assinante}`);
      if (/^[2-5]\d{7}$/.test(assinante)) return valido(`55${ddd}${assinante}`);
    }
    return { status: 'invalido', chave: null, whatsapp: null };
  }

  if (digitos.length < 10) return { status: 'incompleto', chave: null, whatsapp: null };
  // DDI de outro país: 11-15 dígitos (E.164), nunca começando em 0. Vale como
  // identificador — são iguais só se forem o MESMO número.
  if (digitos.length <= 15 && /^[1-9]/.test(digitos) && !digitos.startsWith('55')) {
    return { status: 'internacional', chave: digitos, whatsapp: digitos };
  }
  return { status: 'invalido', chave: null, whatsapp: null };
};

const valido = (chave) => ({ status: 'valido', chave, whatsapp: chave });

/** Chave canônica do telefone, ou null quando não serve para deduplicar. */
export const chaveTelefone = (valor) => classificarTelefone(valor).chave;

/** Número pronto para o WhatsApp (só dígitos, com DDI), ou null. */
export const telefoneWhatsapp = (valor) => classificarTelefone(valor).whatsapp;
