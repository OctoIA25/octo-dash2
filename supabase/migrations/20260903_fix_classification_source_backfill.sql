-- =============================================================================
-- Conserta a origem das linhas classificadas pelo backfill de 16/ago/2026.
--
-- O QUE ACONTECEU
-- 20260815_backfill_lead_classification.sql faz
--   UPDATE ... SET classification = ..., classification_source = 'automatic'
-- mas o UPDATE dispara `tr_leads_classification_guard`, que reescreve a origem
-- para 'dashboard' sempre que o chamador não é service_role. Rodando a migration
-- pelo SQL editor do Supabase o chamador é `postgres` — então TODA linha do
-- backfill saiu marcada como decisão humana.
--
-- POR QUE IMPORTA
-- A regra de precedência da 20260815 diz, em letras maiúsculas, que qualquer
-- reprocessamento futuro deve filtrar `WHERE classification_source = 'automatic'`
-- para não pisar no que a Lia ou o corretor decidiram. Com o carimbo errado, o
-- reprocessamento pula exatamente as linhas que ele deveria corrigir — e as
-- decisões humanas de verdade ficam indistinguíveis das automáticas.
--
-- ⚠️ APLICAR FORA DO HORÁRIO DE PICO E COM OS SCHEDULERS DE SYNC PAUSADOS
-- (KENLO_SYNC_SCHEDULER, CONTACT2SALE_SYNC_SCHEDULER, SANTA_ANGELA_SYNC_SCHEDULER),
-- pelas MESMAS razões da 20260815_backfill_lead_classification.sql: são as mesmas
-- tabelas, e `kenlo_leads` tem ~85k linhas — em 28/jul este Supabase já ficou
-- unhealthy por varredura pesada nela. Medido em 03/set/2026: 3.364 linhas em
-- `leads` e 84.611 em `kenlo_leads` com origem 'dashboard'.
--
-- O RECORTE
-- O backfill roda numa transação só, então `now()` é idêntico até o microssegundo
-- em todas as linhas que ele tocou. Esse timestamp exato É o recorte: nenhuma
-- edição humana cai no mesmo microssegundo. Não filtramos por data aproximada.
--
-- As duas tabelas compartilham o MESMO timestamp mesmo o backfill tendo um
-- BEGIN/COMMIT por tabela: o SQL editor do Supabase roda o script inteiro numa
-- transação só, e `now()` é o início da transação. É também a prova de que o
-- backfill rodou por lá — e não como service_role.
--
-- ⚠️ CONFIRA O TIMESTAMP ANTES DE RODAR. O valor abaixo foi medido neste banco
-- (Lotus Brokers, 03/set/2026); noutro ambiente o backfill terá outro. A query
-- de conferência no fim mostra os candidatos.
--
-- Não dispara o guard: ele é BEFORE UPDATE **OF classification**, e aqui a
-- classificação não muda — só a origem.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

UPDATE public.leads
   SET classification_source = 'automatic'
 WHERE classification_source = 'dashboard'
   AND classification_updated_at = '2026-08-16T01:52:20.776311+00'::timestamptz;

UPDATE public.kenlo_leads
   SET classification_source = 'automatic'
 WHERE classification_source = 'dashboard'
   AND classification_updated_at = '2026-08-16T01:52:20.776311+00'::timestamptz;

COMMIT;

-- ---------- Conferência (rodar à mão ANTES, para achar o timestamp) ----------
-- Um grupo com centenas de linhas no mesmo microssegundo é o backfill; grupos
-- de 1-2 linhas são edição humana de verdade e NÃO devem ser tocados.
--
--   SELECT classification_updated_at, count(*)
--     FROM public.leads
--    WHERE classification_source = 'dashboard'
--    GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
--
-- ROLLBACK
--   Não há: o valor anterior ('dashboard') era o errado. Para desfazer, rode o
--   mesmo UPDATE trocando 'automatic' por 'dashboard' com o mesmo WHERE de data.
-- =============================================================================
