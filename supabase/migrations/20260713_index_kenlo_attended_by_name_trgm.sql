-- Migration: índice para acelerar a busca de leads do corretor por NOME
-- Data: 2026-07-13
--
-- Problema: o Kanban "Meus Leads" filtra kenlo_leads por
--   .ilike('attended_by_name', <nome>)  (match exato, case-insensitive).
-- Sem índice adequado, o Postgres faz sequential scan da tabela inteira a cada
-- página → cada request levava ~20s (medido no tenant JAPI). ILIKE não é
-- acelerado por btree comum; o índice apropriado é um GIN trigram (pg_trgm).
--
-- Índice composto conceitual não se aplica a GIN trgm; o filtro por tenant_id
-- (já indexado em outros índices) combina com este no planner.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_kenlo_leads_attended_by_name_trgm
  ON public.kenlo_leads
  USING gin (attended_by_name gin_trgm_ops);

COMMENT ON INDEX public.idx_kenlo_leads_attended_by_name_trgm IS
  'Acelera .ilike(attended_by_name) do Kanban Meus Leads (evita seq-scan). Ver leadsService.fetchLeadsDoCorretorCRM.';
