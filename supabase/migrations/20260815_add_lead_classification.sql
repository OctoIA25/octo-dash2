-- =============================================================================
-- Classificação de lead: lancamento / pronto / locacao / indefinido
--
-- Esta migration é SÓ ESTRUTURA + REGRA. Não cria trigger nenhum (Task 2) nem
-- faz backfill (Task 3). Aplicá-la sozinha não muda comportamento algum.
--
-- ⚠️ REGRA DE PRECEDÊNCIA: a classificação 'automatic' só é escrita no INSERT.
--    Qualquer reprocessamento futuro DEVE filtrar
--    `WHERE classification_source = 'automatic'` — senão apaga o que a Lia
--    ou o corretor decidiram, e não há histórico para recuperar.
--
-- Ver docs/superpowers/specs/2026-08-15-classificacao-lead-badges-design.md
-- =============================================================================

-- ---------- 1) Colunas ----------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS classification text,
  ADD COLUMN IF NOT EXISTS classification_source text,
  ADD COLUMN IF NOT EXISTS classification_updated_at timestamptz;

ALTER TABLE public.kenlo_leads
  ADD COLUMN IF NOT EXISTS classification text,
  ADD COLUMN IF NOT EXISTS classification_source text,
  ADD COLUMN IF NOT EXISTS classification_updated_at timestamptz;

-- O espelho carrega só o valor: bolsao é fila de leitura, não audita nada.
ALTER TABLE public.bolsao
  ADD COLUMN IF NOT EXISTS classification text;

