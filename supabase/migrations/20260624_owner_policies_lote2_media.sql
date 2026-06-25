-- Lote 2 (grupo MÉDIA): troca o owner email INLINE por public.is_platform_owner()
-- nas policies de configuração e operação por tenant, para que QUALQUER owner
-- cadastrado em platform_owners tenha acesso cross-tenant nessas tabelas também.
--
-- Pré-requisito: 20260624_create_platform_owners.sql (define is_platform_owner()).
--
-- Princípio (igual ao lote 1): cada policy preserva EXATAMENTE sua lógica de
-- tenant (tenant_memberships, role IN (...)). A ÚNICA mudança é trocar o ramo do
-- owner inline por public.is_platform_owner(). Nada de isolamento é afrouxado.
--
-- Nomes e estruturas transcritos das migrations de origem (estado final). DROP+
-- CREATE explícito por policy, guardado por existência da tabela. Idempotente.
--
-- Observação: a maioria destas policies NÃO declara "TO authenticated" (usa o
-- default). Preservamos isso — recriamos sem TO onde o original não tinha, e com
-- "TO authenticated" só onde o original declarava (tenants, tenant_source_images).

-- =====================================================================
-- tenants (TO authenticated; email SEM lower/coalesce)
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.tenants') IS NOT NULL THEN
    DROP POLICY IF EXISTS "tenants_select_policy" ON public.tenants;
    CREATE POLICY "tenants_select_policy" ON public.tenants FOR SELECT TO authenticated
      USING (
        public.is_platform_owner()
        OR id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );

    DROP POLICY IF EXISTS "tenants_insert_policy" ON public.tenants;
    CREATE POLICY "tenants_insert_policy" ON public.tenants FOR INSERT TO authenticated
      WITH CHECK (public.is_platform_owner());

    DROP POLICY IF EXISTS "tenants_update_policy" ON public.tenants;
    CREATE POLICY "tenants_update_policy" ON public.tenants FOR UPDATE TO authenticated
      USING (public.is_platform_owner())
      WITH CHECK (public.is_platform_owner());

    DROP POLICY IF EXISTS "tenants_delete_policy" ON public.tenants;
    CREATE POLICY "tenants_delete_policy" ON public.tenants FOR DELETE TO authenticated
      USING (public.is_platform_owner());
  END IF;
END $$;

