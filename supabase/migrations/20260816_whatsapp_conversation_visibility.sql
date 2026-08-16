-- =============================================================================
-- Visibilidade das conversas WhatsApp por dono (corretor) — recorte no BANCO
--
-- Antes (20260528): QUALQUER membro do tenant lia TODAS as conversas e
-- mensagens. Ou seja: todo corretor via o telefone de todo lead do tenant.
--
-- Agora:
--   • admin/owner do tenant (e o owner da plataforma) continuam vendo tudo;
--   • corretor vê SOMENTE as conversas com assigned_user_id = ele;
--   • conversa sem dono (assigned_user_id NULL) — criada pelo trigger da
--     20260702 no momento em que o lead entra, antes de a Lia atribuir — é
--     visível apenas para admin/owner. O número não sai do servidor para o
--     corretor enquanto a Lia não atribuir
--     (POST /api/v1/whatsapp/conversations/assign).
--
-- Por que RLS e não filtro no front: o recorte por usuário no cliente é
-- cosmético — a linha (com o telefone) já teria trafegado. Aqui o banco é a
-- fonte da verdade e o front não precisa conhecer a regra.
--
-- whatsapp_messages NÃO repete o predicado: exige apenas que a conversa da
-- mensagem seja visível. Como whatsapp_conversations tem RLS, o EXISTS já
-- aplica a regra acima (sem recursão: a policy de conversas não referencia
-- mensagens). Uma regra, um lugar para mudar.
--
-- Idempotente: pode ser reaplicada com segurança.
-- =============================================================================

-- Lista do corretor: WHERE tenant_id = ? AND assigned_user_id = auth.uid().
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_tenant_assigned
  ON public.whatsapp_conversations(tenant_id, assigned_user_id);

-- -----------------------------------------------------------------------------
-- Regra única de visibilidade de uma conversa.
--
-- SECURITY DEFINER para não exigir SELECT em tenant_memberships do usuário (e
-- para não depender das policies daquela tabela dentro desta). A pertinência ao
-- tenant continua obrigatória nos dois braços: ex-membro removido da imobiliária
-- perde acesso mesmo às conversas que ainda estejam no nome dele.
--
-- ponytail: 'team_leader' NÃO está na lista de gestores — o pedido foi "somente
-- admin e owner". O front hoje trata team_leader como gestão (isAdmin), então um
-- líder vê o botão de configurar mas só as conversas dele. Se mudar de ideia, é
-- acrescentar 'team_leader' no IN abaixo e reaplicar esta migração.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_read_whatsapp_conversation(
  p_tenant_id        UUID,
  p_assigned_user_id UUID
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_owner()
      OR EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = p_tenant_id
          AND tm.user_id = auth.uid()
          AND (tm.role IN ('admin', 'owner') OR p_assigned_user_id = auth.uid())
      );
$$;

-- -----------------------------------------------------------------------------
-- whatsapp_conversations
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "whatsapp_conversations_select_tenant" ON public.whatsapp_conversations;
CREATE POLICY "whatsapp_conversations_select_tenant"
  ON public.whatsapp_conversations
  FOR SELECT
  TO authenticated
  USING (public.can_read_whatsapp_conversation(tenant_id, assigned_user_id));

-- Escrita (marcar lida, renomear contato, criar conversa manual) segue o mesmo
-- recorte. WITH CHECK idêntico: o corretor não pode criar nem transferir uma
-- conversa para fora do próprio nome — inclusive não pode criar sem dono, que
-- viraria uma conversa invisível para ele mesmo.
DROP POLICY IF EXISTS "whatsapp_conversations_write_tenant" ON public.whatsapp_conversations;
CREATE POLICY "whatsapp_conversations_write_tenant"
  ON public.whatsapp_conversations
  FOR ALL
  TO authenticated
  USING (public.can_read_whatsapp_conversation(tenant_id, assigned_user_id))
  WITH CHECK (public.can_read_whatsapp_conversation(tenant_id, assigned_user_id));

-- -----------------------------------------------------------------------------
-- whatsapp_messages — herdam a visibilidade da conversa
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "whatsapp_messages_select_tenant" ON public.whatsapp_messages;
CREATE POLICY "whatsapp_messages_select_tenant"
  ON public.whatsapp_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = whatsapp_messages.conversation_id
    )
  );

DROP POLICY IF EXISTS "whatsapp_messages_insert_tenant" ON public.whatsapp_messages;
CREATE POLICY "whatsapp_messages_insert_tenant"
  ON public.whatsapp_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.whatsapp_conversations c
      WHERE c.id = whatsapp_messages.conversation_id
    )
  );

COMMENT ON COLUMN public.whatsapp_conversations.assigned_user_id IS
  'Corretor dono da conversa (auth.users.id, mesmo uuid de leads.attended_by_id). Define a visibilidade: NULL = só admin/owner. Atribuído pela Lia via POST /api/v1/whatsapp/conversations/assign.';
