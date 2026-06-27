-- tenant_santa_angela_config: configuração por tenant da integração Santa Ângela.
-- Espelha o espírito de kenlo_integrations (1 config por tenant), porém greenfield:
-- nasce SEM coluna plaintext — a api_key vive apenas cifrada (AES-256-GCM).
-- O fallback legado durante a migração vem da ENV, resolvido no servidor.
CREATE TABLE IF NOT EXISTS public.tenant_santa_angela_config (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          text NOT NULL UNIQUE,
  base_url           text NOT NULL,
  api_key_encrypted  text,
  status             text NOT NULL DEFAULT 'active',
  last_sync_at       timestamptz,
  leads_count        integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Acelera listagem/varredura por tenants ativos (status no GET /sync/status).
CREATE INDEX IF NOT EXISTS idx_tsa_config_status
  ON public.tenant_santa_angela_config (status);
