-- =============================================================================
-- Backfill da classificação. Depende das duas migrations anteriores.
--
-- ⚠️ APLICAR COM OS SCHEDULERS DE SYNC PAUSADOS (KENLO_SYNC_SCHEDULER,
--    CONTACT2SALE_SYNC_SCHEDULER, SANTA_ANGELA_SYNC_SCHEDULER). O backfill trava
--    linhas na ordem do scan; os triggers de mirror travam as mesmas na ordem do
--    lote do sync. Conjuntos sobrepostos em ordens diferentes dão DEADLOCK, e
--    `lock_timeout` NÃO protege contra isso — o detector dispara antes (1s).
--
-- ⚠️ FORA DO HORÁRIO DE PICO. Em 28/jul este Supabase ficou unhealthy por
--    varredura paralela em kenlo_leads (~85k linhas).
--
-- Idempotente: `WHERE classification IS NULL` nas fontes garante que rodar de
-- novo não pisa em classificação feita pela Lia ou pelo corretor.
--
-- Cada UPDATE em sua PRÓPRIA transação: numa transação só, os row locks do
-- primeiro ficariam presos durante todo o resto, dobrando a janela de contenção
-- com o sync sem ganho nenhum. São independentes e idempotentes.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.kenlo_leads
   SET classification = public.classificar_lead(
         interest_reference, portal, interest_is_rent, interest_is_sale),
       classification_source = 'automatic',
       classification_updated_at = now()
 WHERE classification IS NULL;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.leads
   SET classification = public.classificar_lead(property_code, source, NULL, NULL),
       classification_source = 'automatic',
       classification_updated_at = now()
 WHERE classification IS NULL;
COMMIT;

-- Espelho: IS DISTINCT FROM cobre os dois sentidos (preenche o que faltou E
-- corrige o que divergiu). Usa os índices únicos parciais que já existem.
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.bolsao b
   SET classification = l.classification
  FROM public.leads l
 WHERE b.source_lead_id = l.id
   AND b.classification IS DISTINCT FROM l.classification;
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE public.bolsao b
   SET classification = k.classification
  FROM public.kenlo_leads k
 WHERE b.source_kenlo_id = k.id
   AND b.classification IS DISTINCT FROM k.classification;
COMMIT;

-- ---------- Conferência (rodar à mão depois) ----------
--   SELECT classification, count(*) FROM public.kenlo_leads GROUP BY 1 ORDER BY 2 DESC;
--     esperado: locacao ≈ 44.590 | indefinido inclui os 250 ambíguos | NULL = 0
--     (44.590 = 35.720 com interest_is_sale=false + 8.870 com interest_is_sale IS NULL;
--      `is_sale IS NULL` É locação — só is_rent E is_sale ambos true viram indefinido)
--   SELECT count(*) FROM public.leads WHERE classification IS NULL;        -- 0
--   SELECT count(*) FROM public.bolsao b JOIN public.leads l ON b.source_lead_id = l.id
--    WHERE b.classification IS DISTINCT FROM l.classification;             -- 0
--   SELECT count(*) FROM public.bolsao b JOIN public.kenlo_leads k ON b.source_kenlo_id = k.id
--    WHERE b.classification IS DISTINCT FROM k.classification;             -- 0
--   -- invariante do sinal, deve continuar 0:
--   SELECT count(*) FROM public.kenlo_leads
--    WHERE interest_is_rent IS FALSE AND interest_type = 'Aluguel';        -- 0
--
-- ROLLBACK
-- --------
-- Full rollback: drop the columns. See 20260815_add_lead_classification.sql ROLLBACK.
--
-- Partial undo (early window only, before Task 2 INSERT triggers go live):
-- After Task 2 is live, classification_source = 'automatic' appears on every new INSERT,
-- so you can no longer tell backfilled rows from newly-inserted ones. Undo only works
-- in the window before new leads arrive. Use classification_updated_at to scope it:
--
-- For public.kenlo_leads:
--   - Set classification = NULL
--   - Where classification_source = 'automatic'
--   - And classification_updated_at between backfill start and completion times
--
-- For public.leads:
--   - Same as above
--
-- For public.bolsao:
--   - Has no classification_source column and no timestamp. Cannot be scoped by time.
--   - To restore after reverting the source tables, re-run the two mirror UPDATEs
--     from this file (they use IS DISTINCT FROM, so they re-converge both directions).
-- =============================================================================
