-- =============================================================================
-- Config por tenant da integração Contact2Sale (C2S).
-- Padrão tenant_santa_angela_config: greenfield SEM coluna plaintext — o token
-- vive apenas cifrado (AES-256-GCM via server/recommendations/crypto.js,
-- chave-mestra EMAIL_ENCRYPTION_KEY). O token NUNCA volta ao frontend.
--
-- Cursores (sincronização incremental real — a API C2S tem updated_gte):
--   last_sync_at      — cursor LIVE (updated_gte = last_sync_at − overlap).
--                       Avança para o timestamp de INÍCIO do ciclo e SOMENTE
--                       quando o ciclo termina sem erro (conservador — a C2S não
--                       tem reconciliação periódica barata como o Kenlo).
--   backfill_cursor   — progresso do import inicial (walk por created_at asc,
--                       gravado a cada página). Permite retomar um backfill de
--                       horas após crash/deploy sem recomeçar do zero.
--   last_full_sync_at — carimbo do último walk completo (primeiro sync ou
--                       resync manual), para observabilidade.
--
-- sync_state: snapshot JSON (mesmo formato do kenlo_integrations.sync_state,
-- escrito pelo engine compartilhado) — tipo text por uniformidade com o engine.
--
-- status: 'active' | 'inactive'. Nasce 'inactive': ativar é ação explícita do
-- admin e dispara a exclusividade com o Kenlo (20260706_provider_exclusivity).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_contact2sale_config (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            text NOT NULL UNIQUE,
  api_token_encrypted  text,
  status               text NOT NULL DEFAULT 'inactive',
  last_sync_at         timestamptz,
  backfill_cursor      timestamptz,
  last_full_sync_at    timestamptz,
  sync_state           text,
  leads_count          integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Varredura de tenants ativos pelo scheduler (mesmo padrão do Kenlo/SA).
CREATE INDEX IF NOT EXISTS idx_tc2s_config_status
  ON public.tenant_contact2sale_config (status);

-- Tabela de segredos: RLS ligado SEM policies = inacessível via PostgREST
-- anon/authenticated. O servidor usa service_role (bypassa RLS). Mesmo padrão
-- de tenant_email_secrets / tenant_recommendation_config.
ALTER TABLE public.tenant_contact2sale_config ENABLE ROW LEVEL SECURITY;
