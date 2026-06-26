-- ============================================================
-- MIGRATION: variable_mapping por disparo (auditoria)
-- Guarda o mapa {{N}}→fonte usado no disparo. A fila propaga o
-- mapping dentro do payload jsonb (sem coluna nova na queue).
-- ============================================================

ALTER TABLE public.agent_action_runs
  ADD COLUMN IF NOT EXISTS variable_mapping JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.agent_action_runs.variable_mapping IS 'Mapa {{N}}→{type,value} usado neste disparo. {} = sem variáveis / texto livre.';
