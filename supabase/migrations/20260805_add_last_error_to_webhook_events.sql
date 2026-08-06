-- =============================================================================
-- webhook_events.last_error — coluna existe no CREATE TABLE (20260517) mas NÃO
-- em produção: a tabela foi criada antes e o IF NOT EXISTS mascarou a diferença.
--
-- Consequência: o UPDATE de falha do poller (processWebhookEvents) escreve
-- last_error e morre com 42703. Como o resultado do .update() não era conferido,
-- a falha sumia — o evento ficava 'pending' com attempts=0 e next_attempt_at
-- congelado no created_at, re-tentando a cada 5s para sempre, com aparência de
-- fila normal. Diagnosticado em 05/08/2026 no primeiro lead.created que teve
-- uma subscription real para entregar.
--
-- Aplicar ANTES de reiniciar o servidor com o recordOutcome() novo, senão o log
-- de erro dispara a cada tick de cada evento que falhar.
--
-- Idempotente.
-- =============================================================================

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS last_error TEXT;
