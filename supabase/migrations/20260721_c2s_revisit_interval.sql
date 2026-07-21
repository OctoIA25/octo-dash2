-- =============================================================================
-- Carimbo da última revisita do LIVE (Contact2Sale) — desacopla a re-varredura
-- de N dias da rotina de 1 minuto.
--
-- Problema (incidente 2026-07-21): o piso do LIVE era Math.min(overlap 5min,
-- agora − revisit_days), então TODO ciclo de 1min re-varria os últimos N dias
-- (dezenas de páginas), estourava o rate limit da C2S (429) e o sync travava.
--
-- Correção: a ROTINA (todo tick) usa só o overlap de 5min (walk de ~1 página);
-- a REVISITA de N dias passa a ser esporádica (default 1×/hora, env
-- C2S_REVISIT_INTERVAL_MIN). last_revisit_at é o relógio dessa cadência —
-- gravado por buildCursorPatch só em ciclo de revisita sem erro.
--
--   NULL → nunca revisou (ou coluna recém-criada): o próximo ciclo faz revisita
--          e carimba. Fail-safe: um tenant sem a coluna revisita no 1º ciclo.
--
-- Sem backfill de dados: NULL já é tratado como "revisar agora" no provider.
-- Idempotente: pode reaplicar.
-- =============================================================================

ALTER TABLE public.tenant_contact2sale_config
  ADD COLUMN IF NOT EXISTS last_revisit_at timestamptz;

COMMENT ON COLUMN public.tenant_contact2sale_config.last_revisit_at IS
  'Instante do último ciclo LIVE de revisita (recuo de revisit_days). NULL=revisar no próximo ciclo. Cadência via C2S_REVISIT_INTERVAL_MIN (default 60min). Desacopla a re-varredura de N dias da rotina de 1min (evita 429).';
