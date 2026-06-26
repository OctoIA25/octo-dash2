-- =============================================================================
-- Webhook lead.created — cobertura da tabela kenlo_leads
--
-- Contexto: a migracao 20260517_create_webhook_outbox.sql criou a trigger
-- tr_enqueue_lead_created_webhook APENAS em public.leads. Porem os caminhos de
-- criacao de lead via API (POST /api/v1/leads, /batch, /upsert) e os caminhos
-- Kenlo inserem em public.kenlo_leads. Resultado: esses leads nunca enfileiravam
-- o evento lead.created e, portanto, nunca disparavam webhook.
--
-- Esta migracao fecha a lacuna SEM tocar em rota Express:
--   1. Generaliza a funcao de enqueue para usar TG_TABLE_NAME como source_table.
--      Isso e necessario porque o indice unico de webhook_events e
--      (event_type, source_table, source_id); um id de kenlo_leads pode colidir
--      com um id de leads se ambos gravassem source_table = 'leads'.
--   2. Recria a trigger em public.leads (agora apontando para source_table='leads'
--      via TG_TABLE_NAME, comportamento identico ao anterior).
--   3. Cria a mesma trigger em public.kenlo_leads.
--
-- Idempotente: pode ser reaplicada com seguranca.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_lead_created_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.webhook_events (
    tenant_id,
    event_type,
    source_table,
    source_id,
    payload
  )
  VALUES (
    NEW.tenant_id,
    'lead.created',
    TG_TABLE_NAME,        -- 'leads' ou 'kenlo_leads', conforme a tabela de origem
    NEW.id::text,
    to_jsonb(NEW)
  )
  ON CONFLICT (event_type, source_table, source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Recria a trigger em leads (mantem o comportamento existente)
DROP TRIGGER IF EXISTS tr_enqueue_lead_created_webhook ON public.leads;
CREATE TRIGGER tr_enqueue_lead_created_webhook
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_lead_created_webhook();

-- Nova cobertura: kenlo_leads (caminhos de API e Kenlo)
DROP TRIGGER IF EXISTS tr_enqueue_lead_created_webhook ON public.kenlo_leads;
CREATE TRIGGER tr_enqueue_lead_created_webhook
  AFTER INSERT ON public.kenlo_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_lead_created_webhook();
