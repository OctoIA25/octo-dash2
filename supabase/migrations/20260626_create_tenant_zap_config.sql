-- tenant_zap_config: configuração por tenant da integração ZAP Imóveis / Grupo OLX.
-- Tira a integração do .env global (single-tenant) e a torna multi-tenant.
-- Espelha o espírito de tenant_santa_angela_config (1 config por tenant, greenfield,
-- segredos só cifrados AES-256-GCM), mas adaptado ao modelo feed+webhook da ZAP:
-- não há token/refresh nem polling; o que era ENV (secret, contato, resync) vira coluna.
CREATE TABLE IF NOT EXISTS public.tenant_zap_config (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                text NOT NULL UNIQUE,
  status                   text NOT NULL DEFAULT 'active',

  -- Segredos: cifrados AES-256-GCM (mesmo crypto.js de Kenlo/SA). Nunca em claro.
  feed_secret_encrypted    text,   -- secret que identifica o tenant no feed/webhook
  resync_token_encrypted   text,   -- Bearer do notify-update (opcional)

  -- Índice pesquisável do feed_secret: HMAC-SHA256 determinístico (server/zap/secretLookup.js).
  -- O secret cifrado tem IV aleatório e não é indexável; este HMAC permite o lookup
  -- secret → tenant em O(1), sem varrer/descifrar todas as linhas e sem o secret em claro.
  feed_secret_lookup       text,

  -- Parâmetros não-secretos do feed (eram ZAPIMOVEIS_* globais no .env).
  provider                 text NOT NULL DEFAULT 'OctoDash',
  contact_name             text,
  contact_email            text,
  contact_phone            text,
  publication_type         text NOT NULL DEFAULT 'STANDARD',
  detail_base_url          text,
  resync_url               text,

  -- Observabilidade exigida pela área administrativa.
  last_feed_at             timestamptz,  -- último pull do feed pela ZAP
  last_lead_at             timestamptz,  -- último lead recebido via webhook
  last_error               text,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Lookup secret → tenant. UNIQUE garante que dois tenants não colidam no mesmo secret
-- (isolamento) e dá resolução O(1) no validateZapFeedAccess.
CREATE UNIQUE INDEX IF NOT EXISTS idx_zap_config_secret_lookup
  ON public.tenant_zap_config (feed_secret_lookup)
  WHERE feed_secret_lookup IS NOT NULL;

-- Acelera listagem/varredura por status na área admin (GET /status).
CREATE INDEX IF NOT EXISTS idx_zap_config_status
  ON public.tenant_zap_config (status);

-- Sem RLS: tabela lida APENAS pelo backend (resolver + rotas owner/admin), nunca
-- pelo cliente Supabase do frontend — mesmo padrão de kenlo_integrations / SA.
