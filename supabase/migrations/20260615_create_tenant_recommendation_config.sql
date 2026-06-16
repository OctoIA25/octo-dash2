-- ============================================================
-- MIGRATION: Configuração de recomendações por tenant
-- Guarda o e-mail de teste usado para validar envios sem atingir o cliente real.
-- Multi-tenant: isolamento por tenant_id + RLS.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_recommendation_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- E-mail que recebe os envios de teste e os envios redirecionados fora de
  -- produção. Sobrescreve a env EMAIL_TEST_RECIPIENT para este tenant.
  test_email TEXT,
  -- Nome da empresa exibido no cabeçalho do e-mail (branding). Opcional.
  company_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_recommendation_config_tenant
  ON public.tenant_recommendation_config(tenant_id);

ALTER TABLE public.tenant_recommendation_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_recommendation_config_select"
  ON public.tenant_recommendation_config FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "tenant_recommendation_config_insert"
  ON public.tenant_recommendation_config FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "tenant_recommendation_config_update"
  ON public.tenant_recommendation_config FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE OR REPLACE FUNCTION public.update_tenant_recommendation_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_recommendation_config_updated_at
  ON public.tenant_recommendation_config;

CREATE TRIGGER trg_tenant_recommendation_config_updated_at
  BEFORE UPDATE ON public.tenant_recommendation_config
  FOR EACH ROW EXECUTE FUNCTION public.update_tenant_recommendation_config_updated_at();

COMMENT ON TABLE public.tenant_recommendation_config
  IS 'Configuração de recomendações por tenant (e-mail de teste, branding do e-mail)';
