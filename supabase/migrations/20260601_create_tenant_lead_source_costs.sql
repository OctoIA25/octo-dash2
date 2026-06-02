-- ============================================================
-- MIGRATION: Custo de investimento por origem de lead (Financeiro)
-- Multi-tenant: isolamento por tenant_id + RLS
-- Cada linha = quanto a imobiliária gasta por MÊS com aquela
-- origem/canal de leads (ex: "Facebook", "Google Ads", "Site").
-- A lista de origens NÃO é fixa: o front oferece as origens que
-- realmente aparecem nos leads do tenant.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_lead_source_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  origem TEXT NOT NULL,
  -- Valor gasto por mês com essa origem (BRL). Visão anual = monthly_cost * 12.
  monthly_cost NUMERIC(14, 2) NOT NULL DEFAULT 0
    CHECK (monthly_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, origem)
);

CREATE INDEX IF NOT EXISTS idx_tenant_lead_source_costs_tenant
  ON public.tenant_lead_source_costs(tenant_id);

ALTER TABLE public.tenant_lead_source_costs ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro do tenant lê
CREATE POLICY "lead_source_costs_select"
  ON public.tenant_lead_source_costs FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- INSERT: admin / team_leader / owner
CREATE POLICY "lead_source_costs_insert"
  ON public.tenant_lead_source_costs FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- UPDATE: admin / team_leader / owner
CREATE POLICY "lead_source_costs_update"
  ON public.tenant_lead_source_costs FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- DELETE: admin / team_leader / owner
CREATE POLICY "lead_source_costs_delete"
  ON public.tenant_lead_source_costs FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_tenant_lead_source_costs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_lead_source_costs_updated_at
  ON public.tenant_lead_source_costs;

CREATE TRIGGER trg_tenant_lead_source_costs_updated_at
  BEFORE UPDATE ON public.tenant_lead_source_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_tenant_lead_source_costs_updated_at();

COMMENT ON TABLE public.tenant_lead_source_costs
  IS 'Custo mensal de investimento por origem de lead, por tenant (aba Financeiro dos Relatórios)';
COMMENT ON COLUMN public.tenant_lead_source_costs.origem
  IS 'Rótulo da origem/canal do lead, igual ao origem_lead usado nos leads (ex: Facebook, Google Ads, Site)';
COMMENT ON COLUMN public.tenant_lead_source_costs.monthly_cost
  IS 'Valor gasto por mês com essa origem em BRL; visão anual = monthly_cost * 12';
