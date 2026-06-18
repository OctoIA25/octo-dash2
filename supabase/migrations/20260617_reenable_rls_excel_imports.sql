-- Reativa RLS em public.excel_imports (receita mensal por corretor — dado financeiro
-- sensível) com isolamento por tenant.
--
-- Contexto: 20260505_disable_rls_excel_imports.sql DESLIGOU o RLS porque as policies
-- antigas usavam `app.current_tenant_id` (GUC de sessão que o client JS nunca seta),
-- e o "isolamento" passou a ser feito só no cliente — o que NÃO é barreira de
-- segurança: com a anon key, qualquer um lê/escreve dados de qualquer tenant via
-- PostgREST. Esta migração restaura o isolamento no banco.
--
-- Compatibilidade verificada (não requer mudança no frontend):
--   - src/features/excel/services/excelImportService.ts usa o client autenticado
--     (@/lib/supabaseClient, com sessão JWT) e jåá filtra por .eq('tenant_id', ...),
--     então auth.uid() + tenant_memberships funcionam para membros do tenant.
--   - O tipo de excel_imports.tenant_id varia por ambiente (a migração do repo declara
--     TEXT, mas a tabela pode ter sido criada como UUID fora do repo). Para ser robusto
--     em ambos os casos, a comparação faz cast dos DOIS lados para ::text
--     (tm.tenant_id::text = excel_imports.tenant_id::text).
--   - Owner da plataforma mantém acesso cross-tenant (impersonation) via check inline
--     do email no JWT (não depende da função public.is_platform_owner(), que pode não
--     existir em todos os ambientes).

-- 1) Remover QUALQUER policy remanescente (nomes desconhecidos, criados fora do repo,
--    que usavam app.current_tenant_id). Se sobrassem, ao religar o RLS elas
--    reativariam e bloqueariam todo acesso (o GUC nunca é setado).
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'excel_imports'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.excel_imports', pol.policyname);
  END LOOP;
END $$;

-- 2) Religar RLS.
ALTER TABLE public.excel_imports ENABLE ROW LEVEL SECURITY;

-- 3) Policy única (FOR ALL): membros do tenant com role admin/team_leader/owner
--    (dado financeiro — corretor NÃO acessa) OU owner da plataforma. Restrita a
--    `authenticated` (a anon key sem sessão não recebe policy alguma → negado).
DROP POLICY IF EXISTS "excel_imports_tenant_isolation" ON public.excel_imports;
CREATE POLICY "excel_imports_tenant_isolation"
  ON public.excel_imports
  FOR ALL
  TO authenticated
  USING (
    -- owner da plataforma (inline; não depende de public.is_platform_owner()):
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id::text = excel_imports.tenant_id::text
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'team_leader', 'owner')
    )
  )
  WITH CHECK (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id::text = excel_imports.tenant_id::text
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'team_leader', 'owner')
    )
  );

COMMENT ON POLICY "excel_imports_tenant_isolation" ON public.excel_imports IS
  'Isolamento por tenant: membros (via tenant_memberships, cast tenant_id::text) ou owner da plataforma. Restaura o RLS desligado em 20260505.';
