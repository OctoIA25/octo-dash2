/**
 * 📡 Resolução de entrega POR CANAL (email | whatsapp).
 *
 * Centraliza a regra de "para onde vai e se realmente envia", reusando o
 * recipientResolver do e-mail (sem mudar seu comportamento) e adicionando o
 * WhatsApp. Mantém a proteção de ambiente:
 *   - Email: produção → lead; fora de produção → redireciona p/ e-mail de teste.
 *   - WhatsApp: produção → telefone do lead; fora de produção → SIMULA (não envia).
 *
 * Módulo PURO (sem rede), para ser exaustivamente testável.
 */

import { resolveRecipient, resolveEnvironment } from './recipientResolver.js';

export const CHANNELS = ['email', 'whatsapp'];

/** Normaliza telefone para apenas dígitos (formato aceito pela Meta). */
export function normalizePhone(value) {
  if (!value) return '';
  return String(value).replace(/\D+/g, '');
}

/**
 * Resolve a entrega de um canal específico.
 * @returns {{ channel, recipient: string|null, intended: string|null,
 *            redirected: boolean, simulate: boolean, isTest: boolean,
 *            environment: string, reason: string, error?: string }}
 */
export function resolveDelivery({
  channel,
  environment,
  leadEmail,
  leadPhone,
  configuredTestEmail,
  isTest = false,
  processEnv = process.env,
}) {
  const env = resolveEnvironment(environment);

  if (channel === 'email') {
    const r = resolveRecipient({
      environment: env,
      leadEmail,
      configuredTestEmail,
      isTest,
      processEnv,
    });
    // Email nunca "simula" por ambiente — ele redireciona (e ainda envia).
    return { channel: 'email', simulate: false, ...r };
  }

  if (channel === 'whatsapp') {
    const phone = normalizePhone(leadPhone);
    if (!phone) {
      return {
        channel: 'whatsapp',
        recipient: null,
        intended: null,
        redirected: false,
        simulate: false,
        isTest,
        environment: env,
        reason: 'missing_lead_phone',
        error: 'Lead sem telefone — não é possível enviar por WhatsApp.',
      };
    }
    // Fora de produção (ou teste): simula, nunca dispara para número real.
    const simulate = env !== 'production' || isTest;
    return {
      channel: 'whatsapp',
      recipient: phone,
      intended: phone,
      redirected: false,
      simulate,
      isTest,
      environment: env,
      reason: simulate ? (isTest ? 'test_simulated' : 'non_production_simulated') : 'production_real_recipient',
    };
  }

  return {
    channel,
    recipient: null,
    intended: null,
    redirected: false,
    simulate: false,
    isTest,
    environment: env,
    reason: 'unsupported_channel',
    error: `Canal não suportado: ${channel}`,
  };
}

/** Deriva o status final do envio a partir da resolução + resultado do sender. */
export function deriveStatus({ isTest, simulate, sent, failed }) {
  if (failed) return 'failed';
  if (isTest) return 'test';
  if (simulate || sent?.simulated) return 'simulated';
  return 'sent';
}
