-- =============================================================================
-- `parceiro`: a quinta classificação de lead (28/09/2026)
--
-- POR QUE UMA MIGRATION E NÃO SÓ TELA
-- O vocabulário é travado por CHECK em DUAS tabelas — `leads` (onde a Lia e a
-- Santa Ângela escrevem) e `kenlo_leads` (a integração Kenlo). Sem soltar as
-- duas, marcar "Parceiro" na tela devolve erro do banco: o corretor clica, nada
-- acontece, e não há mensagem que explique.
--
-- ORDEM DOS VALORES
-- `parceiro` entra ANTES de `indefinido`, que é a mesma ordem canônica de
-- gravação do front (ORDEM_CANONICA) e do servidor (CLASSIFICACOES). A ordem
-- não é cosmética: o guard e o espelho do bolsão comparam
-- `NEW.classification IS DISTINCT FROM OLD.classification`, e o mesmo conjunto
-- em ordens diferentes dispararia os dois à toa.
--
-- O QUE ESTA MIGRATION NÃO FAZ
-- Não classifica ninguém. `parceiro` é marcação humana, no modal do lead —
-- nenhum trigger o escreve, e nenhum lead existente muda. Também não mexe em
-- `indefinido`: ele continua sendo o que o trigger grava quando não consegue
-- decidir (imóvel sem código, ZAP/OLX), hoje 3.373 dos 5.412 leads. O que saiu
-- em 28/09 foi só o BOTÃO de marcá-lo à mão.
-- =============================================================================

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_classification_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_classification_check CHECK (
  classification IS NULL
  OR (
    array_length(classification, 1) >= 1
    AND classification <@ ARRAY['lancamento', 'pronto', 'locacao', 'parceiro', 'indefinido']::text[]
  )
);

ALTER TABLE public.kenlo_leads DROP CONSTRAINT IF EXISTS kenlo_leads_classification_check;
ALTER TABLE public.kenlo_leads ADD CONSTRAINT kenlo_leads_classification_check CHECK (
  classification IS NULL
  OR (
    array_length(classification, 1) >= 1
    AND classification <@ ARRAY['lancamento', 'pronto', 'locacao', 'parceiro', 'indefinido']::text[]
  )
);

COMMENT ON CONSTRAINT leads_classification_check ON public.leads IS
  'Vocabulário da classificação. `parceiro` é marcação humana (28/09/2026); `indefinido` é o que o trigger grava quando não sabe.';
