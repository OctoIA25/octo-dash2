-- =============================================================================
-- RLS de isolamento por tenant em `public.bolsao` (auditoria NEW-1).
--
-- STATUS: NEEDS DATABASE VERIFICATION.
-- `bolsao` foi criada FORA das migrations do repositório (só existe `ALTER
-- TABLE public.bolsao ...` em 20260427; nenhum CREATE TABLE, nenhum ENABLE ROW
-- LEVEL SECURITY, nenhuma CREATE POLICY). Não dá para provar pelo repositório
-- se o RLS está ligado. O front conversa com `bolsao` DIRETO via PostgREST
-- (anon key + JWT) e as leituras do bolsaoService não filtram tenant. SE o RLS
-- estiver desligado, qualquer autenticado lê/escreve o pool de TODOS os tenants
-- (PII de leads + métricas de corretores de imobiliárias concorrentes).
--
-- ANTES DE APLICAR — rodar no banco e conferir:
--
--   SELECT c.relrowsecurity, c.relforcerowsecurity
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relname = 'bolsao';        -- espera true/…
--
--   SELECT policyname, permissive, roles, cmd, qual, with_check
--     FROM pg_policies WHERE schemaname='public' AND tablename='bolsao';
--
-- Se aparecer QUALQUER policy permissiva ampla (USING(true) / sem tenant_id /
-- FOR ALL) sob outro nome, DROPÁ-LA À MÃO antes/depois — esta migration não
-- consegue remover policy de nome desconhecido. As policies criadas aqui são
-- aditivas (permissivas combinam por OR), então uma policy ruim preexistente
-- continuaria vazando.
--
-- REGRA DE NEGÓCIO
-- `bolsao` é o POOL COMPARTILHADO de leads DENTRO de um tenant: qualquer membro
-- do tenant pode ver e agir (assumir/mover/atender) sobre o pool. Logo o escopo
-- é "membro do tenant", não "dono da linha". Cross-tenant é sempre negado.
-- Platform owner (is_platform_owner) tem acesso global, como nas demais tabelas.
--
-- SEGURANÇA DE APLICAÇÃO
--  - o espelhamento tg_mirror_leads_to_bolsao é SECURITY DEFINER → roda fora do
--    RLS; ligar RLS não quebra o espelho nem a roleta/expiração (triggers);
--  - o backend de produção usa service_role → bypassa RLS, não é afetado;
--  - nenhum fluxo público/anon lê `bolsao` (o portal público lê tenant_brokers,
--    ver 20260801) → policies restritas a `authenticated` são seguras.
-- VERIFICAR EM STAGING que a UI do pool de leads continua lendo após o ENABLE.
--
-- Idempotente. Aplicar via supabase MCP / SQL editor.
-- =============================================================================

-- ENABLE RLS + DDL de policy pegam AccessExclusiveLock em bolsao, que conflita
-- com o mirror SECURITY DEFINER e a roleta/expiração. lock_timeout troca o
-- "deadlock detected" por um erro limpo de espera — reexecute se estourar
-- (idempotente), de preferência com os schedulers pausados / em baixa carga.
SET lock_timeout = '5s';

ALTER TABLE public.bolsao ENABLE ROW LEVEL SECURITY;

-- Membro do tenant OU platform owner. Inline (mesmo padrão de 20260624), sem
-- SECURITY DEFINER novo. Cast ::text dos dois lados por consistência com as
-- demais policies do projeto (tenant_id é uuid aqui, mas o cast é inócuo e
-- resiste a divergência de tipo entre tabelas).
DROP POLICY IF EXISTS "bolsao_tenant_select" ON public.bolsao;
CREATE POLICY "bolsao_tenant_select" ON public.bolsao
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_owner()
    OR tenant_id IN (SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "bolsao_tenant_insert" ON public.bolsao;
CREATE POLICY "bolsao_tenant_insert" ON public.bolsao
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_platform_owner()
    OR tenant_id IN (SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "bolsao_tenant_update" ON public.bolsao;
CREATE POLICY "bolsao_tenant_update" ON public.bolsao
  FOR UPDATE
  TO authenticated
  USING (
    public.is_platform_owner()
    OR tenant_id IN (SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_platform_owner()
    OR tenant_id IN (SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "bolsao_tenant_delete" ON public.bolsao;
CREATE POLICY "bolsao_tenant_delete" ON public.bolsao
  FOR DELETE
  TO authenticated
  USING (
    public.is_platform_owner()
    OR tenant_id IN (SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid())
  );

-- ---------- Prova (avaliada solta) ----------
DO $$
DECLARE
  v_rls  boolean;
  v_cmds int;
BEGIN
  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'bolsao';
  ASSERT v_rls, 'RLS não ficou habilitado em bolsao';

  SELECT count(*) INTO v_cmds
    FROM pg_policies
   WHERE schemaname='public' AND tablename='bolsao'
     AND cmd IN ('SELECT','INSERT','UPDATE','DELETE')
     AND policyname LIKE 'bolsao_tenant_%';
  ASSERT v_cmds = 4, 'faltam policies por comando em bolsao';

  RAISE NOTICE 'bolsao RLS: asserts OK';
END $$;

-- =============================================================================
-- ROLLBACK
--   DROP POLICY IF EXISTS "bolsao_tenant_select" ON public.bolsao;
--   DROP POLICY IF EXISTS "bolsao_tenant_insert" ON public.bolsao;
--   DROP POLICY IF EXISTS "bolsao_tenant_update" ON public.bolsao;
--   DROP POLICY IF EXISTS "bolsao_tenant_delete" ON public.bolsao;
--   -- só desligar o RLS se ele estava desligado antes (conferir a introspecção acima):
--   -- ALTER TABLE public.bolsao DISABLE ROW LEVEL SECURITY;
-- =============================================================================
