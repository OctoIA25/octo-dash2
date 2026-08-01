/**
 * Produção roda proxy-production.js; dev roda api-server.js. Registrar a rota
 * só em um dos dois dá 404 silencioso em produção — este teste é o guarda.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const ENTRYPOINTS = ['api-server.js', 'proxy-production.js'];

describe('paridade de entrypoints — visualizar como', () => {
  for (const entry of ENTRYPOINTS) {
    const src = readFileSync(join(SERVER_DIR, entry), 'utf8');
    it(`${entry} importa e chama registerViewAsRoutes(app, supabase)`, () => {
      expect(src).toMatch(/import\s*\{[^}]*\bregisterViewAsRoutes\b/);
      expect(src).toMatch(/registerViewAsRoutes\s*\(\s*app\s*,\s*supabase/);
    });
  }
});
