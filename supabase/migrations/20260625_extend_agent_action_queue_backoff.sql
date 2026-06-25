-- ============================================================
-- MIGRATION: Colunas de backoff/retry em agent_action_queue
--
-- Suporte ao worker de outbox endurecido (Task 13): retry com backoff e teto de
-- tentativas. A coluna `attempts` já existe (migration 20260620); aqui
-- adicionamos:
--  - next_attempt_at: quando o item volta a ser elegível para claim. NULL =
--    elegível imediatamente (itens novos). Em falha, o worker agenda o futuro.
--  - max_attempts: teto de tentativas antes de marcar 'failed' (default 5).
--
-- Aditivo e idempotente (ADD COLUMN IF NOT EXISTS).
--
-- ÍNDICE: NÃO criamos um índice novo aqui. O índice parcial existente
-- `idx_agent_action_queue_pending ON (status, created_at) WHERE status='pending'`
-- (migration 20260620) já cobre o claim por status+ordem. O índice por
-- `next_attempt_at` que o claim com backoff (SKIP LOCKED) pode exigir será
-- avaliado na Task 13, junto da query real — evitamos criar índice especulativo
-- aqui (write-amplification sem consumidor ainda).
-- ============================================================

ALTER TABLE public.agent_action_queue
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5;

COMMENT ON COLUMN public.agent_action_queue.next_attempt_at
  IS 'Quando o item volta a ser elegível para processamento (backoff). NULL = elegível imediatamente.';
COMMENT ON COLUMN public.agent_action_queue.max_attempts
  IS 'Teto de tentativas antes de marcar o item como failed (default 5).';
