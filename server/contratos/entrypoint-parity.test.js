/**
 * Produção roda proxy-production.js; dev roda api-server.js. Registrar a rota
 * só em um dos dois dá 404 silencioso em produção — este teste é o guarda.
 *
 * Aqui dói mais que no resto: sem a rota, o corretor abre a tela de contrato,
 * clica em aceitar e nada acontece. Ele fica bloqueado fora da Dash, sem
 * caminho de saída e sem erro que explique.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const ENTRYPOINTS = ['api-server.js', 'proxy-production.js'];

describe('paridade de entrypoints — aceite de contrato', () => {
  for (const entry of ENTRYPOINTS) {
    const src = readFileSync(join(SERVER_DIR, entry), 'utf8');
    it(`${entry} importa e chama registerContratosRoutes(app, supabase)`, () => {
      expect(src).toMatch(/import\s*\{[^}]*\bregisterContratosRoutes\b/);
      expect(src).toMatch(/registerContratosRoutes\s*\(\s*app\s*,\s*supabase/);
    });
  }
});
