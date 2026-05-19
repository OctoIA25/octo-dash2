-- Persistencia das propostas imobiliarias.
-- Dados sensiveis de compradores/vendedores ficam no banco, protegidos por RLS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.proposals_can_access_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = p_tenant_id
        AND tm.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.update_proposals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'draft' CHECK (source IN ('crm', 'draft', 'manual')),
  property_origin TEXT NOT NULL DEFAULT 'interno' CHECK (property_origin IN ('interno', 'externo')),
  property_reference TEXT NOT NULL DEFAULT '',
  cep TEXT NOT NULL DEFAULT '',
  numero TEXT NOT NULL DEFAULT '',
  logradouro TEXT NOT NULL DEFAULT '',
  bairro TEXT NOT NULL DEFAULT '',
  complemento TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  agent_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  agent_name TEXT NOT NULL DEFAULT '',
  business_type TEXT NOT NULL DEFAULT 'Venda',
  lead_type TEXT NOT NULL DEFAULT 'Interessado',
  origin TEXT NOT NULL DEFAULT 'Manual',
  temperature TEXT NOT NULL DEFAULT 'Morno',
  status TEXT NOT NULL DEFAULT 'Proposta Criada',
  stage_id TEXT NOT NULL DEFAULT 'proposta-criada' CHECK (
    stage_id IN (
      'negociacao',
      'proposta-criada',
      'proposta-enviada',
      'propostas-respondidas',
      'feitura-contrato',
      'proposta-assinada',
      'arquivado'
    )
  ),
  value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'Compra e venda',
  has_financing BOOLEAN NOT NULL DEFAULT FALSE,
  financing_amount TEXT NOT NULL DEFAULT '',
  down_payment TEXT NOT NULL DEFAULT '',
  banking_support TEXT NOT NULL DEFAULT 'suporte' CHECK (banking_support IN ('aprovado', 'suporte')),
  specific_conditions TEXT NOT NULL DEFAULT '',
  external_partners BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  sent_to_proponent BOOLEAN NOT NULL DEFAULT FALSE,
  sent_to_owner BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.proposal_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  party_type TEXT NOT NULL CHECK (party_type IN ('comprador', 'vendedor')),
  full_name TEXT NOT NULL DEFAULT '',
  cpf TEXT NOT NULL DEFAULT '',
  rg TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  is_company BOOLEAN NOT NULL DEFAULT FALSE,
  signature_channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (signature_channel IN ('whatsapp', 'email')),
  signed_by TEXT NOT NULL DEFAULT '',
  signature_status TEXT NOT NULL DEFAULT 'pendente' CHECK (
    signature_status IN ('pendente', 'enviado', 'assinado', 'recusado')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.proposal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_by UUID NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_tenant_stage ON public.proposals(tenant_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_proposals_tenant_updated_at ON public.proposals(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON public.proposals(lead_id);
CREATE INDEX IF NOT EXISTS idx_proposal_parties_proposal ON public.proposal_parties(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_parties_tenant_type ON public.proposal_parties(tenant_id, party_type);
CREATE INDEX IF NOT EXISTS idx_proposal_history_proposal ON public.proposal_history(proposal_id, created_at DESC);

DROP TRIGGER IF EXISTS trigger_update_proposals_updated_at ON public.proposals;
CREATE TRIGGER trigger_update_proposals_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_proposals_updated_at();

DROP TRIGGER IF EXISTS trigger_update_proposal_parties_updated_at ON public.proposal_parties;
CREATE TRIGGER trigger_update_proposal_parties_updated_at
  BEFORE UPDATE ON public.proposal_parties
  FOR EACH ROW
  EXECUTE FUNCTION public.update_proposals_updated_at();

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members can view proposals" ON public.proposals;
CREATE POLICY "Tenant members can view proposals" ON public.proposals
  FOR SELECT
  TO authenticated
  USING (public.proposals_can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "Tenant members can write proposals" ON public.proposals;
CREATE POLICY "Tenant members can write proposals" ON public.proposals
  FOR ALL
  TO authenticated
  USING (public.proposals_can_access_tenant(tenant_id))
  WITH CHECK (public.proposals_can_access_tenant(tenant_id));

DROP POLICY IF EXISTS "Tenant members can view proposal parties" ON public.proposal_parties;
CREATE POLICY "Tenant members can view proposal parties" ON public.proposal_parties
  FOR SELECT
  TO authenticated
  USING (
    public.proposals_can_access_tenant(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.proposals p
      WHERE p.id = proposal_id
        AND p.tenant_id = tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant members can write proposal parties" ON public.proposal_parties;
CREATE POLICY "Tenant members can write proposal parties" ON public.proposal_parties
  FOR ALL
  TO authenticated
  USING (
    public.proposals_can_access_tenant(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.proposals p
      WHERE p.id = proposal_id
        AND p.tenant_id = tenant_id
    )
  )
  WITH CHECK (
    public.proposals_can_access_tenant(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.proposals p
      WHERE p.id = proposal_id
        AND p.tenant_id = tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant members can view proposal history" ON public.proposal_history;
CREATE POLICY "Tenant members can view proposal history" ON public.proposal_history
  FOR SELECT
  TO authenticated
  USING (
    public.proposals_can_access_tenant(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.proposals p
      WHERE p.id = proposal_id
        AND p.tenant_id = tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant members can write proposal history" ON public.proposal_history;
CREATE POLICY "Tenant members can write proposal history" ON public.proposal_history
  FOR ALL
  TO authenticated
  USING (
    public.proposals_can_access_tenant(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.proposals p
      WHERE p.id = proposal_id
        AND p.tenant_id = tenant_id
    )
  )
  WITH CHECK (
    public.proposals_can_access_tenant(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.proposals p
      WHERE p.id = proposal_id
        AND p.tenant_id = tenant_id
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_parties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_history TO authenticated;
