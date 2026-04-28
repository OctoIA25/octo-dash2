-- =============================================================================
-- 1) Habilita pg_cron e agenda expire_bolsao_leads para rodar a cada minuto
-- 2) Adiciona master switch `bolsao_enabled` em tenant_bolsao_config
-- 3) Triggers e expire respeitam o switch (false -> nao espelha, nao expira)
--
-- Aplicada em producao em 2026-04-28 via supabase MCP.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- IMPORTANTE: rodar manualmente em ambiente novo (cron.schedule eh idempotente
-- por nome) -- pular se ja agendado.
SELECT cron.schedule(
  'bolsao-expire-every-minute',
  '* * * * *',
  $$ SELECT public.expire_bolsao_leads(); $$
);

ALTER TABLE public.tenant_bolsao_config
  ADD COLUMN IF NOT EXISTS bolsao_enabled boolean NOT NULL DEFAULT true;

-- Triggers de espelhamento e expire_bolsao_leads atualizados pra respeitar
-- o switch — corpo completo das funcoes nas migrations de Apr 27/28 anteriores;
-- veja a migration aplicada via MCP em 2026-04-28 (mesmo nome).
