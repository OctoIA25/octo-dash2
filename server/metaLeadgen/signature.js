/**
 * Validação do X-Hub-Signature-256 da Meta. É a fronteira de confiança inteira
 * do webhook: sem isso qualquer um posta lead falso na conta de um tenant.
 *
 * Comparação em tempo constante (timingSafeEqual) — comparar hash com === vaza
 * o prefixo correto pelo tempo de resposta e permite forjar byte a byte.
 *
 * Fecha em `false` para todo caso degenerado (header ausente, hex inválido,
 * segredo não configurado). Nada aqui pode lançar: uma exceção aqui viraria 500
 * e a Meta trataria como falha nossa, reenviando um payload que já sabíamos
 * inválido.
 */
import crypto from 'node:crypto';

export function verifyMetaSignature(rawBody, headerValue, appSecret) {
  // Type-check explícito, não só truthiness: um appSecret truthy de tipo errado
  // (número, objeto) faria createHmac LANÇAR, e esta função promete nunca lançar.
  if (typeof appSecret !== 'string' || !appSecret) return false;
  if (typeof headerValue !== 'string' || !headerValue) return false;
  if (!rawBody || !rawBody.length) return false;

  const [algo, sent] = headerValue.split('=');
  if (algo !== 'sha256' || !sent) return false;
  // Buffer.from com hex inválido não lança — trunca. O confronto de tamanho
  // abaixo é o que pega tanto o truncado quanto o hex de tamanho errado.
  if (!/^[0-9a-f]+$/i.test(sent)) return false;

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();
  const received = Buffer.from(sent, 'hex');
  if (received.length !== expected.length) return false;

  return crypto.timingSafeEqual(expected, received);
}
