-- =============================================================================
-- Sincroniza `bolsao.codigo` com o código da linha de origem.
--
-- PROBLEMA
-- O espelho leads/kenlo_leads -> bolsao só copia o código no INSERT
-- (tg_mirror_leads_to_bolsao / tg_mirror_kenlo_leads_to_bolsao). O sync do
-- Santa Ângela preenche `leads.property_code` DEPOIS, num UPDATE — então o
-- espelho nasce sem código e nunca recebe. Medido em 12/ago no tenant Japi
-- Lançamentos: de 110 linhas de bolsão cujo lead tem property_code, 109
-- estavam com `codigo` nulo.
--
-- O inverso também acontece: 14 linhas mantêm `codigo` de um valor que a
-- origem já limpou — em sua maioria CPFs que o Santa Ângela vazava no campo
-- antes do fix de 05/ago (ex.: '32328077803'), mais um 'AP001' do ZAP.
--
-- Este arquivo é SÓ ADITIVO: cria duas funções e dois triggers novos, com
-- nomes próprios. Não recria nenhuma função de mirror existente — as vigentes
-- são as de 20260428_fix_bolsao_triggers_and_add_server_expiration.sql (leads)
-- e 20260427_mirror_leads_and_kenlo_into_bolsao.sql (kenlo_leads).
--
-- Consumidor: a classificação lançamento/pronto lida na tela do Bolsão compara
-- `bolsao.codigo` com `lancamentos.nome`. Sem esta sincronia ela não enxerga
-- nada. Ver docs/superpowers/specs/2026-08-12-classificacao-lead-bolsao-design.md
--
-- ⚠️ ORDEM DE DEPLOY: aplicar ANTES do deploy do front. O front só lê `codigo`;
--    sem a migration ele não quebra — as linhas que a migration ainda não tocou
--    ficam `indefinido` (fail-open) e a feature simplesmente não tem efeito.
--
-- ⚠️ APLICAR COM OS SCHEDULERS DE SYNC PAUSADOS (KENLO_SYNC_SCHEDULER,
--    CONTACT2SALE_SYNC_SCHEDULER, SANTA_ANGELA_SYNC_SCHEDULER). O backfill trava
--    linhas de bolsao na ordem do scan; os triggers de mirror já existentes
--    travam as mesmas linhas na ordem do lote do sync. Conjuntos sobrepostos em
--    ordens diferentes podem dar deadlock — o Postgres aborta um dos dois e
--    reporta o erro. Não há perda permanente (o backfill é idempotente e o sync
--    reemite o patch no ciclo seguinte), mas é ruído evitável numa janela de
--    segundos. `lock_timeout` NÃO protege contra deadlock: ele limita a espera
--    por lock, e o detector de deadlock dispara antes (deadlock_timeout = 1s).
-- =============================================================================

-- ---------- 1) leads.property_code -> bolsao.codigo ----------
CREATE OR REPLACE FUNCTION public.tg_leads_codigo_to_bolsao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Propaga inclusive NULL: quando a origem limpa o código, o espelho limpa
  -- junto. É o que impede o espelho de guardar CPF/código morto para sempre.
  UPDATE public.bolsao
     SET codigo = NEW.property_code
   WHERE source_lead_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_leads_codigo_to_bolsao ON public.leads;
CREATE TRIGGER tr_leads_codigo_to_bolsao
  AFTER UPDATE OF property_code ON public.leads
  FOR EACH ROW
  WHEN (OLD.property_code IS DISTINCT FROM NEW.property_code)
  EXECUTE FUNCTION public.tg_leads_codigo_to_bolsao();

-- ---------- 2) kenlo_leads.interest_reference -> bolsao.codigo ----------
CREATE OR REPLACE FUNCTION public.tg_kenlo_leads_codigo_to_bolsao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bolsao
     SET codigo = NEW.interest_reference
   WHERE source_kenlo_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_kenlo_leads_codigo_to_bolsao ON public.kenlo_leads;
