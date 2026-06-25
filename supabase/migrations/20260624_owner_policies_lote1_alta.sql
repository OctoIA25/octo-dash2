-- Lote 1 (grupo ALTA): troca o owner email INLINE por public.is_platform_owner()
-- nas policies/funções de dados sensíveis de negócio, para que QUALQUER owner
-- cadastrado em platform_owners (ex.: Yasmin) tenha acesso cross-tenant — não só
-- o email original.
--
-- Pré-requisito: 20260624_create_platform_owners.sql (cria a função/tabela). Esta
-- migração DEVE rodar depois.
--
-- Princípio: cada policy/função preserva EXATAMENTE sua lógica de tenant
-- (tenant_memberships, role IN (...), casts ::text). A ÚNICA mudança é trocar o
-- trecho do email por public.is_platform_owner(). Nada de isolamento de tenant é
-- afrouxado.
--
-- Estratégia: onde a policy delega a uma função (proposals_*), basta corrigir a
-- FUNÇÃO — todas as policies que a usam herdam o novo owner automaticamente.
--
-- Idempotente (CREATE OR REPLACE / DROP+CREATE com nomes exatos). Guardado por
-- existência da tabela onde aplicável.

-- =====================================================================
-- PARTE A — Funções SECURITY DEFINER com email inline
-- =====================================================================

-- A1. proposals_can_access_tenant — usada por TODAS as 6 policies de proposals/
--     proposal_parties/proposal_history. Corrigir aqui propaga para todas.
CREATE OR REPLACE FUNCTION public.proposals_can_access_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = p_tenant_id
        AND tm.user_id = auth.uid()
    );
$$;

-- A2. proposals_is_tenant_manager — usada pela policy de SELECT de proposals.
CREATE OR REPLACE FUNCTION public.proposals_is_tenant_manager(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = p_tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'team_leader', 'owner')
    );
$$;

