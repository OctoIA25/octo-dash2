-- =============================================================================
-- Anthropic Fase 3 — modo de operação por tenant.
--
-- mode: 'api' (pull horário via Admin API — F1/F2, default) | 'max' (push: o
--   reporter get_usage na máquina com OAuth do plano Max POSTa o % oficial da
--   assinatura no ingest /api/v1/anthropic/usage-report a cada ~5 min).
-- No modo 'max' as colunas de USD (last_usage_usd/weekly_limit_usd) ficam null
-- (a assinatura não tem semântica de gasto em dólar) e o scheduler F2 PULA o
-- tenant (o tick sem Admin key sobrescreveria o snapshot e re-armaria o dedup).
-- =============================================================================

ALTER TABLE public.tenant_anthropic_config
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'api';

DO $$ BEGIN
  ALTER TABLE public.tenant_anthropic_config
    ADD CONSTRAINT tenant_anthropic_config_mode_check CHECK (mode IN ('api','max'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
