/**
 * Regressão estrutural da migração de exclusividade Kenlo XOR Contact2Sale.
 * O trigger roda no Postgres (fora do vitest); estes asserts travam os
 * invariantes — em especial o cast ::text na comparação de tenant_id, cujo
 * esquecimento causou em produção "operator does not exist: uuid = text"
 * (kenlo_integrations.tenant_id é uuid, tenant_contact2sale_config.tenant_id é
 * text), derrubando o UPSERT que ativava a Contact2Sale.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  path.join(__dirname, '../../supabase/migrations/20260706_provider_exclusivity.sql'),
  'utf8',
);

describe('migração provider_exclusivity', () => {
  it('função SECURITY DEFINER com search_path fixo e owner explícito', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.deactivate_other_crm_provider()');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public');
    expect(sql).toMatch(/ALTER FUNCTION public\.deactivate_other_crm_provider\(\) OWNER TO postgres/);
  });

  it('compara tenant_id com ::text nos DOIS lados (evita uuid = text)', () => {
    // O bug: kenlo_integrations.tenant_id (uuid) vs tenant_contact2sale_config
    // .tenant_id (text). Sem cast o trigger explode e derruba o UPSERT.
    const comparisons = sql.match(/WHERE tenant_id\S* = NEW\.tenant_id\S*/g) || [];
    expect(comparisons.length).toBe(2); // um por branch (kenlo→c2s e c2s→kenlo)
    for (const c of comparisons) {
      expect(c).toMatch(/tenant_id::text = NEW\.tenant_id::text/);
    }
    // Nenhuma comparação crua sobrou (sem ::text de um lado só).
    expect(sql).not.toMatch(/WHERE tenant_id = NEW\.tenant_id\b/);
  });

  it('só desativa o OUTRO provider quando um vira active (WHEN + WHERE status active, sem loop)', () => {
    // O UPDATE em cascata seta inactive, que não satisfaz o WHEN active → sem
    // recursão. Trigger Kenlo é literal; trigger C2S vive dentro de um EXECUTE
    // string (aspas duplicadas ''active'').
    expect(sql).toMatch(/WHEN \(NEW\.status = 'active'\)/);
    expect(sql).toMatch(/WHEN \(NEW\.status = ''active''\)/);
    expect((sql.match(/AND status = 'active';/g) || []).length).toBe(2); // um WHERE por branch do UPDATE
  });

  it('guarda a ausência da tabela C2S (to_regclass) para não quebrar ativação do Kenlo se aplicada fora de ordem', () => {
    expect(sql).toMatch(/to_regclass\('public\.tenant_contact2sale_config'\) IS NOT NULL/);
  });

  it('instala o trigger nas duas tabelas de config (Kenlo direto, C2S via EXECUTE)', () => {
    expect(sql).toMatch(/CREATE TRIGGER tr_crm_provider_exclusivity[\s\S]*?ON public\.kenlo_integrations/);
    // O lado C2S é criado condicionalmente (só se a tabela existir), dentro de EXECUTE.
    expect(sql).toMatch(/CREATE TRIGGER tr_crm_provider_exclusivity[\s\S]*?ON public\.tenant_contact2sale_config/);
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS tr_crm_provider_exclusivity ON public\.tenant_contact2sale_config/);
  });
});
