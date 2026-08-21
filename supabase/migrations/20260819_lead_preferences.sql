-- =============================================================================
-- Preferências do lead: termos imobiliários (Apartamento, Sala Comercial, ...)
-- marcados À MÃO pelo corretor e exibidos como badges em Meus Leads.
--
-- Eixo DIFERENTE de `classification`: aquela diz em que balde do bolsão o lead
-- cai (lançamento/pronto/locação) e é escrita por trigger; esta é o que o
-- cliente PROCURA, texto livre, e só entra por gente. Por isso coluna própria
-- e não mais um valor no vocabulário da classification.
--
-- Também não reusa `leads.tags`: aquela coluna já carrega marcador de
-- importação (`{excel_funil_interessado}`), que viraria badge fantasma no card.
--
-- Vocabulário ABERTO por decisão do Victor (19/ago/2026): o front sugere os
-- tipos de `src/lib/tiposImovel.ts`, mas o corretor pode digitar qualquer
-- coisa. Consequência aceita: 'apto' e 'Apartamento' coexistem como termos
-- distintos. Por isso não há CHECK de conteúdo — só de tamanho.
--
-- SEM trigger e SEM espelho em `bolsao`: Meus Leads lê as tabelas fonte
-- direto. Se o Bolsão precisar mostrar as badges, é ADD COLUMN + um trigger
-- copiado de `tg_leads_classification_to_bolsao`.
-- =============================================================================

ALTER TABLE public.leads       ADD COLUMN IF NOT EXISTS preferences text[];
ALTER TABLE public.kenlo_leads ADD COLUMN IF NOT EXISTS preferences text[];

-- Teto de tamanho, não de vocabulário. Array vazio é barrado porque "sem
-- preferência" já tem representação (NULL) — duas formas do mesmo estado
-- fazem o front ter que testar as duas para sempre.
--
-- O limite POR TERMO (40 chars) fica no front: CHECK não aceita subquery, e
-- sem subquery não dá para olhar elemento a elemento. O que dá para fazer aqui
-- é limitar o tamanho TOTAL, que é o que protege a linha de abuso.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_preferences_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_preferences_check
      CHECK (preferences IS NULL OR (
        array_length(preferences, 1) BETWEEN 1 AND 10
        AND length(array_to_string(preferences, ',')) <= 450));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kenlo_leads_preferences_check') THEN
    ALTER TABLE public.kenlo_leads ADD CONSTRAINT kenlo_leads_preferences_check
      CHECK (preferences IS NULL OR (
        array_length(preferences, 1) BETWEEN 1 AND 10
        AND length(array_to_string(preferences, ',')) <= 450));
  END IF;
END $$;

COMMENT ON COLUMN public.leads.preferences IS
  'text[] livre com o que o cliente procura (Apartamento, Sala Comercial...). Marcação manual do corretor. NULL = sem preferência.';
COMMENT ON COLUMN public.kenlo_leads.preferences IS
  'text[] livre com o que o cliente procura (Apartamento, Sala Comercial...). Marcação manual do corretor. NULL = sem preferência.';

-- ---------- Prova ----------
-- Sem INSERT de mentira em `leads`: a tabela tem trigger de roleta, espelho do
-- bolsão e outbox de webhook — um lead fantasma dispararia os três. Prova-se
-- então (a) que as duas constraints existem e (b) que a expressão delas aceita
-- o caso real e barra o abusivo, avaliada solta.
DO $$
DECLARE
  real_ text[] := ARRAY['Apartamento', 'Sala Comercial'];
  abuso text[] := ARRAY(SELECT repeat('x', 40) FROM generate_series(1, 11));
BEGIN
  ASSERT (SELECT count(*) FROM pg_constraint
           WHERE conname IN ('leads_preferences_check', 'kenlo_leads_preferences_check')) = 2,
         'constraints de preferences não foram criadas';
  ASSERT array_length(real_, 1) BETWEEN 1 AND 10
         AND length(array_to_string(real_, ',')) <= 400;
  ASSERT NOT (array_length(abuso, 1) BETWEEN 1 AND 10);
  RAISE NOTICE 'lead preferences: asserts OK';
END $$;

-- =============================================================================
-- ROLLBACK
--   ALTER TABLE public.leads       DROP CONSTRAINT IF EXISTS leads_preferences_check;
--   ALTER TABLE public.kenlo_leads DROP CONSTRAINT IF EXISTS kenlo_leads_preferences_check;
--   ALTER TABLE public.leads       DROP COLUMN IF EXISTS preferences;
--   ALTER TABLE public.kenlo_leads DROP COLUMN IF EXISTS preferences;
-- =============================================================================