CREATE TRIGGER tr_kenlo_leads_codigo_to_bolsao
  AFTER UPDATE OF interest_reference ON public.kenlo_leads
  FOR EACH ROW
  WHEN (OLD.interest_reference IS DISTINCT FROM NEW.interest_reference)
  EXECUTE FUNCTION public.tg_kenlo_leads_codigo_to_bolsao();

-- ---------- 3) Backfill: espelho de verdade, não só onde está NULL ----------
-- `IS DISTINCT FROM` cobre os dois sentidos: preenche o que faltou E zera o
-- que a origem já limpou. Um backfill só-de-NULL nunca alcançaria as 14 linhas
-- com CPF, que têm `codigo` preenchido e origem vazia.
--
-- Forma `UPDATE ... FROM`: o join usa os índices únicos parciais
-- bolsao_source_lead_id_uniq / bolsao_source_kenlo_id_uniq, que já existem.
-- Linhas de bolsão sem source_lead_id nem source_kenlo_id (legado anterior ao
-- espelhamento) não são tocadas — não há origem para espelhar.
--
-- Volume em 12/ago: ~79k linhas em bolsao, ~3,4k em leads, ~84k em kenlo_leads.
-- O UPDATE só escreve onde há diferença real.

-- Cada UPDATE em sua PRÓPRIA transação, de propósito: numa transação só, os row
-- locks do primeiro ficariam presos durante todo o segundo, dobrando a janela de
-- contenção com o sync sem ganho nenhum. Os dois são independentes e idempotentes,
-- então não há estado intermediário inconsistente a proteger.

BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.bolsao b
   SET codigo = l.property_code
  FROM public.leads l
 WHERE b.source_lead_id = l.id
   AND b.codigo IS DISTINCT FROM l.property_code;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.bolsao b
   SET codigo = k.interest_reference
  FROM public.kenlo_leads k
 WHERE b.source_kenlo_id = k.id
   AND b.codigo IS DISTINCT FROM k.interest_reference;
COMMIT;

-- ---------- 4) Conferência (rodar à mão depois de aplicar) ----------
-- Nenhuma divergência deve sobrar:
--
--   SELECT count(*) AS divergentes_leads
--     FROM public.bolsao b JOIN public.leads l ON b.source_lead_id = l.id
--    WHERE b.codigo IS DISTINCT FROM l.property_code;
--
--   SELECT count(*) AS divergentes_kenlo
--     FROM public.bolsao b JOIN public.kenlo_leads k ON b.source_kenlo_id = k.id
--    WHERE b.codigo IS DISTINCT FROM k.interest_reference;
--
-- Sanidade no tenant Japi Lançamentos (65c69875-dc83-4062-90f6-6f6adc30df26),
-- sobre as 231 linhas com status='bolsao', esperado após o backfill:
--   145 casam com lancamentos.nome ('RESERVA CASTANHEIRA')
--     2 com código de catálogo próprio (Manual, TESTE)
--    84 sem código ou com código de namespace opaco (ZAP/OLX, Santa Ângela)
--
-- =============================================================================
-- ROLLBACK
--   DROP TRIGGER IF EXISTS tr_leads_codigo_to_bolsao ON public.leads;
--   DROP TRIGGER IF EXISTS tr_kenlo_leads_codigo_to_bolsao ON public.kenlo_leads;
--   DROP FUNCTION IF EXISTS public.tg_leads_codigo_to_bolsao();
--   DROP FUNCTION IF EXISTS public.tg_kenlo_leads_codigo_to_bolsao();
--
--   O backfill NÃO é revertido por este rollback: ele apenas alinhou o espelho
--   com a origem, que é o estado correto. Os códigos órfãos que ele apagou
--   (CPFs) não são recuperáveis nem desejáveis.
-- =============================================================================
