-- ⚠️ ORDEM DE DEPLOY: rodar DEPOIS de 20260727_create_enps_tables.sql (prod E dev).
-- Depende das tabelas survey_responses / survey_dispatches existirem.
--
-- Índices de request-path que faltavam no create original (revisão arquitetural).
-- Nenhum é constraint — são só de performance de leitura. Aditivo, IF NOT EXISTS.
--
-- ⚠️ Se aplicar numa tabela JÁ POVOADA em produção, um CREATE INDEX comum bloqueia
-- escritas na tabela durante a construção. Em tabela grande, prefira rodar
-- manualmente com CREATE INDEX CONCURRENTLY (fora de transação — não pode ir num
-- bloco transacional). Como as tabelas eNPS nascem vazias, o CREATE comum abaixo é
-- seguro na primeira aplicação.
-- ============================================================

-- P2 — Agregação do dashboard lê TODAS as respostas do ciclo:
--   aggregate.js: from('survey_responses').select(...).eq('cycle_id', cycle.id)
-- O único índice de responses é o partial `survey_responses_one_per_optin`
-- (WHERE respondent_user_id IS NOT NULL) — NÃO serve essa query, porque a maioria
-- das respostas é anônima (respondent_user_id NULL) e fica de fora do índice
-- parcial → o planner cai em seq scan sobre a tabela histórica inteira (global,
-- todos os tenants/ciclos). Índice pleno em (cycle_id) cobre tudo.
CREATE INDEX IF NOT EXISTS survey_responses_cycle
  ON public.survey_responses (cycle_id);

-- P3 — Banner de pendência (roda a cada carga de dashboard de corretor):
--   aggregate.js makePendingHandler:
--     from('survey_dispatches').select('cycle_id')
--       .eq('respondent_user_id', userId).eq('has_responded', false)
--       .in('status', ['pending','sent'])
-- Os índices existentes têm cycle_id como coluna líder (não usáveis p/ busca por
-- respondent_user_id); o parcial survey_dispatches_due filtra status='sent', que
-- não cobre status IN ('pending','sent'). Índice por (respondent_user_id,
-- has_responded, status) serve essa query no hot-path do banner.
CREATE INDEX IF NOT EXISTS survey_dispatches_by_respondent
  ON public.survey_dispatches (respondent_user_id, has_responded, status);

-- ROLLBACK (se necessário):
--   DROP INDEX IF EXISTS public.survey_dispatches_by_respondent;
--   DROP INDEX IF EXISTS public.survey_responses_cycle;
