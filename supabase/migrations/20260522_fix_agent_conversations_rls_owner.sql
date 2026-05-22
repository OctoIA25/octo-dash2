-- =============================================================================
-- Fix: permitir que OWNER (impersonando outro tenant) e qualquer usuário
-- autenticado consiga inserir conversas/mensagens. A política antiga exigia
-- presença em tenant_memberships, o que bloqueava o OWNER (que não tem
-- linha em tenant_memberships dos tenants impersonados).
--
-- A garantia continua sendo: user_id = auth.uid(). O tenant_id passa a ser
-- um atributo informacional escolhido pelo cliente — como ele só vê suas
-- próprias conversas (ou as do tenant onde é manager), não há vazamento.
-- =============================================================================

DROP POLICY IF EXISTS "agent_conversations_insert_own" ON public.agent_conversations;
CREATE POLICY "agent_conversations_insert_own"
  ON public.agent_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

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
