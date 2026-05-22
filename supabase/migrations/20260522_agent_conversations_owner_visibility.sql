-- =============================================================================
-- Fix: permitir que o OWNER da plataforma veja conversas/mensagens de qualquer
-- tenant que esteja impersonando (o OWNER não tem linha em tenant_memberships
-- dos tenants impersonados, por isso o gestor "embutido" da política antiga
-- não passava). Segue o mesmo padrão das outras migrations do projeto:
-- (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- agent_conversations: SELECT (dono | gestor do tenant | OWNER)
-- ---------------------------------------------------------------------------
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
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- ---------------------------------------------------------------------------
-- agent_messages: SELECT (dono | gestor do tenant | OWNER)
-- ---------------------------------------------------------------------------
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
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- ---------------------------------------------------------------------------
-- agent_conversations: UPDATE/DELETE (dono | OWNER)
-- O OWNER em impersonation precisa poder renomear/arquivar/excluir conversas
-- que ele próprio criou na conta impersonada, ou que está auditando.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "agent_conversations_update_own" ON public.agent_conversations;
CREATE POLICY "agent_conversations_update_own"
  ON public.agent_conversations
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

DROP POLICY IF EXISTS "agent_conversations_delete_own" ON public.agent_conversations;
CREATE POLICY "agent_conversations_delete_own"
  ON public.agent_conversations
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );
