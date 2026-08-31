-- =============================================================================
-- Gestor (team_leader) vê as conversas WhatsApp dos CORRETORES DA SUA EQUIPE.
--
-- Evolui a 20260826 (visibilidade por especialidade), que cobria "as dele" +
-- "as da especialidade" (incl. não atribuídas da Lia, se o lead for
-- classificado). Faltava o braço por vínculo de equipe: corretor da equipe do
-- gestor com lead FORA da atuação dele ficava invisível (task de 30/08:
-- "gestor vê as conversas dele, da Lia e dos seus corretores").
--
-- Braço novo: a conversa atribuída a um corretor cuja equipe tem auth.uid()
-- como gestor (teams.leader_user_ids, cobre primário e secundários) ou cujo
-- gestor primário denormalizado (tenant_memberships.leader_user_id) é
-- auth.uid().
--
-- Mesma assinatura da 20260826 → CREATE OR REPLACE puro, as policies de
-- whatsapp_conversations/whatsapp_messages continuam válidas sem recriação.
-- Idempotente: pode ser reaplicada com segurança.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_read_whatsapp_conversation(
  p_tenant_id         UUID,
  p_assigned_user_id  UUID,
  p_lead_id           UUID,
  p_lead_source_table TEXT
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_owner()
      OR EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = p_tenant_id
          AND tm.user_id = auth.uid()
          AND (
            tm.role IN ('admin', 'owner')
            OR p_assigned_user_id = auth.uid()
            -- especialidade (20260826): conversa de lead classificado na atuação do gestor
            OR (
              tm.role = 'team_leader'
              AND p_lead_id IS NOT NULL
              AND COALESCE(
                CASE p_lead_source_table
                  WHEN 'leads' THEN
                    (SELECT l.classification FROM public.leads l
                      WHERE l.id = p_lead_id AND l.tenant_id = p_tenant_id)
                  WHEN 'kenlo_leads' THEN
                    (SELECT k.classification FROM public.kenlo_leads k
                      WHERE k.id = p_lead_id AND k.tenant_id = p_tenant_id)
                END,
                '{}'::text[]
              ) && public.classificacoes_da_atuacao(tm.permissions)
            )
            -- equipe (20260830): conversa atribuída a corretor gerido por auth.uid()
            OR (
              tm.role = 'team_leader'
              AND p_assigned_user_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM public.tenant_memberships corretor
                LEFT JOIN public.teams t ON t.id = corretor.team_id
                WHERE corretor.tenant_id = p_tenant_id
                  AND corretor.user_id = p_assigned_user_id
                  AND (
                    corretor.leader_user_id = auth.uid()
                    OR t.leader_user_ids @> ARRAY[auth.uid()]
                  )
              )
            )
          )
      );
$$;
