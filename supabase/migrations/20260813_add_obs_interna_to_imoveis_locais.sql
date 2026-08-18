ALTER TABLE public.imoveis_locais
  ADD COLUMN IF NOT EXISTS obs_interna TEXT;

COMMENT ON COLUMN public.imoveis_locais.obs_interna IS
  'Observação interna da equipe da imobiliária. Não exposta no portal público.';
