-- =============================================================================
-- Webhook outbox para eventos de leads
--
-- Objetivo: qualquer lead inserido em public.leads, seja pelo painel, API,
-- importacao ou outro caminho, gera um evento pendente em webhook_events.
-- O servidor Express processa essa fila e envia para webhook_subscriptions.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Webhook',
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT ARRAY['lead.created'],
  secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_tenant_status
  ON public.webhook_subscriptions(tenant_id, status);

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_unique_source
  ON public.webhook_events(event_type, source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_pending
  ON public.webhook_events(status, next_attempt_at, created_at);

ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members can list webhook subscriptions" ON public.webhook_subscriptions;
CREATE POLICY "tenant members can list webhook subscriptions"
  ON public.webhook_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = webhook_subscriptions.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant members can insert webhook subscriptions" ON public.webhook_subscriptions;
CREATE POLICY "tenant members can insert webhook subscriptions"
  ON public.webhook_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = webhook_subscriptions.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant members can update webhook subscriptions" ON public.webhook_subscriptions;
CREATE POLICY "tenant members can update webhook subscriptions"
  ON public.webhook_subscriptions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = webhook_subscriptions.tenant_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = webhook_subscriptions.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant members can delete webhook subscriptions" ON public.webhook_subscriptions;
CREATE POLICY "tenant members can delete webhook subscriptions"
  ON public.webhook_subscriptions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = webhook_subscriptions.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

-- webhook_events e tabela interna: usuarios autenticados nao precisam inserir
-- nela diretamente. A trigger abaixo usa SECURITY DEFINER para contornar RLS
-- apenas nesse caminho controlado.
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
    'leads',
    NEW.id::text,
    to_jsonb(NEW)
  )
  ON CONFLICT (event_type, source_table, source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_enqueue_lead_created_webhook ON public.leads;
CREATE TRIGGER tr_enqueue_lead_created_webhook
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_lead_created_webhook();
