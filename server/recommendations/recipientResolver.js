/**
 * 🛡️ Resolução de destinatário com proteção entre ambientes.
 *
 * Esta é a peça de SEGURANÇA do envio: garante que, fora de produção, nenhum
 * e-mail chegue ao cliente real — todos são redirecionados para o e-mail de
 * teste configurado. A decisão fica 100% no servidor: o cliente nunca é
 * confiável para decidir o destinatário final.
 *
 * Módulo PURO (sem rede/IO) para ser exaustivamente testável.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida formato básico de e-mail. */
export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_REGEX.test(value.trim());
}

/**
 * Normaliza a string de ambiente em uma das três categorias suportadas.
 * Qualquer valor desconhecido é tratado como 'development' (fail-safe: na dúvida,
 * NÃO envia para o cliente real).
 */
export function resolveEnvironment(rawEnv) {
  const env = String(rawEnv || '').trim().toLowerCase();
  if (env === 'production' || env === 'prod') return 'production';
  if (env === 'homologation' || env === 'homolog' || env === 'staging') return 'homologation';
  return 'development';
}

/**
 * Lê o ambiente a partir das variáveis de ambiente do processo.
 * Precedência: APP_ENV explícito > NODE_ENV > 'development'.
 */
export function environmentFromEnv(processEnv = process.env) {
  return resolveEnvironment(processEnv.APP_ENV || processEnv.NODE_ENV);
}

/**
 * Determina o e-mail de teste a ser usado, em ordem de precedência:
 *   1. testEmail explícito (configuração do tenant / requisição)
 *   2. EMAIL_TEST_RECIPIENT (variável de ambiente)
 * Sem nenhum dos dois, retorna null (fail-closed): NÃO há para onde redirecionar,
 * então o envio é bloqueado em vez de vazar PII para um endereço embutido.
 */
export function resolveTestRecipient(configuredTestEmail, processEnv = process.env) {
  if (isValidEmail(configuredTestEmail)) return configuredTestEmail.trim();
  if (isValidEmail(processEnv.EMAIL_TEST_RECIPIENT)) return processEnv.EMAIL_TEST_RECIPIENT.trim();
  return null;
}

/**
 * Resolve para qual e-mail o envio deve realmente ir.
 *
 * @param {object} params
 * @param {string} params.environment   ambiente já normalizado ('production'|...)
 * @param {string|null} params.leadEmail   e-mail real do lead
 * @param {string} [params.configuredTestEmail]  e-mail de teste (tenant/requisição)
 * @param {boolean} [params.isTest]   envio de teste explícito ("como se fosse o cliente")
 * @param {object} [params.processEnv]
 * @returns {{ recipient: string|null, redirected: boolean, environment: string,
 *            isTest: boolean, intendedEmail: string|null, reason: string,
 *            error?: string }}
 */
export function resolveRecipient({
  environment,
  leadEmail,
  configuredTestEmail,
  isTest = false,
  processEnv = process.env,
}) {
  const env = resolveEnvironment(environment);
  const intendedEmail = isValidEmail(leadEmail) ? leadEmail.trim() : null;
  const testRecipient = resolveTestRecipient(configuredTestEmail, processEnv);

  // Envio de teste explícito: SEMPRE vai para o e-mail de teste, em qualquer ambiente.
  if (isTest) {
    if (!testRecipient) {
      return {
        recipient: null,
        redirected: false,
        environment: env,
        isTest: true,
        intendedEmail,
        reason: 'missing_test_recipient',
        error: 'Sem e-mail de teste configurado (testEmail ou EMAIL_TEST_RECIPIENT) — envio de teste bloqueado.',
      };
    }
    return {
      recipient: testRecipient,
      redirected: true,
      environment: env,
      isTest: true,
      intendedEmail,
      reason: 'test_mode',
    };
  }

  // Produção: vai para o lead real — exige e-mail válido.
  if (env === 'production') {
    if (!intendedEmail) {
      return {
        recipient: null,
        redirected: false,
        environment: env,
        isTest: false,
        intendedEmail: null,
        reason: 'missing_lead_email',
        error: 'Lead sem e-mail válido — não é possível enviar em produção.',
      };
    }
    return {
      recipient: intendedEmail,
      redirected: false,
      environment: env,
      isTest: false,
      intendedEmail,
      reason: 'production_real_recipient',
    };
  }

  // Não-produção: redireciona TUDO para o e-mail de teste (proteção do cliente real).
  // Sem e-mail de teste configurado, falha fechado (não envia) em vez de vazar PII.
  if (!testRecipient) {
    return {
      recipient: null,
      redirected: false,
      environment: env,
      isTest: false,
      intendedEmail,
      reason: 'missing_test_recipient',
      error: 'Sem e-mail de teste configurado (testEmail ou EMAIL_TEST_RECIPIENT) fora de produção — envio bloqueado.',
    };
  }
  return {
    recipient: testRecipient,
    redirected: true,
    environment: env,
    isTest: false,
    intendedEmail,
    reason: 'non_production_redirect',
  };
}

/**
 * Prefixo de assunto para deixar explícito, no inbox de teste, que aquele e-mail
 * teria ido para outro destinatário. Vazio quando não há redirecionamento.
 */
export function testSubjectPrefix({ redirected, isTest, intendedEmail }) {
  if (!redirected) return '';
  const alvo = intendedEmail || 'lead sem e-mail';
  return isTest ? `[TESTE → ${alvo}] ` : `[REDIRECIONADO → ${alvo}] `;
}
