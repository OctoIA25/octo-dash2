-- =============================================================================
-- Config por tenant da integração Anthropic (Admin API de Usage & Cost).
-- Padrão tenant_contact2sale_config: greenfield SEM coluna plaintext — a admin
-- API key vive apenas cifrada (AES-256-GCM via server/recommendations/crypto.js,
-- chave-mestra EMAIL_ENCRYPTION_KEY). A key NUNCA volta ao frontend.
--
-- Numerador (consumo) vem da API oficial (cost_report, 7 dias). Denominador
-- (weekly_limit_usd) é configurado pelo Owner — a Anthropic não expõe o limite
-- semanal por API. Sem key OU sem limite → status 'not_configured'.
--
-- Colunas last_*: snapshot do último cálculo do scheduler, para a UI ler sem
-- bater na Anthropic a cada render. last_error NUNCA contém a key.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_anthropic_config (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                text NOT NULL UNIQUE,
  admin_api_key_encrypted  text,
  weekly_limit_usd         numeric,
  status                   text NOT NULL DEFAULT 'not_configured',
  last_usage_usd           numeric,
  last_percentage          numeric,
  last_window_start        timestamptz,
  last_window_end          timestamptz,
  last_state               text,
  last_error               text,
  last_synced_at           timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Varredura de tenants configurados pelo scheduler.
CREATE INDEX IF NOT EXISTS idx_tenant_anthropic_config_status
  ON public.tenant_anthropic_config (status);

-- Tabela de segredos: RLS ligado SEM policies = inacessível via PostgREST
-- anon/authenticated. O servidor usa service_role (bypassa RLS). Mesmo padrão
-- de tenant_contact2sale_config / tenant_email_secrets.
ALTER TABLE public.tenant_anthropic_config ENABLE ROW LEVEL SECURITY;
