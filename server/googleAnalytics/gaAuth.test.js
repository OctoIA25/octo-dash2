import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { gaEnvConfig, makeGaTokenProvider } from './gaAuth.js';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function okFetch(body = { access_token: 'tok-1', expires_in: 3600 }) {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
}

describe('gaEnvConfig', () => {
  it('retorna null sem as duas env vars', () => {
    expect(gaEnvConfig({})).toBeNull();
    expect(gaEnvConfig({ GA_SA_CLIENT_EMAIL: 'a@b.c' })).toBeNull();
  });

  it('desfaz o escape \\n da private key (formato EasyPanel)', () => {
    const cfg = gaEnvConfig({
      GA_SA_CLIENT_EMAIL: 'ga@p.iam.gserviceaccount.com',
      GA_SA_PRIVATE_KEY: '-----BEGIN\\nKEY-----',
    });
    expect(cfg.privateKey).toBe('-----BEGIN\nKEY-----');
  });
});

describe('makeGaTokenProvider', () => {
  it('monta um JWT RS256 válido e troca por access token', async () => {
    const fetchImpl = okFetch();
    const getToken = makeGaTokenProvider({
      clientEmail: 'ga@p.iam.gserviceaccount.com', privateKey, fetchImpl, now: () => 1_700_000_000_000,
    });
    expect(await getToken()).toBe('tok-1');

    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const assertion = new URLSearchParams(opts.body).get('assertion');
    const [h, c, s] = assertion.split('.');
    const verified = crypto.verify(
      'RSA-SHA256', Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, 'base64url'),
    );
    expect(verified).toBe(true);
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims.iss).toBe('ga@p.iam.gserviceaccount.com');
    expect(claims.scope).toBe('https://www.googleapis.com/auth/analytics.readonly');
    expect(claims.exp - claims.iat).toBe(3600);
  });

  it('cacheia o token e renova quando falta menos de 5min para expirar', async () => {
    let clock = 1_700_000_000_000;
    const fetchImpl = okFetch();
    const getToken = makeGaTokenProvider({
      clientEmail: 'e', privateKey, fetchImpl, now: () => clock,
    });
    await getToken();
    clock += 30 * 60_000; // 30min — ainda válido
    await getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock += 26 * 60_000; // 56min — dentro da janela de 5min do exp
    await getToken();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('erro do endpoint de token vira exceção sem vazar a chave', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'invalid_grant' }) }));
    const getToken = makeGaTokenProvider({ clientEmail: 'e', privateKey, fetchImpl, now: () => 0 });
    await expect(getToken()).rejects.toThrow('ga_token_error_401');
  });
});
