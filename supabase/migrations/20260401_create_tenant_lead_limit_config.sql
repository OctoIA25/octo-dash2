-- ============================================================
-- MIGRATION: Configuração de limite de leads por corretor
-- Multi-tenant: isolamento por tenant_id + RLS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_lead_limit_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_limit_enabled BOOLEAN NOT NULL DEFAULT false,
  max_active_leads_per_broker INTEGER NOT NULL DEFAULT 100,
  max_pending_response_leads_per_broker INTEGER NOT NULL DEFAULT 50,
  blocking_mode TEXT NOT NULL DEFAULT 'both'
    CHECK (blocking_mode IN ('carteira', 'pendencia', 'both')),
  warning_threshold_percent INTEGER NOT NULL DEFAULT 80
    CHECK (warning_threshold_percent BETWEEN 1 AND 100),
  pending_statuses TEXT[] NOT NULL DEFAULT ARRAY['Novos Leads'],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_lead_limit_config_tenant
  ON public.tenant_lead_limit_config(tenant_id);

ALTER TABLE public.tenant_lead_limit_config ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro do tenant lê
CREATE POLICY "lead_limit_config_select"
  ON public.tenant_lead_limit_config FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- INSERT: admin / team_leader / owner
CREATE POLICY "lead_limit_config_insert"
  ON public.tenant_lead_limit_config FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- UPDATE: admin / team_leader / owner
CREATE POLICY "lead_limit_config_update"
  ON public.tenant_lead_limit_config FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- DELETE: admin / owner
CREATE POLICY "lead_limit_config_delete"
  ON public.tenant_lead_limit_config FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_tenant_lead_limit_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_lead_limit_config_updated_at
  ON public.tenant_lead_limit_config;

CREATE TRIGGER trg_tenant_lead_limit_config_updated_at
  BEFORE UPDATE ON public.tenant_lead_limit_config
  FOR EACH ROW EXECUTE FUNCTION public.update_tenant_lead_limit_config_updated_at();

COMMENT ON TABLE public.tenant_lead_limit_config
  IS 'Configuração de limite de leads por corretor para cada tenant (imobiliária)';
COMMENT ON COLUMN public.tenant_lead_limit_config.lead_limit_enabled
  IS 'Se o controle de limite está ativo para o tenant';
COMMENT ON COLUMN public.tenant_lead_limit_config.max_active_leads_per_broker
  IS 'Número máximo de leads ativos na carteira por corretor';
COMMENT ON COLUMN public.tenant_lead_limit_config.max_pending_response_leads_per_broker
  IS 'Número máximo de leads com resposta pendente por corretor';
COMMENT ON COLUMN public.tenant_lead_limit_config.blocking_mode
  IS 'Modo de bloqueio: carteira (só carteira), pendencia (só pendência), both (ambos)';
COMMENT ON COLUMN public.tenant_lead_limit_config.warning_threshold_percent
  IS 'Percentual do limite para exibir aviso de proximidade (ex: 80%)';
COMMENT ON COLUMN public.tenant_lead_limit_config.pending_statuses
  IS 'Array de status do lead considerados como resposta pendente (ex: Novos Leads)';
