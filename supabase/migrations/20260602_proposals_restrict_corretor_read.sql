-- =============================================================================
-- Leitura de propostas baseada em papel (gestao ve tudo, corretor ve so o seu)
--
-- Contexto: 20260602_mirror_leads_into_proposals.sql passou a materializar TODO
-- lead-negocio em `proposals` (tenant-wide). Os dados de todos os corretores
-- ficam gravados no banco e visiveis para a gestao -- isso e o desejado.
--
-- Esta migracao restringe apenas a LEITURA:
--   - gestor (role owner/admin/team_leader, ou o email owner): le TODAS as
--     propostas do tenant;
--   - corretor: le SOMENTE as proprias -- proposta atribuida a ele
--     (agent_user_id), criada por ele (created_by) ou cujo lead vinculado esta
--     atribuido a ele (leads.assigned_agent_id).
--
-- A ESCRITA (FOR ALL) e o trigger de espelhamento continuam inalterados: nada
-- some do banco; apenas a visibilidade do corretor fica limitada.
--
-- proposal_parties / proposal_history nao precisam mudar: suas policies de
-- SELECT ja exigem o EXISTS na proposta-pai, e esse subquery passa a respeitar
-- esta policy (RLS aninhada), entao a restricao cascateia automaticamente.
--
-- Aplicar em producao via supabase MCP / SQL editor.
-- =============================================================================

-- Gestor do tenant: owner (por email) ou membership admin/team_leader/owner.
CREATE OR REPLACE FUNCTION public.proposals_is_tenant_manager(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.tenant_id = p_tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'team_leader', 'owner')
    );
$$;

-- O lead vinculado a esta proposta esta atribuido ao usuario atual?
-- SECURITY DEFINER para checar a atribuicao sem depender do RLS de `leads`.
-- (leads.assigned_agent_id e TEXT contendo o uuid do corretor, como usado em
--  useLeadsMetrics: query.eq('assigned_agent_id', user.id).)
CREATE OR REPLACE FUNCTION public.proposals_lead_assigned_to_me(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_lead_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = p_lead_id
      AND l.assigned_agent_id = auth.uid()::text
  );
$$;

DROP POLICY IF EXISTS "Tenant members can view proposals" ON public.proposals;
CREATE POLICY "Tenant members can view proposals" ON public.proposals
  FOR SELECT
  TO authenticated
  USING (
    public.proposals_can_access_tenant(tenant_id)
    AND (
      public.proposals_is_tenant_manager(tenant_id)
      OR agent_user_id = auth.uid()
      OR created_by = auth.uid()
      OR public.proposals_lead_assigned_to_me(lead_id)
    )
  );
