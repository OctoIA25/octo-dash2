-- ============================================================
-- MIGRATION: agendamento pontual de campanha (C3)
-- scheduled_at = quando disparar (UTC). schedule_status = ciclo do
-- agendamento. O worker (loop 5s) dispara as 'scheduled' vencidas.
-- ============================================================

ALTER TABLE public.communication_campaigns
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS schedule_status TEXT NOT NULL DEFAULT 'none'
    CHECK (schedule_status IN ('none','scheduled','dispatched','error','canceled')),
  ADD COLUMN IF NOT EXISTS schedule_error TEXT;

CREATE INDEX IF NOT EXISTS idx_comm_campaigns_due
  ON public.communication_campaigns(scheduled_at)
  WHERE schedule_status = 'scheduled';

COMMENT ON COLUMN public.communication_campaigns.scheduled_at IS 'Quando disparar (UTC). NULL = não agendada.';
COMMENT ON COLUMN public.communication_campaigns.schedule_status IS 'none=imediato; scheduled=aguardando; dispatched=disparou; error=falhou; canceled=cancelado.';
