/**
 * Cliente mínimo do Google Sheets para service account.
 * JWT RS256 com node:crypto + token OAuth por fetch — sem googleapis de
 * propósito: o job só precisa de clear + update de UMA aba.
 */
import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

export function makeSheetsClient({ email, privateKeyPem, fetchImpl = fetch }) {
  let cached = null; // { token, expiraEm (ms epoch) }

  async function getToken() {
    if (cached && Date.now() < cached.expiraEm - 60_000) return cached.token;
    const iat = Math.floor(Date.now() / 1000);
    const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
      iss: email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600,
    })}`;
    const sig = createSign('RSA-SHA256').update(unsigned).sign(privateKeyPem).toString('base64url');
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${sig}`,
      }).toString(),
    });
    if (!res.ok) throw new Error(`token Google falhou: ${res.status} ${await res.text()}`);
    const body = await res.json();
    cached = { token: body.access_token, expiraEm: Date.now() + body.expires_in * 1000 };
    return cached.token;
  }

  async function call(url, options = {}) {
    const token = await getToken();
    const res = await fetchImpl(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
    });
    if (!res.ok) throw new Error(`Sheets API ${options.method || 'GET'} falhou: ${res.status} ${await res.text()}`);
    return res.json();
  }

  return {
    /** Apaga a aba inteira e escreve `values` a partir de A1. */
    async overwriteTab({ spreadsheetId, tab, values }) {
      const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values`;
      // Nome da aba entre aspas simples em notação A1 (obrigatório p/ nomes com
      // espaço/caracteres especiais; aspas dobradas escapam aspas embutidas).
      // O range da URL e o do body PRECISAM casar — a API rejeita com 400
      // "Request range does not match value's range" se um vier sem aspas
      // (visto no smoke test real de 29/08).
      const quotedRange = `'${tab.replace(/'/g, "''")}'!A1`;
      const urlRange = encodeURIComponent(quotedRange);
      await call(`${base}/${encodeURIComponent(`'${tab.replace(/'/g, "''")}'`)}:clear`, { method: 'POST', body: '{}' });
      await call(`${base}/${urlRange}?valueInputOption=RAW`, {
        method: 'PUT',
        body: JSON.stringify({ range: quotedRange, majorDimension: 'ROWS', values }),
      });
    },
  };
}
