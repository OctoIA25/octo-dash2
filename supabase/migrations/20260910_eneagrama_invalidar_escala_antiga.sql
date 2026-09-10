-- Eneagrama: invalida os resultados produzidos pelo questionário antigo.
--
-- POR QUE: o questionário anterior tinha 10 pares com mapa desbalanceado — os
-- tipos 1 e 5 apareciam em 3 pares e os demais em 2. Enumerando as 1024 respostas
-- possíveis, o Tipo 1 saía em 46,9% delas e o Tipo 9 em 0,2%, e 73% dos
-- resultados eram empate resolvido silenciosamente pelo menor índice. O tipo
-- gravado descreve o instrumento, não a pessoa.
--
-- O questionário novo tem 36 pares (todos os pares possíveis entre os 9 tipos),
-- cada tipo aparecendo 8 vezes. As escalas são incompatíveis e é isso que dá o
-- critério seguro para separá-las: cada pergunta distribui exatamente 1 ponto,
-- então a SOMA dos 9 scores é o número de perguntas — 10 na escala antiga, 36 na
-- nova. Todo UPDATE aqui é filtrado por essa soma.
--
-- IDEMPOTENTE: reaplicar não toca em resultado da escala nova. Isso importa —
-- a migration é aplicada à mão, e a versão anterior deste arquivo apagava tudo
-- na segunda execução.
--
-- ⚠️ APLICAR MANUALMENTE no Supabase, ANTES do deploy do front. Sem isso, o
-- relatório da equipe mistura as duas escalas na mesma distribuição.

BEGIN;

CREATE TABLE IF NOT EXISTS public.eneagrama_resultados_escala_antiga (
  origem            text        NOT NULL,   -- 'Corretores' | 'admin_test_results'
  origem_id         text        NOT NULL,
  tenant_id         uuid,
  identificacao     text,
  tipo_principal    integer,
  scores            jsonb,
  data_teste        timestamptz,
  arquivado_em      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origem, origem_id)
);

COMMENT ON TABLE public.eneagrama_resultados_escala_antiga IS
  'Resultados do Eneagrama gravados pelo questionário de 10 pares (enviesado, teto 3), arquivados ao migrar para o item bank de 36 pares. Somente auditoria.';

-- ---------------------------------------------------------------- Corretores
WITH antigos AS (
  SELECT id, tenant_id, nm_corretor, eneagrama_tipo_principal, eneagrama_data_teste,
         jsonb_build_object(
           '1', eneagrama_score_tipo_1, '2', eneagrama_score_tipo_2, '3', eneagrama_score_tipo_3,
           '4', eneagrama_score_tipo_4, '5', eneagrama_score_tipo_5, '6', eneagrama_score_tipo_6,
           '7', eneagrama_score_tipo_7, '8', eneagrama_score_tipo_8, '9', eneagrama_score_tipo_9
         ) AS scores
  FROM public."Corretores"
  WHERE eneagrama_tipo_principal IS NOT NULL
    AND COALESCE(eneagrama_score_tipo_1,0) + COALESCE(eneagrama_score_tipo_2,0)
      + COALESCE(eneagrama_score_tipo_3,0) + COALESCE(eneagrama_score_tipo_4,0)
      + COALESCE(eneagrama_score_tipo_5,0) + COALESCE(eneagrama_score_tipo_6,0)
      + COALESCE(eneagrama_score_tipo_7,0) + COALESCE(eneagrama_score_tipo_8,0)
      + COALESCE(eneagrama_score_tipo_9,0) <= 10
)
INSERT INTO public.eneagrama_resultados_escala_antiga
  (origem, origem_id, tenant_id, identificacao, tipo_principal, scores, data_teste)
SELECT 'Corretores', id::text, tenant_id, nm_corretor, eneagrama_tipo_principal, scores, eneagrama_data_teste
FROM antigos
ON CONFLICT (origem, origem_id) DO NOTHING;

UPDATE public."Corretores"
SET eneagrama_tipo_principal = NULL,
    eneagrama_score_tipo_1 = NULL, eneagrama_score_tipo_2 = NULL, eneagrama_score_tipo_3 = NULL,
    eneagrama_score_tipo_4 = NULL, eneagrama_score_tipo_5 = NULL, eneagrama_score_tipo_6 = NULL,
    eneagrama_score_tipo_7 = NULL, eneagrama_score_tipo_8 = NULL, eneagrama_score_tipo_9 = NULL,
    eneagrama_data_teste = NULL
