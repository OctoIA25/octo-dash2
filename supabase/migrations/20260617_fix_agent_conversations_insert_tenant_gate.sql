-- C5: corrige o INSERT de agent_conversations.
--
-- Problema: 20260522_fix_agent_conversations_rls_owner.sql trocou o WITH CHECK do INSERT
-- para apenas (user_id = auth.uid()), removendo a checagem de tenant para permitir o
-- OWNER (que não tem linha em tenant_memberships do tenant impersonado). Efeito colateral:
-- um usuário comum pode INSERIR conversa carimbando o tenant_id de OUTRO tenant
-- (poisoning da auditoria/visão de outro tenant).
--
-- Correção: restaurar o gate de tenant SEM quebrar o owner — exigir que o usuário seja
-- membro do tenant informado OU seja o owner da plataforma (email inline no JWT).
-- Para usuários normais o tenant_id sempre vem do próprio AuthContext (são membros),
-- então não há quebra de fluxo. agent_messages fica coberto transitivamente: seu INSERT
-- já exige uma conversa existente e pertencente ao próprio usuário, com tenant_id igual.

DROP POLICY IF EXISTS "agent_conversations_insert_own" ON public.agent_conversations;
CREATE POLICY "agent_conversations_insert_own"
  ON public.agent_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
      OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                 WHERE tm.tenant_id = agent_conversations.tenant_id AND tm.user_id = auth.uid())
    )
  );
