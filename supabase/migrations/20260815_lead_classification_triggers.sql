-- =============================================================================
-- Triggers da classificação de lead. Depende de 20260815_add_lead_classification.
--
-- Três responsabilidades, deliberadamente separadas:
--   1. classificar na ENTRADA (BEFORE INSERT nas duas fontes)
--   2. impedir que o browser se passe pela Lia (BEFORE UPDATE, guard de origem)
--   3. espelhar o valor no bolsão (BEFORE INSERT no bolsão + AFTER UPDATE nas fontes)
--
-- ⚠️ A classificação automática NUNCA roda em UPDATE. É isso — e não um `if` —
--    que garante que ela não sobrescreva a Lia. Não adicione um trigger de
--    UPDATE aqui "por completude".
-- =============================================================================

-- ---------- 1) Classificação na entrada ----------
-- Sobrescreve incondicionalmente o que vier do cliente: o CriarLeadQuickModal
-- insere direto do browser, então `classification` do payload não é confiável.
CREATE OR REPLACE FUNCTION public.tg_leads_classificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- `leads` não tem sinal de venda/locação: medido em 15/ago, property_type
  -- preenchido em 1 de 3.690 linhas e custom_fields->>interest_is_rent em 0.
  NEW.classification := public.classificar_lead(NEW.property_code, NEW.source, NULL, NULL);
  NEW.classification_source := 'automatic';
  NEW.classification_updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_leads_classificar ON public.leads;
CREATE TRIGGER tr_leads_classificar
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_leads_classificar();

CREATE OR REPLACE FUNCTION public.tg_kenlo_leads_classificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.classification := public.classificar_lead(
    NEW.interest_reference, NEW.portal, NEW.interest_is_rent, NEW.interest_is_sale);
  NEW.classification_source := 'automatic';
  NEW.classification_updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_kenlo_leads_classificar ON public.kenlo_leads;
CREATE TRIGGER tr_kenlo_leads_classificar
  BEFORE INSERT ON public.kenlo_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_kenlo_leads_classificar();

-- ---------- 2) Guard de origem ----------
-- SECURITY INVOKER (default) DE PROPÓSITO: com SECURITY DEFINER, current_user
-- vira o dono da função e o guard nunca enxergaria o chamador real.
-- A função só mexe em NEW, então não precisa de privilégio nenhum.
CREATE OR REPLACE FUNCTION public.tg_classification_source_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Servidor (service_role) mantém o que setou: 'lia' na rota da IA.
  -- Qualquer outro chamador — browser com JWT de usuário — vira 'dashboard',
  -- não importa o que tenha mandado no payload.
  IF coalesce(auth.role(), current_user) IS DISTINCT FROM 'service_role' THEN
    NEW.classification_source := 'dashboard';
  END IF;
  NEW.classification_updated_at := now();
  RETURN NEW;
END;
$$;

-- WHEN (...IS DISTINCT FROM...) não é detalhe: sem ele, o upsert do
-- crmSync/engine.js — que faz UPDATE sem tocar em classification — reescreveria
-- o source da Lia para 'dashboard' a cada ciclo de sync.
DROP TRIGGER IF EXISTS tr_leads_classification_guard ON public.leads;
CREATE TRIGGER tr_leads_classification_guard
  BEFORE UPDATE OF classification ON public.leads
  FOR EACH ROW
  WHEN (NEW.classification IS DISTINCT FROM OLD.classification)
  EXECUTE FUNCTION public.tg_classification_source_guard();

DROP TRIGGER IF EXISTS tr_kenlo_leads_classification_guard ON public.kenlo_leads;
CREATE TRIGGER tr_kenlo_leads_classification_guard
  BEFORE UPDATE OF classification ON public.kenlo_leads
  FOR EACH ROW
  WHEN (NEW.classification IS DISTINCT FROM OLD.classification)
  EXECUTE FUNCTION public.tg_classification_source_guard();

-- ---------- 3a) Espelho: herança no INSERT do próprio bolsão ----------
-- Roda no INSERT do bolsão, quando a linha de origem JÁ EXISTE por definição.
-- Um AFTER INSERT nas tabelas fonte seria frágil: triggers AFTER disparam em
-- ordem alfabética de nome, e este poderia rodar ANTES do mirror, atualizando
-- uma linha de bolsao que ainda não existe — falha calada.
CREATE OR REPLACE FUNCTION public.tg_bolsao_herda_classificacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source_lead_id IS NOT NULL THEN
    SELECT l.classification INTO NEW.classification
      FROM public.leads l WHERE l.id = NEW.source_lead_id;
  ELSIF NEW.source_kenlo_id IS NOT NULL THEN
    SELECT k.classification INTO NEW.classification
      FROM public.kenlo_leads k WHERE k.id = NEW.source_kenlo_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_bolsao_herda_classificacao ON public.bolsao;
CREATE TRIGGER tr_bolsao_herda_classificacao
  BEFORE INSERT ON public.bolsao
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_bolsao_herda_classificacao();

-- ---------- 3b) Espelho: propagação das mudanças posteriores ----------
-- Molde da 20260812_sync_bolsao_codigo.sql, inclusive propagar NULL.
CREATE OR REPLACE FUNCTION public.tg_leads_classification_to_bolsao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.bolsao SET classification = NEW.classification
   WHERE source_lead_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_leads_classification_to_bolsao ON public.leads;
CREATE TRIGGER tr_leads_classification_to_bolsao
  AFTER UPDATE OF classification ON public.leads
  FOR EACH ROW
  WHEN (NEW.classification IS DISTINCT FROM OLD.classification)
  EXECUTE FUNCTION public.tg_leads_classification_to_bolsao();

CREATE OR REPLACE FUNCTION public.tg_kenlo_leads_classification_to_bolsao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.bolsao SET classification = NEW.classification
   WHERE source_kenlo_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_kenlo_leads_classification_to_bolsao ON public.kenlo_leads;
CREATE TRIGGER tr_kenlo_leads_classification_to_bolsao
  AFTER UPDATE OF classification ON public.kenlo_leads
  FOR EACH ROW
  WHEN (NEW.classification IS DISTINCT FROM OLD.classification)
  EXECUTE FUNCTION public.tg_kenlo_leads_classification_to_bolsao();

-- =============================================================================
-- ROLLBACK
--   DROP TRIGGER IF EXISTS tr_leads_classificar ON public.leads;
--   DROP TRIGGER IF EXISTS tr_kenlo_leads_classificar ON public.kenlo_leads;
--   DROP TRIGGER IF EXISTS tr_leads_classification_guard ON public.leads;
--   DROP TRIGGER IF EXISTS tr_kenlo_leads_classification_guard ON public.kenlo_leads;
--   DROP TRIGGER IF EXISTS tr_bolsao_herda_classificacao ON public.bolsao;
--   DROP TRIGGER IF EXISTS tr_leads_classification_to_bolsao ON public.leads;
--   DROP TRIGGER IF EXISTS tr_kenlo_leads_classification_to_bolsao ON public.kenlo_leads;
--   DROP FUNCTION IF EXISTS public.tg_leads_classificar();
--   DROP FUNCTION IF EXISTS public.tg_kenlo_leads_classificar();
--   DROP FUNCTION IF EXISTS public.tg_classification_source_guard();
--   DROP FUNCTION IF EXISTS public.tg_bolsao_herda_classificacao();
--   DROP FUNCTION IF EXISTS public.tg_leads_classification_to_bolsao();
--   DROP FUNCTION IF EXISTS public.tg_kenlo_leads_classification_to_bolsao();
-- =============================================================================
