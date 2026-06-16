/**
 * 🔐 Cifra simétrica para segredos em repouso (senha SMTP por tenant).
 *
 * AES-256-GCM (autenticado: detecta adulteração). A chave-mestra vem do ambiente
 * (EMAIL_ENCRYPTION_KEY), nunca do banco — assim um dump do Postgres não revela
 * a senha. Formato do payload: "iv:authTag:ciphertext", cada parte em base64.
 *
 * Gerar uma chave (32 bytes / base64):
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // recomendado para GCM
const KEY_LEN = 32; // AES-256

/**
 * Resolve a chave-mestra a partir do ambiente. Aceita base64 ou hex que
 * decodifiquem para exatamente 32 bytes. Lança erro claro se ausente/ inválida.
 */
export function getEncryptionKey(processEnv = process.env) {
  const raw = processEnv.EMAIL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'EMAIL_ENCRYPTION_KEY ausente. Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  let key = tryDecode(raw, 'base64');
  if (!key || key.length !== KEY_LEN) key = tryDecode(raw, 'hex');
  if (!key || key.length !== KEY_LEN) {
    throw new Error('EMAIL_ENCRYPTION_KEY inválida: precisa decodificar para 32 bytes (base64 ou hex).');
  }
  return key;
}

function tryDecode(value, encoding) {
  try {
    return Buffer.from(value, encoding);
  } catch {
    return null;
  }
}

/** Indica se há chave configurada (sem lançar) — útil para degradar o fluxo. */
export function hasEncryptionKey(processEnv = process.env) {
  try {
    getEncryptionKey(processEnv);
    return true;
  } catch {
    return false;
  }
}

/** Cifra um texto. Retorna a string de payload para gravar no banco. */
export function encryptSecret(plaintext, processEnv = process.env) {
  const key = getEncryptionKey(processEnv);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Decifra um payload gerado por {@link encryptSecret}. Lança se adulterado. */
export function decryptSecret(payload, processEnv = process.env) {
  const key = getEncryptionKey(processEnv);
  const parts = String(payload).split(':');
  if (parts.length !== 3) throw new Error('payload cifrado inválido');
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
