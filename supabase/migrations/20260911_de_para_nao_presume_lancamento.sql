-- =============================================================================
-- O de-para responde "QUAL é o código deste anúncio"; quem diz o que o lead é
-- passa a ser o CÓDIGO.
--
-- POR QUE
-- `lancamento_anuncios` nasceu com um pressuposto embutido: tudo que está lá é
-- lançamento. Isso valeu enquanto só lançamento entrava na tabela. A tela de
-- pendência (anúncio desconhecido → 1 clique) vai permitir amarrar um anúncio a
-- um imóvel PRONTO do cadastro — o anúncio 2886878809, por exemplo, é o AP001 —
-- e com a regra antiga esse lead entraria como 'lancamento', na seção errada do
-- Bolsão e na roleta do corretor errado.
--
-- A ORDEM NOVA, do fato mais específico para o mais genérico:
--   1. premissa de portal (Santa Ângela é lançamento) — regra de negócio explícita
--   2. código está no catálogo do tenant                → pronto (ou locacao)
--   3. código está no de-para                           → lancamento
--   4. regra base (20260815)
--
-- NADA MUDA HOJE: nenhum código do de-para ('L001'…'L031', 'RESERVA
-- CASTANHEIRA') existe em imoveis_locais/imoveis_corretores, conferido em
-- 11/set/2026. O passo 5 reprocessa o que mudar, e hoje não muda nada — é rede,
-- não migração de dado.
--
-- Depende de: 20260911_classificar_zap_por_catalogo.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.classificar_lead_com_lancamento(
  p_tenant uuid, p_codigo text, p_portal text, p_is_rent boolean, p_is_sale boolean
) RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base text := public.classificar_lead(p_codigo, p_portal, p_is_rent, p_is_sale);
BEGIN
  -- 1) Premissa de negócio do portal (hoje só Santa Ângela) continua soberana:
  --    ela afirma o ESTÁGIO independentemente de qualquer código.
  IF v_base = 'lancamento' THEN
    RETURN ARRAY['lancamento'];
  END IF;

  -- 2) O código é um imóvel do cadastro → pronto. Vem ANTES do de-para porque é
  --    a afirmação mais específica: não é "este anúncio é de lançamento", é
  --    "este código É este imóvel". O eixo de transação continua mandando
  --    quando existe (locação), e o caso ambíguo continua 'indefinido'.
  IF public.eh_codigo_catalogo(p_tenant, p_codigo) THEN
    RETURN ARRAY[coalesce(public.classificar_lead_transacao(p_is_rent, p_is_sale), 'pronto')];
  END IF;

  -- 3) Sobrou o de-para: código que não é imóvel nosso e está na tabela de
  --    anúncios é lançamento — é o caso do 'L014' e do 'RESERVA CASTANHEIRA'
  --    que chega do Meta (o portal 'Facebook' não se abstém, então sem este
  --    ramo o lead pago voltaria a 'pronto').
  IF public.eh_codigo_lancamento(p_tenant, p_codigo) THEN
    RETURN ARRAY['lancamento'];
  END IF;

  RETURN ARRAY[v_base];
END;
$$;

-- ---------- Prova ----------
DO $$
DECLARE
  v_tenant uuid; v_codigo text; v_lanc_tenant uuid; v_lanc text;
BEGIN
  SELECT tenant_id, codigo_imovel INTO v_tenant, v_codigo
    FROM public.imoveis_locais WHERE codigo_imovel IS NOT NULL LIMIT 1;
  SELECT tenant_id, codigo INTO v_lanc_tenant, v_lanc FROM public.lancamento_anuncios LIMIT 1;
  IF v_tenant IS NULL OR v_lanc IS NULL THEN
    RAISE EXCEPTION 'catálogo ou de-para vazios — nada a provar';
  END IF;

  -- O que esta migration existe para consertar: anúncio amarrado a imóvel pronto.
  ASSERT public.classificar_lead_com_lancamento(v_tenant, v_codigo, 'ZAP Imóveis', NULL, NULL)
         = ARRAY['pronto'];
  -- O que ela NÃO pode quebrar:
  ASSERT public.classificar_lead_com_lancamento(v_lanc_tenant, v_lanc, 'ZAP Imóveis', NULL, NULL)
         = ARRAY['lancamento'];
  -- lead pago do Meta: portal que NÃO se abstém + código de lançamento.
  ASSERT public.classificar_lead_com_lancamento(v_lanc_tenant, v_lanc, 'Facebook', NULL, NULL)
         = ARRAY['lancamento'];
  ASSERT public.classificar_lead_com_lancamento(v_lanc_tenant, v_lanc, 'Instagram', NULL, NULL)
         = ARRAY['lancamento'];
  -- premissa de portal soberana, com ou sem código de catálogo.
  ASSERT public.classificar_lead_com_lancamento(v_tenant, v_codigo, 'Santa Angela', NULL, NULL)
         = ARRAY['lancamento'];
  -- código do portal segue sem veredito; locação e ambíguo seguem iguais.
  ASSERT public.classificar_lead_com_lancamento(v_tenant, '110D1GD', 'ZAP Imóveis', NULL, NULL)
         = ARRAY['indefinido'];
  ASSERT public.classificar_lead_com_lancamento(v_tenant, v_codigo, 'ZAP Imóveis', true, false)
         = ARRAY['locacao'];
  ASSERT public.classificar_lead_com_lancamento(v_tenant, v_codigo, 'ZAP Imóveis', true, true)
         = ARRAY['indefinido'];
  ASSERT public.classificar_lead_com_lancamento(v_tenant, 'AP1139', 'Kenlo', false, true)
         = ARRAY['pronto'];
  ASSERT public.classificar_lead_com_lancamento('00000000-0000-0000-0000-000000000000'::uuid,
           v_codigo, 'ZAP Imóveis', NULL, NULL) = ARRAY['indefinido'];

  RAISE NOTICE 'de-para sem presuncao: 10 asserts OK';
END $$;

-- ---------- Reprocessamento (rede: hoje não muda nenhuma linha) ----------
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE tmp_reclass_depara ON COMMIT DROP AS
SELECT l.id,
       public.classificar_lead_com_lancamento(l.tenant_id, l.property_code, l.source, NULL, NULL) AS nova
  FROM public.leads l
 WHERE l.classification_source = 'automatic'
   AND l.classification IS DISTINCT FROM
       public.classificar_lead_com_lancamento(l.tenant_id, l.property_code, l.source, NULL, NULL);

UPDATE public.leads l SET classification = t.nova
  FROM tmp_reclass_depara t WHERE l.id = t.id;

-- Mesma razão da migration anterior: o guard carimba 'dashboard' em quem não é
-- service_role, e migration roda como postgres.
UPDATE public.leads l SET classification_source = 'automatic'
  FROM tmp_reclass_depara t
 WHERE l.id = t.id AND l.classification_source IS DISTINCT FROM 'automatic';

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM tmp_reclass_depara;
  RAISE NOTICE 'leads reclassificados: % (esperado 0 em 11/set)', v_n;
END $$;
COMMIT;

-- =============================================================================
-- ROLLBACK
--   Reaplique a definição de classificar_lead_com_lancamento da
--   20260911_classificar_zap_por_catalogo.sql (de-para antes do catálogo) e
--   rode de novo o bloco de reprocessamento acima — ele reconverge nos dois
--   sentidos (IS DISTINCT FROM).
-- =============================================================================
