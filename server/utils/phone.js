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
