/**
 * Teste de regressão (A5 — SSRF + timeout no dispatch de webhooks de saída).
 *
 * proxy-production.js é monolítico (cria client Supabase e chama app.listen no
 * import), logo não é importável em teste de unidade. A lógica de validação de URL
 * vive em ./security/ssrfGuard.js (com testes próprios). Aqui validamos, a nível de
 * código-fonte, que o dispatch e a criação realmente USAM o guard e o timeout.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'proxy-production.js'), 'utf8');

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  expect(start, `marcador não encontrado: ${startMarker}`).toBeGreaterThan(-1);
  const rest = source.slice(start);
  const end = rest.indexOf(endMarker);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('A5 — dispatchWebhookEvent', () => {
  const dispatch = sliceBetween('async function dispatchWebhookEvent', 'const WEBHOOK_POLL_BASE_MS');

  it('valida a URL (SSRF) antes do fetch e aborta se reprovada', () => {
    expect(dispatch.includes('await assertSafeHttpUrl(webhook.url)')).toBe(true);
    expect(/if \(!safe\.ok\)[\s\S]*return;/.test(dispatch)).toBe(true);
  });

  it('o fetch usa timeout e não segue redirects', () => {
    expect(dispatch.includes('AbortSignal.timeout(WEBHOOK_FETCH_TIMEOUT_MS)')).toBe(true);
    expect(dispatch.includes("redirect: 'manual'")).toBe(true);
  });
});

describe('A5 — criação de webhook (POST /api/v1/webhooks)', () => {
  const create = sliceBetween("app.post('/api/v1/webhooks'", '.from(\'webhook_subscriptions\')\n      .insert');

  it('aplica parseHttpUrl no cadastro (defesa em profundidade)', () => {
    expect(create.includes('parseHttpUrl(url)')).toBe(true);
  });
});

describe('A5 — wiring de imports/constantes', () => {
  it('importa o guard e define o timeout', () => {
    expect(source.includes("from './security/ssrfGuard.js'")).toBe(true);
    expect(source.includes('const WEBHOOK_FETCH_TIMEOUT_MS')).toBe(true);
  });
});