-- A3. search_candidates — assinatura e CORPO preservados LITERALMENTE da
--     20260617_fix_recruitment_rls_and_functions.sql:64-125. A ÚNICA mudança é a
--     primeira linha do guard (email inline → is_platform_owner()).
--     RETURNS TABLE(...) com `rank real` — NÃO mudar a assinatura, senão o Postgres
--     recusa com "cannot change return type of existing function".
CREATE OR REPLACE FUNCTION public.search_candidates(
  p_tenant_id UUID,
  p_search_query TEXT DEFAULT '',
  p_status TEXT DEFAULT NULL,
  p_cargo TEXT DEFAULT NULL,
  p_experiencia TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  email TEXT,
  telefone TEXT,
  cargo TEXT,
  status TEXT,
  data_inscricao TIMESTAMP WITH TIME ZONE,
  experiencia TEXT,
  linkedin TEXT,
  curriculo TEXT,
  observacoes TEXT,
  rank REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_platform_owner()
    OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
               WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden: caller is not a member of tenant %', p_tenant_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.nome,
    c.email,
    c.telefone,
    c.cargo,
    c.status,
    c.data_inscricao,
    c.experiencia,
    c.linkedin,
    c.curriculo,
    c.observacoes,
    ts_rank(c.search_vector, plainto_tsquery('portuguese', p_search_query)) as rank
  FROM recruitment_candidates c
  WHERE c.tenant_id = p_tenant_id
    AND (p_search_query = '' OR c.search_vector @@ plainto_tsquery('portuguese', p_search_query))
    AND (p_status IS NULL OR c.status = p_status)
    AND (p_cargo IS NULL OR c.cargo = p_cargo)
    AND (p_experiencia IS NULL OR c.experiencia = p_experiencia)
  ORDER BY
    CASE WHEN p_search_query != '' THEN ts_rank(c.search_vector, plainto_tsquery('portuguese', p_search_query)) END DESC NULLS LAST,
    c.data_inscricao DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- A4. get_recruitment_metrics — assinatura e CORPO preservados LITERALMENTE da
--     20260617_fix_recruitment_rls_and_functions.sql:127-178. Só o guard muda.
--     RETURNS TABLE(...) — não mudar a assinatura.
CREATE OR REPLACE FUNCTION public.get_recruitment_metrics(p_tenant_id UUID)
RETURNS TABLE (
  total_candidates BIGINT,
  lead_count BIGINT,
  interaction_count BIGINT,
  meeting_count BIGINT,
  onboard_count BIGINT,
  approved_count BIGINT,
  rejected_count BIGINT,
  conversion_rate DECIMAL,
  avg_process_days DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_platform_owner()
    OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
               WHERE tm.tenant_id = p_tenant_id AND tm.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden: caller is not a member of tenant %', p_tenant_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH candidate_stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'Lead') as leads,
      COUNT(*) FILTER (WHERE status = 'Interação') as interactions,
      COUNT(*) FILTER (WHERE status = 'Reunião') as meetings,
      COUNT(*) FILTER (WHERE status = 'Onboard') as onboard,
      COUNT(*) FILTER (WHERE status = 'Aprovado') as approved,
      COUNT(*) FILTER (WHERE status = 'Rejeitado') as rejected,
      AVG(EXTRACT(DAY FROM (updated_at - created_at))) FILTER (WHERE status IN ('Aprovado', 'Rejeitado')) as avg_days
    FROM recruitment_candidates
    WHERE tenant_id = p_tenant_id
  )
  SELECT
    total,
    leads,
    interactions,
    meetings,
    onboard,
    approved,
    rejected,
    CASE WHEN total > 0 THEN ROUND((approved::DECIMAL / total) * 100, 2) ELSE 0 END as conversion_rate,
    COALESCE(avg_days, 0) as avg_process_days
  FROM candidate_stats;
END;
$$;

-- =====================================================================
-- PARTE B — Policies com email INLINE direto (não via função)
-- =====================================================================
-- Helper local: recria uma policy trocando só o owner-check. Como cada policy tem
-- estrutura própria, fazemos DROP+CREATE explícito com a lógica de tenant intacta.

-- ---- commercial_sales ----
DO $$
BEGIN
  IF to_regclass('public.commercial_sales') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Members can view commercial sales" ON public.commercial_sales;
    CREATE POLICY "Members can view commercial sales"
      ON public.commercial_sales FOR SELECT TO authenticated
      USING (
        public.is_platform_owner()
        OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );

    DROP POLICY IF EXISTS "Managers can write commercial sales" ON public.commercial_sales;
    CREATE POLICY "Managers can write commercial sales"
      ON public.commercial_sales FOR ALL TO authenticated
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
  END IF;
END $$;

-- ---- commercial_sales_import_batches ----
DO $$
BEGIN
  IF to_regclass('public.commercial_sales_import_batches') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Members can view commercial sales import batches" ON public.commercial_sales_import_batches;
    CREATE POLICY "Members can view commercial sales import batches"
      ON public.commercial_sales_import_batches FOR SELECT TO authenticated
      USING (
        public.is_platform_owner()
        OR tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
      );

    DROP POLICY IF EXISTS "Managers can write commercial sales import batches" ON public.commercial_sales_import_batches;
    CREATE POLICY "Managers can write commercial sales import batches"
      ON public.commercial_sales_import_batches FOR ALL TO authenticated
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
  END IF;
END $$;

-- ---- excel_imports ----
DO $$
BEGIN
  IF to_regclass('public.excel_imports') IS NOT NULL THEN
    DROP POLICY IF EXISTS "excel_imports_tenant_isolation" ON public.excel_imports;
    CREATE POLICY "excel_imports_tenant_isolation"
      ON public.excel_imports FOR ALL TO authenticated
      USING (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id::text = excel_imports.tenant_id::text
                     AND tm.user_id = auth.uid()
                     AND tm.role IN ('admin','team_leader','owner'))
      )
      WITH CHECK (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id::text = excel_imports.tenant_id::text
                     AND tm.user_id = auth.uid()
                     AND tm.role IN ('admin','team_leader','owner'))
      );
  END IF;
END $$;

-- ---- generic_imports ----
DO $$
BEGIN
  IF to_regclass('public.generic_imports') IS NOT NULL THEN
    DROP POLICY IF EXISTS "generic_imports_tenant_isolation" ON public.generic_imports;
    CREATE POLICY "generic_imports_tenant_isolation"
      ON public.generic_imports FOR ALL TO authenticated
      USING (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id::text = generic_imports.tenant_id::text
                     AND tm.user_id = auth.uid()
                     AND tm.role IN ('admin','team_leader','owner'))
      )
      WITH CHECK (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id::text = generic_imports.tenant_id::text
                     AND tm.user_id = auth.uid()
                     AND tm.role IN ('admin','team_leader','owner'))
      );
  END IF;
