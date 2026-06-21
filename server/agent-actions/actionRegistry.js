/**
 * 🧩 Registro de Ações do Agente Disparador (executor baseado em ações).
 *
 * O agente NÃO é especializado em mensagens: ele interpreta intenção e executa
 * AÇÕES. Cada ação é um plugin que implementa um contrato comum. Adicionar uma
 * nova ação (create_task, add_tag, move_pipeline, assign_broker) é registrar
 * uma entrada aqui — sem novo agente, sem nova fila, sem novas rotas.
 *
 * Contrato de uma ação:
 *   type            : string único (vai para action_type na fila/run).
 *   description     : descrição em linguagem natural (vira a tool do interpreter).
 *   requiredRoles   : roles que podem disparar em massa esta ação.
 *   toolSchema      : JSON Schema dos parâmetros (OpenAI function-calling).
 *   checkEligibility(lead, payload) -> { eligible, reason? }
 *                     decide, por destinatário, se a ação pode ser executada
 *                     (ex.: WhatsApp exige telefone válido). PURA, sem rede.
 *   buildPayload(payload, lead) -> objeto persistido em agent_action_queue.payload
 *   deliverItem(supabase, item, deps) -> { status, messageId?, error? }
 *                     executa de fato UM item, reusando a infra existente.
 *
 * MVP: apenas send_whatsapp implementada. As demais ficam como contrato a
 * preencher — a estrutura já as suporta.
 */

import { resolveDelivery } from '../recommendations/channels.js';

/**
 * Ação: enviar WhatsApp.
 *
 * Reutiliza integralmente a infra de envio existente:
 *  - resolveDelivery()        → elegibilidade (telefone válido) + proteção de ambiente
 *  - deliverRecommendation()  → idempotência + envio (template HSM) + histórico
 *
 * Conteúdo: a Meta NÃO permite texto livre fora da janela de 24h. O envio é via
 * TEMPLATE aprovado configurado por tenant; a "mensagem" do usuário vira o
 * primeiro parâmetro do corpo do template (params[0]). Documentado em
 * whatsappSender.js.
 */
const sendWhatsappAction = {
  type: 'send_whatsapp',
  description:
    'Envia uma mensagem de WhatsApp (via template aprovado) para um cliente ou ' +
    'grupo de clientes. Use para comandos como "envie uma mensagem para...".',
  requiredRoles: ['owner', 'admin', 'team_leader', 'corretor'],
  toolSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description:
          'Texto da mensagem a enviar (vira o parâmetro do template de WhatsApp). ' +
          'Se o usuário não forneceu, deixe vazio e o sistema pedirá.',
      },
    },
    required: [],
  },

  /** Elegibilidade por destinatário: precisa de telefone válido. PURA. */
  checkEligibility(lead) {
    const d = resolveDelivery({
      channel: 'whatsapp',
      environment: 'production', // só para validar o telefone; ambiente real é resolvido no envio
      leadPhone: lead.phone,
    });
    if (!d.recipient) return { eligible: false, reason: 'no_whatsapp' };
    return { eligible: true };
  },

  /** Payload persistido por item: o parâmetro do template. */
  buildPayload(payload, lead) {
    return {
      // O template recebe [mensagem]. Mantemos genérico para evoluir parâmetros.
      templateParams: [payload?.message || ''],
      leadName: lead.name || '',
    };
  },

  /**
   * Entrega UM item, reusando deliverRecommendation (fonte única de envio).
   * deps: { deliverRecommendation, makeSchedulerDeps, getEnvironment, processEnv }
   */
  async deliverItem(supabase, item, deps) {
    const { deliverRecommendation, schedulerDeps, getEnvironment, processEnv = process.env } = deps;
    const environment = getEnvironment ? getEnvironment(processEnv) : processEnv.NODE_ENV || 'development';

    const delivery = resolveDelivery({
      channel: 'whatsapp',
      environment,
      leadPhone: item.lead_phone,
      processEnv,
    });
    if (!delivery.recipient) {
      return { status: 'skipped', error: delivery.error || 'no_whatsapp' };
    }

    const params = item.payload?.templateParams || [];
    const result = await deliverRecommendation(
      supabase,
      {
        tenantId: item.tenant_id,
        channel: 'whatsapp',
        lead: { id: item.lead_id, name: item.lead_name, source: item.lead_source },
        delivery,
        // sanitizedProps vazio: este disparo não envia lista de imóveis; o
        // template recebe a mensagem do usuário como parâmetro do corpo.
        sanitizedProps: [],
        content: { whatsappBody: params[0] || '' },
        isTest: false,
        sentBy: deps.sentBy || {},
        // Sobrescreve os params do template com a mensagem do usuário.
        whatsappParams: params,
        // Idempotência por RUN (não por imóveis): garante que reprocessar a fila
        // não reenvie, mas runs distintos (novo comando) reenviem por decisão.
        idempotencyRefs: [`run:${item.run_id}`],
      },
      schedulerDeps,
    );

    if (result.deduplicated) return { status: 'done', deduplicated: true, messageId: result.messageId };
    if (result.ok) return { status: 'done', messageId: result.messageId };
    return { status: 'failed', error: result.errorMessage || 'send_failed' };
  },
};

// Mapa de ações registradas. Extensível: basta adicionar a entrada.
const REGISTRY = new Map([[sendWhatsappAction.type, sendWhatsappAction]]);

/** Retorna a ação registrada ou null. */
export function getAction(type) {
  return REGISTRY.get(type) || null;
}

/** Lista os tipos de ação registrados. */
export function listActionTypes() {
  return [...REGISTRY.keys()];
}

/** Tool definitions (OpenAI function-calling) para todas as ações registradas. */
export function buildToolDefinitions() {
  return [...REGISTRY.values()].map((a) => ({
    type: 'function',
    function: { name: a.type, description: a.description, parameters: a.toolSchema },
  }));
}

/** Permite registrar ações em testes ou módulos futuros sem editar este arquivo. */
export function registerAction(action) {
  if (!action?.type) throw new Error('action.type é obrigatório');
  REGISTRY.set(action.type, action);
}

export const __test__ = { sendWhatsappAction, REGISTRY };
