-- Lote 2b (CONSOLIDAÇÃO): corrige a bagunça de policies em 5 tabelas onde o banco
-- divergiu das migrations versionadas.
--
-- Contexto: o lote 2 (20260624_owner_policies_lote2_media.sql) usou nomes de policy
-- vindos das migrations de origem, mas o BANCO REAL tinha nomes diferentes
-- (imoveis_corretores_select em vez de "Membros podem ver...", além de policies
-- *_owner_bypass criadas fora do versionamento). Resultado: duplicatas e policies
-- antigas com email inline sobreviveram.
--
-- Estratégia: para cada uma das 5 tabelas, DROPAR TODAS as policies existentes
-- (varrendo pg_policies — pega qualquer nome) e recriar UM conjunto único, limpo e
-- coerente: acesso = membro do tenant OR public.is_platform_owner(). Sem policy de
-- owner_bypass separada, sem email inline, sem duplicata.
--
-- Nível de escrita preservado conforme o que cada tabela já praticava:
--   - imoveis_corretores, imoveis_locais: qualquer MEMBRO escreve (FOR ALL).
--   - tenants: leitura por membro; escrita só owner (era o comportamento via
--     tenants_*_policy + tenants_select_owner/_if_member).
--   - tenant_bolsao_config, tenant_lead_limit_config: leitura por membro; escrita
--     por manager (admin/team_leader/owner). DELETE de lead_limit era admin/owner.
--
-- Idempotente: o DROP varre por nome real; o CREATE usa nomes canônicos *_select etc.

-- Helper inline: dropa todas as policies de uma tabela.
-- (repetido por tabela via DO block para manter guarda de existência)

-- ===================== imoveis_corretores =====================
-- Membro escreve tudo → uma policy FOR ALL.
DO $$
DECLARE pol RECORD;
BEGIN
  IF to_regclass('public.imoveis_corretores') IS NULL THEN RETURN; END IF;
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='imoveis_corretores' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.imoveis_corretores', pol.policyname);
  END LOOP;

  CREATE POLICY "imoveis_corretores_tenant" ON public.imoveis_corretores FOR ALL TO authenticated
    USING (
      public.is_platform_owner()
      OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    )
    WITH CHECK (
      public.is_platform_owner()
      OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    );
END $$;

-- ===================== imoveis_locais =====================
DO $$
DECLARE pol RECORD;
BEGIN
  IF to_regclass('public.imoveis_locais') IS NULL THEN RETURN; END IF;
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='imoveis_locais' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.imoveis_locais', pol.policyname);
  END LOOP;

  CREATE POLICY "imoveis_locais_tenant" ON public.imoveis_locais FOR ALL TO authenticated
    USING (
      public.is_platform_owner()
      OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    )
    WITH CHECK (
      public.is_platform_owner()
      OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    );
END $$;

-- ===================== tenants =====================
-- Leitura: membro do tenant OR owner. Escrita (insert/update/delete): só owner
-- (era o comportamento das tenants_*_policy, que tinham só email no write).
DO $$
DECLARE pol RECORD;
BEGIN
  IF to_regclass('public.tenants') IS NULL THEN RETURN; END IF;
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='tenants' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tenants', pol.policyname);
  END LOOP;

  CREATE POLICY "tenants_select" ON public.tenants FOR SELECT TO authenticated
    USING (
      public.is_platform_owner()
      OR id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    );

  CREATE POLICY "tenants_insert" ON public.tenants FOR INSERT TO authenticated
    WITH CHECK (public.is_platform_owner());

  CREATE POLICY "tenants_update" ON public.tenants FOR UPDATE TO authenticated
    USING (public.is_platform_owner())
    WITH CHECK (public.is_platform_owner());

  CREATE POLICY "tenants_delete" ON public.tenants FOR DELETE TO authenticated
    USING (public.is_platform_owner());
END $$;

-- ===================== tenant_bolsao_config =====================
-- Leitura: membro OR owner. Escrita: manager OR owner.
DO $$
DECLARE pol RECORD;
BEGIN
  IF to_regclass('public.tenant_bolsao_config') IS NULL THEN RETURN; END IF;
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='tenant_bolsao_config' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tenant_bolsao_config', pol.policyname);
  END LOOP;

  CREATE POLICY "tenant_bolsao_config_select" ON public.tenant_bolsao_config FOR SELECT TO authenticated
    USING (
      public.is_platform_owner()
      OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    );

  CREATE POLICY "tenant_bolsao_config_write" ON public.tenant_bolsao_config FOR ALL TO authenticated
    USING (
      public.is_platform_owner()
      OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                       WHERE user_id = auth.uid() AND role IN ('admin','owner','team_leader'))
    )
    WITH CHECK (
      public.is_platform_owner()
      OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                       WHERE user_id = auth.uid() AND role IN ('admin','owner','team_leader'))
    );
END $$;

-- ===================== tenant_lead_limit_config =====================
-- Leitura: membro OR owner. Escrita: manager OR owner.
DO $$
DECLARE pol RECORD;
BEGIN
  IF to_regclass('public.tenant_lead_limit_config') IS NULL THEN RETURN; END IF;
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='tenant_lead_limit_config' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tenant_lead_limit_config', pol.policyname);
  END LOOP;

  CREATE POLICY "lead_limit_config_select" ON public.tenant_lead_limit_config FOR SELECT TO authenticated
    USING (
      public.is_platform_owner()
      OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
    );

  CREATE POLICY "lead_limit_config_write" ON public.tenant_lead_limit_config FOR ALL TO authenticated
    USING (
      public.is_platform_owner()
      OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                       WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
    )
    WITH CHECK (
      public.is_platform_owner()
      OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                       WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
    );
END $$;
