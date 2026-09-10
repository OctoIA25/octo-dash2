/**
 * Validação do corpo de POST /api/v1/lia/lead-events.
 *
 * Fronteira de confiança: quem chama é um app hospedado fora. Nada aqui confia
 * no formato recebido. Função pura, ÚNICA fonte de verdade do shape, para que
 * rota e testes não divirjam — mesmo desenho de liaCadencia/normalize.js.
 *
 * ALL-OR-NOTHING: um campo inválido reprova a requisição inteira. Aceitar "o
 * que deu" produziria evento pela metade que o card mostraria como histórico
 * real.
 *
 * O que NÃO é aceito do cliente: `tenant_id` e `lead_source` (saem da
 * autenticação e da resolução do lead, respectivamente) e qualquer prefixo
 * `lead.` em event_type — esse namespace é do trigger do banco e deixá-lo
 * aberto permitiria forjar "lead criado" ou "entregue para fulano".
 *
 * DEVOLVE SÓ O QUE VEIO. O mesmo evento pode ser reportado mais de uma vez com
 * a mesma idempotency_key (a LIA reenvia ao concluir o que anunciou), e a rota
 * mescla na linha existente. Campo ausente NÃO entra no objeto, senão o merge
 * apaga o que a chamada anterior gravou.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_TIPO = 100;
const MAX_TEXTO_CURTO = 200;   // idempotency_key, ator_nome, de, para, etapa
const MAX_DESCRICAO = 1000;
const MAX_METADATA_CHAVES = 30;
/** O relógio de quem emite pode adiantar alguns minutos. */
const SKEW_FUTURO_MS = 5 * 60_000;

/** Namespace reservado ao trigger do banco (ver 20260910_lead_events.sql). */
const PREFIXO_RESERVADO = 'lead.';

const texto = (v, max) => {
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Valida o corpo e devolve a linha pronta para gravar (sem tenant_id/lead_id,
 * que a rota resolve).
 *
 * @param {object} raw          corpo da requisição
 * @param {{now?: number}} opts relógio injetável
 * @returns {{ok: true, row: object, leadPhone: string|null} | {ok: false, details: {field, reason}[]}}
 */
export function normalizarEvento(raw, { now = Date.now() } = {}) {
  const erros = [];
  const erro = (field, reason) => erros.push({ field, reason });
  const row = {};
  /** Só entra no objeto o campo que o chamador realmente mandou. */
  const definir = (chave, valor) => { if (valor !== undefined && valor !== null) row[chave] = valor; };
  const veio = (v) => v != null && v !== '';

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, details: [{ field: '_body', reason: 'not_an_object' }] };
  }

  // --- âncora do lead: ao menos uma das duas ---------------------------
  // lead_phone não vai para a linha: a rota resolve o lead e grava o id real.
  // Guardar o telefone aqui duplicaria a verdade e envelheceria sozinho.
  let leadId;
  const mandouLeadId = veio(raw.lead_id);
  if (mandouLeadId) {
    if (!UUID_RE.test(String(raw.lead_id))) erro('lead_id', 'invalid_uuid');
    else leadId = String(raw.lead_id);
  }
  const leadPhone = veio(raw.lead_phone) ? texto(raw.lead_phone, 32) : null;
  // "faltando" só quando NENHUMA das duas veio. Um lead_id malformado já foi
  // acusado acima; dizer também que está ausente confunde quem integra.
  if (!mandouLeadId && !leadPhone) erro('lead_id', 'missing_lead_id_or_lead_phone');

  // --- tipo do evento --------------------------------------------------
  const tipo = veio(raw.event_type) ? texto(raw.event_type, MAX_TIPO) : null;
  if (!tipo) {
    erro('event_type', 'required');
  } else if (tipo.toLowerCase().startsWith(PREFIXO_RESERVADO)) {
    erro('event_type', 'reserved_prefix');
  } else {
    row.event_type = tipo;
  }

  // --- idempotência: é o que impede evento duplicado em retry -----------
  const idem = veio(raw.idempotency_key) ? texto(raw.idempotency_key, MAX_TEXTO_CURTO) : null;
  if (!idem) erro('idempotency_key', 'required');
  else row.idempotency_key = idem;

  // --- textos livres ----------------------------------------------------
  if (veio(raw.descricao)) definir('descricao', texto(raw.descricao, MAX_DESCRICAO));
  if (veio(raw.de)) definir('de', texto(raw.de, MAX_TEXTO_CURTO));
  if (veio(raw.para)) definir('para', texto(raw.para, MAX_TEXTO_CURTO));
  if (veio(raw.ator_nome)) definir('ator_nome', texto(raw.ator_nome, MAX_TEXTO_CURTO));

  // --- quando aconteceu -------------------------------------------------
  // Evento é passado: a LIA reporta o que já fez. Data futura seria relógio
  // torto do emissor e desordenaria a linha do tempo do card.
  if (veio(raw.occurred_at)) {
    const t = Date.parse(raw.occurred_at);
    if (Number.isNaN(t)) erro('occurred_at', 'invalid_date');
    else if (t > now + SKEW_FUTURO_MS) erro('occurred_at', 'in_the_future');
    else row.created_at = new Date(t).toISOString();
  }

  // --- metadata ---------------------------------------------------------
  // `etapa` é campo de primeira classe no contrato (é o que a LIA usa para
  // dizer em que ponto do atendimento está), mas mora no metadata para não
  // criar coluna que só um emissor preenche.
  const metadata = {};
  if (veio(raw.metadata)) {
    if (typeof raw.metadata !== 'object' || Array.isArray(raw.metadata)) {
      erro('metadata', 'not_an_object');
    } else if (Object.keys(raw.metadata).length > MAX_METADATA_CHAVES) {
      erro('metadata', 'too_many_keys');
    } else {
      Object.assign(metadata, raw.metadata);
    }
  }
  if (veio(raw.etapa)) metadata.etapa = texto(raw.etapa, MAX_TEXTO_CURTO);
  if (Object.keys(metadata).length > 0) row.metadata = metadata;

  if (erros.length > 0) return { ok: false, details: erros };

  // Quem escreve por esta rota é sempre a LIA — nunca um humano da dash.
  row.ator_tipo = 'lia';

  return { ok: true, row, leadId: leadId ?? null, leadPhone };
}
