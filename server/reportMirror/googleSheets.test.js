// server/reportMirror/googleSheets.test.js
import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { makeSheetsClient } from './googleSheets.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const b64urlJson = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

function makeFetchMock() {
  return vi.fn(async (url) => {
    if (String(url).includes('oauth2.googleapis.com')) {
      return { ok: true, json: async () => ({ access_token: 'tok-123', expires_in: 3600 }) };
    }
    return { ok: true, json: async () => ({}) };
  });
}

describe('makeSheetsClient', () => {
  it('assina JWT RS256 verificável, com claims da SA', async () => {
    const fetchImpl = makeFetchMock();
    const client = makeSheetsClient({ email: 'sa@test.iam.gserviceaccount.com', privateKeyPem: privateKey, fetchImpl });
    await client.overwriteTab({ spreadsheetId: 'SHEET1', tab: 'ESPELHO', values: [['a']] });

    const tokenCall = fetchImpl.mock.calls.find(([u]) => String(u).includes('oauth2.googleapis.com'));
    const assertion = new URLSearchParams(tokenCall[1].body).get('assertion');
    const [h, p, sig] = assertion.split('.');
    expect(b64urlJson(h)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = b64urlJson(p);
    expect(claims.iss).toBe('sa@test.iam.gserviceaccount.com');
    expect(claims.scope).toBe('https://www.googleapis.com/auth/spreadsheets');
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
    expect(claims.exp - claims.iat).toBe(3600);
    const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(sig, 'base64url'));
    expect(ok).toBe(true);
  });

  it('limpa a aba e escreve os valores com o token', async () => {
    const fetchImpl = makeFetchMock();
    const client = makeSheetsClient({ email: 'sa@x.iam.gserviceaccount.com', privateKeyPem: privateKey, fetchImpl });
    await client.overwriteTab({ spreadsheetId: 'SHEET1', tab: 'ESPELHO', values: [['a', 1]] });

    const urls = fetchImpl.mock.calls.map(([u]) => String(u));
    const clearCall = fetchImpl.mock.calls.find(([u]) => String(u).includes(':clear'));
    const putCall = fetchImpl.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(urls.some((u) => u.includes('/v4/spreadsheets/SHEET1/values/'))).toBe(true);
    expect(clearCall[1].headers.Authorization).toBe('Bearer tok-123');
    expect(String(putCall[0])).toContain('valueInputOption=RAW');
    const putBody = JSON.parse(putCall[1].body);
    expect(putBody.values).toEqual([['a', 1]]);
    expect(putBody.range).toBe("'ESPELHO'!A1");
  });

  it('aba com espaço no nome: URL percent-encoded, range do body entre aspas simples', async () => {
    const fetchImpl = makeFetchMock();
    const client = makeSheetsClient({ email: 'sa@x.iam.gserviceaccount.com', privateKeyPem: privateKey, fetchImpl });
    await client.overwriteTab({ spreadsheetId: 'SHEET1', tab: 'Aba Nova', values: [['a']] });

    const putCall = fetchImpl.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(String(putCall[0])).toContain(encodeURIComponent('Aba Nova'));
    expect(JSON.parse(putCall[1].body).range).toBe("'Aba Nova'!A1");
  });

  it('reusa o token dentro da validade (1 chamada ao oauth em 2 overwrites)', async () => {
    const fetchImpl = makeFetchMock();
    const client = makeSheetsClient({ email: 'sa@x.iam.gserviceaccount.com', privateKeyPem: privateKey, fetchImpl });
    await client.overwriteTab({ spreadsheetId: 'S', tab: 'ESPELHO', values: [['a']] });
    await client.overwriteTab({ spreadsheetId: 'S', tab: 'ESPELHO', values: [['b']] });
    const oauthCalls = fetchImpl.mock.calls.filter(([u]) => String(u).includes('oauth2.googleapis.com'));
    expect(oauthCalls).toHaveLength(1);
  });

  it('propaga erro da API com status e corpo', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('oauth2')) return { ok: true, json: async () => ({ access_token: 't', expires_in: 3600 }) };
      return { ok: false, status: 403, text: async () => 'PERMISSION_DENIED' };
    });
    const client = makeSheetsClient({ email: 'sa@x.iam.gserviceaccount.com', privateKeyPem: privateKey, fetchImpl });
    await expect(client.overwriteTab({ spreadsheetId: 'S', tab: 'ESPELHO', values: [[1]] })).rejects.toThrow(/403.*PERMISSION_DENIED/s);
  });
});
