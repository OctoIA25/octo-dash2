-- =============================================================================
-- Gate de frescor no lead.created de `leads` — espelho do gate de kenlo_leads
-- (20260706_webhook_gate_backfill_freshness), agora que `leads` também recebe
-- import histórico: o primeiro sync Santa Ângela de um tenant (last_sync_at
-- null) varre TODAS as páginas do grid e insere a base antiga com o created_at
-- original preservado.
--
-- Sem este gate, cada lead histórico inserido enfileiraria um lead.created e a
-- Lia saudaria centenas de pessoas cadastradas anos atrás.
--
-- Regra: lead.created só é enfileirado quando o lead foi criado nas últimas
-- 48h (created_at do lead, que o sync preenche com a data de cadastro na
-- origem). Leads reais de qualquer caminho vivo (painel, Zap, OLX, API, Lia,
-- sync Santa Ângela página 1) têm minutos de idade — nada muda para eles.
--
-- ORDEM DE DEPLOY: aplicar esta migration ANTES de subir o código com o
-- primeiro-sync completo (santaAngelaSyncService `full`), senão um tenant novo
-- conectado dispara a Lia para a base histórica inteira.
--
-- A função enqueue_lead_created_webhook não muda — só o trigger ganha WHEN.
-- Idempotente: pode reaplicar.
-- =============================================================================

DROP TRIGGER IF EXISTS tr_enqueue_lead_created_webhook ON public.leads;
CREATE TRIGGER tr_enqueue_lead_created_webhook
  AFTER INSERT ON public.leads
  FOR EACH ROW
  WHEN (COALESCE(NEW.created_at, now()) >= now() - interval '48 hours')
  EXECUTE FUNCTION public.enqueue_lead_created_webhook();
