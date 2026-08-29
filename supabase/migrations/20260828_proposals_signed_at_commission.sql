-- =============================================================================
-- REPORT Espelho: data de assinatura persistida + override de comissão.
--
-- `signed_at`: o espelho agrupa vendas por mês de ASSINATURA. `updated_at` não
-- serve — muda em qualquer edição da proposta. Trigger seta na transição de
-- stage para 'proposta-assinada' (INSERT já assinado também conta); nunca
-- sobrescreve valor existente, então correção manual da data sobrevive.
--
-- `commission_total`: override manual da comissão total da venda. NULL = o job
-- deriva pela regra do forecast (3,5% lançamento / 6% terceiros). Existe porque
-- a comissão contratual real varia por negócio (5%, parcerias etc.).
--
-- Ver docs/superpowers/specs/2026-08-28-report-espelho-drive.md
-- =============================================================================

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS signed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS commission_total numeric(14, 2);

CREATE OR REPLACE FUNCTION public.tg_proposals_set_signed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stage_id = 'proposta-assinada'
     AND (TG_OP = 'INSERT' OR OLD.stage_id IS DISTINCT FROM 'proposta-assinada')
     AND NEW.signed_at IS NULL THEN
    NEW.signed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposals_set_signed_at ON public.proposals;
CREATE TRIGGER trg_proposals_set_signed_at
  BEFORE INSERT OR UPDATE OF stage_id ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.tg_proposals_set_signed_at();

-- Backfill: assinadas antigas ganham a melhor aproximação disponível.
-- Desabilita o trigger incondicional de updated_at (20260519) que contaminaria
-- o histórico de recência; este é o único DISABLE aceitável, pois a migração
-- roda manualmente em janela de calma.
-- BEGIN/COMMIT: psql roda cada statement autocommitado por padrão; sem a
-- transação explícita, uma falha entre o DISABLE e o ENABLE (ex.: statement
-- rodado à mão, um por vez) deixaria o trigger de updated_at desligado.
BEGIN;

ALTER TABLE public.proposals DISABLE TRIGGER trigger_update_proposals_updated_at;

UPDATE public.proposals
   SET signed_at = updated_at
 WHERE stage_id = 'proposta-assinada' AND signed_at IS NULL;

ALTER TABLE public.proposals ENABLE TRIGGER trigger_update_proposals_updated_at;

COMMIT;

-- ---------- Prova ----------
DO $$
DECLARE
  v_cols int;
  v_pendentes int;
BEGIN
  SELECT count(*) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'proposals'
     AND column_name IN ('signed_at', 'commission_total');
  ASSERT v_cols = 2, 'colunas signed_at/commission_total não foram criadas';

  ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_proposals_set_signed_at'),
    'trigger de signed_at não foi criado';

  SELECT count(*) INTO v_pendentes
    FROM public.proposals
   WHERE stage_id = 'proposta-assinada' AND signed_at IS NULL;
  ASSERT v_pendentes = 0, 'backfill deixou assinadas sem signed_at';
  RAISE NOTICE 'signed_at/commission_total: asserts OK';
END $$;

-- =============================================================================
-- ROLLBACK
--   DROP TRIGGER IF EXISTS trg_proposals_set_signed_at ON public.proposals;
--   DROP FUNCTION IF EXISTS public.tg_proposals_set_signed_at();
--   ALTER TABLE public.proposals
--     DROP COLUMN IF EXISTS signed_at,
--     DROP COLUMN IF EXISTS commission_total;
-- =============================================================================
