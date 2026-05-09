-- Adiciona o timestamp da primeira resposta aos leads importados do Kenlo.
ALTER TABLE public.kenlo_leads
ADD COLUMN IF NOT EXISTS first_response_at timestamptz;

COMMENT ON COLUMN public.kenlo_leads.first_response_at IS 'Data/hora em que o lead Kenlo recebeu a primeira resposta/primeira movimentação fora da etapa inicial.';