-- =====================================================================
-- imoveis_locais (sem TO; padrão membro OR owner)
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.imoveis_locais') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Membros podem ver imóveis do tenant" ON public.imoveis_locais;
    CREATE POLICY "Membros podem ver imóveis do tenant" ON public.imoveis_locais FOR SELECT
      USING (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "Membros podem criar imóveis" ON public.imoveis_locais;
    CREATE POLICY "Membros podem criar imóveis" ON public.imoveis_locais FOR INSERT
      WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "Membros podem atualizar imóveis do tenant" ON public.imoveis_locais;
    CREATE POLICY "Membros podem atualizar imóveis do tenant" ON public.imoveis_locais FOR UPDATE
      USING (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      )
      WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "Membros podem deletar imóveis do tenant" ON public.imoveis_locais;
    CREATE POLICY "Membros podem deletar imóveis do tenant" ON public.imoveis_locais FOR DELETE
      USING (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );
  END IF;
END $$;

-- =====================================================================
-- imoveis_corretores (sem TO)
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.imoveis_corretores') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Membros podem ver mapeamentos do tenant" ON public.imoveis_corretores;
    CREATE POLICY "Membros podem ver mapeamentos do tenant" ON public.imoveis_corretores FOR SELECT
      USING (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "Membros podem criar mapeamentos" ON public.imoveis_corretores;
    CREATE POLICY "Membros podem criar mapeamentos" ON public.imoveis_corretores FOR INSERT
      WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "Membros podem atualizar mapeamentos do tenant" ON public.imoveis_corretores;
    CREATE POLICY "Membros podem atualizar mapeamentos do tenant" ON public.imoveis_corretores FOR UPDATE
      USING (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      )
      WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "Membros podem deletar mapeamentos do tenant" ON public.imoveis_corretores;
    CREATE POLICY "Membros podem deletar mapeamentos do tenant" ON public.imoveis_corretores FOR DELETE
      USING (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );
  END IF;
END $$;

-- =====================================================================
-- imoveis_geolocalizacao (sem TO; sem DELETE no original)
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.imoveis_geolocalizacao') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Membros podem ver geocoding do tenant" ON public.imoveis_geolocalizacao;
    CREATE POLICY "Membros podem ver geocoding do tenant" ON public.imoveis_geolocalizacao FOR SELECT
      USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "Membros podem inserir geocoding do tenant" ON public.imoveis_geolocalizacao;
    CREATE POLICY "Membros podem inserir geocoding do tenant" ON public.imoveis_geolocalizacao FOR INSERT
      WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "Membros podem atualizar geocoding do tenant" ON public.imoveis_geolocalizacao;
    CREATE POLICY "Membros podem atualizar geocoding do tenant" ON public.imoveis_geolocalizacao FOR UPDATE
      USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );
  END IF;
END $$;

-- =====================================================================
-- lancamentos (sem TO)
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.lancamentos') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Membros podem ver lançamentos do tenant" ON public.lancamentos;
    CREATE POLICY "Membros podem ver lançamentos do tenant" ON public.lancamentos FOR SELECT
      USING (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "Membros podem criar lançamentos" ON public.lancamentos;
    CREATE POLICY "Membros podem criar lançamentos" ON public.lancamentos FOR INSERT
      WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "Membros podem atualizar lançamentos do tenant" ON public.lancamentos;
    CREATE POLICY "Membros podem atualizar lançamentos do tenant" ON public.lancamentos FOR UPDATE
      USING (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "Membros podem deletar lançamentos do tenant" ON public.lancamentos;
    CREATE POLICY "Membros podem deletar lançamentos do tenant" ON public.lancamentos FOR DELETE
      USING (
        tenant_id IN (SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );
  END IF;
END $$;

-- =====================================================================
-- Tabelas de config com padrão SELECT(membro) + I/U/D(manager) — todas SEM TO.
-- Helper que recria as 4 policies nomeadas {prefix}_{select,insert,update,delete}.
-- =====================================================================
DO $$
DECLARE
  r RECORD;
  -- (tabela, prefixo das policies, roles_de_escrita)
  cfg CONSTANT text[][] := ARRAY[
    ARRAY['tenant_lead_limit_config','lead_limit_config','admin,team_leader,owner','admin,owner'],
    ARRAY['tenant_lead_source_costs','lead_source_costs','admin,team_leader,owner','admin,team_leader,owner'],
    ARRAY['tenant_lead_source_channels','lead_source_channels','admin,team_leader,owner','admin,team_leader,owner']
  ];
  i int;
  tbl text; pfx text; w_iu text; w_del text;
  roles_iu_sql text; roles_del_sql text;
BEGIN
  FOR i IN 1 .. array_length(cfg,1) LOOP
    tbl := cfg[i][1]; pfx := cfg[i][2]; w_iu := cfg[i][3]; w_del := cfg[i][4];
    IF to_regclass('public.'||tbl) IS NULL THEN CONTINUE; END IF;

    roles_iu_sql  := '''' || replace(w_iu,  ',', ''',''') || '''';
    roles_del_sql := '''' || replace(w_del, ',', ''',''') || '''';

    -- SELECT: qualquer membro OR owner
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pfx||'_select', tbl);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
               OR public.is_platform_owner())
    $f$, pfx||'_select', tbl);

    -- INSERT: manager OR owner
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pfx||'_insert', tbl);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR INSERT
        WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                                  WHERE user_id = auth.uid() AND role IN (%s))
                    OR public.is_platform_owner())
    $f$, pfx||'_insert', tbl, roles_iu_sql);

    -- UPDATE: manager OR owner
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pfx||'_update', tbl);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR UPDATE
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                             WHERE user_id = auth.uid() AND role IN (%s))
               OR public.is_platform_owner())
    $f$, pfx||'_update', tbl, roles_iu_sql);

    -- DELETE: manager OR owner
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pfx||'_delete', tbl);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR DELETE
        USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                             WHERE user_id = auth.uid() AND role IN (%s))
               OR public.is_platform_owner())
    $f$, pfx||'_delete', tbl, roles_del_sql);
  END LOOP;
END $$;

-- =====================================================================
-- tenant_source_images (TO authenticated; FOR ALL; email COM lower/coalesce)
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.tenant_source_images') IS NOT NULL THEN
    DROP POLICY IF EXISTS "tenant_source_images_tenant_isolation" ON public.tenant_source_images;
    CREATE POLICY "tenant_source_images_tenant_isolation"
      ON public.tenant_source_images FOR ALL TO authenticated
      USING (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id = tenant_source_images.tenant_id AND tm.user_id = auth.uid())
      )
      WITH CHECK (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id = tenant_source_images.tenant_id AND tm.user_id = auth.uid())
      );
  END IF;
END $$;

