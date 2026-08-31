/**
 * O erro mais caro deste repo: registrar rota só no api-server (dev) e não no
 * proxy-production (prod) — 404 em produção, tudo verde em dev.
 * Mesmo padrão de leadClassificationRoute.test.js / metaLeadgen/entrypoints.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(__dirname, '..', f), 'utf8');

describe.each(['proxy-production.js', 'api-server.js'])('%s', (file) => {
  const src = read(file);

  it('importa e registra as rotas do GA', () => {
    expect(src).toMatch(/from '\.\/googleAnalytics\/index\.js'/);
    expect(src).toMatch(/registerGaRoutes\(\s*app,\s*supabase\s*\)/);
  });
});
