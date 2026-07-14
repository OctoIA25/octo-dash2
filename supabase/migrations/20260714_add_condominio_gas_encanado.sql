-- Adiciona item "Gás Encanado" à infraestrutura básica dos condomínios.

ALTER TABLE public.condominios
  ADD COLUMN IF NOT EXISTS infra_gas_encanado BOOLEAN DEFAULT FALSE;