END $$;

-- ---- team_metrics (SELECT / INSERT / UPDATE) ----
DO $$
BEGIN
  IF to_regclass('public.team_metrics') IS NOT NULL THEN
    DROP POLICY IF EXISTS "team_metrics_select" ON public.team_metrics;
    CREATE POLICY "team_metrics_select"
      ON public.team_metrics FOR SELECT TO authenticated
      USING (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id::text = team_metrics.tenant_id::text AND tm.user_id = auth.uid())
      );

    DROP POLICY IF EXISTS "team_metrics_insert" ON public.team_metrics;
    CREATE POLICY "team_metrics_insert"
      ON public.team_metrics FOR INSERT TO authenticated
      WITH CHECK (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id::text = team_metrics.tenant_id::text AND tm.user_id = auth.uid())
      );

    DROP POLICY IF EXISTS "team_metrics_update" ON public.team_metrics;
    CREATE POLICY "team_metrics_update"
      ON public.team_metrics FOR UPDATE TO authenticated
      USING (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id::text = team_metrics.tenant_id::text AND tm.user_id = auth.uid())
      )
      WITH CHECK (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id::text = team_metrics.tenant_id::text AND tm.user_id = auth.uid())
      );
  END IF;
END $$;

-- ---- recruitment_candidates (FOR ALL) ----
DO $$
BEGIN
  IF to_regclass('public.recruitment_candidates') IS NOT NULL THEN
    DROP POLICY IF EXISTS "recruitment_candidates_tenant_isolation" ON public.recruitment_candidates;
    CREATE POLICY "recruitment_candidates_tenant_isolation"
      ON public.recruitment_candidates FOR ALL TO authenticated
      USING (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id = recruitment_candidates.tenant_id AND tm.user_id = auth.uid())
      )
      WITH CHECK (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id = recruitment_candidates.tenant_id AND tm.user_id = auth.uid())
      );
  END IF;
END $$;

-- ---- recruitment_stages (FOR ALL) ----
DO $$
BEGIN
  IF to_regclass('public.recruitment_stages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "recruitment_stages_tenant_isolation" ON public.recruitment_stages;
    CREATE POLICY "recruitment_stages_tenant_isolation"
      ON public.recruitment_stages FOR ALL TO authenticated
      USING (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id = recruitment_stages.tenant_id AND tm.user_id = auth.uid())
      )
      WITH CHECK (
        public.is_platform_owner()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id = recruitment_stages.tenant_id AND tm.user_id = auth.uid())
      );
  END IF;
END $$;

-- ---- agent_conversations (SELECT / INSERT / UPDATE / DELETE) ----
DO $$
BEGIN
  IF to_regclass('public.agent_conversations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "agent_conversations_select_own_or_manager" ON public.agent_conversations;
    CREATE POLICY "agent_conversations_select_own_or_manager"
      ON public.agent_conversations FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id = agent_conversations.tenant_id
                     AND tm.user_id = auth.uid()
                     AND tm.role IN ('admin','owner','team_leader'))
        OR public.is_platform_owner()
      );

    DROP POLICY IF EXISTS "agent_conversations_insert_own" ON public.agent_conversations;
    CREATE POLICY "agent_conversations_insert_own"
      ON public.agent_conversations FOR INSERT TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND (
          public.is_platform_owner()
          OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                     WHERE tm.tenant_id = agent_conversations.tenant_id AND tm.user_id = auth.uid())
        )
      );

    DROP POLICY IF EXISTS "agent_conversations_update_own" ON public.agent_conversations;
    CREATE POLICY "agent_conversations_update_own"
      ON public.agent_conversations FOR UPDATE TO authenticated
      USING (user_id = auth.uid() OR public.is_platform_owner())
      WITH CHECK (user_id = auth.uid() OR public.is_platform_owner());

    DROP POLICY IF EXISTS "agent_conversations_delete_own" ON public.agent_conversations;
    CREATE POLICY "agent_conversations_delete_own"
      ON public.agent_conversations FOR DELETE TO authenticated
      USING (user_id = auth.uid() OR public.is_platform_owner());
  END IF;
END $$;

-- ---- agent_messages (só o SELECT tem owner inline) ----
DO $$
BEGIN
  IF to_regclass('public.agent_messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "agent_messages_select_own_or_manager" ON public.agent_messages;
    CREATE POLICY "agent_messages_select_own_or_manager"
      ON public.agent_messages FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
                   WHERE tm.tenant_id = agent_messages.tenant_id
                     AND tm.user_id = auth.uid()
                     AND tm.role IN ('admin','owner','team_leader'))
        OR public.is_platform_owner()
      );
  END IF;
