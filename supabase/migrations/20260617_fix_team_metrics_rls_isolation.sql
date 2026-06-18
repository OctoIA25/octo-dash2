-- C5: corrige o RLS de public.team_metrics (métricas agregadas por equipe, incl.
-- valor_total_vendas).
--
-- Problema: 20260429_fix_team_metrics_rls.sql trocou o SELECT para USING (true),
-- expondo métricas de TODOS os tenants a qualquer usuário autenticado via PostgREST.
-- INSERT/UPDATE usavam current_setting('app.current_tenant_id') (GUC que o client JS
-- nunca seta → quebrado).
--
-- Contexto importante: a tabela é ÓRFÃ — não é referenciada em nenhum lugar do código
-- (src/ nem server/), então esta correção NÃO altera nenhum fluxo do app; apenas fecha
-- a leitura cross-tenant. Qualquer escrita real seria via service_role (ignora RLS).
--
-- Padrão (igual às demais tabelas): membro do tenant (tenant_memberships) OU owner da
-- plataforma (email inline no JWT — não depende de public.is_platform_owner()).
-- Comparação com cast ::text dos dois lados (robusto independentemente do tipo real).

-- 1) Remover TODAS as policies remanescentes (inclui o USING(true) e as do GUC).
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'team_metrics'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.team_metrics', pol.policyname);
  END LOOP;
END $$;

-- 2) Garantir RLS ligado.
ALTER TABLE public.team_metrics ENABLE ROW LEVEL SECURITY;

-- 3) Policies por comando (mantém a estrutura original: SELECT/INSERT/UPDATE, sem DELETE),
--    agora com isolamento real por tenant. Restrito a `authenticated`.
CREATE POLICY "team_metrics_select" ON public.team_metrics
  FOR SELECT TO authenticated
  USING (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id::text = team_metrics.tenant_id::text
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "team_metrics_insert" ON public.team_metrics
  FOR INSERT TO authenticated
  WITH CHECK (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id::text = team_metrics.tenant_id::text
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "team_metrics_update" ON public.team_metrics
  FOR UPDATE TO authenticated
  USING (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id::text = team_metrics.tenant_id::text
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.tenant_id::text = team_metrics.tenant_id::text
        AND tm.user_id = auth.uid()
    )
  );
