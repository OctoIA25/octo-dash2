-- Adiciona campo opcional `endereco_plantao` em lancamentos.
-- Endereço do plantão (estande de vendas do lançamento). Não obrigatório.
-- Quando vazio, a API expõe null e a Lia informa que o corretor entrará em
-- contato para passar o endereço e combinar a melhor data.
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS endereco_plantao TEXT;
