-- Verificação do lote 2 (20260624_owner_policies_lote2_media.sql).
-- Rodar no SQL Editor APÓS aplicar a migration. Só lê estado.

-- 1) Nenhuma policy do grupo Média deve mais conter o email inline.
--    Esperado: 0 linhas.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'tenants','imoveis_locais','imoveis_corretores','imoveis_geolocalizacao','lancamentos',
    'tenant_lead_limit_config','tenant_lead_source_costs','tenant_lead_source_channels',
    'tenant_source_images','tenant_bolsao_config','lead_recommendations',
    'lead_recommendation_preferences','tenant_recommendation_config','recommendation_schedules',
    'agent_action_queue','agent_action_runs'
  )
  AND (qual ILIKE '%octo.inteligenciaimobiliaria%'
       OR with_check ILIKE '%octo.inteligenciaimobiliaria%')
ORDER BY tablename, policyname;

-- 2) As policies do grupo agora referenciam is_platform_owner().
--    Esperado: ~36 linhas, uma por policy migrada.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'tenants','imoveis_locais','imoveis_corretores','imoveis_geolocalizacao','lancamentos',
    'tenant_lead_limit_config','tenant_lead_source_costs','tenant_lead_source_channels',
    'tenant_source_images','tenant_bolsao_config','lead_recommendations',
    'lead_recommendation_preferences','tenant_recommendation_config','recommendation_schedules',
    'agent_action_queue','agent_action_runs'
  )
  AND (qual ILIKE '%is_platform_owner%' OR with_check ILIKE '%is_platform_owner%')
ORDER BY tablename, policyname;

-- 3) Contagem por tabela — sanidade de que nenhuma tabela ficou sem policies
--    (ex.: um DROP que não recriou por erro de nome). Compare com o esperado.
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'tenants','imoveis_locais','imoveis_corretores','imoveis_geolocalizacao','lancamentos',
    'tenant_lead_limit_config','tenant_lead_source_costs','tenant_lead_source_channels',
    'tenant_source_images','tenant_bolsao_config','lead_recommendations',
    'lead_recommendation_preferences','tenant_recommendation_config','recommendation_schedules',
    'agent_action_queue','agent_action_runs'
  )
GROUP BY tablename
ORDER BY tablename;
-- Esperado (nº de policies por tabela):
--   tenants 4, imoveis_locais 4, imoveis_corretores 4, imoveis_geolocalizacao 3,
--   lancamentos 4, tenant_lead_limit_config 4, tenant_lead_source_costs 4,
--   tenant_lead_source_channels 4, tenant_source_images 1, tenant_bolsao_config 3,
--   lead_recommendations 2, lead_recommendation_preferences 3,
--   tenant_recommendation_config 3, recommendation_schedules 4,
--   agent_action_queue 1, agent_action_runs 1
-- (Se alguma vier MENOR que o esperado, um DROP não foi recriado — investigar.)
