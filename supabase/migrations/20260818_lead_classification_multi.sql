-- =============================================================================
-- Classificação de lead vira MULTI-VALOR: um lead pode ser Lançamento E Locação.
--
-- Decisão de negócio (Victor, 18/ago/2026): no Bolsão o lead aparece em TODAS
-- as seções que ele carrega, e as combinações são livres — só 'indefinido' é
-- exclusiva (é a ausência de classificação, não uma classificação a mais).
--
-- A coluna MUDA DE TIPO em vez de ganhar uma irmã (`classifications`): duas
-- colunas para o mesmo vocabulário viram duas fontes de verdade que divergem
-- em silêncio — o trigger escreveria numa e o dashboard na outra.
--
-- ⚠️ Continua valendo a regra de precedência da 20260815: reprocessamento
--    automático só pode tocar linhas com `classification_source = 'automatic'`.
--
-- Depende de: 20260815_add_lead_classification.sql
--             20260815_lead_classification_triggers.sql
-- =============================================================================

-- ---------- 1) CHECKs de valor único saem antes do ALTER TYPE ----------
ALTER TABLE public.leads       DROP CONSTRAINT IF EXISTS leads_classification_check;
ALTER TABLE public.kenlo_leads DROP CONSTRAINT IF EXISTS kenlo_leads_classification_check;

-- ---------- 2) Triggers que CITAM a coluna saem antes do ALTER TYPE ----------
-- `BEFORE/AFTER UPDATE OF classification` + `WHEN (NEW.classification ...)`
-- gravam a coluna na definição do trigger, e o Postgres recusa mudar o tipo
-- enquanto isso existir (0A000). Os triggers de INSERT não citam a coluna
-- (só atribuem NEW.classification no corpo) e por isso ficam onde estão.
-- São recriados idênticos no passo 6 — a lógica não muda aqui.
DROP TRIGGER IF EXISTS tr_leads_classification_guard        ON public.leads;
DROP TRIGGER IF EXISTS tr_kenlo_leads_classification_guard  ON public.kenlo_leads;
DROP TRIGGER IF EXISTS tr_leads_classification_to_bolsao    ON public.leads;
DROP TRIGGER IF EXISTS tr_kenlo_leads_classification_to_bolsao ON public.kenlo_leads;

-- ---------- 3) text -> text[] ----------
-- Condicional por tipo atual: rodar a migration duas vezes não transforma
-- text[] em text[][]. NULL continua NULL (lê-se como indefinido, fail-open).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('leads', 'kenlo_leads', 'bolsao')
       AND column_name = 'classification'
       AND data_type <> 'ARRAY'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN classification TYPE text[] '
      'USING (CASE WHEN classification IS NULL THEN NULL ELSE ARRAY[classification] END)',
      t.table_name);
    RAISE NOTICE 'classification -> text[] em public.%', t.table_name;
  END LOOP;
END $$;

-- ---------- 4) CHECKs novos: conjunto fechado, nunca array vazio ----------
-- `<@` garante que todo elemento está no vocabulário. Duplicata dentro do
-- array não é barrada aqui (CHECK não aceita subquery) — quem escreve
-- normaliza: `classificacoesDe`/`toggleClassificacao` no front,
-- `resolveClassification` no servidor.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_classification_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_classification_check
      CHECK (classification IS NULL OR (
        array_length(classification, 1) >= 1
        AND classification <@ ARRAY['lancamento', 'pronto', 'locacao', 'indefinido']::text[]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kenlo_leads_classification_check') THEN
    ALTER TABLE public.kenlo_leads ADD CONSTRAINT kenlo_leads_classification_check
      CHECK (classification IS NULL OR (
        array_length(classification, 1) >= 1
        AND classification <@ ARRAY['lancamento', 'pronto', 'locacao', 'indefinido']::text[]));
  END IF;
END $$;

COMMENT ON COLUMN public.leads.classification IS
  'text[] com 1+ de lancamento|pronto|locacao|indefinido. NULL e {indefinido} leem-se como sem classificação (fail-open).';

-- ---------- 5) Triggers de entrada: a regra continua devolvendo UM valor ----------
-- A classificação AUTOMÁTICA segue single-valued de propósito: os dois eixos
-- (estágio e transação) já são achatados por `classificar_lead`, e inventar um
-- segundo valor aqui seria regra nova escondida numa migration de tipo.
-- Múltiplas classificações são decisão humana (dashboard) ou da Lia.
CREATE OR REPLACE FUNCTION public.tg_leads_classificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.classification := ARRAY[public.classificar_lead(NEW.property_code, NEW.source, NULL, NULL)];
  NEW.classification_source := 'automatic';
  NEW.classification_updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_kenlo_leads_classificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.classification := ARRAY[public.classificar_lead(
    NEW.interest_reference, NEW.portal, NEW.interest_is_rent, NEW.interest_is_sale)];
  NEW.classification_source := 'automatic';
  NEW.classification_updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------- 6) Triggers do passo 2 de volta, IDÊNTICOS aos da 20260815 ----------
