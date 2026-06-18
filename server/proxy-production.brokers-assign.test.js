/**
 * Teste de regressão (A1 — injeção/erro em POST /api/v1/brokers/:id/assign).
 *
 * O código antigo usava `supabase.raw(\`raw_data || '{"attendedBy": [...]}'::jsonb\`)`
 * com interpolação de string. Dois defeitos: (1) `supabase.raw` NÃO existe no
 * supabase-js v2 → o endpoint sempre lançava TypeError (500); (2) interpolar
 * id/broker_name num literal SQL é vetor de injeção.
 *
 * Correção: o merge passou a ser feito por uma RPC Postgres parametrizada
 * (assign_broker_to_leads) — 1 statement, atômico, sem injeção, escopado por tenant.
 *
 * O proxy-production.js é um script monolítico (cria client Supabase e chama
 * app.listen no import), logo não é importável em teste de unidade. Este teste
 * valida o invariante a nível de código-fonte: o handler não pode mais conter SQL
 * cru e deve chamar a RPC; e a migração deve definir a função protegida.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'proxy-production.js'), 'utf8');

/** Extrai o corpo de um handler: do registro da rota até o próximo registro. */
function extractHandler(method, route) {
  const marker = `app.${method}('${route}'`;
  const start = source.indexOf(marker);
  expect(start, `rota não encontrada: ${method.toUpperCase()} ${route}`).toBeGreaterThan(-1);
  const rest = source.slice(start + marker.length);
  const next = rest.search(/app\.(get|post|put|patch|delete)\(/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('A1 — /brokers/:id/assign via RPC parametrizada (sem SQL cru)', () => {
  it('proxy-production.js não contém mais supabase.raw (inexistente no supabase-js v2)', () => {
    expect(source.includes('supabase.raw(')).toBe(false);
  });

  const assign = extractHandler('post', '/api/v1/brokers/:id/assign');

  it('o handler chama a RPC assign_broker_to_leads escopada por tenant, sem ::jsonb interpolado', () => {
    expect(assign.includes("supabase.rpc('assign_broker_to_leads'")).toBe(true);
    expect(assign.includes('p_tenant_id: req.tenantId')).toBe(true);
    expect(assign.includes('p_lead_ids: lead_ids')).toBe(true);
    expect(assign.includes('p_broker_id: String(id)')).toBe(true);
    expect(assign.includes('::jsonb')).toBe(false);
  });

  it('preserva o contrato de resposta (leads_updated em data)', () => {
    expect(assign.includes('leads_updated: leadsUpdated')).toBe(true);
  });
});

describe('A1 — migração da RPC assign_broker_to_leads', () => {
  const migration = readFileSync(
    join(__dirname, '../supabase/migrations/20260616_create_assign_broker_to_leads_rpc.sql'),
    'utf8',
  );

  it('define a função e a protege (search_path, revoke public, grant service_role)', () => {
    expect(migration.includes('function public.assign_broker_to_leads')).toBe(true);
    expect(migration.toLowerCase().includes('set search_path')).toBe(true);
    expect(migration.toLowerCase().includes('revoke execute on function public.assign_broker_to_leads')).toBe(true);
    expect(/grant\s+execute\s+on\s+function\s+public\.assign_broker_to_leads[\s\S]*service_role/i.test(migration)).toBe(true);
  });

  it('faz merge na raiz preservando demais chaves (coalesce + || + jsonb_build_object)', () => {
    expect(migration.includes("coalesce(raw_data, '{}'::jsonb)")).toBe(true);
    expect(migration.includes('jsonb_build_object')).toBe(true);
    expect(migration.includes("'attendedBy'")).toBe(true);
    expect(migration.includes('id = any(p_lead_ids)')).toBe(true);
    expect(migration.includes('tenant_id = p_tenant_id')).toBe(true);
  });
});