-- CHECKs em bloco condicional: ADD CONSTRAINT não tem IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_classification_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_classification_check
      CHECK (classification IS NULL OR classification IN ('lancamento', 'pronto', 'locacao', 'indefinido'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_classification_source_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_classification_source_check
      CHECK (classification_source IS NULL OR classification_source IN ('automatic', 'lia', 'dashboard'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kenlo_leads_classification_check') THEN
    ALTER TABLE public.kenlo_leads ADD CONSTRAINT kenlo_leads_classification_check
      CHECK (classification IS NULL OR classification IN ('lancamento', 'pronto', 'locacao', 'indefinido'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kenlo_leads_classification_source_check') THEN
    ALTER TABLE public.kenlo_leads ADD CONSTRAINT kenlo_leads_classification_source_check
      CHECK (classification_source IS NULL OR classification_source IN ('automatic', 'lia', 'dashboard'));
  END IF;
END $$;

COMMENT ON COLUMN public.leads.classification IS
  'lancamento|pronto|locacao|indefinido. NULL lê-se como indefinido (fail-open).';
COMMENT ON COLUMN public.leads.classification_source IS
  'automatic (trigger de entrada) | lia (API key) | dashboard (sessão de usuário).';

-- ---------- 2) Normalização (mesmo idioma do TS: minúsculas, sem acento, espaços colapsados) ----------
-- translate() em vez da extensão unaccent: não cria dependência de extensão.
CREATE OR REPLACE FUNCTION public.normalizar_texto(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(
    translate(lower(coalesce(p, '')),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'),
    '\s+', ' ', 'g'));
$$;

-- ---------- 3) Eixo TRANSAÇÃO (venda vs locação) ----------
-- NULL = "este eixo não diz nada"; quem decide então é o eixo de estágio.
CREATE OR REPLACE FUNCTION public.classificar_lead_transacao(p_is_rent boolean, p_is_sale boolean)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    -- Imóvel anunciado para venda E locação: a intenção do lead é indeterminada.
    -- Medido em 15/ago: 250 leads reais assim.
    WHEN p_is_rent IS TRUE AND p_is_sale IS TRUE THEN 'indefinido'
    WHEN p_is_rent IS TRUE THEN 'locacao'
    ELSE NULL
  END;
$$;

-- ---------- 4) Eixo ESTÁGIO (lançamento vs pronto) — regra já em produção ----------
CREATE OR REPLACE FUNCTION public.classificar_lead_estagio(p_codigo text, p_portal text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    -- Santa Ângela é integração exclusiva de lançamentos: premissa de negócio
    -- do Victor (12/ago/2026), não inferência de dado. Igualdade EXATA — um
    -- futuro 'Santa Angela Locação' não herda a afirmação.
    WHEN public.normalizar_texto(p_portal) = 'santa angela' THEN 'lancamento'
    WHEN public.normalizar_texto(p_codigo) = '' THEN 'indefinido'
    -- clientListingId do Grupo OLX: id de anúncio externo, não identifica nada
    -- no nosso catálogo. `LIKE` porque abster-se demais é inofensivo.
    WHEN public.normalizar_texto(p_portal) LIKE '%zap%' THEN 'indefinido'
    WHEN public.normalizar_texto(p_portal) LIKE '%olx%' THEN 'indefinido'
    ELSE 'pronto'
  END;
$$;

-- ---------- 5) Composição dos dois eixos ----------
CREATE OR REPLACE FUNCTION public.classificar_lead(
  p_codigo text, p_portal text, p_is_rent boolean, p_is_sale boolean
) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_estagio   text := public.classificar_lead_estagio(p_codigo, p_portal);
  v_transacao text := public.classificar_lead_transacao(p_is_rent, p_is_sale);
BEGIN
  -- A premissa de negócio vence o sinal de transação. Na prática não colidem:
  -- Santa Ângela escreve em `leads`, que não tem coluna de locação.
  IF v_estagio = 'lancamento' THEN
    RETURN 'lancamento';
  END IF;
  RETURN COALESCE(v_transacao, v_estagio);
END;
$$;

-- ---------- 6) Prova da regra: roda AGORA, aborta a migration se quebrar ----------
DO $$
BEGIN
  -- Santa Ângela: lançamento com código, sem código e com lixo (CPF vazado)
  ASSERT public.classificar_lead('RESERVA CASTANHEIRA', 'Santa Angela', NULL, NULL) = 'lancamento';
  ASSERT public.classificar_lead(NULL, 'Santa Angela', NULL, NULL) = 'lancamento';
  ASSERT public.classificar_lead('32328077803', 'Santa Ângela', NULL, NULL) = 'lancamento';
  ASSERT public.classificar_lead(NULL, '  SANTA   ANGELA ', NULL, NULL) = 'lancamento';
  -- ...mas não por prefixo
  ASSERT public.classificar_lead('AP001', 'Santa Angela Locacao', NULL, NULL) <> 'lancamento';

  -- Locação: rent puro
  ASSERT public.classificar_lead('CA0898', 'Cliquei Mudei', true, false) = 'locacao';
  ASSERT public.classificar_lead('AP0051', 'Cliquei Mudei', true, NULL)  = 'locacao';
  -- Ambíguo: venda E locação -> indefinido, NUNCA locacao
  ASSERT public.classificar_lead('CA0826', 'Cliquei Mudei', true, true)  = 'indefinido';

  -- Estágio, quando não há sinal de transação
  ASSERT public.classificar_lead('S1KUFJ', 'ZAP Imóveis', false, true)   = 'indefinido';
  ASSERT public.classificar_lead('22AUFJ', 'Grupo OLX', NULL, NULL)      = 'indefinido';
  ASSERT public.classificar_lead('AP001', 'Manual', NULL, NULL)          = 'pronto';
  ASSERT public.classificar_lead('CA1045', 'Kenlo', false, true)         = 'pronto';

  -- Sem sinal nenhum: indefinido. NUNCA 'pronto' por padrão.
  ASSERT public.classificar_lead(NULL, NULL, NULL, NULL)                 = 'indefinido';
  ASSERT public.classificar_lead('', 'Portal Novo', NULL, NULL)          = 'indefinido';
  ASSERT public.classificar_lead('   ', 'Lia (Japi)', false, false)      = 'indefinido';

  RAISE NOTICE 'classificar_lead: 15 asserts OK';
END $$;

-- =============================================================================
-- ROLLBACK
--   ALTER TABLE public.leads       DROP COLUMN IF EXISTS classification,
--     DROP COLUMN IF EXISTS classification_source, DROP COLUMN IF EXISTS classification_updated_at;
--   ALTER TABLE public.kenlo_leads DROP COLUMN IF EXISTS classification,
--     DROP COLUMN IF EXISTS classification_source, DROP COLUMN IF EXISTS classification_updated_at;
--   ALTER TABLE public.bolsao      DROP COLUMN IF EXISTS classification;
--   DROP FUNCTION IF EXISTS public.classificar_lead(text, text, boolean, boolean);
--   DROP FUNCTION IF EXISTS public.classificar_lead_estagio(text, text);
--   DROP FUNCTION IF EXISTS public.classificar_lead_transacao(boolean, boolean);
--   DROP FUNCTION IF EXISTS public.normalizar_texto(text);
-- =============================================================================
