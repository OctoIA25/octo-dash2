/**
 * O erro mais caro deste repo: registrar rota só no api-server (dev) e não no
 * proxy-production (prod) — 404 em produção, tudo verde em dev.
 * Mesmo padrão de liaCadencia/entrypoints.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(__dirname, '..', f), 'utf8');

describe.each(['proxy-production.js', 'api-server.js'])('%s', (file) => {
  const src = read(file);

  it('importa e registra as rotas de histórico do lead', () => {
    expect(src).toMatch(/from '\.\/leadEvents\/index\.js'/);
    expect(src).toMatch(/registerLeadEventsRoutes\(\s*app,\s*supabase\s*\)/);
  });

  it('registra ANTES do catch-all 404, senão a rota nunca é alcançada', () => {
    const registro = src.indexOf('registerLeadEventsRoutes(app, supabase)');
    const catchAll = src.indexOf("app.use('/api/v1/*'");
    expect(registro).toBeGreaterThan(-1);
    expect(catchAll).toBeGreaterThan(-1);
    expect(registro).toBeLessThan(catchAll);
  });
});
