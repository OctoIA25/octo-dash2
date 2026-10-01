-- ============================================================
-- A.1 · Super Meta — um segundo alvo na mesma meta (aprovado em 29/09).
--
-- O que o Manual pede, e só isso: "na tabela goals, uma coluna valor_super
-- (numeric, pode ser nulo)", e o evento `super_meta_batida` gravado UMA vez por
-- meta quando o realizado cruza a super meta — é o que o Fire (A.6) vai ler.
--
-- O evento mora no histórico da meta (`goal_history`, change_type
-- 'super_meta_batida'), que é o extrato que a tela já mostra. "Uma vez, nunca
-- duas" é garantido pelo banco: `super_batida_em` é preenchida pelo gatilho na
-- primeira vez e nunca mais muda — nem se o realizado cair e subir de novo,
-- nem se alguém mandar outro valor pela API.
--
-- Só no modelo simples: a escalonada e a personalizada já têm vários alvos
-- (níveis e marcos), e uma super meta ali seria um nível a mais com outro nome.
-- ============================================================

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS valor_super numeric;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS super_batida_em timestamptz;

COMMENT ON COLUMN public.goals.valor_super IS
  'A.1 · Super Meta: segundo alvo, acima do target_value. Só no modelo simples. A tela só o mostra depois de bater a meta.';
COMMENT ON COLUMN public.goals.super_batida_em IS
  'Quando o realizado cruzou a super meta pela primeira vez. Escrito só pelo gatilho tg_goal_super_meta; nunca volta a NULL.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goals_valor_super_check') THEN
    ALTER TABLE public.goals ADD CONSTRAINT goals_valor_super_check
      CHECK (valor_super IS NULL OR (model = 'simple' AND valor_super > target_value));
  END IF;
END $$;

-- Antes de gravar: decide `super_batida_em`. Ignora o que vier de fora.
CREATE OR REPLACE FUNCTION public.tg_goal_super_meta()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.super_batida_em IS NOT NULL THEN
    NEW.super_batida_em := OLD.super_batida_em;
  ELSIF NEW.valor_super IS NOT NULL AND NEW.current_value >= NEW.valor_super THEN
    NEW.super_batida_em := now();
  ELSE
    NEW.super_batida_em := NULL;
  END IF;
  RETURN NEW;
END $$;

-- Depois de gravar: o evento no extrato da meta, na hora em que ela foi batida.
-- AFTER porque o histórico aponta para a meta (FK), que no INSERT ainda não existe no BEFORE.
CREATE OR REPLACE FUNCTION public.tg_goal_super_meta_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.super_batida_em IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.super_batida_em IS NULL) THEN
    INSERT INTO goal_history (goal_id, tenant_id, changed_by_name, change_type, summary)
    VALUES (NEW.id, NEW.tenant_id, 'Sistema', 'super_meta_batida',
            format('Super Meta batida: %s de %s', NEW.current_value, NEW.valor_super));
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.tg_goal_super_meta() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_goal_super_meta_evento() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_goal_super_meta ON public.goals;
CREATE TRIGGER tr_goal_super_meta
  BEFORE INSERT OR UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.tg_goal_super_meta();

DROP TRIGGER IF EXISTS tr_goal_super_meta_evento ON public.goals;
CREATE TRIGGER tr_goal_super_meta_evento
  AFTER INSERT OR UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.tg_goal_super_meta_evento();

-- Coluna nova: sem isto o PostgREST segue com o esquema antigo em cache e a
-- tela não vê `valor_super`, sem erro nenhum.
NOTIFY pgrst, 'reload schema';
