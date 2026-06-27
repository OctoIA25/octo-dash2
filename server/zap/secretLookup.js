/**
 * Deriva o índice pesquisável do feed_secret da ZAP, sem expor o segredo.
 *
 * O feed/webhook da ZAP chega ao backend trazendo APENAS o secret — precisamos
 * achar o tenant a partir dele. O secret vive cifrado (AES-256-GCM, IV aleatório),
 * logo não é indexável. Guardamos então um HMAC-SHA256 determinístico do secret
 * numa coluna indexada (feed_secret_lookup): lookup O(1) sem varrer/descifrar
 * todas as linhas e sem o secret em claro no banco.
 *
 * A chave do HMAC NÃO é a chave-mestra direta: derivamos via HKDF (separação de
 * domínios — a chave de cifra nunca serve a outro propósito). O sufixo de versão
 * em `info` permite rotacionar a chave de lookup sem mexer no AES dos segredos.
 */
import crypto from 'crypto';
import { getEncryptionKey } from '../recommendations/crypto.js';

const LOOKUP_INFO = 'zap-feed-secret-lookup-v1'; // bump p/ -v2 rotaciona a derivação
const DERIVED_KEY_LEN = 32;

function deriveLookupKey(processEnv = process.env) {
  const master = getEncryptionKey(processEnv); // 32 bytes; lança se ausente/inválida
  // HKDF-SHA256(ikm=master, salt='', info=LOOKUP_INFO) → chave dedicada ao lookup.
  const derived = crypto.hkdfSync('sha256', master, Buffer.alloc(0), Buffer.from(LOOKUP_INFO), DERIVED_KEY_LEN);
  return Buffer.from(derived); // hkdfSync devolve ArrayBuffer
}

/** HMAC-SHA256(secret) em base64 — determinístico, indexável. */
export function computeSecretLookup(secret, processEnv = process.env) {
  if (!secret) throw new Error('secret vazio');
  const key = deriveLookupKey(processEnv);
  return crypto.createHmac('sha256', key).update(String(secret), 'utf8').digest('base64');
}

/** Gera um feed_secret forte (256 bits, base64url). Único ponto de criação. */
export function generateFeedSecret() {
  return crypto.randomBytes(32).toString('base64url');
}
