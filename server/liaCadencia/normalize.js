/**
 * Validação e normalização do corpo de POST /api/v1/lia/cadencias.
 *
 * Fronteira de confiança: quem chama é um app hospedado fora, então nada aqui
 * confia no formato recebido. Mesmo desenho de agent-telemetry/emit.js —
 * uma função pura que é a ÚNICA fonte de verdade do shape, para que a rota e
 * os testes não divirjam do CHECK do banco.
 *
 * ALL-OR-NOTHING: um campo inválido reprova a requisição inteira e nada é
 * gravado. Aceitar "o que deu" produziria linha pela metade que a tela
 * mostraria como cadência real.
 *
 * O que NÃO é aceito do cliente: `tenant_id` (vem da autenticação da rota) e
 * qualquer coisa fora da lista abaixo — campo desconhecido é ignorado em
 * silêncio de propósito, para o app poder mandar metadado próprio sem quebrar.
 *
 * DEVOLVE SÓ O QUE VEIO. A mesma cadência é reportada três vezes (agendou,
 * enviou, encerrou) com a mesma idempotency_key, e a rota mescla na linha que
 * já existe. Se este módulo devolvesse a chave `scheduled_at: null` só porque
 * a terceira chamada não a repetiu, o merge apagaria o agendamento. Por isso
 * campo ausente NÃO entra no objeto — inclusive `status`, cujo default só faz
 * sentido no INSERT e é aplicado lá.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const STATUS_VALIDOS = ['pending', 'sent', 'cancelled', 'expired'];
export const CANAIS_VALIDOS = ['whatsapp', 'email', 'ligacao', 'sms'];
export const OUTCOMES_VALIDOS = ['respondido', 'sem_resposta', 'visita_agendada', 'escalado', 'opt_out'];

const MAX_TEXTO_CURTO = 200;   // tag, template_name, cancelled_reason, idempotency_key
const MAX_TEXTO_LONGO = 4000;  // motivo, message_sent
const MAX_TENTATIVA = 20;      // a LIA usa 1..3; o teto só barra lixo
const SKEW_FUTURO_MS = 5 * 60_000; // relógio do emissor pode adiantar alguns minutos

/** Campos de data aceitos, todos opcionais. */
const CAMPOS_DATA = ['scheduled_at', 'sent_at', 'cancelled_at', 'replied_at', 'last_lead_msg_at'];

const texto = (v, max) => {
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Valida o corpo e devolve a linha pronta para upsert (sem tenant_id).
 *
 * @param {object} raw          corpo da requisição
 * @param {{now?: number}} opts relógio injetável
 * @returns {{ok: true, row: object} | {ok: false, details: {field, reason}[]}}
 */
export function normalizarCadencia(raw, { now = Date.now() } = {}) {
  const erros = [];
  const erro = (field, reason) => erros.push({ field, reason });
  const row = {};
  /** Só entra no objeto o campo que o chamador realmente mandou. */
  const definir = (chave, valor) => { if (valor !== undefined) row[chave] = valor; };
  const veio = (v) => v != null && v !== '';

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, details: [{ field: '_body', reason: 'not_an_object' }] };
  }

  // --- identificação do lead: ao menos uma das duas âncoras ---
  const mandouLeadId = veio(raw.lead_id);
  if (mandouLeadId) {
    if (!UUID_RE.test(String(raw.lead_id))) erro('lead_id', 'invalid_uuid');
    else definir('lead_id', String(raw.lead_id));
  }
  const leadPhone = veio(raw.lead_phone) ? texto(raw.lead_phone, 32) : undefined;
  definir('lead_phone', leadPhone);
  // "faltando" só quando NENHUMA das duas âncoras veio. Um lead_id malformado
  // já foi acusado acima; dizer também que está ausente confunde quem integra.
  if (!mandouLeadId && !leadPhone) erro('lead_id', 'missing_lead_id_or_lead_phone');

  // --- idempotência: obrigatória, é o que impede linha duplicada em retry ---
  const idem = veio(raw.idempotency_key) ? texto(raw.idempotency_key, MAX_TEXTO_CURTO) : null;
  if (!idem) erro('idempotency_key', 'required');
  else row.idempotency_key = idem;

  // --- enums ---
  let status;
  if (veio(raw.status)) {
    status = String(raw.status).trim();
    if (!STATUS_VALIDOS.includes(status)) erro('status', 'invalid_value');
    else row.status = status;
  }

  if (veio(raw.channel)) {
    const channel = String(raw.channel).trim().toLowerCase();
    if (!CANAIS_VALIDOS.includes(channel)) erro('channel', 'invalid_value');
    else row.channel = channel;
  }

  if (veio(raw.outcome)) {
    const outcome = String(raw.outcome).trim().toLowerCase();
    if (!OUTCOMES_VALIDOS.includes(outcome)) erro('outcome', 'invalid_value');
    else row.outcome = outcome;
  }

  // --- tentativa ---
  if (veio(raw.attempt_number)) {
    const n = Number(raw.attempt_number);
    if (!Number.isInteger(n) || n < 1 || n > MAX_TENTATIVA) erro('attempt_number', 'out_of_range');
    else row.attempt_number = n;
  }

  // --- datas: parseáveis e não absurdamente no futuro ---
  for (const campo of CAMPOS_DATA) {
    if (!veio(raw[campo])) continue;
    const t = Date.parse(raw[campo]);
    if (Number.isNaN(t)) { erro(campo, 'invalid_date'); continue; }
    // scheduled_at é a única data que PODE ser futura — é o agendamento.
    if (campo !== 'scheduled_at' && t > now + SKEW_FUTURO_MS) { erro(campo, 'in_the_future'); continue; }
    row[campo] = new Date(t).toISOString();
  }

  // --- textos livres ---
  for (const [campo, max] of [
    ['tag', MAX_TEXTO_CURTO],
    ['template_name', MAX_TEXTO_CURTO],
    ['cancelled_reason', MAX_TEXTO_CURTO],
    ['motivo', MAX_TEXTO_LONGO],
    ['message_sent', MAX_TEXTO_LONGO],
  ]) {
    if (veio(raw[campo])) definir(campo, texto(raw[campo], max));
  }

  // --- coerência: dizer que enviou sem dizer quando deixa a tela cega ---
  if (status === 'sent' && !row.sent_at) erro('sent_at', 'required_when_status_sent');

  if (erros.length > 0) return { ok: false, details: erros };

  row.updated_at = new Date(now).toISOString();
  return { ok: true, row };
}
