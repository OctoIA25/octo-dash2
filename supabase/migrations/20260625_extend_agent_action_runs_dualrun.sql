-- ============================================================
-- MIGRATION: Colunas de diagnóstico do dual-run em agent_action_runs
--
-- O preview do Disparador passa a gravar, por run:
--  - primary_source: a fonte efetivamente usada para resolver o público
--    ('kenlo' | 'crm'), espelhando o modo do tenant no momento da prévia.
--  - public_source_diagnostic: o resultado de diffPublics (contagens e amostras
--    mascaradas) quando o modo roda um shadow da fonte secundária; NULL quando
--    não há secundária (kenlo_only/leads_only).
--
-- Aditivo e idempotente (ADD COLUMN IF NOT EXISTS) — não altera linhas existentes.
-- ============================================================

ALTER TABLE public.agent_action_runs
  ADD COLUMN IF NOT EXISTS public_source_diagnostic JSONB,
  ADD COLUMN IF NOT EXISTS primary_source TEXT;

COMMENT ON COLUMN public.agent_action_runs.public_source_diagnostic
  IS 'Diagnóstico do shadow dual-run (diffPublics): contagens e amostras mascaradas. NULL quando não há fonte secundária.';
COMMENT ON COLUMN public.agent_action_runs.primary_source
  IS 'Fonte primária usada para resolver o público do run: kenlo | crm.';
