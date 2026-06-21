/**
 * ✉️ Abstração de transporte de e-mail.
 *
 * Define um contrato único (`send`) e duas implementações:
 *   - SMTP (nodemailer): usada quando há credenciais SMTP configuradas.
 *   - Simulada ("log/preview"): default quando NÃO há credenciais. Não envia
 *     nada de fato — apenas registra e devolve sucesso simulado. Isso permite
 *     exercitar todo o fluxo (preview, histórico, redirecionamento, logs) sem
 *     risco de disparo acidental e sem dependência de rede nos testes.
 *
 * Trocar para envio real = preencher as variáveis SMTP_* no ambiente.
 *
 * @typedef {Object} EmailMessage
 * @property {string} from
 * @property {string} to
 * @property {string} subject
 * @property {string} html
 * @property {string} [text]
 *
 * @typedef {Object} SendResult
 * @property {boolean} simulated
 * @property {string} transport   'smtp' | 'simulated'
 * @property {string} [messageId]
 *
 * @typedef {Object} EmailTransport
 * @property {string} kind
 * @property {(message: EmailMessage) => Promise<SendResult>} send
 */

/** Cria um transporte simulado, que registra o envio sem disparar e-mail. */
export function createSimulatedTransport({ logger = console } = {}) {
  return {
    kind: 'simulated',
    async send(message) {
      logger.log?.(
        `📨 [email:simulado] (NÃO enviado) to=${message.to} subject="${message.subject}"`,
      );
      return {
        simulated: true,
        transport: 'simulated',
        messageId: `simulated-${Date.now()}`,
      };
    },
  };
}

/**
 * Cria um transporte SMTP real via nodemailer. O import é dinâmico para que a
 * dependência só seja exigida quando o SMTP estiver de fato configurado.
 */
export async function createSmtpTransport({ smtp, logger = console }) {
  let nodemailer;
  try {
    ({ default: nodemailer } = await import('nodemailer'));
  } catch {
    throw new Error(
      'SMTP configurado, mas o pacote "nodemailer" não está instalado. Rode `npm i nodemailer` no servidor.',
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port || 587,
    secure: Boolean(smtp.secure),
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    // Timeouts para FALHAR RÁPIDO quando o SMTP está mal configurado/inacessível.
    // Sem eles, os defaults do nodemailer são altos (minutos) e a requisição de
    // envio fica pendurada — o que aparece como "loading infinito" na tela.
    connectionTimeout: 10_000, // 10s para abrir a conexão TCP
    greetingTimeout: 10_000, // 10s para o greeting do servidor SMTP
    socketTimeout: 20_000, // 20s sem atividade no socket
  });

  return {
    kind: 'smtp',
    async send(message) {
      const info = await transporter.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      logger.log?.(`📨 [email:smtp] enviado to=${message.to} id=${info.messageId}`);
      return { simulated: false, transport: 'smtp', messageId: info.messageId };
    },
  };
}

/** Lê a configuração SMTP a partir das variáveis de ambiente. */
export function smtpConfigFromEnv(processEnv = process.env) {
  if (!processEnv.SMTP_HOST) return null;
  return {
    host: processEnv.SMTP_HOST,
    port: processEnv.SMTP_PORT ? Number(processEnv.SMTP_PORT) : 587,
    secure: processEnv.SMTP_SECURE === 'true',
    user: processEnv.SMTP_USER,
    pass: processEnv.SMTP_PASS,
  };
}

/**
 * Cria o transporte apropriado a partir do ambiente: SMTP quando configurado,
 * caso contrário simulado. É assíncrona porque o SMTP carrega nodemailer sob demanda.
 */
export async function createEmailTransport({ processEnv = process.env, logger = console } = {}) {
  const smtp = smtpConfigFromEnv(processEnv);
  if (smtp) return createSmtpTransport({ smtp, logger });
  return createSimulatedTransport({ logger });
}

/** E-mail remetente padrão (From). */
export function fromAddressFromEnv(processEnv = process.env) {
  return processEnv.EMAIL_FROM || 'Recomendações <nao-responda@octodash.local>';
}
