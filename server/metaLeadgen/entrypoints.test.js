/**
 * Regressão do erro mais caro deste repo: registrar rota só no api-server
 * (dev) e não no proxy-production (prod) — 404 em produção, tudo verde em dev.
 * Também trava o callback `verify` do express.json: sem rawBody, TODO webhook
 * da Meta cai em 401 e nenhum teste unitário perceberia.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(path.join(__dirname, '..', f), 'utf8');

const ENTRYPOINTS = ['proxy-production.js', 'api-server.js'];

describe.each(ENTRYPOINTS)('%s', (file) => {
  const src = read(file);

  it('importa o módulo do Meta Lead Ads', () => {
    expect(src).toMatch(/from '\.\/metaLeadgen\/index\.js'/);
  });

  it('registra as rotas', () => {
    expect(src).toMatch(/registerMetaLeadgenRoutes\(app, supabase/);
  });

  it('captura o rawBody no express.json — sem isso todo webhook dá 401', () => {
    expect(src).toMatch(/express\.json\(\{[^)]*verify:/s);
    expect(src).toMatch(/req\.rawBody\s*=\s*buf/);
  });
});

// O inverso da regressão acima, e mais caro: o api-server tem
// LEADS_TABLE = 'kenlo_leads', então o POST /api/v1/leads dele grava numa
// tabela DIFERENTE da de produção. Com o scheduler rodando ali, a checagem de
// duplicidade (que consulta `leads`) nunca acha o lead recém-criado e duplica
// o lead a cada retry. O processor roda SÓ no proxy-production.
describe('api-server.js', () => {
  it('NÃO inicia o scheduler do Meta Lead Ads', () => {
    expect(read('api-server.js')).not.toMatch(/startMetaLeadgenScheduler/);
  });
});

describe('proxy-production.js', () => {
  it('inicia o scheduler do Meta Lead Ads', () => {
    expect(read('proxy-production.js')).toMatch(/startMetaLeadgenScheduler\(supabase/);
  });
});
