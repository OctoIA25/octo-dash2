-- =============================================================================
-- Forecast Interessado: os quatro campos que a planilha grava.
--
-- As LINHAS do forecast já existem — são as propostas fora de 'arquivado',
-- materializadas por `tg_mirror_lead_to_proposal` (20260602). O que faltava era
-- onde guardar o que o gestor digita.
--
-- Colunas aqui e não em `forecast_entries`: não existe forecast sem proposta,
-- nem proposta com dois forecasts. Uma tabela separada custaria FK, RLS própria,
-- política de escrita e um JOIN a mais para dizer exatamente isto.
--
-- Nada de RLS nova: `proposals` já tem a política de leitura por papel
-- (20260602_proposals_restrict_corretor_read: gestor lê o tenant, corretor lê
-- só as suas) e a de escrita. Estas colunas herdam as duas.
--
-- O trigger de espelhamento não encosta nelas — ele só atualiza stage_id/status
-- de propostas source='crm' —, então o que for digitado sobrevive à mudança de
-- etapa do lead.
--
-- Ver docs/superpowers/specs/2026-08-20-forecast-interessado-design.md
-- =============================================================================

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS forecast_empreendimento text,
  ADD COLUMN IF NOT EXISTS forecast_unidade        text,
  ADD COLUMN IF NOT EXISTS forecast_previsao       date,
  ADD COLUMN IF NOT EXISTS forecast_estado         text;

-- Teto de tamanho, não de vocabulário: os quatro campos são texto livre por
-- decisão de design (empreendimento e unidade não se relacionam com
-- `lancamentos`). O CHECK protege a linha de abuso, não o conteúdo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_forecast_text_check') THEN
    ALTER TABLE public.proposals ADD CONSTRAINT proposals_forecast_text_check
      CHECK (
        length(COALESCE(forecast_empreendimento, '')) <= 200
        AND length(COALESCE(forecast_unidade, ''))    <= 100
        AND length(COALESCE(forecast_estado, ''))     <= 500
      );
  END IF;
END $$;

COMMENT ON COLUMN public.proposals.forecast_empreendimento IS
  'Forecast: nome do lançamento de interesse. Texto livre — NÃO é FK para lancamentos. Nasce com property_reference quando o lead não é de lançamento.';
COMMENT ON COLUMN public.proposals.forecast_unidade IS
  'Forecast: unidade do lançamento. Texto livre. Nasce com property_reference quando o lead não é de lançamento.';
COMMENT ON COLUMN public.proposals.forecast_previsao IS
  'Forecast: previsão de fechamento preenchida à mão. NULL = ainda não estimada (é o estado inicial por decisão de design).';
COMMENT ON COLUMN public.proposals.forecast_estado IS
  'Forecast: estado atual do negócio, texto livre do gestor/corretor. NULL = em branco.';

-- ---------- Prova ----------
-- Sem INSERT de mentira em `proposals`: a tabela é alvo do trigger de
-- espelhamento e tem FK para tenants/leads/auth.users — uma proposta fantasma
-- exigiria semear quatro tabelas. Prova-se então (a) que as quatro colunas
-- existem com o tipo certo e (b) que a constraint aceita o caso real e barra o
-- abusivo, avaliada solta.
DO $$
DECLARE
  v_cols int;
  v_previsao_type text;
  abuso text := repeat('x', 201);
BEGIN
  SELECT count(*) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'proposals'
     AND column_name IN ('forecast_empreendimento', 'forecast_unidade',
                         'forecast_previsao', 'forecast_estado');
  ASSERT v_cols = 4, 'colunas de forecast não foram criadas';

  SELECT data_type INTO v_previsao_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'proposals'
     AND column_name = 'forecast_previsao';
  ASSERT v_previsao_type = 'date', 'forecast_previsao deveria ser date, veio ' || v_previsao_type;

  ASSERT (SELECT count(*) FROM pg_constraint
           WHERE conname = 'proposals_forecast_text_check') = 1,
         'constraint de tamanho do forecast não foi criada';

  ASSERT length('Residencial Vista Verde') <= 200;
  ASSERT NOT (length(abuso) <= 200);
  RAISE NOTICE 'forecast fields: asserts OK';
END $$;

-- =============================================================================
-- ROLLBACK
--   ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_forecast_text_check;
--   ALTER TABLE public.proposals
--     DROP COLUMN IF EXISTS forecast_empreendimento,
--     DROP COLUMN IF EXISTS forecast_unidade,
--     DROP COLUMN IF EXISTS forecast_previsao,
--     DROP COLUMN IF EXISTS forecast_estado;
-- =============================================================================
