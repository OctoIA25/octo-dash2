-- ============================================================
-- MIGRATION: Metas comerciais (aba "Metas")
-- Multi-tenant: isolamento por tenant_id + RLS
--
-- Modelagem orientada a extensibilidade:
--   - Colunas comuns a TODA meta (nome, categoria, período, valores...)
--   - `model` define a ESTRUTURA de cálculo do progresso
--     ('simple' | 'scaled' | 'custom'). Novos modelos podem ser
--     adicionados sem migração, pois a parte específica de cada
--     modelo (níveis, marcos, critérios) vive em `config` (JSONB).
--   - `category_id` é TEXTO livre (não enum): novas categorias de
--     meta (VGV, VGC, Captação, Recrutamento, ...) são apenas dados,
--     não exigem alteração de schema.
--
-- A validação da forma de `config` é feita na aplicação (estratégia
-- por modelo), mantendo o banco simples e o domínio extensível.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  category_id   TEXT NOT NULL,
  model         TEXT NOT NULL CHECK (model IN ('simple', 'scaled', 'custom')),
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  owner_name    TEXT NOT NULL DEFAULT '',
  target_value  NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL DEFAULT 'count' CHECK (unit IN ('currency', 'count', 'percent')),
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_goals_tenant         ON public.goals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_goals_tenant_status  ON public.goals(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_tenant_category ON public.goals(tenant_id, category_id);

-- Histórico de alterações (auditoria leve por meta)
CREATE TABLE IF NOT EXISTS public.goal_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id         UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  changed_by_name TEXT NOT NULL DEFAULT '',
  change_type     TEXT NOT NULL,
  summary         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_history_goal   ON public.goal_history(goal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goal_history_tenant ON public.goal_history(tenant_id);

-- ============================================================
-- RLS
-- Leitura: qualquer membro do tenant (+ owner da plataforma).
-- Escrita: admin / team_leader / owner (+ owner da plataforma).
-- ============================================================
ALTER TABLE public.goals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_history ENABLE ROW LEVEL SECURITY;

-- ---------- goals ----------
CREATE POLICY "goals_select"
  ON public.goals FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "goals_insert"
  ON public.goals FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "goals_update"
  ON public.goals FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "goals_delete"
  ON public.goals FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- ---------- goal_history ----------
CREATE POLICY "goal_history_select"
  ON public.goal_history FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "goal_history_insert"
  ON public.goal_history FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_goals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_goals_updated_at ON public.goals;
CREATE TRIGGER trg_goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.update_goals_updated_at();

COMMENT ON TABLE public.goals IS 'Metas comerciais por tenant. `model` define a estrutura de progresso; `config` (JSONB) guarda os dados específicos do modelo.';
COMMENT ON COLUMN public.goals.category_id IS 'Categoria da meta (vgv, vgc, captacao, recrutamento, ...). Texto livre para extensibilidade.';
COMMENT ON COLUMN public.goals.config IS 'Dados específicos do modelo: { kind: "scaled", levels: [...] } | { kind: "custom", milestones: [...] } | { kind: "simple" }.';

-- ============================================================
-- Liberar a feature "metas" por padrão nos tenants
-- ============================================================
ALTER TABLE public.tenants
  ALTER COLUMN allowed_features
  SET DEFAULT '["leads", "notificacoes", "metricas", "juridico", "estudo-mercado", "imoveis", "octo-chat", "metas"]'::jsonb;

UPDATE public.tenants
SET allowed_features = COALESCE(allowed_features, '[]'::jsonb) || '["metas"]'::jsonb
WHERE allowed_features IS NULL
   OR NOT (allowed_features @> '["metas"]'::jsonb);
