-- C5: corrige o isolamento de recrutamento (PII de candidatos).
--
-- Problemas:
--  1) recruitment_candidates / recruitment_stages usavam USING(tenant_id = auth.uid()),
--     que compara o tenant_id (UUID do tenant) com auth.uid() (UUID do usuário) —
--     predicado semanticamente quebrado. Correção: isolar por tenant_memberships + owner.
--  2) As funções SECURITY DEFINER search_candidates / get_recruitment_metrics bypassam
--     RLS, não fixam search_path e aceitam p_tenant_id arbitrário sem checar o caller →
--     qualquer usuário autenticado lê dados/métricas de OUTRO tenant via RPC.
--     Correção: SET search_path = public + guard de membership/owner no início.
--
-- Uso verificado (não quebra fluxo): src/features/corretores/services/recruitmentService.ts
-- usa o client autenticado e sempre filtra .eq('tenant_id', tenantId); a feature de
-- Recrutamento só é exposta a owner/admin no sidebar. tenant_id é UUID (FK -> tenants).

-- ============================ recruitment_candidates ============================
DO $$ DECLARE pol RECORD; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recruitment_candidates'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.recruitment_candidates', pol.policyname); END LOOP;
END $$;

ALTER TABLE public.recruitment_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recruitment_candidates_tenant_isolation" ON public.recruitment_candidates
  FOR ALL TO authenticated
  USING (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
               WHERE tm.tenant_id = recruitment_candidates.tenant_id AND tm.user_id = auth.uid())
  )
  WITH CHECK (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
               WHERE tm.tenant_id = recruitment_candidates.tenant_id AND tm.user_id = auth.uid())
  );

-- ============================ recruitment_stages ============================
DO $$ DECLARE pol RECORD; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recruitment_stages'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.recruitment_stages', pol.policyname); END LOOP;
END $$;

ALTER TABLE public.recruitment_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recruitment_stages_tenant_isolation" ON public.recruitment_stages
  FOR ALL TO authenticated
  USING (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
               WHERE tm.tenant_id = recruitment_stages.tenant_id AND tm.user_id = auth.uid())
  )
  WITH CHECK (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (SELECT 1 FROM public.tenant_memberships tm
               WHERE tm.tenant_id = recruitment_stages.tenant_id AND tm.user_id = auth.uid())
  );

-- ============================ DEFINER functions (search_path + guard) ============================
-- Mantém EXATAMENTE a assinatura e o corpo originais (20260428), apenas adicionando
-- SET search_path e o guard de autorização do caller no início.

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
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
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
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
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