WHERE eneagrama_tipo_principal IS NOT NULL
  AND COALESCE(eneagrama_score_tipo_1,0) + COALESCE(eneagrama_score_tipo_2,0)
    + COALESCE(eneagrama_score_tipo_3,0) + COALESCE(eneagrama_score_tipo_4,0)
    + COALESCE(eneagrama_score_tipo_5,0) + COALESCE(eneagrama_score_tipo_6,0)
    + COALESCE(eneagrama_score_tipo_7,0) + COALESCE(eneagrama_score_tipo_8,0)
    + COALESCE(eneagrama_score_tipo_9,0) <= 10;

-- ------------------------------------------------------- admin_test_results
-- Gestor/admin faz os testes por este caminho. Sem limpar aqui, ele mantém o
-- resultado enviesado, não é convidado a refazer e ainda passa no gate dos 3
-- testes. Blindado com to_regclass para o caso da tabela não existir no ambiente.
DO $$
BEGIN
  IF to_regclass('public.admin_test_results') IS NULL THEN
    RAISE NOTICE 'admin_test_results não existe neste ambiente; pulando.';
    RETURN;
  END IF;

  INSERT INTO public.eneagrama_resultados_escala_antiga
    (origem, origem_id, tenant_id, identificacao, tipo_principal, scores, data_teste)
  SELECT 'admin_test_results', a.id::text, NULL, a.user_email, a.eneagrama_tipo_principal,
         jsonb_build_object(
           '1', a.eneagrama_score_tipo_1, '2', a.eneagrama_score_tipo_2, '3', a.eneagrama_score_tipo_3,
           '4', a.eneagrama_score_tipo_4, '5', a.eneagrama_score_tipo_5, '6', a.eneagrama_score_tipo_6,
           '7', a.eneagrama_score_tipo_7, '8', a.eneagrama_score_tipo_8, '9', a.eneagrama_score_tipo_9
         ),
         a.eneagrama_data_teste
  FROM public.admin_test_results a
  WHERE a.eneagrama_tipo_principal IS NOT NULL
    AND COALESCE(a.eneagrama_score_tipo_1,0) + COALESCE(a.eneagrama_score_tipo_2,0)
      + COALESCE(a.eneagrama_score_tipo_3,0) + COALESCE(a.eneagrama_score_tipo_4,0)
      + COALESCE(a.eneagrama_score_tipo_5,0) + COALESCE(a.eneagrama_score_tipo_6,0)
      + COALESCE(a.eneagrama_score_tipo_7,0) + COALESCE(a.eneagrama_score_tipo_8,0)
      + COALESCE(a.eneagrama_score_tipo_9,0) <= 10
  ON CONFLICT (origem, origem_id) DO NOTHING;

  UPDATE public.admin_test_results
  SET eneagrama_tipo_principal = NULL,
      eneagrama_score_tipo_1 = NULL, eneagrama_score_tipo_2 = NULL, eneagrama_score_tipo_3 = NULL,
      eneagrama_score_tipo_4 = NULL, eneagrama_score_tipo_5 = NULL, eneagrama_score_tipo_6 = NULL,
      eneagrama_score_tipo_7 = NULL, eneagrama_score_tipo_8 = NULL, eneagrama_score_tipo_9 = NULL,
      eneagrama_data_teste = NULL
  WHERE eneagrama_tipo_principal IS NOT NULL
    AND COALESCE(eneagrama_score_tipo_1,0) + COALESCE(eneagrama_score_tipo_2,0)
      + COALESCE(eneagrama_score_tipo_3,0) + COALESCE(eneagrama_score_tipo_4,0)
      + COALESCE(eneagrama_score_tipo_5,0) + COALESCE(eneagrama_score_tipo_6,0)
      + COALESCE(eneagrama_score_tipo_7,0) + COALESCE(eneagrama_score_tipo_8,0)
      + COALESCE(eneagrama_score_tipo_9,0) <= 10;
END $$;

COMMIT;

-- Conferência depois de aplicar:
--   SELECT origem, count(*) FROM public.eneagrama_resultados_escala_antiga GROUP BY origem;
--   -- nenhum resultado de escala antiga deve sobrar na tabela viva:
--   SELECT count(*) FROM public."Corretores"
--    WHERE eneagrama_tipo_principal IS NOT NULL
--      AND COALESCE(eneagrama_score_tipo_1,0)+COALESCE(eneagrama_score_tipo_2,0)
--        + COALESCE(eneagrama_score_tipo_3,0)+COALESCE(eneagrama_score_tipo_4,0)
--        + COALESCE(eneagrama_score_tipo_5,0)+COALESCE(eneagrama_score_tipo_6,0)
--        + COALESCE(eneagrama_score_tipo_7,0)+COALESCE(eneagrama_score_tipo_8,0)
--        + COALESCE(eneagrama_score_tipo_9,0) <= 10;  -- esperado: 0
