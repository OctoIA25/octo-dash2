-- ============================================================
-- MIGRATION: Fonte de leads do Disparador por tenant (dual-run)
--
-- Flag por-tenant que controla de qual fonte o Agente Disparador resolve o
-- público (kenlo_leads vs leads/CRM) e se roda um shadow diagnóstico. A escrita
-- é feita pelo servidor (service_role); o cliente apenas LÊ a configuração do
-- próprio tenant. Default 'kenlo_only' garante que, sem configuração, o
-- comportamento é idêntico ao atual (envio só por kenlo).
--
-- Multi-tenant: isolamento por tenant_id + RLS (SELECT por membership/owner).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_public_source_config (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'kenlo_only'
    CHECK (mode IN ('kenlo_only', 'shadow_leads', 'leads_primary', 'leads_only')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

ALTER TABLE public.agent_public_source_config ENABLE ROW LEVEL SECURITY;

-- Escrita é exclusiva do servidor (service_role bypassa RLS). Revogamos
-- INSERT/UPDATE/DELETE de anon/authenticated para que nenhum cliente possa
-- alterar a fonte de leads diretamente — só lê.
REVOKE INSERT, UPDATE, DELETE ON public.agent_public_source_config FROM anon, authenticated;

-- SELECT: qualquer membro do tenant lê a própria configuração; owner lê todas.
CREATE POLICY "agent_public_source_config_select"
  ON public.agent_public_source_config FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_agent_public_source_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_public_source_config_updated_at
  ON public.agent_public_source_config;

CREATE TRIGGER trg_agent_public_source_config_updated_at
  BEFORE UPDATE ON public.agent_public_source_config
  FOR EACH ROW EXECUTE FUNCTION public.update_agent_public_source_config_updated_at();

COMMENT ON TABLE public.agent_public_source_config
  IS 'Fonte de leads do Agente Disparador por tenant (dual-run): kenlo_only/shadow_leads/leads_primary/leads_only';
COMMENT ON COLUMN public.agent_public_source_config.mode
  IS 'Modo do dual-run. kenlo_only = produção atual (só kenlo). shadow_leads = kenlo primária + diagnóstico leads. leads_primary = leads primária + diagnóstico kenlo. leads_only = só leads.';
COMMENT ON COLUMN public.agent_public_source_config.updated_by
  IS 'Identificador (email) de quem alterou a configuração — observabilidade.';
