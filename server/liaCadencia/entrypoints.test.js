/**
 * O erro mais caro deste repo: registrar rota só no api-server (dev) e não no
 * proxy-production (prod) — 404 em produção, tudo verde em dev.
 * Mesmo padrão de recrutamento/entrypoints.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(__dirname, '..', f), 'utf8');

describe.each(['proxy-production.js', 'api-server.js'])('%s', (file) => {
  const src = read(file);

  it('importa e registra as rotas de cadência da LIA', () => {
    expect(src).toMatch(/from '\.\/liaCadencia\/index\.js'/);
    expect(src).toMatch(/registerLiaCadenciaRoutes\(\s*app,\s*supabase\s*\)/);
  });

  it('registra ANTES do catch-all 404, senão a rota nunca é alcançada', () => {
    const registro = src.indexOf('registerLiaCadenciaRoutes(app, supabase)');
    const catchAll = src.indexOf("app.use('/api/v1/*'");
    expect(registro).toBeGreaterThan(-1);
    expect(catchAll).toBeGreaterThan(-1);
    expect(registro).toBeLessThan(catchAll);
  });
});
