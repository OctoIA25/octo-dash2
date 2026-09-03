-- =============================================================================
-- Classificação: reconhecer lançamento pelo de-para, e reclassificar no revive.
-- Depende de 20260903_lancamento_anuncios.sql.
--
-- DOIS PROBLEMAS, UM ARQUIVO (a mesma função de trigger resolve os dois):
--
-- 1) Lead de ZAP com código de lançamento continuava `indefinido`.
--    `classificar_lead_estagio` abstém todo lead de ZAP/OLX porque o código do
--    portal não identifica nada no catálogo (20260815, §4). Agora o webhook
--    grava 'L003' em vez de 'OFOUFJ', e um código que está em
--    `lancamento_anuncios` É, por definição, lançamento.
--
--    A consulta NÃO entra em `classificar_lead`: aquela função é IMMUTABLE de
--    propósito (é ela que os asserts provam sem tocar em tabela). Quem lê a
--    tabela é o trigger, que já é volátil por natureza.
--
-- 2) Lead REVIVIDO mantinha a classificação do lead anterior.
--    `insertOrReviveLead` (proxy-production.js) transforma cliente que volta
--    pelo mesmo telefone num UPDATE. Como a classificação automática só roda no
--    INSERT, o lead novo herdava o veredito do antigo. Medido no lead de teste
--    de 03/set/2026: chegou com `originListingId` de lançamento e ficou
--    `indefinido`/'dashboard' com carimbo de 16/ago — o do backfill.
--
--    ⚠️ A 20260815 diz "a classificação automática NUNCA roda em UPDATE. Não
--    adicione um trigger de UPDATE aqui por completude." Esta é a exceção que
--    aquele comentário não previu, e ela NÃO é por completude: no revive a
--    linha deixa de ser o mesmo lead (nome, origem, imóvel, corretor e mensagem
--    são todos reescritos). A decisão da Lia que está ali era sobre o lead
--    ANTERIOR; mantê-la é que seria o erro. O WHEN usa exatamente o mesmo sinal
--    de revive já consagrado em 20260805_enqueue_lead_revived_webhook.sql,
--    freio de 5 minutos incluído — não um `if` largo dentro da função.
-- =============================================================================

-- ---------- 1) "Este código é de lançamento?" ----------
-- STABLE (não IMMUTABLE): lê tabela. SECURITY DEFINER porque
-- `lancamento_anuncios` tem RLS ligada sem policy.
CREATE OR REPLACE FUNCTION public.eh_codigo_lancamento(p_tenant uuid, p_codigo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lancamento_anuncios a
     WHERE a.tenant_id = p_tenant
       -- coalesce → '' cobre o NULL: nenhum código cadastrado é vazio.
       AND a.codigo = upper(btrim(coalesce(p_codigo, '')))
  );
$$;

-- ---------- 2) Regra completa, num lugar só ----------
-- Usada pelos três triggers abaixo (INSERT em leads, INSERT em kenlo_leads,
-- revive em leads) para que não exista uma quarta versão da regra.
CREATE OR REPLACE FUNCTION public.classificar_lead_com_lancamento(
  p_tenant uuid, p_codigo text, p_portal text, p_is_rent boolean, p_is_sale boolean
) RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- O de-para vence a abstenção do portal: é informação positiva sobre o
  -- anúncio, não inferência. Locação não colide — lançamento não se aluga.
  IF public.eh_codigo_lancamento(p_tenant, p_codigo) THEN
    RETURN ARRAY['lancamento'];
  END IF;
  RETURN ARRAY[public.classificar_lead(p_codigo, p_portal, p_is_rent, p_is_sale)];
END;
$$;

-- ---------- 3) Triggers de entrada (mesmo contrato da 20260818) ----------
CREATE OR REPLACE FUNCTION public.tg_leads_classificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.classification := public.classificar_lead_com_lancamento(
    NEW.tenant_id, NEW.property_code, NEW.source, NULL, NULL);
  NEW.classification_source := 'automatic';
  NEW.classification_updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_kenlo_leads_classificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.classification := public.classificar_lead_com_lancamento(
    NEW.tenant_id, NEW.interest_reference, NEW.portal,
    NEW.interest_is_rent, NEW.interest_is_sale);
  NEW.classification_source := 'automatic';
  NEW.classification_updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------- 4) Revive ----------