-- As FUNÇÕES não foram tocadas (o guard só mexe em `classification_source`, os
-- espelhos copiam coluna para coluna) — só os triggers precisaram sair para o
-- ALTER TYPE passar. `IS DISTINCT FROM` compara arrays elemento a elemento: é
-- por isso que quem escreve mantém a ORDEM CANÔNICA (lancamento, pronto,
-- locacao, indefinido) — {pronto,locacao} e {locacao,pronto} são arrays
-- distintos e disparariam guard e espelho à toa.
CREATE TRIGGER tr_leads_classification_guard
  BEFORE UPDATE OF classification ON public.leads
  FOR EACH ROW
  WHEN (NEW.classification IS DISTINCT FROM OLD.classification)
  EXECUTE FUNCTION public.tg_classification_source_guard();

CREATE TRIGGER tr_kenlo_leads_classification_guard
  BEFORE UPDATE OF classification ON public.kenlo_leads
  FOR EACH ROW
  WHEN (NEW.classification IS DISTINCT FROM OLD.classification)
  EXECUTE FUNCTION public.tg_classification_source_guard();

CREATE TRIGGER tr_leads_classification_to_bolsao
  AFTER UPDATE OF classification ON public.leads
  FOR EACH ROW
  WHEN (NEW.classification IS DISTINCT FROM OLD.classification)
  EXECUTE FUNCTION public.tg_leads_classification_to_bolsao();

CREATE TRIGGER tr_kenlo_leads_classification_to_bolsao
  AFTER UPDATE OF classification ON public.kenlo_leads
  FOR EACH ROW
  WHEN (NEW.classification IS DISTINCT FROM OLD.classification)
  EXECUTE FUNCTION public.tg_kenlo_leads_classification_to_bolsao();

-- O espelho no INSERT do bolsão (tr_bolsao_herda_classificacao) não cita a
-- coluna na definição, então nunca saiu — segue valendo sem alteração.

-- ---------- 7) Prova de que a estrutura aceita o caso que motivou a migration ----------
DO $$
DECLARE
  v text[];
BEGIN
  -- vocabulário fechado
  ASSERT (ARRAY['lancamento', 'locacao']::text[]
          <@ ARRAY['lancamento', 'pronto', 'locacao', 'indefinido']::text[]);
  ASSERT NOT (ARRAY['lancamento', 'venda']::text[]
          <@ ARRAY['lancamento', 'pronto', 'locacao', 'indefinido']::text[]);
  -- a regra automática continua devolvendo exatamente um valor
  v := ARRAY[public.classificar_lead('AP001', 'Manual', NULL, NULL)];
  ASSERT array_length(v, 1) = 1 AND v[1] = 'pronto';
  RAISE NOTICE 'classification multi: asserts OK';
END $$;

-- =============================================================================
-- ROLLBACK (só é seguro se nenhum lead tiver 2+ classificações — o extra some)
--   ALTER TABLE public.leads       DROP CONSTRAINT IF EXISTS leads_classification_check;
--   ALTER TABLE public.kenlo_leads DROP CONSTRAINT IF EXISTS kenlo_leads_classification_check;
--   -- derrubar os 4 triggers do passo 2 ANTES do ALTER (mesmo 0A000 na volta)
--   ALTER TABLE public.leads       ALTER COLUMN classification TYPE text USING classification[1];
--   ALTER TABLE public.kenlo_leads ALTER COLUMN classification TYPE text USING classification[1];
--   ALTER TABLE public.bolsao      ALTER COLUMN classification TYPE text USING classification[1];
--   -- e reaplicar 20260815_lead_classification_triggers.sql para voltar os
--   -- triggers de entrada à atribuição sem ARRAY[].
-- =============================================================================
