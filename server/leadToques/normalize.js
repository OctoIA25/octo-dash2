/**
 * Validação do corpo de POST /api/v1/leads/:leadId/toques.
 *
 * Função pura e ÚNICA fonte do shape, para a rota e os testes não divergirem
 * dos CHECKs de 20260916_lead_toques.sql.
 *
 * O que NÃO vem do cliente: quem executou (sai do JWT), quando (é o instante
 * do registro), tenant e lead (autenticação e URL). Campo desconhecido é
 * ignorado.
 */

export const CANAIS_TOQUE = ['whatsapp', 'ligacao', 'email', 'presencial'];
export const RESULTADOS_TOQUE = ['respondeu', 'nao_respondeu', 'numero_errado', 'nao_contatar'];

const MAX_OBSERVACAO = 1000;
/** Relógio do navegador pode atrasar alguns minutos em relação ao servidor. */
const SKEW_MS = 5 * 60_000;

/**
 * @param {object} raw
 * @param {{now?: number}} opts relógio injetável
 * @returns {{ok: true, row: object} | {ok: false, details: {field, reason}[]}}
 */
export function normalizarToque(raw, { now = Date.now() } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, details: [{ field: '_body', reason: 'not_an_object' }] };
  }

  const erros = [];
  const erro = (field, reason) => erros.push({ field, reason });
  const enumerado = (campo, validos) => {
    const v = raw[campo] == null ? '' : String(raw[campo]).trim().toLowerCase();
    if (!v) erro(campo, 'required');
    else if (!validos.includes(v)) erro(campo, 'invalid_value');
    return v;
  };

  const canal = enumerado('canal', CANAIS_TOQUE);
  const resultado = enumerado('resultado', RESULTADOS_TOQUE);

  const observacao = raw.observacao == null ? '' : String(raw.observacao).trim();
  if (observacao.length > MAX_OBSERVACAO) erro('observacao', 'too_long');

  let proximo = null;
  if (raw.proximo_toque_em != null && raw.proximo_toque_em !== '') {
    const t = Date.parse(raw.proximo_toque_em);
    if (Number.isNaN(t)) erro('proximo_toque_em', 'invalid_date');
    else if (t < now - SKEW_MS) erro('proximo_toque_em', 'in_the_past');
    else proximo = new Date(t).toISOString();
  }

  if (erros.length > 0) return { ok: false, details: erros };
  return {
    ok: true,
    row: { canal, resultado, observacao: observacao || null, proximo_toque_em: proximo },
  };
}
