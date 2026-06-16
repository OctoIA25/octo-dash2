-- ============================================================
-- MIGRATION: Histórico de recomendações de imóveis enviadas a leads
-- Multi-tenant: isolamento por tenant_id + RLS
--
-- Modelada para auditoria e para o dashboard futuro (taxa de abertura,
-- cliques, conversões, imóveis mais enviados, performance por corretor).
-- Os campos de engajamento (opened_at, clicked_at, ...) já existem aqui,
-- nulos, para que o tracking futuro NÃO exija nova migração disruptiva.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lead_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Identificação do lead. lead_id é TEXT por flexibilidade: o lead pode vir de
  -- fontes com tipos de id distintos (bolsao=bigint, kenlo_leads, leads=uuid).
  lead_id TEXT,
  lead_source TEXT,                 -- 'bolsao' | 'kenlo' | 'crm' | 'manual'
  lead_name TEXT,
  lead_email TEXT,                  -- e-mail real/pretendido do lead (pode ser nulo)

  -- Envio efetivo
  recipient_email TEXT NOT NULL,    -- para onde o e-mail FOI de fato (pode ser o de teste)
  redirected BOOLEAN NOT NULL DEFAULT false,  -- true quando redirecionado p/ e-mail de teste
  is_test BOOLEAN NOT NULL DEFAULT false,      -- envio de teste ("como se fosse o cliente")
  environment TEXT NOT NULL,        -- 'production' | 'homologation' | 'development'

  -- Conteúdo
  subject TEXT NOT NULL,
  custom_message TEXT,
  properties JSONB NOT NULL DEFAULT '[]'::jsonb,  -- snapshot dos imóveis enviados
  property_count INTEGER NOT NULL DEFAULT 0,

  -- Resultado
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'simulated', 'failed', 'test')),
  error_message TEXT,
  transport TEXT,                   -- 'smtp' | 'simulated'
  message_id TEXT,

  -- Responsável
  sent_by_user_id UUID,
  sent_by_email TEXT,

  -- Ganchos para o dashboard futuro (engajamento) — nulos por enquanto
  opened_at TIMESTAMPTZ,
  first_opened_at TIMESTAMPTZ,
  open_count INTEGER NOT NULL DEFAULT 0,
  clicked_at TIMESTAMPTZ,
  click_count INTEGER NOT NULL DEFAULT 0,
  converted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_recommendations_tenant
  ON public.lead_recommendations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_recommendations_lead
  ON public.lead_recommendations(tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_recommendations_created
  ON public.lead_recommendations(tenant_id, created_at DESC);

ALTER TABLE public.lead_recommendations ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro do tenant lê (necessário para o dashboard futuro)
CREATE POLICY "lead_recommendations_select"
  ON public.lead_recommendations FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- INSERT: membros do tenant (o servidor usa service_role e ignora RLS, mas a
-- policy mantém o caminho seguro caso a inserção ocorra com a chave anon).
CREATE POLICY "lead_recommendations_insert"
  ON public.lead_recommendations FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

COMMENT ON TABLE public.lead_recommendations
  IS 'Histórico de recomendações de imóveis enviadas por e-mail aos leads (auditoria + métricas futuras)';
COMMENT ON COLUMN public.lead_recommendations.recipient_email
  IS 'E-mail para onde o envio realmente foi (pode ser o e-mail de teste em ambientes não-produção)';
COMMENT ON COLUMN public.lead_recommendations.redirected
  IS 'true quando o envio foi redirecionado para o e-mail de teste (proteção entre ambientes)';
COMMENT ON COLUMN public.lead_recommendations.properties
  IS 'Snapshot dos imóveis enviados (referencia, titulo, preço, etc.) para auditoria mesmo se o imóvel sair do feed';
