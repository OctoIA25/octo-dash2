-- =============================================================================
-- Lead de ZAP/OLX com código do NOSSO catálogo deixa de ser 'indefinido'.
--
-- POR QUE AGORA
-- A abstenção de ZAP/OLX (20260815 §4) foi escrita quando todo código de ZAP era
-- o id do anúncio no portal ('S1KUFJ') e não identificava nada no catálogo.
-- Desde o feed VRSync isso mudou para o anúncio publicado por nós: o portal
-- devolve `clientListingId` = o nosso `codigo_imovel`. Medido em 11/set/2026 no
-- tenant Lotus Brokers: AP679, AP677, AP0685 e CA0056 chegaram com o código
-- certo e ficaram 'indefinido' à toa; 'S1KUFJ' e companhia continuam sendo o
-- caso que a abstenção protege.
--
-- A REGRA QUE MUDA É SÓ ESTA: código que EXISTE no catálogo do tenant é
-- informação positiva sobre o imóvel, exatamente como o de-para de lançamento
-- já é sobre o anúncio (20260903). Nada aqui infere imóvel a partir de texto.
--
-- ORDEM IMPORTA: o catálogo só entra quando a regra base SE ABSTEVE. Assim a
-- premissa "Santa Ângela é lançamento" e o de-para continuam vencendo — o
-- catálogo nunca rebaixa um veredito positivo, só preenche o vazio.
--
-- Depende de: 20260903_classificacao_lancamento_e_revive.sql
-- =============================================================================

-- ---------- 1) "Este código existe no catálogo do tenant?" ----------
-- STABLE (lê tabela, não é IMMUTABLE como classificar_lead) e SECURITY DEFINER
-- pela mesma razão de eh_codigo_lancamento: as tabelas têm RLS. Devolve boolean,
-- nunca dado do catálogo.
--
-- As DUAS tabelas, como resolvePropertyExclusivity já consulta (api-server.js):
-- imóvel de corretor é imóvel pronto igual. Comparação contra a coluna CRUA de
-- propósito — o código é gravado em MAIÚSCULO pela rota (`codigoNormalizado`),
-- verificado em 11/set (651 linhas, nenhuma fora do padrão) — para o índice de
-- (tenant_id, codigo_imovel) continuar servindo.
CREATE OR REPLACE FUNCTION public.eh_codigo_catalogo(p_tenant uuid, p_codigo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT upper(btrim(coalesce(p_codigo, ''))) <> ''
     AND (EXISTS (SELECT 1 FROM public.imoveis_locais i
                   WHERE i.tenant_id = p_tenant
                     AND i.codigo_imovel = upper(btrim(p_codigo)))
       OR EXISTS (SELECT 1 FROM public.imoveis_corretores c
                   WHERE c.tenant_id = p_tenant
                     AND c.codigo_imovel = upper(btrim(p_codigo))));
$$;

-- ---------- 2) A regra completa, ainda num lugar só ----------
CREATE OR REPLACE FUNCTION public.classificar_lead_com_lancamento(
  p_tenant uuid, p_codigo text, p_portal text, p_is_rent boolean, p_is_sale boolean
) RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_base text;
BEGIN
  -- De-para do anúncio primeiro: ele responde "que anúncio é este?", pergunta
  -- mais específica que "este código existe?".
  IF public.eh_codigo_lancamento(p_tenant, p_codigo) THEN
    RETURN ARRAY['lancamento'];
  END IF;

  v_base := public.classificar_lead(p_codigo, p_portal, p_is_rent, p_is_sale);

  -- Só preenche abstenção. O 'indefinido' do caso ambíguo (imóvel anunciado
  -- para venda E locação) não é afetado: ele volta igual pelo eixo de transação.
  IF v_base = 'indefinido' AND public.eh_codigo_catalogo(p_tenant, p_codigo) THEN
    RETURN ARRAY[coalesce(public.classificar_lead_transacao(p_is_rent, p_is_sale), 'pronto')];
  END IF;

  RETURN ARRAY[v_base];
END;
$$;

-- ---------- 3) Prova: roda AGORA, aborta a migration se quebrar ----------
DO $$
DECLARE
  v_tenant uuid;
  v_codigo text;
  v_lanc_tenant uuid;
  v_lanc text;
