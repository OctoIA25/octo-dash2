/**
 * Teste de regressão (C4 — reativar RLS em excel_imports).
 *
 * Migração não-executável aqui (precisa do Postgres). Validamos os invariantes
 * críticos a nível de SQL para evitar os modos de falha conhecidos:
 *  - religar RLS sem dropar policies antigas (que usavam app.current_tenant_id) →
 *    bloquearia todo acesso;
 *  - comparar TEXT (excel_imports.tenant_id) com UUID (tenant_memberships.tenant_id)
 *    sem cast → erro de tipo;
 *  - esquecer o acesso do owner (impersonation) ou não restringir a `authenticated`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, '../../supabase/migrations/20260617_reenable_rls_excel_imports.sql'),
  'utf8',
);

describe('C4 — migração reativa RLS de excel_imports com segurança', () => {
  it('dropa todas as policies remanescentes antes de religar (evita bloqueio total)', () => {
    expect(/FROM pg_policies[\s\S]*tablename = 'excel_imports'/.test(sql)).toBe(true);
    expect(sql.includes('DROP POLICY IF EXISTS %I ON public.excel_imports')).toBe(true);
  });

  it('habilita RLS', () => {
    expect(sql.includes('ENABLE ROW LEVEL SECURITY')).toBe(true);
  });

  it('compara tenant_id com cast nos DOIS lados (robusto a TEXT ou UUID)', () => {
    expect(sql.includes('tm.tenant_id::text = excel_imports.tenant_id::text')).toBe(true);
  });

  // Corpo da policy SEM comentários SQL — evita colisão com menções em comentário.
  const policyBody = sql.slice(sql.indexOf('CREATE POLICY')).replace(/--[^\n]*/g, '');

  it('isola por membership e preserva o owner via check inline do email', () => {
    expect(policyBody.includes('tenant_memberships')).toBe(true);
    expect(policyBody.includes('auth.uid()')).toBe(true);
    expect(policyBody.includes("auth.jwt() ->> 'email'")).toBe(true);
    // a policy NÃO pode depender da função (pode não existir no ambiente)
    expect(policyBody.includes('is_platform_owner()')).toBe(false);
  });

  it('restringe acesso a admin/team_leader/owner (corretor não acessa dado financeiro)', () => {
    expect(policyBody.includes("tm.role IN ('admin', 'team_leader', 'owner')")).toBe(true);
    expect(policyBody.includes("'corretor'")).toBe(false);
  });

  it('restringe a authenticated e cobre leitura e escrita (USING + WITH CHECK)', () => {
    expect(sql.includes('TO authenticated')).toBe(true);
    expect(sql.includes('USING (')).toBe(true);
    expect(sql.includes('WITH CHECK (')).toBe(true);
  });
});
