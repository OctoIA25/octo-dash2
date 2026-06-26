import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');

/**
 * PARIDADE DE ENTRYPOINTS: o módulo Comunicação (Disparador/Campanhas/Templates)
 * precisa ser registrado em TODOS os entrypoints de servidor. Já houve uma
 * regressão silenciosa em que o módulo existia só em dev (api-server.js) e dava
 * 404 em produção (proxy-production.js). Este teste trava os dois.
 */
const ENTRYPOINTS = ['api-server.js', 'proxy-production.js'];
const REQUIRED = ['registerAgentActionRoutes', 'registerCommunicationRoutes'];

describe('paridade de entrypoints — módulo Comunicação', () => {
  for (const entry of ENTRYPOINTS) {
    const src = readFileSync(join(SERVER_DIR, entry), 'utf8');
    for (const fn of REQUIRED) {
      it(`${entry} registra ${fn}`, () => {
        // importa a função
        expect(src).toMatch(new RegExp(`import\\s*\\{[^}]*\\b${fn}\\b`));
        // E a CHAMA com (app, supabase)
        expect(src).toMatch(new RegExp(`${fn}\\s*\\(\\s*app\\s*,\\s*supabase`));
      });
    }
  }
});
