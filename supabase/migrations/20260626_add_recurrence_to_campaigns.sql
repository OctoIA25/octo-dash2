-- ============================================================
-- MIGRATION: recorrência de campanha (C4a)
-- recurrence = null (pontual) | { frequency:daily|weekly, day_of_week?:0-6, time:HH:MM }.
-- Recorrente reagenda scheduled_at após cada disparo bem-sucedido.
-- ============================================================

ALTER TABLE public.communication_campaigns
  ADD COLUMN IF NOT EXISTS recurrence JSONB;

COMMENT ON COLUMN public.communication_campaigns.recurrence IS 'null = pontual; { frequency:daily|weekly, day_of_week?:0-6, time:HH:MM (UTC) }. O worker reagenda scheduled_at após cada disparo.';
