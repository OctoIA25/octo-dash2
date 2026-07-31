-- =============================================================================
-- ANTHROPIC — APLICAR NO SUPABASE (SQL Editor) — 2026-07-31
-- As 3 migrations da integração Anthropic, na ORDEM, consolidadas num único
-- run. Todas idempotentes (IF NOT EXISTS / guard duplicate_object): rodar de
-- novo é seguro. Fonte: supabase/migrations/20260729_create_tenant_anthropic_config.sql,
-- 20260730_anthropic_fase2_threshold_alert.sql, 20260730_anthropic_fase3_mode.sql.
-- Aplicar ANTES do deploy do código (senão: scheduler 42703 e card degradado).
-- =============================================================================

-- ═══ [1/3] 20260729_create_tenant_anthropic_config ═══

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

-- ═══ [2/3] 20260730_anthropic_fase2_threshold_alert ═══

-- =============================================================================
-- Anthropic Fase 2 — limiar de alerta por-tenant + carimbo de último aviso.
--
-- alert_threshold_bps: limiar do aviso em basis points (1430 = 14,30%),
--   configurável por tenant na aba Integrações. O denominador do % NÃO é
--   por-tenant: vem do env ANTHROPIC_WEEKLY_BUDGET_USD (conta não-Enterprise
--   não tem limite programático na API da Anthropic).
--
-- last_alerted_at: carimbo de auditoria de quando o último aviso (sino+email)
--   foi enviado. WRITE-ONLY: nenhuma lógica lê — o dedup do alerta é por
--   transição de estado (last_state normal→warning), que já persiste no banco.
--
-- weekly_limit_usd (Fase 1) fica REPURPOSED: o service grava nela o denominador
-- usado no último cálculo (env budget) p/ o card do Status mostrar "Limite"
-- correto. Nada a lê como entrada. Não remover (migration destrutiva evitada).
-- =============================================================================

ALTER TABLE public.tenant_anthropic_config
  ADD COLUMN IF NOT EXISTS alert_threshold_bps integer NOT NULL DEFAULT 1430,
  ADD COLUMN IF NOT EXISTS last_alerted_at timestamptz;

-- ═══ [3/3] 20260730_anthropic_fase3_mode ═══

-- =============================================================================
-- Anthropic Fase 3 — modo de operação por tenant.
--
-- mode: 'api' (pull horário via Admin API — F1/F2, default) | 'max' (push: o
--   reporter get_usage na máquina com OAuth do plano Max POSTa o % oficial da
--   assinatura no ingest /api/v1/anthropic/usage-report a cada ~5 min).
-- No modo 'max' as colunas de USD (last_usage_usd/weekly_limit_usd) ficam null
-- (a assinatura não tem semântica de gasto em dólar) e o scheduler F2 PULA o
-- tenant (o tick sem Admin key sobrescreveria o snapshot e re-armaria o dedup).
-- =============================================================================

ALTER TABLE public.tenant_anthropic_config
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'api';

DO $$ BEGIN
  ALTER TABLE public.tenant_anthropic_config
    ADD CONSTRAINT tenant_anthropic_config_mode_check CHECK (mode IN ('api','max'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ VERIFICAÇÃO (deve listar 16 colunas, incl. alert_threshold_bps,
-- last_alerted_at e mode; e rowsecurity = true sem policies) ═══
SELECT column_name, data_type, column_default FROM information_schema.columns
  WHERE table_schema='public' AND table_name='tenant_anthropic_config' ORDER BY ordinal_position;
SELECT relrowsecurity FROM pg_class WHERE oid='public.tenant_anthropic_config'::regclass;
SELECT count(*) AS policies FROM pg_policies WHERE tablename='tenant_anthropic_config'; -- deve ser 0
