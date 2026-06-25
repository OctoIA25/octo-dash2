/**
 * 🧠 Interpretador de intenção do Agente Disparador.
 *
 * Transforma um comando em linguagem natural numa OPERAÇÃO estruturada:
 *   { action: 'send_whatsapp', segment: { type, ... }, params: { message } }
 *
 * Transporte: webhook n8n (mesmo padrão dos agentes Elaine/Caio — a chave da IA
 * vive no n8n, NÃO no CRM). Mandamos o comando e o n8n devolve o PLANO em JSON
 * estruturado ({ action, segment, message?, clarification? }). O CRM continua
 * dono do schema: validamos tudo em normalizePlan() antes de executar.
 *
 * IMPORTANTE: o interpretador NÃO executa nada. Ele só decide a intenção. A
 * busca de clientes, a prévia e o envio acontecem depois, no servidor, com
 * confirmação explícita. Isso é a proteção central contra disparo acidental: o
 * n8n nunca dispara — apenas propõe.
 *
 * O fluxo n8n esperado: um webhook que recebe { agente:'Disparador', mensagem }
 * e responde com o JSON do plano (em qualquer um dos campos usuais aceitos pelo
 * parser dos webhooks — response/output/data/...). `transport` é injetável para
 * testes (sem rede).
 */

import { SEGMENT_TYPES, validateSegment } from './segmentSchema.js';

// URL do fluxo n8n do Disparador. Distinta dos webhooks de chat (Elaine/Caio),
// pois este retorna PLANO estruturado, não texto livre. Override por env.
const DEFAULT_DISPARADOR_WEBHOOK_URL =
  process.env.DISPARADOR_WEBHOOK_URL || 'https://webhook.octoia.org/webhook/disparador';

/**
 * CONTRATO esperado do fluxo n8n (documentação para quem montar o fluxo lá).
 * O n8n deve receber o comando e responder com este JSON:
 *
 *   {
 *     "action": "send_whatsapp" | "",          // vazio se não for ação suportada
 *     "segment": {
 *       "type": "explicit_list" | "archived" | "archived_period" |
 *               "by_broker" | "no_contact" | "interest",
 *       "names":   ["João Silva"],   // explicit_list
 *       "days":    30,                // archived_period / no_contact
 *       "broker":  "Imobiliária X",   // by_broker
 *       "interest":"apartamento"      // interest
 *     },
 *     "message": "texto a enviar",    // vazio se o usuário não forneceu
 *     "clarification": "..."          // quando ambíguo / não suportado
 *   }
 *
 * Regras que o prompt do n8n deve seguir:
 *  - NUNCA executar a ação; apenas descrever a intenção.
 *  - explicit_list  → nomes citados ("para o cliente João Silva").
 *  - archived       → todos os arquivados, sem período.
 *  - archived_period→ "arquivados há mais de N dias" (preencher days).
 *  - by_broker      → clientes de um corretor/corretora (preencher broker).
 *  - no_contact     → "sem atendimento/contato nos últimos N dias" (days).
 *  - interest       → interessados em um tipo de imóvel (preencher interest).
 *  - Se ambíguo / não suportado → action "" e explicar em clarification.
 *
 * Este contrato é o ÚNICO ponto de acoplamento com o n8n; o CRM revalida tudo
 * em normalizePlan(), então uma resposta malformada nunca dispara nada.
 */
export const N8N_PLAN_CONTRACT = { SEGMENT_TYPES, supportedActions: ['send_whatsapp'] };

/**
 * Extrai o objeto-plano da resposta do n8n, que pode vir em formatos variados
 * (igual ao parser dos webhooks de chat): JSON direto, string JSON, ou aninhado
 * em response/output/data/.... Retorna o objeto ou null.
 */
export function extractPlan(data) {
  if (data == null) return null;
  // string → tenta JSON
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof data !== 'object') return null;
  // já é o plano (tem 'action' ou 'segment')
  if ('action' in data || 'segment' in data) return data;
  // procura em campos usuais de wrapper
  for (const key of ['response', 'output', 'result', 'resultado', 'data', 'plan', 'message']) {
    if (key in data) {
      const inner = extractPlan(data[key]);
      if (inner) return inner;
    }
  }
  return null;
}

/** Transporte padrão: POST do comando ao webhook n8n do Disparador. */
async function defaultTransport(command, opts) {
  const url = opts.webhookUrl || DEFAULT_DISPARADOR_WEBHOOK_URL;
  const fetchImpl = opts.fetchImpl || fetch;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agente: 'Disparador',
      mensagem: command,
      empresa: opts.empresa || '',
      usuario: opts.usuario || '',
    }),
  });
  if (!response.ok) {
    const err = new Error(`n8n HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  const contentType = response.headers?.get?.('content-type') || '';
  return contentType.includes('application/json') ? response.json() : response.text();
}

/**
 * Interpreta o comando via n8n. Retorna { ok, operation } ou
 * { ok:false, error, clarification? }.
 *
 * @param command  texto em linguagem natural
 * @param opts     { transport?, webhookUrl?, fetchImpl?, empresa?, usuario? }
 *                 `transport(command, opts) -> resposta crua` é injetável p/ testes.
 */
export async function interpretCommand(command, opts = {}) {
  const text = String(command || '').trim();
  if (!text) return { ok: false, error: 'empty_command' };

  const transport = opts.transport || defaultTransport;

  let raw;
  try {
    raw = await transport(text, opts);
  } catch (err) {
    return { ok: false, error: 'n8n_error', detail: err?.message };
  }

  const parsed = extractPlan(raw);
  if (!parsed) return { ok: false, error: 'invalid_plan' };

  return normalizePlan(parsed);
}

/** Valida/normaliza o plano cru do LLM em uma operação confiável. */
export function normalizePlan(parsed) {
  const action = parsed?.action || '';
  if (!action) {
    return { ok: false, error: 'unsupported_intent', clarification: parsed?.clarification || null };
  }
  if (action !== 'send_whatsapp') {
    return { ok: false, error: `unsupported_action:${action}` };
  }

  const segValidation = validateSegment(parsed?.segment);
  if (!segValidation.ok) {
    return { ok: false, error: 'invalid_segment', clarification: parsed?.clarification || null };
  }
  const cleanSegment = segValidation.segment;

  // Mensagem: contrato n8n usa top-level `message`; aceitamos também
  // `params.message` por robustez.
  const message = String(parsed?.message ?? parsed?.params?.message ?? '').trim();

  return {
    ok: true,
    operation: {
      action,
      segment: cleanSegment,
      params: { message },
      needsMessage: message.length === 0,
    },
  };
}

export const __test__ = { SEGMENT_TYPES, normalizePlan, extractPlan };
