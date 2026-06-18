/**
 * Regressão (M8 + M16): migração 20260618 troca o GUC app.current_tenant_id por
 * isolamento via tenant_memberships em sales_transactions/corretor_metrics/teams e
 * endurece count_leads_mensal — tudo guardado por existência (to_regclass/to_regprocedure),
 * pois o banco real pode não conter todas as tabelas. Validação a nível de SQL.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(
  join(__dirname, '../../supabase/migrations/20260618_fix_guc_rls_and_count_leads.sql'),
  'utf8',
);
const noComments = sql.replace(/--[^\n]*/g, '');

describe('M8 — GUC -> membership (guardado por existência)', () => {
  it('remove o GUC app.current_tenant_id (não aparece no SQL executável)', () => {
    expect(noComments.includes('current_setting')).toBe(false);
  });

  it('cobre as 3 tabelas e guarda por to_regclass', () => {
    expect(sql.includes("ARRAY['sales_transactions', 'corretor_metrics', 'teams']")).toBe(true);
    expect(sql.includes("to_regclass('public.' || t)")).toBe(true);
  });

  it('isola por membership (tm.tenant_id = %I.tenant_id) + owner inline, só authenticated', () => {
    expect(sql.includes('tm.tenant_id = %I.tenant_id')).toBe(true);
    expect(sql.includes("auth.jwt() ->> 'email'")).toBe(true);
    expect(sql.includes('is_platform_owner()')).toBe(false);
    expect(sql.includes('FOR ALL TO authenticated')).toBe(true);
  });

  it('habilita RLS e dropa policies antigas dinamicamente', () => {
    expect(sql.includes('ENABLE ROW LEVEL SECURITY')).toBe(true);
    expect(sql.includes('DROP POLICY IF EXISTS %I ON public.%I')).toBe(true);
  });
});

describe('M16 — count_leads_mensal endurecida (se existir)', () => {
  it('guarda por to_regprocedure, fixa search_path e revoga anon', () => {
    expect(sql.includes("to_regprocedure('public.count_leads_mensal(uuid)')")).toBe(true);
    expect(sql.includes('SET search_path = public')).toBe(true);
    expect(sql.includes('REVOKE EXECUTE ON FUNCTION public.count_leads_mensal(uuid) FROM anon')).toBe(true);
  });
});
