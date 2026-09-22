/**
 * Produção roda proxy-production.js; dev roda api-server.js. Registrar a rota
 * só em um dos dois dá 404 silencioso em produção — este teste é o guarda.
 *
 * Aqui o sintoma é traiçoeiro: a LIA lê o documento, manda o resultado, leva
 * 404 e — se não tratar — desiste calada. A pessoa abre a pasta e vê os campos
 * em branco, concluindo que a leitura automática "não funciona", quando o que
 * houve foi a rota não existir naquele processo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const ENTRYPOINTS = ['api-server.js', 'proxy-production.js'];

describe('paridade de entrypoints — leitura de documentos', () => {
  for (const entry of ENTRYPOINTS) {
    const src = readFileSync(join(SERVER_DIR, entry), 'utf8');

    it(`${entry} importa e chama registerDocumentosRoutes`, () => {
      expect(src).toMatch(/import\s*\{[^}]*\bregisterDocumentosRoutes\b/);
      expect(src).toMatch(/registerDocumentosRoutes\s*\(\s*app\s*,\s*supabase\s*,\s*validateApiKey/);
    });

    it(`${entry} registra a rota antes do catch-all de 404`, () => {
      const registro = src.indexOf('registerDocumentosRoutes(app');
      // O catch-all é o `app.use` sem caminho no fim do arquivo; se houver um
      // depois do registro, tudo bem — o que não pode é o registro vir depois.
      const catchAll = src.search(/app\.use\(\s*\(req,\s*res\)/);
      expect(registro).toBeGreaterThan(-1);
      if (catchAll > -1) expect(registro).toBeLessThan(catchAll);
    });
  }
});
