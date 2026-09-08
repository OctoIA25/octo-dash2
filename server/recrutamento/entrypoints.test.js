/**
 * O erro mais caro deste repo: registrar rota só no api-server (dev) e não no
 * proxy-production (prod) — 404 em produção, tudo verde em dev.
 * Mesmo padrão de googleAnalytics/entrypoints.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(__dirname, '..', f), 'utf8');

describe.each(['proxy-production.js', 'api-server.js'])('%s', (file) => {
  const src = read(file);

  it('importa e registra as rotas de recrutamento', () => {
    expect(src).toMatch(/from '\.\/recrutamento\/index\.js'/);
    expect(src).toMatch(/registerRecrutamentoRoutes\(\s*app,\s*supabase\s*\)/);
  });
});

// O scheduler é o oposto das rotas: tem que rodar em UM processo só, sempre
// atrás da flag. Em produção o entrypoint é o proxy — no api-server ele nem
// deve aparecer, senão dois processos encerram o mesmo candidato.
describe('scheduler dos jobs', () => {
  it('vive só no proxy-production e atrás de RECRUTAMENTO_SCHEDULER=1', () => {
    const proxy = read('proxy-production.js');
    expect(proxy).toMatch(/RECRUTAMENTO_SCHEDULER === '1'/);
    expect(proxy).toMatch(/startRecrutamentoScheduler\(supabase\)/);
    expect(proxy).toMatch(/from '\.\/recrutamento\/jobs\.js'/);
    expect(read('api-server.js')).not.toMatch(/startRecrutamentoScheduler/);
  });
});
