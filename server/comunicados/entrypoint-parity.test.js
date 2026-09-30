/**
 * Produção roda proxy-production.js; dev roda api-server.js. Registrar a rota
 * só em um dos dois dá 404 em produção — e a LIA, sem tratar, desiste calada.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const ENTRYPOINTS = ['api-server.js', 'proxy-production.js'];

describe('paridade de entrypoints — comunicados', () => {
  for (const entry of ENTRYPOINTS) {
    const src = readFileSync(join(SERVER_DIR, entry), 'utf8');

    it(`${entry} importa e chama registerComunicadosRoutes`, () => {
      expect(src).toMatch(/import\s*\{[^}]*\bregisterComunicadosRoutes\b/);
      expect(src).toMatch(/registerComunicadosRoutes\s*\(\s*app\s*,\s*supabase\s*,\s*validateApiKey/);
    });

    it(`${entry} registra a rota antes do catch-all de /api/v1`, () => {
      const registro = src.indexOf('registerComunicadosRoutes(app');
      const catchAll = src.indexOf("app.use('/api/v1/*'");
      expect(registro).toBeGreaterThan(-1);
      expect(catchAll).toBeGreaterThan(-1);
      expect(registro).toBeLessThan(catchAll);
    });
  }
});
