-- Complementa o enrich de `lancamentos` com 2 campos que a LISTAGEM do Portal
-- (/lotus-lancamentos) usa nos filtros e na ordenação:
--   - tipo_dorms: tipologia categórica p/ o filtro "2/3/4 dorms" (ex '3 dorms').
--   - preco_num:  preço numérico p/ o filtro de faixa de preço e a ordenação.
--
-- Sem estes, a listagem dinâmica perderia o filtro de tipo/preço e o sort por
-- preço (a tabela só tinha preco_texto string e dormitorios livre). Nullable,
-- não quebram registros existentes. Impacto zero no dashboard/RLS.
--
-- ROLLBACK:
--   ALTER TABLE public.lancamentos
--     DROP COLUMN IF EXISTS tipo_dorms, DROP COLUMN IF EXISTS preco_num;

ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS tipo_dorms TEXT,     -- categórico p/ filtro: "2 dorms", "3 dorms"...
  ADD COLUMN IF NOT EXISTS preco_num  INTEGER;  -- preço a partir de, em reais (p/ faixa e sort)

COMMENT ON COLUMN public.lancamentos.tipo_dorms IS 'Tipologia categórica p/ filtro da listagem, ex "3 dorms" (Portal).';
COMMENT ON COLUMN public.lancamentos.preco_num  IS 'Preço numérico (R$) p/ filtro de faixa e ordenação da listagem (Portal).';
