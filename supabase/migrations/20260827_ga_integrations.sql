-- =============================================================================
-- Config da integração Google Analytics (GA4) por tenant.
--
-- Guarda APENAS o property_id da propriedade GA4 do tenant — o acesso é feito
-- por UMA service account global (env do servidor), que o tenant adiciona como
-- Leitor na propriedade dele. Sem tokens, sem segredos nesta tabela.
--
-- Escrita/leitura em produção acontecem pelo servidor (service_role, bypassa
-- RLS) nas rotas /api/v1/integrations/ga/*, que fazem o gate admin/owner na
-- aplicação. As policies abaixo cobrem leitura via PostgREST e restringem
-- escrita direta a admin do tenant (mesmo idiom de 20260824_bolsao_enable_rls).
--
-- APLICAR NO SUPABASE ANTES DO DEPLOY DO CÓDIGO.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ga_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id text NOT NULL,
  connected_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ga_integrations ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer membro do tenant (a tela mostra "conectado" para todos).
DROP POLICY IF EXISTS "ga_integrations_select" ON public.ga_integrations;
CREATE POLICY "ga_integrations_select" ON public.ga_integrations
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_owner()
    OR tenant_id IN (SELECT tm.tenant_id FROM public.tenant_memberships tm WHERE tm.user_id = auth.uid())
  );

-- Escrita: só admin do tenant (ou platform owner).
DROP POLICY IF EXISTS "ga_integrations_write" ON public.ga_integrations;
CREATE POLICY "ga_integrations_write" ON public.ga_integrations
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_owner()
    OR tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm
       WHERE tm.user_id = auth.uid() AND tm.role = 'admin'
    )
  )
  WITH CHECK (
    public.is_platform_owner()
    OR tenant_id IN (
      SELECT tm.tenant_id FROM public.tenant_memberships tm
       WHERE tm.user_id = auth.uid() AND tm.role = 'admin'
    )
  );
