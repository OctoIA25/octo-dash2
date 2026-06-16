-- ============================================================
-- MIGRATION (Fase 2): Agendamento de recomendações
--
-- "Enviar semanalmente, porém só na semana em que o lead mostrou interesse":
-- modelamos um agendamento por lead com cadência semanal + uma JANELA DE
-- INTERESSE (interest_at + interest_window_days). O worker só envia enquanto
-- now <= interest_at + janela; depois disso, desativa o agendamento.
--
-- O CONTEÚDO é um SNAPSHOT congelado na criação (html/texto/whatsapp + imóveis),
-- porque a geração e o render do e-mail rodam no cliente — o worker server-side
-- não tem acesso ao feed XML de imóveis nem ao template TS. Trade-off documentado.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recommendation_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Lead alvo (mesma chave flexível das demais tabelas)
  lead_id TEXT,
  lead_source TEXT,
  lead_name TEXT,
  lead_email TEXT,
  lead_phone TEXT,

  channels TEXT[] NOT NULL DEFAULT ARRAY['email']::text[],

  -- Snapshot do conteúdo (congelado na criação)
  subject TEXT,
  custom_message TEXT,
  email_html TEXT,
  email_text TEXT,
  whatsapp_body TEXT,
  properties JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Cadência + janela de interesse
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly')),
  interest_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  interest_window_days INTEGER NOT NULL DEFAULT 7,
  active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_count INTEGER NOT NULL DEFAULT 0,

  created_by_user_id UUID,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Consulta principal do worker: agendamentos ativos cujo next_run_at já venceu.
CREATE INDEX IF NOT EXISTS idx_rec_schedules_due
  ON public.recommendation_schedules(active, next_run_at);
CREATE INDEX IF NOT EXISTS idx_rec_schedules_tenant_lead
  ON public.recommendation_schedules(tenant_id, lead_source, lead_id);

ALTER TABLE public.recommendation_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rec_schedules_select"
  ON public.recommendation_schedules FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "rec_schedules_insert"
  ON public.recommendation_schedules FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "rec_schedules_update"
  ON public.recommendation_schedules FOR UPDATE
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "rec_schedules_delete"
  ON public.recommendation_schedules FOR DELETE
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE OR REPLACE FUNCTION public.update_recommendation_schedules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recommendation_schedules_updated_at ON public.recommendation_schedules;
CREATE TRIGGER trg_recommendation_schedules_updated_at
  BEFORE UPDATE ON public.recommendation_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_recommendation_schedules_updated_at();

COMMENT ON TABLE public.recommendation_schedules
  IS 'Agendamentos de recomendação (Fase 2). Conteúdo é snapshot; envio gated pela janela de interesse.';
COMMENT ON COLUMN public.recommendation_schedules.interest_window_days
  IS 'Só envia enquanto now <= interest_at + interest_window_days; depois desativa.';
