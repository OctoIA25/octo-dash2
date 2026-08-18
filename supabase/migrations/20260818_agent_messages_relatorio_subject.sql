-- =============================================================================
-- Relatórios da Elaine visíveis para o corretor analisado.
--
-- Problema: o relatório que o GESTOR gera sobre um corretor fica gravado na
-- conversa do gestor (agent_messages.user_id = gestor). O gestor enxerga tudo
-- do tenant, mas o corretor só enxerga o que ele mesmo escreveu — ou seja, o
-- relatório sobre ele próprio ficava invisível para ele.
--
-- Solução: a mensagem de resposta da Elaine passa a carregar em metadata quem
-- é o SUJEITO do relatório (metadata->>'subject_email'). O SELECT de
-- agent_messages ganha essa cláusula, então o corretor lê os relatórios sobre
-- ele independentemente de quem os gerou.
--
-- Escopo deliberado: só leitura, e só a mensagem marcada como relatório. A
-- conversa do gestor continua privada — o corretor não passa a ver o chat
-- inteiro, apenas o relatório.
--
-- ponytail: sem índice em metadata->>'subject_corretor_id'/'subject_email'.
-- agent_messages tem dezenas de linhas (57 em 18/08/2026) e a listagem já é
-- LIMIT 50 — seq scan é mais rápido que o índice. Crie o índice parcial
-- (WHERE metadata->>'is_report' = 'true') quando a tabela passar de ~100k
-- linhas ou a listagem ficar lenta de verdade; até lá ele só custa lock de
-- DDL e manutenção de escrita.
-- =============================================================================

-- Falha rápido em vez de deadlockar contra o tráfego do app: o DROP/CREATE
-- POLICY pega AccessExclusiveLock em agent_messages. Se não conseguir em 5s,
-- aborta e você roda de novo — nada fica pela metade.
SET lock_timeout = '5s';

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
    -- Sujeito do relatório: o corretor analisado lê o relatório sobre ele.
    OR LOWER(metadata ->> 'subject_email') = LOWER(auth.jwt() ->> 'email')
  );
