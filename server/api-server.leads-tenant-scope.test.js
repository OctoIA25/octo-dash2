/**
 * Teste de regressão de SEGURANÇA (C1 — IDOR cross-tenant em leads).
 *
 * O api-server.js usa a service_role key do Supabase, que BYPASSA o RLS. Portanto,
 * o ÚNICO mecanismo de isolamento de tenant nesses endpoints é o filtro explícito
 * `.eq('tenant_id', req.tenantId)` na query. Se algum desses endpoints perder esse
 * filtro, volta a existir leitura/escrita cross-tenant de PII.
 *
 * O api-server.js não é importável em teste de unidade (conecta ao Supabase e chama
 * app.listen/process.exit no import), então este teste valida o invariante a nível de
 * código-fonte: cada handler de lead-por-id deve escopar por tenant.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'api-server.js'), 'utf8');

/**
 * Extrai o corpo do handler de uma rota: do registro `app.<method>('<route>'`
 * até o próximo registro de rota `app.<get|post|put|patch|delete>(`.
 */
function extractHandler(method, route) {
  const marker = `app.${method}('${route}'`;
  const start = source.indexOf(marker);
  expect(start, `rota não encontrada: ${method.toUpperCase()} ${route}`).toBeGreaterThan(-1);
  const rest = source.slice(start + marker.length);
  const next = rest.search(/app\.(get|post|put|patch|delete)\(/);
  return next === -1 ? rest : rest.slice(0, next);
}

// Endpoints que recebem o lead por id/external_id/telefone e DEVEM filtrar por tenant.
const SCOPED_ENDPOINTS = [
  ['get', '/api/v1/leads/:id'],
  ['get', '/api/v1/leads/phone/:phone'],
  ['put', '/api/v1/leads/:id'],
  ['patch', '/api/v1/leads/:id'],
  ['patch', '/api/v1/leads/:id/temperature'],
  ['patch', '/api/v1/leads/:id/agent'],
  ['post', '/api/v1/leads/upsert'],
];

describe('C1 — isolamento de tenant nos endpoints de lead (api-server)', () => {
  it.each(SCOPED_ENDPOINTS)(
    '%s %s escopa toda query de leads por tenant_id',
    (method, route) => {
      const body = extractHandler(method, route);

      // Toda referência à tabela de leads dentro do handler deve ser seguida, em
      // algum ponto da cadeia, por `.eq('tenant_id', req.tenantId)`.
      const accessesLeadsTable = /from\(LEADS_TABLE\)/.test(body);
      expect(accessesLeadsTable, `${method} ${route} não acessa LEADS_TABLE?`).toBe(true);

      expect(
        body.includes(".eq('tenant_id', req.tenantId)"),
        `${method} ${route} NÃO escopa por tenant — risco de IDOR cross-tenant`
      ).toBe(true);
    }
  );

  it('upsert atribui tenant_id ao lead recém-criado (evita linhas órfãs/duplicatas)', () => {
    const body = extractHandler('post', '/api/v1/leads/upsert');
    expect(body.includes('mapped.tenant_id = req.tenantId')).toBe(true);
  });
});
