-- ============================================================
-- MIGRATION: Canal por origem de lead (Relatórios)
-- Multi-tenant: isolamento por tenant_id + RLS
-- Cada linha = a qual CANAL (agrupamento) pertence aquela origem
-- de lead (ex: origem "ZAP Imóveis" -> canal "Portais Imobiliários",
-- origem "Meta" -> canal "Redes Sociais").
-- A lista de origens NÃO é fixa: o front oferece as origens que
-- realmente aparecem nos leads do tenant. Origens sem linha aqui
-- recebem um canal sugerido automaticamente no front (heurística);
-- esta tabela guarda apenas as escolhas manuais do admin/owner.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenant_lead_source_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  origem TEXT NOT NULL,
  canal TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, origem)
);

CREATE INDEX IF NOT EXISTS idx_tenant_lead_source_channels_tenant
  ON public.tenant_lead_source_channels(tenant_id);

ALTER TABLE public.tenant_lead_source_channels ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro do tenant lê
CREATE POLICY "lead_source_channels_select"
  ON public.tenant_lead_source_channels FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- INSERT: admin / team_leader / owner
CREATE POLICY "lead_source_channels_insert"
  ON public.tenant_lead_source_channels FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- UPDATE: admin / team_leader / owner
CREATE POLICY "lead_source_channels_update"
  ON public.tenant_lead_source_channels FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- DELETE: admin / team_leader / owner (deletar = voltar ao canal automático)
CREATE POLICY "lead_source_channels_delete"
  ON public.tenant_lead_source_channels FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships
      WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner')
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_tenant_lead_source_channels_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_lead_source_channels_updated_at
  ON public.tenant_lead_source_channels;

CREATE TRIGGER trg_tenant_lead_source_channels_updated_at
  BEFORE UPDATE ON public.tenant_lead_source_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_tenant_lead_source_channels_updated_at();

COMMENT ON TABLE public.tenant_lead_source_channels
  IS 'Canal (agrupamento) escolhido manualmente para cada origem de lead, por tenant. Origens ausentes usam a sugestão automática do front.';
COMMENT ON COLUMN public.tenant_lead_source_channels.origem
  IS 'Chave da origem do lead, normalizada (trim + lowercase), igual ao origem_lead usado nos leads';
COMMENT ON COLUMN public.tenant_lead_source_channels.canal
  IS 'Rótulo do canal escolhido para a origem (ex: Portais Imobiliários, Redes Sociais, Site)';
