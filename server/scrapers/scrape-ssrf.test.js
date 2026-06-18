/**
 * Teste de regressão (A4 — SSRF no scraper POST /api/v1/scrape-imovel).
 *
 * A URL vem do cliente e é buscada server-side (fetch + Puppeteer). A validação de
 * destino vive em ../security/ssrfGuard.js (com testes próprios exaustivos). Aqui
 * garantimos, a nível de código-fonte, que o handler chama o guard ANTES de qualquer
 * scrape/cache, sem ter adicionado auth (a rota é usada anonimamente pelo frontend).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'index.js'), 'utf8');

describe('A4 — scrape-imovel valida SSRF no ponto de entrada', () => {
  it('importa o guard SSRF compartilhado', () => {
    expect(source.includes("from '../security/ssrfGuard.js'")).toBe(true);
  });

  const handlerStart = source.indexOf("app.post('/api/v1/scrape-imovel'");
  const handler = source.slice(handlerStart, handlerStart + 1200);

  it('chama assertSafeHttpUrl e rejeita (400) antes do cache/scrape', () => {
    const guardIdx = handler.indexOf('await assertSafeHttpUrl(url)');
    const cacheIdx = handler.indexOf('getFromCache(url)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(cacheIdx).toBeGreaterThan(-1);
    // o guard deve vir ANTES da checagem de cache
    expect(guardIdx).toBeLessThan(cacheIdx);
    expect(/if \(!safe\.ok\)[\s\S]*status\(400\)/.test(handler)).toBe(true);
  });

  it('não adicionou validateApiKey à rota (frontend a chama anonimamente)', () => {
    expect(source.includes("app.post('/api/v1/scrape-imovel', validateApiKey")).toBe(false);
  });
});
