-- =============================================================================
-- P1 — Observabilidade dos jobs: estado ATUAL de cada job crítico.
-- Spec: docs/superpowers/specs/2026-07-11-observabilidade-jobs-design.md
--
-- Uma linha por job (job_name é PK). SEM histórico, SEM time-series, SEM
-- agregações — só "o último ciclo rodou quando e como". O helper
-- server/observability/heartbeat.js faz UPSERT (ON CONFLICT job_name).
--
-- last_result guarda o summary real do ciclo + duration_ms + consecutive_failures
-- (ver spec). O endpoint GET /api/v1/health/jobs (fase posterior) lê esta tabela.
--
-- Tabela server-only: RLS ligado SEM policies = inacessível via PostgREST
-- anon/authenticated. Servidor grava/lê via service_role (bypassa RLS). Mesmo
-- padrão de tenant_contact2sale_config / tenant_email_secrets.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.job_heartbeats (
  job_name     text PRIMARY KEY,
  last_run_at  timestamptz NOT NULL,
  last_result  jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_heartbeats ENABLE ROW LEVEL SECURITY;
