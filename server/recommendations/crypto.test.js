import { describe, it, expect } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  getEncryptionKey,
  hasEncryptionKey,
} from './crypto.js';

// Chave determinística de 32 bytes para os testes.
const KEY = Buffer.alloc(32, 7).toString('base64');
const env = { EMAIL_ENCRYPTION_KEY: KEY };

describe('crypto AES-256-GCM', () => {
  it('round-trip: decifra de volta o texto original', () => {
    const payload = encryptSecret('minha-senha-secreta', env);
    expect(payload).not.toContain('minha-senha-secreta'); // não vaza em claro
    expect(decryptSecret(payload, env)).toBe('minha-senha-secreta');
  });

  it('cada cifragem usa IV novo (payloads diferentes para o mesmo texto)', () => {
    expect(encryptSecret('x', env)).not.toBe(encryptSecret('x', env));
  });

  it('detecta adulteração (GCM authTag)', () => {
    const payload = encryptSecret('abc', env);
    const [iv, tag, data] = payload.split(':');
    const adulterado = [iv, tag, Buffer.from('outro').toString('base64')].join(':');
    expect(() => decryptSecret(adulterado, env)).toThrow();
  });

  it('aceita chave em hex', () => {
    const hexEnv = { EMAIL_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('hex') };
    const payload = encryptSecret('senha', hexEnv);
    expect(decryptSecret(payload, hexEnv)).toBe('senha');
  });

  it('hasEncryptionKey reflete presença/validade', () => {
    expect(hasEncryptionKey(env)).toBe(true);
    expect(hasEncryptionKey({})).toBe(false);
    expect(hasEncryptionKey({ EMAIL_ENCRYPTION_KEY: 'curta' })).toBe(false);
  });

  it('getEncryptionKey lança com chave ausente/ inválida', () => {
    expect(() => getEncryptionKey({})).toThrow(/ausente/);
    expect(() => getEncryptionKey({ EMAIL_ENCRYPTION_KEY: 'abc' })).toThrow(/inv/i);
  });
});