-- =====================================================================
-- tenant_bolsao_config (sem TO; SELECT membro, I/U manager; sem DELETE)
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.tenant_bolsao_config') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Membros podem ver config do bolsao do tenant" ON public.tenant_bolsao_config;
    CREATE POLICY "Membros podem ver config do bolsao do tenant" ON public.tenant_bolsao_config FOR SELECT
      USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "Admins podem inserir config do bolsao do tenant" ON public.tenant_bolsao_config;
    CREATE POLICY "Admins podem inserir config do bolsao do tenant" ON public.tenant_bolsao_config FOR INSERT
      WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                      WHERE user_id = auth.uid() AND role IN ('admin','owner','team_leader'))
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "Admins podem atualizar config do bolsao do tenant" ON public.tenant_bolsao_config;
    CREATE POLICY "Admins podem atualizar config do bolsao do tenant" ON public.tenant_bolsao_config FOR UPDATE
      USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                      WHERE user_id = auth.uid() AND role IN ('admin','owner','team_leader'))
        OR public.is_platform_owner()
      );
  END IF;
END $$;

-- =====================================================================
-- lead_recommendations (sem TO; SELECT + INSERT, ambos qualquer membro)
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.lead_recommendations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "lead_recommendations_select" ON public.lead_recommendations;
    CREATE POLICY "lead_recommendations_select" ON public.lead_recommendations FOR SELECT
      USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "lead_recommendations_insert" ON public.lead_recommendations;
    CREATE POLICY "lead_recommendations_insert" ON public.lead_recommendations FOR INSERT
      WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );
  END IF;
END $$;

-- =====================================================================
-- lead_recommendation_preferences (sem TO; SELECT/INSERT/UPDATE, qualquer membro)
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.lead_recommendation_preferences') IS NOT NULL THEN
    DROP POLICY IF EXISTS "lead_rec_pref_select" ON public.lead_recommendation_preferences;
    CREATE POLICY "lead_rec_pref_select" ON public.lead_recommendation_preferences FOR SELECT
      USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "lead_rec_pref_upsert" ON public.lead_recommendation_preferences;
    CREATE POLICY "lead_rec_pref_upsert" ON public.lead_recommendation_preferences FOR INSERT
      WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "lead_rec_pref_update" ON public.lead_recommendation_preferences;
    CREATE POLICY "lead_rec_pref_update" ON public.lead_recommendation_preferences FOR UPDATE
      USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );
  END IF;
END $$;

-- =====================================================================
-- tenant_recommendation_config (sem TO; SELECT membro, I/U manager)
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.tenant_recommendation_config') IS NOT NULL THEN
    DROP POLICY IF EXISTS "tenant_recommendation_config_select" ON public.tenant_recommendation_config;
    CREATE POLICY "tenant_recommendation_config_select" ON public.tenant_recommendation_config FOR SELECT
      USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "tenant_recommendation_config_insert" ON public.tenant_recommendation_config;
    CREATE POLICY "tenant_recommendation_config_insert" ON public.tenant_recommendation_config FOR INSERT
      WITH CHECK (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                      WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "tenant_recommendation_config_update" ON public.tenant_recommendation_config;
    CREATE POLICY "tenant_recommendation_config_update" ON public.tenant_recommendation_config FOR UPDATE
      USING (
        tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                      WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
        OR public.is_platform_owner()
      );
  END IF;
END $$;

-- =====================================================================
-- recommendation_schedules (sem TO; SELECT/INSERT/UPDATE/DELETE, qualquer membro)
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.recommendation_schedules') IS NOT NULL THEN
    DROP POLICY IF EXISTS "rec_schedules_select" ON public.recommendation_schedules;
    CREATE POLICY "rec_schedules_select" ON public.recommendation_schedules FOR SELECT
      USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
             OR public.is_platform_owner());

    DROP POLICY IF EXISTS "rec_schedules_insert" ON public.recommendation_schedules;
    CREATE POLICY "rec_schedules_insert" ON public.recommendation_schedules FOR INSERT
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
                  OR public.is_platform_owner());

    DROP POLICY IF EXISTS "rec_schedules_update" ON public.recommendation_schedules;
    CREATE POLICY "rec_schedules_update" ON public.recommendation_schedules FOR UPDATE
      USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
             OR public.is_platform_owner());

    DROP POLICY IF EXISTS "rec_schedules_delete" ON public.recommendation_schedules;
    CREATE POLICY "rec_schedules_delete" ON public.recommendation_schedules FOR DELETE
      USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
             OR public.is_platform_owner());
  END IF;
END $$;

-- =====================================================================
-- agent_action_queue / agent_action_runs (sem TO; só SELECT tem owner inline)
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.agent_action_queue') IS NOT NULL THEN
    DROP POLICY IF EXISTS "agent_action_queue_select" ON public.agent_action_queue;
    CREATE POLICY "agent_action_queue_select" ON public.agent_action_queue FOR SELECT
      USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
             OR public.is_platform_owner());
  END IF;

  IF to_regclass('public.agent_action_runs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "agent_action_runs_select" ON public.agent_action_runs;
    CREATE POLICY "agent_action_runs_select" ON public.agent_action_runs FOR SELECT
      USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
             OR public.is_platform_owner());
  END IF;
END $$;
