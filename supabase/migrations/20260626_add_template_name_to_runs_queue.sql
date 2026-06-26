-- ============================================================
-- MIGRATION: template_name por disparo (override do template HSM)
-- Permite que o Disparador/Campanha enviem o template ESCOLHIDO
-- (não o nome fixo de tenant_recommendation_config). NULL = usa o fixo.
-- ============================================================

ALTER TABLE public.agent_action_runs
  ADD COLUMN IF NOT EXISTS template_name TEXT;

ALTER TABLE public.agent_action_queue
  ADD COLUMN IF NOT EXISTS template_name TEXT;

COMMENT ON COLUMN public.agent_action_runs.template_name IS 'Template HSM escolhido p/ este disparo (override). NULL = usa o fixo de tenant_recommendation_config.';
COMMENT ON COLUMN public.agent_action_queue.template_name IS 'Propagado do run: o template HSM a enviar neste item. NULL = usa o fixo.';
