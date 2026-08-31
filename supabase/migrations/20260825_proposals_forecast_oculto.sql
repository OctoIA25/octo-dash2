-- =============================================================================
-- Forecast: colocar/tirar leads da planilha.
--
-- "Tirar" um lead do forecast NÃO pode arquivar o lead nem apagar a proposta —
-- a proposta segue viva no board Jurídico e o lead segue no funil. É só um
-- recorte de exibição da planilha, então vira uma flag na própria proposta:
-- `forecast_oculto`. "Colocar" de volta é desligar a flag (ou, para lead que
-- ainda não é negócio, o front cria a proposta-espelho em 'negociacao' — o
-- mesmo shape que tg_mirror_lead_to_proposal criaria quando o lead avançasse).
--
-- Flag global por proposta, não por usuário: o forecast é UMA planilha
-- compartilhada (gestor vê o tenant, corretor vê as suas). Tirar = "este
-- negócio não é material de forecast", vale para todo mundo que o vê.
--
-- TAMBÉM: estende a policy de UPDATE com `proposals_lead_assigned_to_me`.
-- O SELECT (20260602) tem esse branch; o UPDATE (20260824) não tinha. Resultado:
-- corretor cujo lead foi espelhado com agent_user_id NULL (assigned_agent_id
-- não era uuid) VÊ a linha mas todo UPDATE dele — células editáveis do forecast
-- inclusive — retorna 0 linhas sem erro. Alinhar escrita com leitura é a regra
-- de negócio declarada ("corretor escreve só as suas").
--
-- Idempotente. Aplicar em produção via supabase MCP / SQL editor ANTES do
-- deploy do front (o SELECT do forecast passa a pedir a coluna).
-- =============================================================================

SET lock_timeout = '5s';

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS forecast_oculto boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.proposals.forecast_oculto IS
  'Forecast: true = tirada da planilha pelo corretor/gestor. Não afeta o board Jurídico nem o lead — só a exibição do forecast.';

-- Policy de UPDATE ganha o mesmo branch de "minhas" do SELECT.
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
      OR public.proposals_lead_assigned_to_me(lead_id)
    )
  )
  WITH CHECK (
    public.proposals_can_access_tenant(tenant_id)
    AND (
      public.proposals_is_tenant_manager(tenant_id)
      OR agent_user_id = auth.uid()
      OR created_by = auth.uid()
      OR public.proposals_lead_assigned_to_me(lead_id)
    )
  );

-- ---------- Prova ----------
DO $$
DECLARE
  v_default text;
BEGIN
  SELECT column_default INTO v_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'proposals'
     AND column_name = 'forecast_oculto';
  ASSERT v_default = 'false', 'forecast_oculto deveria ter DEFAULT false, veio ' || COALESCE(v_default, 'NULL');

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'proposals'
       AND policyname = 'proposals_update_owner_or_manager'
       AND qual LIKE '%proposals_lead_assigned_to_me%'
       AND with_check LIKE '%proposals_lead_assigned_to_me%'
  ), 'policy de UPDATE não ganhou o branch proposals_lead_assigned_to_me';

  RAISE NOTICE 'forecast_oculto: asserts OK';
END $$;

-- =============================================================================
-- ROLLBACK
--   ALTER TABLE public.proposals DROP COLUMN IF EXISTS forecast_oculto;
--   -- e recriar a policy de UPDATE como em 20260824_fix_proposals_write_bola.sql
-- =============================================================================
