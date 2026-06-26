-- ============================================================
-- MIGRATION: Campanhas do módulo Comunicação (C1)
-- Agrupa disparos (campaign_id nos runs); colunas de C2-C4 já
-- presentes (nullable/default, sem lógica ativa no C1).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.communication_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES public.communication_templates(id) ON DELETE RESTRICT,
  audience_id UUID NOT NULL REFERENCES public.audiences(id) ON DELETE RESTRICT,
  max_recipients INTEGER,
  send_window JSONB NOT NULL DEFAULT '{}'::jsonb,
  throttle_per_min INTEGER,
  avoid_resend BOOLEAN NOT NULL DEFAULT false,
  variable_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  internal_note TEXT,
  notify_on_complete BOOLEAN NOT NULL DEFAULT false,
  schedule JSONB NOT NULL DEFAULT '{"mode":"now"}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_comm_campaigns_tenant
  ON public.communication_campaigns(tenant_id, created_at DESC);

ALTER TABLE public.agent_action_runs
  ADD COLUMN IF NOT EXISTS campaign_id UUID
  REFERENCES public.communication_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_action_runs_campaign
  ON public.agent_action_runs(campaign_id) WHERE campaign_id IS NOT NULL;

ALTER TABLE public.communication_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comm_campaigns_select"
  ON public.communication_campaigns FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "comm_campaigns_insert"
  ON public.communication_campaigns FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner'))
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "comm_campaigns_update"
  ON public.communication_campaigns FOR UPDATE
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner'))
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "comm_campaigns_delete"
  ON public.communication_campaigns FOR DELETE
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin', 'owner'))
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE OR REPLACE FUNCTION public.update_communication_campaigns_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_communication_campaigns_updated_at ON public.communication_campaigns;
CREATE TRIGGER trg_communication_campaigns_updated_at
  BEFORE UPDATE ON public.communication_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_communication_campaigns_updated_at();

COMMENT ON TABLE public.communication_campaigns IS 'Campanhas do módulo Comunicação (C1: agrupa disparos; C2-C4 ativam variáveis/agendamento/recorrência).';
COMMENT ON COLUMN public.communication_campaigns.schedule IS 'C1 fixo {"mode":"now"}. C3 introduz scheduled; C4 recurring.';
COMMENT ON COLUMN public.agent_action_runs.campaign_id IS 'Agrupa o run a uma campanha. NULL = disparo avulso (Disparador). Não-FK-obrigatória p/ não afetar disparos avulsos.';
