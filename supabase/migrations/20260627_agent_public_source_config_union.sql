-- Libera o modo 'union' na config de fonte de leads do Disparador.
-- 'union' = público resolve leads + kenlo_leads e deduplica por telefone (envio único).
-- O CHECK original (20260625_create_agent_public_source_config.sql) só permitia
-- os 4 modos dual-run; ampliamos sem alterar dados nem o default ('kenlo_only').

ALTER TABLE public.agent_public_source_config
  DROP CONSTRAINT IF EXISTS agent_public_source_config_mode_check;

ALTER TABLE public.agent_public_source_config
  ADD CONSTRAINT agent_public_source_config_mode_check
  CHECK (mode IN ('kenlo_only', 'shadow_leads', 'leads_primary', 'leads_only', 'union'));

COMMENT ON COLUMN public.agent_public_source_config.mode
  IS 'Modo do resolver de públicos. kenlo_only = só kenlo (default). shadow_leads = kenlo + diagnóstico leads. leads_primary = leads + diagnóstico kenlo. leads_only = só leads. union = leads + kenlo deduplicado por telefone (envio único).';