CREATE OR REPLACE FUNCTION public.tg_leads_reclassificar_revive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.classification := public.classificar_lead_com_lancamento(
    NEW.tenant_id, NEW.property_code, NEW.source, NULL, NULL);
  NEW.classification_source := 'automatic';
  NEW.classification_updated_at := now();
  RETURN NEW;
END;
$$;

-- O NOME importa: triggers de mesmo timing disparam em ordem alfabética, e
-- 'tr_leads_reclassificar_revive' vem DEPOIS de 'tr_leads_classification_guard'.
-- Quando o guard roda, NEW.classification ainda é a antiga (o UPDATE do revive
-- não cita a coluna), o WHEN dele é falso e ele não carimba 'dashboard'. Renomear
-- este trigger para algo que ordene antes reintroduz exatamente o bug de origem
-- errada que esta migration conserta.
DROP TRIGGER IF EXISTS tr_leads_reclassificar_revive ON public.leads;
CREATE TRIGGER tr_leads_reclassificar_revive
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  WHEN (NEW.created_at IS DISTINCT FROM OLD.created_at
        AND NEW.created_at >= now() - interval '5 minutes')
  EXECUTE FUNCTION public.tg_leads_reclassificar_revive();

-- kenlo_leads não tem revive: o engine de sync faz upsert por chave própria,
-- não reescreve created_at. Mesmo motivo pelo qual a 20260805 não criou trigger lá.

-- ---------- 5) Prova: roda AGORA, aborta a migration se quebrar ----------
DO $$
DECLARE
  v_tenant uuid;
  v_codigo text;
BEGIN
  SELECT tenant_id, codigo INTO v_tenant, v_codigo
    FROM public.lancamento_anuncios LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'lancamento_anuncios vazia — aplique 20260903_lancamento_anuncios.sql antes';
  END IF;

  -- O caso que motivou tudo: código de lançamento, portal que a regra abstém.
  ASSERT public.classificar_lead_com_lancamento(v_tenant, v_codigo, 'ZAP Imóveis', NULL, NULL)
         = ARRAY['lancamento'];
  -- Espaço e caixa não podem derrubar o de-para.
  ASSERT public.eh_codigo_lancamento(v_tenant, '  ' || lower(v_codigo) || ' ');
  -- Código fora do de-para segue exatamente como antes desta migration.
  ASSERT public.classificar_lead_com_lancamento(v_tenant, 'OFOUFJ', 'ZAP Imóveis', NULL, NULL)
         = ARRAY['indefinido'];
  ASSERT public.classificar_lead_com_lancamento(v_tenant, 'AP1139', 'Kenlo', false, true)
         = ARRAY['pronto'];
  ASSERT public.classificar_lead_com_lancamento(v_tenant, 'CA0898', 'Cliquei Mudei', true, false)
         = ARRAY['locacao'];
  -- Código nulo/vazio não pode casar com o de-para por acidente.
  ASSERT NOT public.eh_codigo_lancamento(v_tenant, NULL);
  ASSERT NOT public.eh_codigo_lancamento(v_tenant, '');
  -- Isolamento entre tenants: o mesmo código em outro tenant não é lançamento.
  ASSERT NOT public.eh_codigo_lancamento('00000000-0000-0000-0000-000000000000'::uuid, v_codigo);

  RAISE NOTICE 'classificacao lancamento: 8 asserts OK';
END $$;

-- =============================================================================
-- ROLLBACK
--   DROP TRIGGER IF EXISTS tr_leads_reclassificar_revive ON public.leads;
--   DROP FUNCTION IF EXISTS public.tg_leads_reclassificar_revive();
--   DROP FUNCTION IF EXISTS public.classificar_lead_com_lancamento(uuid, text, text, boolean, boolean);
--   DROP FUNCTION IF EXISTS public.eh_codigo_lancamento(uuid, text);
--   -- e reaplicar a §5 de 20260818_lead_classification_multi.sql para voltar
--   -- tg_leads_classificar/tg_kenlo_leads_classificar à versão sem de-para.
-- =============================================================================
