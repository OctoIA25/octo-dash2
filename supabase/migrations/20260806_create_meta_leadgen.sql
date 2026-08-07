-- =============================================================================
-- Meta Lead Ads: config por tenant + fila de eventos do webhook leadgen.
--
-- Cada imobiliária tem o PRÓPRIO app Meta (padrão de whatsapp_config), logo:
--  * app_secret é por tenant → a assinatura do webhook só pode ser validada
--    depois de saber quem é o tenant. Daí webhook_token no path da URL.
--  * leads_retrieval sai em Standard Access (o admin da Página tem cargo no
--    app dela) — sem App Review.
--
-- Segredos SOMENTE cifrados (AES-256-GCM via server/recommendations/crypto.js,
-- chave-mestra EMAIL_ENCRYPTION_KEY). Nunca voltam ao frontend.
--
-- Esta config NÃO entra no trigger deactivate_other_crm_provider
-- (20260706_provider_exclusivity): aquela regra é Kenlo XOR Contact2Sale, entre
-- CRMs. Meta Lead Ads é FONTE de lead — tenant com Kenlo ativo precisa poder
-- receber Lead Ads ao mesmo tempo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tenant_meta_leadgen_config (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   text NOT NULL UNIQUE,
  page_id                     text,
  app_secret_encrypted        text,
  system_user_token_encrypted text,
  -- Token opaco no path da URL do webhook. Identifica o tenant ANTES da validação da assinatura.
  -- DEFAULT no banco (não na app) elimina a corrida de dois saves concorrentes gerando tokens
  -- diferentes. A URL registrada na Meta NUNCA pode mudar — a imobiliária já a colou no app dela.
  webhook_token               text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  verify_token                text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  status                      text NOT NULL DEFAULT 'inactive',
  sync_state                  text,
  last_event_at               timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Varredura de tenants ativos.
CREATE INDEX IF NOT EXISTS idx_meta_leadgen_config_status
  ON public.tenant_meta_leadgen_config (status);

-- =============================================================================
-- Fila de eventos. O UNIQUE em leadgen_id cobre UMA das duas fontes de
-- duplicidade: a REENTREGA DO WEBHOOK (a Meta reenviando a notificação). O
-- segundo INSERT colide e o evento não entra na fila duas vezes.
--
-- Ele NÃO cobre a outra fonte: o PROCESSOR reprocessando uma linha que ficou
-- `pending` porque o processo morreu entre o POST que criou o lead e o UPDATE
-- que marcaria `done`. Nesse caso o evento é legítimo e único aqui, mas o lead
-- seria criado de novo no CRM — com segunda atribuição na roleta e segundo
-- disparo da Lia. Quem protege esse caso é a checagem de existência em
-- server/metaLeadgen/processor.js, antes do self-call. Não confie só neste
-- UNIQUE ao mexer no processor.
--
-- O dedup do webhook mora AQUI e não em `leads` porque um índice único em
-- (tenant_id, source_lead_id) falharia ao aplicar — existem 141 duplicatas hoje
-- (Santa Ângela e ZAP). Além disso a rota POST /api/v1/leads gera
-- source_lead_id sozinha, o chamador não define.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.meta_leadgen_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leadgen_id   text NOT NULL UNIQUE,
  tenant_id    text NOT NULL,
  page_id      text,
  form_id      text,
  ad_id        text,
  raw          jsonb,
  status       text NOT NULL DEFAULT 'pending',
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- O processor varre só o que está pendente; índice parcial mantém a varredura
-- barata mesmo com a tabela crescendo para sempre.
CREATE INDEX IF NOT EXISTS idx_meta_leadgen_events_pending
  ON public.meta_leadgen_events (created_at)
  WHERE status = 'pending';

-- Tabelas de segredo e de payload cru: RLS ligado SEM policies = inacessível
-- via PostgREST anon/authenticated. O servidor usa service_role (bypassa RLS).
-- Mesmo padrão de tenant_contact2sale_config.
ALTER TABLE public.tenant_meta_leadgen_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_leadgen_events ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.meta_leadgen_events.leadgen_id
  IS 'ID do lead na Meta. UNIQUE = idempotência contra reentrega.';
