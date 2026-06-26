-- ============================================================
-- MIGRATION: Templates de mensagem do módulo Comunicação
-- Biblioteca + ciclo de aprovação Meta (approval_status).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.communication_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  category TEXT NOT NULL DEFAULT 'MARKETING' CHECK (category IN ('MARKETING','UTILITY')),
  language TEXT NOT NULL DEFAULT 'pt_BR',
  body TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  example_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider_template_id TEXT,
  approval_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft','pending','approved','rejected','error')),
  rejected_reason TEXT,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_comm_templates_tenant ON public.communication_templates(tenant_id, created_at DESC);

ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comm_templates_select"
  ON public.communication_templates FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "comm_templates_insert"
  ON public.communication_templates FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner'))
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "comm_templates_update"
  ON public.communication_templates FOR UPDATE
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin', 'team_leader', 'owner'))
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "comm_templates_delete"
  ON public.communication_templates FOR DELETE
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid() AND role IN ('admin', 'owner'))
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE OR REPLACE FUNCTION public.update_communication_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_communication_templates_updated_at ON public.communication_templates;
CREATE TRIGGER trg_communication_templates_updated_at
  BEFORE UPDATE ON public.communication_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_communication_templates_updated_at();

COMMENT ON TABLE public.communication_templates IS 'Templates de mensagem do módulo Comunicação (biblioteca + aprovação Meta).';
COMMENT ON COLUMN public.communication_templates.approval_status IS 'draft → pending → approved|rejected|error. Espelha o status da Meta via refresh.';
