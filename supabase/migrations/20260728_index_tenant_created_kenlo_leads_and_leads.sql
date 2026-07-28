-- Migration: índices (tenant_id, created_at DESC) em kenlo_leads e leads
-- Data: 2026-07-28
--
-- Problema: incidente de 28/jul — Postgres saturado (queries de 10–155s,
-- "canceling statement due to statement timeout", 522/524 em cascata no
-- PostgREST/Auth). A varredura paginada do front executa
--   WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1000 OFFSET n
-- em kenlo_leads (até 6 páginas em paralelo POR USUÁRIO — supabaseService e
-- leadsService) e não existia índice (tenant_id, created_at): cada página
-- forçava o sort de todos os rows do tenant. fetchCRMLeads também varre a
-- tabela leads inteira por tenant_id sem índice dedicado.
--
-- COMO APLICAR (aprendido na prática em 28/jul):
-- 1) No SQL editor, cada statement num run SEPARADO — o arquivo inteiro num run
--    vira transação e CONCURRENTLY falha com ERROR 25001.
-- 2) Com o banco saturado, o build estoura a janela do gateway do editor
--    ("upstream timeout"). Deploar ANTES o front com a carga reduzida
--    (concorrência 2 + polling 5min) e só então criar os índices.
-- 3) Build cancelado no meio deixa índice INVALID — e com IF NOT EXISTS a
--    re-execução PULA a criação achando que existe. Antes de reaplicar, checar:
--      SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
--    e, se listar algo daqui, rodar sozinho: DROP INDEX CONCURRENTLY <nome>;
-- 4) Se o editor seguir estourando a janela: conexão direta (Session mode,
--    porta 5432) e rodar com SET statement_timeout = 0 na sessão.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kenlo_leads_tenant_created
  ON public.kenlo_leads (tenant_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_tenant_created
  ON public.leads (tenant_id, created_at DESC);

COMMENT ON INDEX public.idx_kenlo_leads_tenant_created IS
  'Paginação por offset do front (supabaseService.fetchKenloLeadsPage, leadsService.fetchKenloPagesInBatches): WHERE tenant_id ORDER BY created_at DESC. Incidente 2026-07-28.';

COMMENT ON INDEX public.idx_leads_tenant_created IS
  'Filtros por tenant na tabela leads (fetchCRMLeads varre o tenant inteiro) e listagens ordenadas por created_at. Incidente 2026-07-28.';
