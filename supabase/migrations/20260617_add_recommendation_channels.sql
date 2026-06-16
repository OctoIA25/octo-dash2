-- ============================================================
-- MIGRATION: Suporte a múltiplos canais (Email + WhatsApp) nas recomendações
--
-- Extensão NÃO-disruptiva do fluxo de e-mail:
--   - channel default 'email' → registros antigos continuam coerentes.
--   - recipient genérico (e-mail OU telefone); recipient_email mantido p/ e-mail.
--   - idempotency_key para impedir envios duplicados em retries.
--   - preferência de canal por lead (facilita consulta e a futura Fase 2 de
--     agendamento), e template WhatsApp por tenant.
-- ============================================================

-- 1) Colunas de canal no histórico
ALTER TABLE public.lead_recommendations
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'whatsapp')),
  ADD COLUMN IF NOT EXISTS recipient TEXT,            -- genérico: e-mail ou telefone
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;      -- dedup de retries

-- Backfill: registros antigos são e-mail; recipient = recipient_email.
UPDATE public.lead_recommendations
  SET recipient = recipient_email
  WHERE recipient IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_recommendations_idempotency
  ON public.lead_recommendations(tenant_id, idempotency_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_recommendations_channel
  ON public.lead_recommendations(tenant_id, channel, created_at DESC);

-- 2) Template WhatsApp por tenant (não-secreto; credenciais Meta já vivem em whatsapp_config)
ALTER TABLE public.tenant_recommendation_config
  ADD COLUMN IF NOT EXISTS whatsapp_template_name TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_template_language TEXT NOT NULL DEFAULT 'pt_BR';

-- 3) Preferência de canal por lead
CREATE TABLE IF NOT EXISTS public.lead_recommendation_preferences (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL,
  lead_source TEXT NOT NULL,                          -- 'bolsao' | 'kenlo' | 'crm' | 'manual'
  channels TEXT[] NOT NULL DEFAULT ARRAY['email']::text[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, lead_source, lead_id)
);

ALTER TABLE public.lead_recommendation_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_rec_pref_select"
  ON public.lead_recommendation_preferences FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "lead_rec_pref_upsert"
  ON public.lead_recommendation_preferences FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

CREATE POLICY "lead_rec_pref_update"
  ON public.lead_recommendation_preferences FOR UPDATE
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

COMMENT ON TABLE public.lead_recommendation_preferences
  IS 'Canais preferidos de recomendação por lead (email/whatsapp). Base para agendamento futuro.';
COMMENT ON COLUMN public.lead_recommendations.channel IS 'Canal do envio: email | whatsapp';
COMMENT ON COLUMN public.lead_recommendations.idempotency_key
  IS 'Hash (tenant+lead+canal+imóveis) para deduplicar envios em retries dentro de uma janela curta';