BEGIN
  SELECT tenant_id, codigo_imovel INTO v_tenant, v_codigo
    FROM public.imoveis_locais WHERE codigo_imovel IS NOT NULL LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'imoveis_locais vazia — nada a provar';
  END IF;

  -- O caso que motivou tudo: código do nosso feed, portal que a regra abstinha.
  ASSERT public.classificar_lead_com_lancamento(v_tenant, v_codigo, 'ZAP Imóveis', NULL, NULL)
         = ARRAY['pronto'];
  ASSERT public.classificar_lead_com_lancamento(v_tenant, '  ' || lower(v_codigo) || ' ', 'Grupo OLX', NULL, NULL)
         = ARRAY['pronto'];
  -- Código do portal (o que a abstenção existe para proteger) NÃO muda.
  ASSERT public.classificar_lead_com_lancamento(v_tenant, '110D1GD', 'ZAP Imóveis', NULL, NULL)
         = ARRAY['indefinido'];
  ASSERT public.classificar_lead_com_lancamento(v_tenant, NULL, 'ZAP Imóveis', NULL, NULL)
         = ARRAY['indefinido'];
  -- Sinal de locação continua vencendo 'pronto'; ambíguo continua indefinido.
  ASSERT public.classificar_lead_com_lancamento(v_tenant, v_codigo, 'ZAP Imóveis', true, false)
         = ARRAY['locacao'];
  ASSERT public.classificar_lead_com_lancamento(v_tenant, v_codigo, 'ZAP Imóveis', true, true)
         = ARRAY['indefinido'];
  -- Isolamento entre tenants: catálogo de um não classifica lead do outro.
  ASSERT public.classificar_lead_com_lancamento('00000000-0000-0000-0000-000000000000'::uuid,
           v_codigo, 'ZAP Imóveis', NULL, NULL) = ARRAY['indefinido'];
  -- Premissa de negócio e de-para não são rebaixados pelo catálogo.
  ASSERT public.classificar_lead_com_lancamento(v_tenant, v_codigo, 'Santa Angela', NULL, NULL)
         = ARRAY['lancamento'];
  SELECT tenant_id, codigo INTO v_lanc_tenant, v_lanc FROM public.lancamento_anuncios LIMIT 1;
  IF v_lanc IS NOT NULL THEN
    ASSERT public.classificar_lead_com_lancamento(v_lanc_tenant, v_lanc, 'ZAP Imóveis', NULL, NULL)
           = ARRAY['lancamento'];
  END IF;
  -- Portal sem abstenção segue exatamente como antes.
  ASSERT public.classificar_lead_com_lancamento(v_tenant, 'AP1139', 'Kenlo', false, true)
         = ARRAY['pronto'];

  RAISE NOTICE 'classificacao por catalogo: 10 asserts OK';
END $$;

-- ---------- 4) Reprocessamento das linhas automáticas ----------
-- `classification_source = 'automatic'` é a regra de precedência da 20260815:
-- reprocessamento NUNCA pisa em decisão do corretor ('dashboard') ou da Lia.
-- Só entram as linhas que a regra nova realmente muda.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE tmp_reclass_catalogo ON COMMIT DROP AS
SELECT l.id,
       public.classificar_lead_com_lancamento(l.tenant_id, l.property_code, l.source, NULL, NULL) AS nova
  FROM public.leads l
 WHERE l.classification_source = 'automatic'
   AND l.classification IS DISTINCT FROM
       public.classificar_lead_com_lancamento(l.tenant_id, l.property_code, l.source, NULL, NULL);

UPDATE public.leads l
   SET classification = t.nova
  FROM tmp_reclass_catalogo t
 WHERE l.id = t.id;

-- O guard (tg_classification_source_guard) carimba 'dashboard' em quem não é
-- service_role — e uma migration roda como postgres. Sem este segundo UPDATE o
-- reprocessamento automático se disfarçaria de decisão humana e ficaria imune ao
-- próximo. Ele não cita `classification`, então o guard não dispara de novo.
UPDATE public.leads l
   SET classification_source = 'automatic'
  FROM tmp_reclass_catalogo t
 WHERE l.id = t.id
   AND l.classification_source IS DISTINCT FROM 'automatic';

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM tmp_reclass_catalogo;
  RAISE NOTICE 'leads reclassificados: %', v_n;
END $$;
COMMIT;

-- kenlo_leads fica de fora de propósito: o catálogo do Kenlo não é espelhado
-- neste banco (verificado em 11/set — CA1116/AP1327 não existem em
-- imoveis_locais nem em imoveis_corretores), então eh_codigo_catalogo seria
-- sempre falso e o UPDATE varreria ~85k linhas para não mudar nada. O lead de
-- ZAP que chega VIA Kenlo continua 'indefinido' — o código dele é confiável (vem
-- do CRM, não do portal), mas não há como conferir isso aqui. Decisão separada.

-- ---------- Conferência (rodar à mão depois de aplicar) ----------
--   SELECT classification, count(*) FROM public.leads
--    WHERE source ILIKE '%zap%' GROUP BY 1 ORDER BY 2 DESC;
--   -- nenhum lead com código do catálogo pode continuar indefinido:
--   SELECT count(*) FROM public.leads l
--    WHERE l.classification_source = 'automatic'
--      AND l.classification = ARRAY['indefinido']
--      AND public.eh_codigo_catalogo(l.tenant_id, l.property_code);   -- 0
--
-- =============================================================================
-- ROLLBACK
--   -- 1) Volta a função à versão da 20260903 (sem o ramo do catálogo):
--   CREATE OR REPLACE FUNCTION public.classificar_lead_com_lancamento(
--     p_tenant uuid, p_codigo text, p_portal text, p_is_rent boolean, p_is_sale boolean
--   ) RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
--   BEGIN
--     IF public.eh_codigo_lancamento(p_tenant, p_codigo) THEN RETURN ARRAY['lancamento']; END IF;
--     RETURN ARRAY[public.classificar_lead(p_codigo, p_portal, p_is_rent, p_is_sale)];
--   END;
--   $f$;
--   DROP FUNCTION IF EXISTS public.eh_codigo_catalogo(uuid, text);
--   -- 2) Reaplique o passo 4 com a função antiga no lugar: ele reconverge as
--   --    linhas 'automatic' nos dois sentidos (IS DISTINCT FROM).
-- =============================================================================
