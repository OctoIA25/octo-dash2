-- Colunas aditivas para observabilidade de sync e reconciliação periódica.
-- Aditivo e idempotente: rollback não exige DROP (colunas órfãs são inertes).
ALTER TABLE public.kenlo_integrations
  ADD COLUMN IF NOT EXISTS last_full_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_state TEXT;
