-- Verificação do lote 1 (20260624_owner_policies_lote1_alta.sql).
-- Rodar no SQL Editor do Supabase APÓS aplicar a migration. Só lê estado.

-- 1) Nenhuma policy do grupo Alta deve mais conter o email inline.
--    Esperado: 0 linhas.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'commercial_sales','commercial_sales_import_batches','excel_imports',
    'generic_imports','team_metrics','recruitment_candidates','recruitment_stages',
    'agent_conversations','agent_messages','dashboard_kpis','kpi_targets',
    'kpi_values','kpi_import_batches','dashboard_kpi_history','goals','goal_history'
  )
  AND (qual ILIKE '%octo.inteligenciaimobiliaria%'
       OR with_check ILIKE '%octo.inteligenciaimobiliaria%');

-- 2) As policies do grupo agora referenciam is_platform_owner().
--    Esperado: várias linhas, todas mencionando is_platform_owner.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'commercial_sales','excel_imports','generic_imports','team_metrics',
    'recruitment_candidates','agent_conversations','dashboard_kpis','goals'
  )
  AND (qual ILIKE '%is_platform_owner%' OR with_check ILIKE '%is_platform_owner%')
ORDER BY tablename, policyname;

-- 3) As funções de proposals/recruitment não devem mais ter o email inline.
--    Esperado: 0 linhas.
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'proposals_can_access_tenant','proposals_is_tenant_manager',
    'search_candidates','get_recruitment_metrics'
  )
  AND pg_get_functiondef(p.oid) ILIKE '%octo.inteligenciaimobiliaria%';

-- 4) E devem referenciar is_platform_owner(). Esperado: as 4 funções.
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'proposals_can_access_tenant','proposals_is_tenant_manager',
    'search_candidates','get_recruitment_metrics'
  )
  AND pg_get_functiondef(p.oid) ILIKE '%is_platform_owner%'
ORDER BY p.proname;

-- 5) Sanidade: search_candidates ainda retorna TABLE(...) com a coluna rank
--    (confirma que o corpo foi preservado, não trocado).
SELECT pg_get_function_result(p.oid) AS retorno
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'search_candidates';
-- Esperado: TABLE(id uuid, nome text, ..., rank real)
