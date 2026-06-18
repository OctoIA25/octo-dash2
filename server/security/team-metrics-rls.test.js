/**
 * Teste de regressão (C5 — team_metrics com USING(true)).
 *
 * Migração não-executável aqui (precisa do Postgres). Valida os invariantes críticos:
 *  - elimina o SELECT USING(true) (vazamento cross-tenant) e o GUC app.current_tenant_id;
 *  - isola por tenant_memberships (com cast nos dois lados) + owner inline;
 *  - restrito a `authenticated`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, '../../supabase/migrations/20260617_fix_team_metrics_rls_isolation.sql'),
  'utf8',
);

// Corpo das policies sem comentários SQL (evita colisão com menções em comentário).
const policySql = sql.slice(sql.indexOf('CREATE POLICY')).replace(/--[^\n]*/g, '');

describe('C5 — team_metrics: RLS com isolamento por tenant', () => {
  it('dropa todas as policies remanescentes antes de recriar', () => {
    expect(/FROM pg_policies[\s\S]*tablename = 'team_metrics'/.test(sql)).toBe(true);
    expect(sql.includes('DROP POLICY IF EXISTS %I ON public.team_metrics')).toBe(true);
  });

  it('NÃO usa mais USING(true) nem o GUC app.current_tenant_id (no corpo das policies)', () => {
    expect(policySql.toLowerCase().includes('using (true)')).toBe(false);
    expect(policySql.includes('current_setting')).toBe(false);
  });

  it('isola por membership (cast ::text dos dois lados) + owner inline', () => {
    expect(policySql.includes('tm.tenant_id::text = team_metrics.tenant_id::text')).toBe(true);
    expect(policySql.includes('auth.uid()')).toBe(true);
    expect(policySql.includes("auth.jwt() ->> 'email'")).toBe(true);
  });

  it('habilita RLS e restringe a authenticated', () => {
    expect(sql.includes('ENABLE ROW LEVEL SECURITY')).toBe(true);
    expect(policySql.includes('TO authenticated')).toBe(true);
  });
});
