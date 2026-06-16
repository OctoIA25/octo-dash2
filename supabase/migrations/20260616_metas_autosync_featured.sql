-- ============================================================
-- MIGRATION: Metas — auto-atualização via CRM + meta destacada
--
-- 1) `source`: define a origem do "valor realizado".
--      'manual' -> editado à mão.
--      'crm'    -> calculado automaticamente a partir dos dados do CRM
--                  (ex: VGV a partir de proposals, Captação de imoveis).
--    A lógica de cálculo vive na aplicação (registry de fontes de métrica),
--    mantendo o banco agnóstico a quais categorias são automáticas.
--
-- 2) `scope`: abrangência da meta. Apenas metas de equipe ('team') podem
--    ser destacadas na tela inicial.
--
-- 3) `is_featured`: marca a meta exibida no card "Meta Mensal" da home.
--    Um índice único parcial garante no MÁXIMO uma destacada por tenant.
-- ============================================================

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'crm'));

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'team'
    CHECK (scope IN ('team', 'individual'));

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

-- No máximo uma meta destacada por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_goals_one_featured_per_tenant
  ON public.goals(tenant_id)
  WHERE is_featured;

COMMENT ON COLUMN public.goals.source IS 'Origem do valor realizado: manual | crm (calculado dos dados do CRM).';
COMMENT ON COLUMN public.goals.scope IS 'Abrangência: team (equipe) | individual. Só metas team podem ser destacadas.';
COMMENT ON COLUMN public.goals.is_featured IS 'Meta exibida no card "Meta Mensal" da tela inicial (uma por tenant).';