END $$;

-- ---- KPIs e Metas (dashboard_kpis, goals, goal_history + tabelas via DO block) ----
-- Padrão comum: SELECT = qualquer membro OR owner; WRITE = membro admin/team_leader/owner OR owner.
DO $$
DECLARE
  t text;
  read_tables text[] := ARRAY[
    'dashboard_kpis','kpi_targets','kpi_values','kpi_import_batches',
    'dashboard_kpi_history','goals','goal_history'
  ];
BEGIN
  -- dashboard_kpis: policies nomeadas dk_* (SELECT/INSERT/UPDATE/DELETE)
  IF to_regclass('public.dashboard_kpis') IS NOT NULL THEN
    DROP POLICY IF EXISTS "dk_select" ON public.dashboard_kpis;
    CREATE POLICY "dk_select" ON public.dashboard_kpis FOR SELECT
      USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
             OR public.is_platform_owner());
    DROP POLICY IF EXISTS "dk_insert" ON public.dashboard_kpis;
    CREATE POLICY "dk_insert" ON public.dashboard_kpis FOR INSERT
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                                WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
                  OR public.is_platform_owner());
    DROP POLICY IF EXISTS "dk_update" ON public.dashboard_kpis;
    CREATE POLICY "dk_update" ON public.dashboard_kpis FOR UPDATE
      USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                           WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
             OR public.is_platform_owner())
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                                WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
                  OR public.is_platform_owner());
    DROP POLICY IF EXISTS "dk_delete" ON public.dashboard_kpis;
    CREATE POLICY "dk_delete" ON public.dashboard_kpis FOR DELETE
      USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                           WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
             OR public.is_platform_owner());
  END IF;

  -- kpi_targets / kpi_values / kpi_import_batches / dashboard_kpi_history:
  -- padrão {tabela}_select (qualquer membro) + {tabela}_write (manager) FOR ALL.
  FOREACH t IN ARRAY ARRAY['kpi_targets','kpi_values','kpi_import_batches','dashboard_kpi_history'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
      EXECUTE format($p$
        CREATE POLICY %I ON public.%I FOR SELECT
          USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
                 OR public.is_platform_owner())
      $p$, t || '_select', t);

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
      EXECUTE format($p$
        CREATE POLICY %I ON public.%I FOR ALL
          USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                               WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
                 OR public.is_platform_owner())
          WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                                    WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
                      OR public.is_platform_owner())
      $p$, t || '_write', t);
    END IF;
  END LOOP;

  -- goals: SELECT/INSERT/UPDATE/DELETE nomeados goals_*
  IF to_regclass('public.goals') IS NOT NULL THEN
    DROP POLICY IF EXISTS "goals_select" ON public.goals;
    CREATE POLICY "goals_select" ON public.goals FOR SELECT
      USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
             OR public.is_platform_owner());
    DROP POLICY IF EXISTS "goals_insert" ON public.goals;
    CREATE POLICY "goals_insert" ON public.goals FOR INSERT
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                                WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
                  OR public.is_platform_owner());
    DROP POLICY IF EXISTS "goals_update" ON public.goals;
    CREATE POLICY "goals_update" ON public.goals FOR UPDATE
      USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                           WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
             OR public.is_platform_owner());
    DROP POLICY IF EXISTS "goals_delete" ON public.goals;
    CREATE POLICY "goals_delete" ON public.goals FOR DELETE
      USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                           WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
             OR public.is_platform_owner());
  END IF;

  -- goal_history: SELECT (membro) + INSERT (manager)
  IF to_regclass('public.goal_history') IS NOT NULL THEN
    DROP POLICY IF EXISTS "goal_history_select" ON public.goal_history;
    CREATE POLICY "goal_history_select" ON public.goal_history FOR SELECT
      USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
             OR public.is_platform_owner());
    DROP POLICY IF EXISTS "goal_history_insert" ON public.goal_history;
    CREATE POLICY "goal_history_insert" ON public.goal_history FOR INSERT
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships
                                WHERE user_id = auth.uid() AND role IN ('admin','team_leader','owner'))
                  OR public.is_platform_owner());
  END IF;
END $$;
