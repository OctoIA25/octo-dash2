import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyMetaSignature } from './signature.js';

const SECRET = 'app-secret-do-tenant';
const BODY = JSON.stringify({ object: 'page', entry: [] });
const sign = (body, secret) =>
  'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

describe('verifyMetaSignature', () => {
  it('aceita assinatura correta', () => {
    expect(verifyMetaSignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it('aceita rawBody como Buffer', () => {
    const buf = Buffer.from(BODY, 'utf8');
    expect(verifyMetaSignature(buf, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it('rejeita assinatura de outro segredo', () => {
    expect(verifyMetaSignature(BODY, sign(BODY, 'outro'), SECRET)).toBe(false);
  });

  it('rejeita corpo adulterado', () => {
    const assinatura = sign(BODY, SECRET);
    expect(verifyMetaSignature(BODY + ' ', assinatura, SECRET)).toBe(false);
  });

  it('rejeita header ausente', () => {
    expect(verifyMetaSignature(BODY, undefined, SECRET)).toBe(false);
  });

  it('rejeita algoritmo diferente de sha256', () => {
    const hex = crypto.createHmac('sha1', SECRET).update(BODY).digest('hex');
    expect(verifyMetaSignature(BODY, `sha1=${hex}`, SECRET)).toBe(false);
  });

  it('rejeita hex de tamanho errado sem estourar', () => {
    expect(verifyMetaSignature(BODY, 'sha256=abcd', SECRET)).toBe(false);
  });

  it('rejeita hex inválido sem estourar', () => {
    expect(verifyMetaSignature(BODY, 'sha256=zzzz', SECRET)).toBe(false);
  });

  it('rejeita quando não há app secret configurado', () => {
    expect(verifyMetaSignature(BODY, sign(BODY, SECRET), null)).toBe(false);
  });

  it('rejeita corpo vazio', () => {
    expect(verifyMetaSignature('', sign('', SECRET), SECRET)).toBe(false);
  });

  it('appSecret numérico retorna false e não lança', () => {
    expect(() => verifyMetaSignature(BODY, sign(BODY, SECRET), 123)).not.toThrow();
    expect(verifyMetaSignature(BODY, sign(BODY, SECRET), 123)).toBe(false);
  });

  it('appSecret objeto retorna false e não lança', () => {
    expect(() => verifyMetaSignature(BODY, sign(BODY, SECRET), {})).not.toThrow();
    expect(verifyMetaSignature(BODY, sign(BODY, SECRET), {})).toBe(false);
  });

  it('headerValue não-string retorna false e não lança', () => {
    expect(() => verifyMetaSignature(BODY, ['sha256=abc'], SECRET)).not.toThrow();
    expect(verifyMetaSignature(BODY, ['sha256=abc'], SECRET)).toBe(false);
  });

  it('header vazio retorna false', () => {
    expect(verifyMetaSignature(BODY, '', SECRET)).toBe(false);
  });

  it('header sem = retorna false', () => {
    expect(verifyMetaSignature(BODY, 'sha256', SECRET)).toBe(false);
  });

  it('algoritmo maiúsculo retorna false', () => {
    const hex = crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyMetaSignature(BODY, `SHA256=${hex}`, SECRET)).toBe(false);
  });
});
