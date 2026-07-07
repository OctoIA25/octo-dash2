-- =============================================================================
-- Gate de automações no outbox — APENAS em kenlo_leads (a tabela `leads`,
-- caminho manual/Zap/OLX/API, continua disparando SEMPRE, sem mudança).
--
-- lead.created só é enfileirado quando AMBOS valem:
--   1) MODO (principal, decisão D3): a linha NÃO veio de import histórico
--      (is_backfill = false). O engine de sync marca is_backfill = TRUE nos
--      INSERTs do primeiro ciclo do servidor / resync completo — BACKFILL não
--      dispara Lia; LIVE dispara normalmente.
--   2) FRESCOR (proteção adicional): lead criado nas últimas 48h. Cobre leads
--      antigos recuperados por reconciliação E o import histórico feito pelo
--      BROWSER no connect legado do Kenlo (que não passa pelo engine) — a Lia
--      não deve saudar lead velho. Leads LIVE reais têm minutos de idade.
--      COALESCE: linha sem lead_timestamp é julgada pela hora do INSERT
--      (created_at) em vez de ser silenciada sem rastro. Payload degenerado que
--      o normalizador do sync data em 1970 continua (corretamente) suprimido.
--
-- Antes desta migração a regra "backfill não dispara automações" era apenas
-- operacional (dependia de não haver webhook_subscription no momento do import).
-- Agora ela é declarativa, no banco, sem corrida com o poller do outbox.
--
-- A função enqueue_lead_created_webhook (20260625/20260701/20260703) NÃO muda —
-- só o trigger ganha a cláusula WHEN.
--
-- Robustez de aplicação manual: o ADD COLUMN defensivo abaixo (idempotente,
-- duplicado da 20260706_add_source_crm_...) garante que o CREATE TRIGGER nunca
-- falhe após o DROP por coluna ausente — cenário que deixaria kenlo_leads sem
-- trigger de lead.created em silêncio. Idempotente: pode reaplicar.
-- =============================================================================

ALTER TABLE public.kenlo_leads
  ADD COLUMN IF NOT EXISTS is_backfill boolean NOT NULL DEFAULT false;

DROP TRIGGER IF EXISTS tr_enqueue_lead_created_webhook ON public.kenlo_leads;
CREATE TRIGGER tr_enqueue_lead_created_webhook
  AFTER INSERT ON public.kenlo_leads
  FOR EACH ROW
  WHEN (NEW.is_backfill IS NOT TRUE
        AND COALESCE(NEW.lead_timestamp, NEW.created_at) >= now() - interval '48 hours')
  EXECUTE FUNCTION public.enqueue_lead_created_webhook();
