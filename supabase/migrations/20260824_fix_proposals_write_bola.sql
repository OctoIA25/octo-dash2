-- =============================================================================
-- Fecha o BOLA intra-tenant de `proposals` (auditoria NEW-2, CONFIRMED).
--
-- PROBLEMA
-- `20260519_create_proposals.sql` criou a policy de escrita como FOR ALL:
--
--   CREATE POLICY "Tenant members can write proposals" ON public.proposals
--     FOR ALL TO authenticated
--     USING (proposals_can_access_tenant(tenant_id))         -- só ser membro
--     WITH CHECK (proposals_can_access_tenant(tenant_id));
--
-- `20260602_proposals_restrict_corretor_read.sql` restringiu SÓ o SELECT
-- (corretor lê apenas as suas). Como o Postgres combina policies permissivas do
-- MESMO comando com OR, e FOR ALL também cobre SELECT, o USING acima
-- REABRIA a leitura para o tenant inteiro — anulando 20260602 — e ainda
-- permitia que qualquer corretor fizesse UPDATE/DELETE em QUALQUER proposta do
-- tenant (reatribuir agent_user_id, adulterar value/forecast_*, apagar a
-- proposta de um colega). É BOLA intra-tenant sobre dado financeiro.
--
-- CORREÇÃO (causa raiz)
-- Remove o FOR ALL e cria policies POR COMANDO com escopo de dono/gestor. O
-- SELECT restrito de 20260602 fica intacto e volta a valer sozinho.
--
-- REGRA DE NEGÓCIO PRESERVADA
--  - gestor do tenant (proposals_is_tenant_manager: owner por email, ou
--    membership admin/team_leader/owner): escreve qualquer proposta do tenant;
--  - corretor: escreve só as suas (agent_user_id OU created_by = auth.uid()).
-- Não é cross-tenant (proposals_can_access_tenant continua ancorando o tenant).
--
-- POR QUE NÃO QUEBRA OS FLUXOS LEGÍTIMOS
--  - a única escrita direta do app é forecastService.updateForecast (ação de
--    gestor/dono) — coberta pelas duas ramificações;
--  - o espelhamento tg_mirror_lead_to_proposal é SECURITY DEFINER: roda fora do
--    RLS e não é afetado por estas policies;
--  - proposal_parties / proposal_history mantêm o FOR ALL delas, mas o USING
--    delas passa por um EXISTS em `proposals` — subquery SUJEITA ao RLS de
--    proposals —, então a restrição de SELECT aqui cascateia e fecha a escrita
--    de parties/history nas propostas que o usuário não pode ver. Nada a mudar
--    lá.
--
-- OWNERSHIP TAKEOVER
-- Um corretor não consegue MIRAR a proposta de outro (o USING de UPDATE/DELETE
-- exige que ele já seja dono/gestor). O WITH CHECK impede que o resultado deixe
-- de ser dele (a não ser que seja gestor). Resíduo aceito: o dono pode reatribuir
-- a PRÓPRIA proposta (dar de si para outro), o que não é sequestro.
--
-- Idempotente. Aplicar em produção via supabase MCP / SQL editor.
-- Ver RELATORIO-AUDITORIA-SEGURANCA.md (NEW-2).
-- =============================================================================

-- DDL de policy pega AccessExclusiveLock em proposals, que conflita com o
-- tráfego vivo (o mirror SECURITY DEFINER, syncs). lock_timeout troca o
-- "deadlock detected" por um erro limpo de espera — reexecute a migration se
-- estourar (idempotente), de preferência numa janela de menos tráfego.
SET lock_timeout = '5s';

-- 1. Remove a policy FOR ALL problemática. O SELECT restrito de 20260602
--    ("Tenant members can view proposals") permanece e passa a governar a
--    leitura sozinho.
DROP POLICY IF EXISTS "Tenant members can write proposals" ON public.proposals;

-- 2. INSERT — gestor ou a linha nasce do próprio usuário.
DROP POLICY IF EXISTS "proposals_insert_owner_or_manager" ON public.proposals;
CREATE POLICY "proposals_insert_owner_or_manager" ON public.proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.proposals_can_access_tenant(tenant_id)
    AND (
      public.proposals_is_tenant_manager(tenant_id)
      OR created_by = auth.uid()
      OR agent_user_id = auth.uid()
    )
  );

-- 3. UPDATE — só mira linhas que gerencia/possui (USING) e o resultado precisa
--    continuar gerenciado/possuído (WITH CHECK). Bloqueia takeover de proposta
--    alheia.
DROP POLICY IF EXISTS "proposals_update_owner_or_manager" ON public.proposals;
CREATE POLICY "proposals_update_owner_or_manager" ON public.proposals
  FOR UPDATE
  TO authenticated
  USING (
    public.proposals_can_access_tenant(tenant_id)
    AND (
      public.proposals_is_tenant_manager(tenant_id)
      OR agent_user_id = auth.uid()
      OR created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.proposals_can_access_tenant(tenant_id)
    AND (
      public.proposals_is_tenant_manager(tenant_id)
      OR agent_user_id = auth.uid()
      OR created_by = auth.uid()
    )
  );

-- 4. DELETE — gestor ou dono.
DROP POLICY IF EXISTS "proposals_delete_owner_or_manager" ON public.proposals;
CREATE POLICY "proposals_delete_owner_or_manager" ON public.proposals
  FOR DELETE
  TO authenticated
  USING (
    public.proposals_can_access_tenant(tenant_id)
    AND (
      public.proposals_is_tenant_manager(tenant_id)
      OR agent_user_id = auth.uid()
      OR created_by = auth.uid()
    )
  );

-- ---------- Prova (avaliada solta; sem INSERT de mentira em proposals) ----------
-- Confirma que (a) a policy FOR ALL sumiu e (b) existem as três policies novas
-- por comando, nenhuma delas FOR ALL.
DO $$
DECLARE
  v_forall int;
  v_cmds   int;
BEGIN
  SELECT count(*) INTO v_forall
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'proposals'
     AND policyname = 'Tenant members can write proposals';
  ASSERT v_forall = 0, 'a policy de escrita irrestrita ainda existe em proposals';

  SELECT count(*) INTO v_cmds
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'proposals'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
     AND policyname LIKE 'proposals_%_owner_or_manager';
  ASSERT v_cmds = 3, 'faltam policies por comando (INSERT/UPDATE/DELETE) em proposals';

  RAISE NOTICE 'proposals write BOLA fix: asserts OK';
END $$;

-- =============================================================================
-- ROLLBACK (reabre o buraco — só para emergência)
--   DROP POLICY IF EXISTS "proposals_insert_owner_or_manager" ON public.proposals;
--   DROP POLICY IF EXISTS "proposals_update_owner_or_manager" ON public.proposals;
--   DROP POLICY IF EXISTS "proposals_delete_owner_or_manager" ON public.proposals;
--   CREATE POLICY "Tenant members can write proposals" ON public.proposals
--     FOR ALL TO authenticated
--     USING (public.proposals_can_access_tenant(tenant_id))
--     WITH CHECK (public.proposals_can_access_tenant(tenant_id));
-- =============================================================================
