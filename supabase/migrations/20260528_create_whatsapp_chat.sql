-- =============================================================================
-- Chat com WhatsApp (Meta Cloud API) — multi-tenant
--
-- Estrutura:
--   whatsapp_config        — credenciais Meta Cloud por tenant
--   whatsapp_conversations — uma linha por contato (telefone) por tenant
--   whatsapp_messages      — mensagens (in/out), referência ao wa_message_id da Meta
--
-- Visibilidade:
--   Qualquer membro do tenant pode ler conversas/mensagens do seu tenant.
--   Somente admin/owner do tenant pode escrever/alterar whatsapp_config.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Configuração WhatsApp por tenant
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL,
  business_account_id TEXT,
  display_phone_number TEXT,
  access_token TEXT NOT NULL,
  webhook_verify_token TEXT NOT NULL,
  app_secret TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_config_phone_number_id
  ON public.whatsapp_config(phone_number_id);

-- -----------------------------------------------------------------------------
-- Conversas (uma por contato/telefone por tenant)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  contact_profile_name TEXT,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id UUID,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, contact_phone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_tenant_last
  ON public.whatsapp_conversations(tenant_id, last_message_at DESC NULLS LAST);

-- -----------------------------------------------------------------------------
-- Mensagens
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wa_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'template', 'system')),
  body TEXT,
  media_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  error_message TEXT,
  sent_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  wa_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id
  ON public.whatsapp_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation
  ON public.whatsapp_messages(conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- Trigger: atualizar last_message_preview/last_message_at/unread_count
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_whatsapp_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.whatsapp_conversations
  SET
    last_message_preview = LEFT(COALESCE(NEW.body, NEW.message_type), 200),
    last_message_at = COALESCE(NEW.wa_timestamp, NEW.created_at),
    unread_count = CASE
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      ELSE unread_count
    END,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_whatsapp_conversation_on_message ON public.whatsapp_messages;
CREATE TRIGGER tr_sync_whatsapp_conversation_on_message
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_whatsapp_conversation_on_message();

CREATE OR REPLACE FUNCTION public.touch_whatsapp_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_touch_whatsapp_conversations ON public.whatsapp_conversations;
CREATE TRIGGER tr_touch_whatsapp_conversations
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_whatsapp_updated_at();

DROP TRIGGER IF EXISTS tr_touch_whatsapp_config ON public.whatsapp_config;
CREATE TRIGGER tr_touch_whatsapp_config
  BEFORE UPDATE ON public.whatsapp_config
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_whatsapp_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.whatsapp_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages      ENABLE ROW LEVEL SECURITY;

-- Helper: dono da plataforma (acesso a todos os tenants).
-- Email lido direto do JWT — não exige SELECT em auth.users.
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com';
$$;

-- whatsapp_config: admin/owner do tenant OU owner da plataforma
DROP POLICY IF EXISTS "whatsapp_config_select_admin" ON public.whatsapp_config;
CREATE POLICY "whatsapp_config_select_admin"
  ON public.whatsapp_config
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = whatsapp_config.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'owner')
    )
  );

DROP POLICY IF EXISTS "whatsapp_config_write_admin" ON public.whatsapp_config;
CREATE POLICY "whatsapp_config_write_admin"
  ON public.whatsapp_config
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = whatsapp_config.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = whatsapp_config.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'owner')
    )
  );

-- whatsapp_conversations: membro do tenant OU owner da plataforma
DROP POLICY IF EXISTS "whatsapp_conversations_select_tenant" ON public.whatsapp_conversations;
CREATE POLICY "whatsapp_conversations_select_tenant"
  ON public.whatsapp_conversations
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = whatsapp_conversations.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "whatsapp_conversations_write_tenant" ON public.whatsapp_conversations;
CREATE POLICY "whatsapp_conversations_write_tenant"
  ON public.whatsapp_conversations
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = whatsapp_conversations.tenant_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = whatsapp_conversations.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

-- whatsapp_messages: membro do tenant OU owner da plataforma
DROP POLICY IF EXISTS "whatsapp_messages_select_tenant" ON public.whatsapp_messages;
CREATE POLICY "whatsapp_messages_select_tenant"
  ON public.whatsapp_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = whatsapp_messages.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "whatsapp_messages_insert_tenant" ON public.whatsapp_messages;
CREATE POLICY "whatsapp_messages_insert_tenant"
  ON public.whatsapp_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id = whatsapp_messages.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Realtime (broadcast de INSERT/UPDATE para Supabase Realtime)
-- -----------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;

-- -----------------------------------------------------------------------------
-- Comentários
-- -----------------------------------------------------------------------------

COMMENT ON TABLE  public.whatsapp_config        IS 'Credenciais Meta Cloud API por tenant. access_token deve ser tratado como segredo.';
COMMENT ON TABLE  public.whatsapp_conversations IS 'Uma linha por contato (telefone) por tenant. Atualizada por trigger ao chegar mensagem.';
COMMENT ON TABLE  public.whatsapp_messages      IS 'Mensagens enviadas/recebidas via WhatsApp Cloud API. wa_message_id é o ID retornado pela Meta.';
COMMENT ON COLUMN public.whatsapp_messages.metadata IS 'Payload bruto da Meta para auditoria/depuração (contact, profile, errors, contexto de reply).';
