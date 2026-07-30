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
