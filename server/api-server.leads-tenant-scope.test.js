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

/**
 * C2 — o TENANT DE DESTINO do lead nunca pode vir do corpo da requisição.
 *
 * `mapLeadToDB` copiava `lead.tenant_id` do body para a linha gravada. Como o
 * corpo é do cliente, isso deixava a key do tenant A:
 *   - CRIAR lead direto no tenant B (POST /leads, /leads/roleta, /leads/upsert),
 *   - MOVER um lead seu para o tenant B (PUT/PATCH /leads/:id — o WHERE filtra
 *     por req.tenantId, mas o SET levava o tenant_id do body).
 * E o /leads/batch nem sequer estampava tenant: sem tenant_id no corpo, o lead
 * nascia órfão (tenant_id NULL, invisível para toda a aplicação).
 *
 * O tenant vem SEMPRE de req.tenantId (validateApiKey).
 */
describe('C2 — tenant de destino do lead não vem do corpo da requisição', () => {
  it('mapLeadToDB NÃO copia tenant_id do payload', () => {
    const start = source.indexOf('const mapLeadToDB = (lead) => {');
    expect(start, 'mapLeadToDB não encontrado').toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n};', start));

    expect(
      /mapped\.tenant_id\s*=\s*lead\.tenant_id/.test(body),
      'mapLeadToDB copia tenant_id do body — permite criar/mover lead para outro tenant'
    ).toBe(false);
  });

  // Todo handler que INSERE lead deve carimbar o tenant da API Key.
  it.each([
    ['post', '/api/v1/leads'],
    ['post', '/api/v1/leads/batch'],
    ['post', '/api/v1/leads/upsert'],
    ['post', '/api/v1/leads/roleta'],
  ])('%s %s estampa req.tenantId na linha inserida', (method, route) => {
    const body = extractHandler(method, route);
    expect(
      /tenant_id\s*=\s*req\.tenantId/.test(body) || /tenant_id:\s*req\.tenantId/.test(body),
      `${method} ${route} não estampa req.tenantId no insert`
    ).toBe(true);
  });

  // O tenant não pode ser reescrito por um update: nem via body, nem via fallback.
  it.each([
    ['put', '/api/v1/leads/:id'],
    ['patch', '/api/v1/leads/:id'],
  ])('%s %s não reescreve tenant_id do lead', (method, route) => {
    const body = extractHandler(method, route);
    const beforeUpdate = body.slice(0, body.indexOf('.update('));
    expect(
      /tenant_id/.test(beforeUpdate),
      `${method} ${route} monta tenant_id no payload de update — moveria o lead de tenant`
    ).toBe(false);
  });
});
