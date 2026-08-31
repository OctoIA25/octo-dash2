/**
 * Access token Google para a service account do GA (escopo analytics.readonly).
 *
 * Sem SDK: JWT RS256 assinado com node:crypto trocado no endpoint OAuth2 de
 * service accounts (grant urn:ietf:params:oauth:grant-type:jwt-bearer).
 * O token vale 1h; cacheamos e renovamos 5min antes de expirar.
 *
 * A private key vem de env var (GA_SA_PRIVATE_KEY) — EasyPanel entrega \n
 * escapado, então gaEnvConfig desfaz o escape. A chave nunca é logada.
 */
import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const RENEW_MARGIN_MS = 5 * 60_000;

const b64url = (s) => Buffer.from(s).toString('base64url');

/** Lê a config da service account do env; null = não configurada. */
export function gaEnvConfig(env = process.env) {
  const clientEmail = env.GA_SA_CLIENT_EMAIL;
  const privateKey = env.GA_SA_PRIVATE_KEY;
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') };
}

/** Fábrica do provedor de token: async () => access_token (com cache). */
export function makeGaTokenProvider({ clientEmail, privateKey, fetchImpl = fetch, now = Date.now }) {
  let cached = null; // { accessToken, expiresAt }

  return async function getAccessToken() {
    if (cached && cached.expiresAt - RENEW_MARGIN_MS > now()) return cached.accessToken;

    const iat = Math.floor(now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({ iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    const assertion = `${header}.${claims}.${signer.sign(privateKey, 'base64url')}`;

    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) throw new Error(`ga_token_error_${res.status}`);

    cached = { accessToken: json.access_token, expiresAt: now() + (json.expires_in || 3600) * 1000 };
    return cached.accessToken;
  };
}
