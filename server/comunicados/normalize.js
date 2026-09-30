/**
 * Validação do corpo de POST /api/v1/comunicados (a LIA avisando pessoas).
 *
 * Fronteira de confiança: quem chama é um servidor de fora. Mesmo desenho de
 * liaCadencia/normalize.js — função pura, tudo ou nada, única fonte do shape.
 * Os limites repetem os CHECK da tabela `comunicados` para a LIA receber 422
 * com o campo certo em vez de um 500 do banco.
 *
 * NÃO vem do cliente: a imobiliária (vem da chave), o autor (a LIA não tem
 * conta) e equipes (a LIA não conhece os ids: manda e-mail ou "todos").
 * Campo desconhecido é ignorado em silêncio, de propósito.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CATEGORIAS = ['comunicado', 'alerta'];
export const PRIORIDADES = ['normal', 'importante'];
export const LIMITES = { idempotency_key: 200, titulo: 120, mensagem: 2000, emails: 50 };

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

function textoObrigatorio(raw, campo, erros) {
  const valor = texto(raw[campo]);
  if (!valor) erros.push({ campo, motivo: 'obrigatorio' });
  else if (valor.length > LIMITES[campo]) erros.push({ campo, motivo: `maximo_${LIMITES[campo]}_caracteres` });
  return valor;
}

function umDe(valor, validos, campo, erros) {
  if (!validos.includes(valor)) erros.push({ campo, motivo: `use_${validos.join('_ou_')}` });
  return valor;
}

function publicoDe(p, erros) {
  if (p?.tipo === 'todos') return { tipo: 'todos', emails: [], copiarGestor: false };
  if (p?.tipo !== 'pessoas') {
    erros.push({ campo: 'publico.tipo', motivo: 'use_todos_ou_pessoas' });
    return null;
  }
  const brutos = Array.isArray(p.emails) ? p.emails : [];
  const emails = [...new Set(brutos.map((e) => texto(e).toLowerCase()).filter(Boolean))];
  const invalidos = emails.filter((e) => !EMAIL_RE.test(e));
  if (emails.length === 0) erros.push({ campo: 'publico.emails', motivo: 'obrigatorio' });
  else if (emails.length > LIMITES.emails) erros.push({ campo: 'publico.emails', motivo: `maximo_${LIMITES.emails}` });
  else if (invalidos.length > 0) erros.push({ campo: 'publico.emails', motivo: 'email_invalido', valores: invalidos });
  return { tipo: 'pessoas', emails, copiarGestor: p.copiar_gestor === true };
}

function linkDe(l, erros) {
  if (l === undefined || l === null) return null;
  if (l?.tipo !== 'lead' || !UUID_RE.test(String(l?.id ?? ''))) {
    erros.push({ campo: 'link', motivo: 'use_tipo_lead_e_id_uuid' });
    return null;
  }
  return { tipo: 'lead', id: String(l.id).toLowerCase() };
}

/**
 * @param {object} raw corpo da requisição (já confirmado como objeto pela rota)
 * @returns {{ok: true, row: object} | {ok: false, details: {campo: string, motivo: string, valores?: string[]}[]}}
 */
export function normalizarComunicado(raw) {
  const erros = [];
  const row = {
    idempotencyKey: textoObrigatorio(raw, 'idempotency_key', erros),
    categoria: umDe(raw.categoria, CATEGORIAS, 'categoria', erros),
    titulo: textoObrigatorio(raw, 'titulo', erros),
    mensagem: textoObrigatorio(raw, 'mensagem', erros),
    prioridade: umDe(raw.prioridade ?? 'normal', PRIORIDADES, 'prioridade', erros),
    publico: publicoDe(raw.publico, erros),
    link: linkDe(raw.link, erros),
  };
  return erros.length > 0 ? { ok: false, details: erros } : { ok: true, row };
}
