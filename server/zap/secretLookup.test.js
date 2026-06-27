import { describe, it, expect } from 'vitest';
import { computeSecretLookup, generateFeedSecret } from './secretLookup.js';

// Chave-mestra de teste (32 bytes base64), igual ao padrão de crypto.js.
const KEY = Buffer.alloc(32, 7).toString('base64');
const env = { EMAIL_ENCRYPTION_KEY: KEY };

describe('secretLookup', () => {
  it('é determinístico: mesmo secret → mesmo lookup', () => {
    const a = computeSecretLookup('abc', env);
    const b = computeSecretLookup('abc', env);
    expect(a).toBe(b);
  });

  it('secrets diferentes → lookups diferentes (sem colisão)', () => {
    expect(computeSecretLookup('abc', env)).not.toBe(computeSecretLookup('abd', env));
  });

  it('chave-mestra diferente → lookup diferente (depende da derivação)', () => {
    const other = { EMAIL_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64') };
    expect(computeSecretLookup('abc', env)).not.toBe(computeSecretLookup('abc', other));
  });

  it('lança sem chave-mestra (não silencia)', () => {
    expect(() => computeSecretLookup('abc', {})).toThrow();
  });

  it('lança com secret vazio', () => {
    expect(() => computeSecretLookup('', env)).toThrow();
  });

  it('generateFeedSecret produz segredos fortes e únicos', () => {
    const s1 = generateFeedSecret();
    const s2 = generateFeedSecret();
    expect(s1).not.toBe(s2);
    // 32 bytes em base64url ~ 43 chars, sem padding/+//
    expect(s1.length).toBeGreaterThanOrEqual(43);
    expect(s1).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
