-- =============================================================================
-- Histórico de conversas dos Agentes de IA (Caio Kotler, Elaine)
--
-- Objetivo: persistir cada conversa do usuário com os agentes para que
-- seja possível abrir o histórico depois, retomar uma conversa ou (para
-- gestores) auditar as conversas dos corretores do mesmo tenant.
--
-- Visibilidade:
--   - Corretor: enxerga apenas as próprias conversas/mensagens.
--   - Gestor (admin/owner/team_leader): enxerga as conversas/mensagens de
--     todos os usuários do mesmo tenant_id (somente leitura).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_slug TEXT NOT NULL CHECK (agent_slug IN ('caio', 'elaine')),
  title TEXT NOT NULL DEFAULT 'Nova conversa',
  user_name TEXT,
  user_email TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_user
  ON public.agent_conversations(user_id, agent_slug, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_tenant
  ON public.agent_conversations(tenant_id, agent_slug, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'agent', 'system')),
  content TEXT NOT NULL,
  display_content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation
  ON public.agent_messages(conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- Trigger: manter message_count, last_message_at e updated_at na conversa
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_agent_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.agent_conversations
  SET
    message_count = message_count + 1,
    last_message_at = NEW.created_at,
    updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_sync_agent_conversation_on_message ON public.agent_messages;
CREATE TRIGGER tr_sync_agent_conversation_on_message
  AFTER INSERT ON public.agent_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_agent_conversation_on_message();

CREATE OR REPLACE FUNCTION public.touch_agent_conversation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_touch_agent_conversation_updated_at ON public.agent_conversations;
CREATE TRIGGER tr_touch_agent_conversation_updated_at
  BEFORE UPDATE ON public.agent_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_agent_conversation_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

-- Conversas: dono pode ver suas próprias; gestor pode ver as do tenant
DROP POLICY IF EXISTS "agent_conversations_select_own_or_manager" ON public.agent_conversations;
CREATE POLICY "agent_conversations_select_own_or_manager"
  ON public.agent_conversations
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = agent_conversations.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'owner', 'team_leader')
    )
  );

-- Conversas: somente o próprio usuário insere
DROP POLICY IF EXISTS "agent_conversations_insert_own" ON public.agent_conversations;
CREATE POLICY "agent_conversations_insert_own"
  ON public.agent_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = agent_conversations.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

-- Conversas: dono pode atualizar (ex.: renomear, arquivar)
DROP POLICY IF EXISTS "agent_conversations_update_own" ON public.agent_conversations;
CREATE POLICY "agent_conversations_update_own"
  ON public.agent_conversations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Conversas: dono pode deletar
DROP POLICY IF EXISTS "agent_conversations_delete_own" ON public.agent_conversations;
CREATE POLICY "agent_conversations_delete_own"
  ON public.agent_conversations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Mensagens: mesma regra (dono OU gestor do tenant)
DROP POLICY IF EXISTS "agent_messages_select_own_or_manager" ON public.agent_messages;
CREATE POLICY "agent_messages_select_own_or_manager"
  ON public.agent_messages
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = agent_messages.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'owner', 'team_leader')
    )
  );

-- Mensagens: somente o próprio usuário insere (gestor não escreve em chat alheio)
DROP POLICY IF EXISTS "agent_messages_insert_own" ON public.agent_messages;
CREATE POLICY "agent_messages_insert_own"
  ON public.agent_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.agent_conversations c
      WHERE c.id = agent_messages.conversation_id
        AND c.user_id = auth.uid()
        AND c.tenant_id = agent_messages.tenant_id
    )
  );

-- Mensagens: dono pode deletar (raro, mas mantém simetria)
DROP POLICY IF EXISTS "agent_messages_delete_own" ON public.agent_messages;
CREATE POLICY "agent_messages_delete_own"
  ON public.agent_messages
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Comentários
-- -----------------------------------------------------------------------------

COMMENT ON TABLE public.agent_conversations IS 'Conversas dos Agentes de IA (Caio Kotler, Elaine). Uma linha por sessão de chat.';
COMMENT ON COLUMN public.agent_conversations.agent_slug IS 'Identificador do agente: caio (Marketing) ou elaine (Comportamental).';
COMMENT ON COLUMN public.agent_conversations.title IS 'Título derivado das primeiras palavras da primeira mensagem do usuário.';
COMMENT ON TABLE public.agent_messages IS 'Mensagens individuais de cada conversa (user/agent/system).';
COMMENT ON COLUMN public.agent_messages.content IS 'Conteúdo enviado para o webhook (texto completo do prompt).';
COMMENT ON COLUMN public.agent_messages.display_content IS 'Conteúdo exibido no chat (texto resumido quando vem de um botão de especialidade).';
COMMENT ON COLUMN public.agent_messages.metadata IS 'Anexos da mensagem (snapshots DISC/Eneagrama/MBTI, especialidade, corretor selecionado, etc).';
