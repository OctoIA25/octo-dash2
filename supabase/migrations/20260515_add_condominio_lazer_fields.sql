-- Adiciona novos itens de esporte/lazer aos condomínios.

ALTER TABLE public.condominios
  ADD COLUMN IF NOT EXISTS infra_mirante BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS infra_espaco_pet BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS infra_quadra_areia BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS infra_pomar BOOLEAN DEFAULT FALSE;
