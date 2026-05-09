-- Track the first time a CRM lead leaves its initial stage.
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS first_response_at timestamptz;

COMMENT ON COLUMN public.leads.first_response_at IS 'Data/hora em que o lead CRM recebeu a primeira resposta/primeira movimentacao fora da etapa inicial.';
