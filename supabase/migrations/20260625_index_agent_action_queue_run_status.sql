-- ============================================================
-- MIGRATION: índice composto para o count de progresso por status
--
-- A rota /communication/dispatch/runs/:id/progress conta itens por status
-- (done/failed/pending/processing) de um run. Sem um índice (run_id, status),
-- cada count escaneia todos os itens do run (até 10k+). O índice composto
-- transforma cada count num range scan curto por status.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_agent_action_queue_run_status
  ON public.agent_action_queue (run_id, status);
