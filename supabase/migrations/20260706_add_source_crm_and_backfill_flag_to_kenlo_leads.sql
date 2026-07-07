-- =============================================================================
-- kenlo_leads passa a ser a tabela canônica de leads de CRMs externos
-- (Kenlo, Contact2Sale, ...). Duas colunas aditivas:
--
--   source_crm  — proveniência da linha ('kenlo' | 'contact2sale' | ...).
--                 DEFAULT 'kenlo' cobre todo o legado; nenhum consumidor muda.
--                 O ENGINE de sync estampa provider.name em todo INSERT
--                 (server/crmSync/engine.js) — não é convenção do provider.
--
--   is_backfill — TRUE somente em linhas inseridas por import histórico
--                 (primeiro ciclo do servidor / resync completo manual).
--                 É o que o gate de automações lê (20260706_webhook_gate_...):
--                 BACKFILL não dispara Lia/webhooks; LIVE dispara normalmente.
--                 Linhas LIVE não enviam a coluna (DEFAULT false).
--
-- Um único ALTER: a tabela é quente (sync a cada 3 min) e cada ALTER pega
-- ACCESS EXCLUSIVE — uma fila de lock só. PG >= 11: ADD COLUMN com DEFAULT
-- constante é metadata-only (não reescreve a tabela). Aplicar fora de pico.
--
-- Atenção (consumidores): o payload do webhook lead.created inclui a linha
-- (to_jsonb(NEW)) — Lia/n8n passam a receber os 2 campos novos (aditivo).
-- Idempotente: pode reaplicar.
-- =============================================================================

ALTER TABLE public.kenlo_leads
  ADD COLUMN IF NOT EXISTS source_crm  text    NOT NULL DEFAULT 'kenlo',
  ADD COLUMN IF NOT EXISTS is_backfill boolean NOT NULL DEFAULT false;
