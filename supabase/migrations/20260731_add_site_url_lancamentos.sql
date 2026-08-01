-- Adiciona campo opcional `site_url` em lancamentos.
-- Link da landing page do empreendimento (uma por lançamento), preenchido por
-- membro da imobiliária no dashboard. A Lia envia esse link nos atendimentos.
-- Quando vazio, a API expõe null e a Lia simplesmente não oferece o link.
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS site_url TEXT;

COMMENT ON COLUMN public.lancamentos.site_url IS 'Landing page do lançamento; a Lia envia nos atendimentos.';
