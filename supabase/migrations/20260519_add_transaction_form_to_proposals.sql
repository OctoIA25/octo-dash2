ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS transaction_form JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_proposals_transaction_form_gin
  ON public.proposals USING GIN (transaction_form);
