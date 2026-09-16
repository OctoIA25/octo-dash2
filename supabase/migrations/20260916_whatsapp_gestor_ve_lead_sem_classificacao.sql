-- =============================================================================
-- Gestor (team_leader) vê a conversa de lead SEM CLASSIFICAÇÃO
--
-- O Kanban do gestor (MeusLeadsAtribuidosSection → filtrarPorAtuacao) mostra os
-- leads da atuação dele MAIS os sem classificação (null, vazio, 'indefinido' ou
-- valor desconhecido — direção fail-open). A RLS do chat (20260826) só aceitava
-- a interseção com a atuação, então o gestor via o lead e o telefone no card,
-- clicava em "Abrir conversa" e recebia "Esta conversa é de outro corretor…"
-- (16/09, Lotus: 19 leads no Kanban da gestora de prontos). Decisão do usuário:
-- liberar — esconder a conversa não protege um telefone que o card já mostra.
--
-- Só para lead de `leads`: é a tabela que o Kanban lê. kenlo_leads segue exigindo
-- a atuação — a Japi tem ~10,7 mil conversas de lead Kenlo sem classificação que
-- nenhum Kanban mostra.
--
-- Lead inexistente (conversa apontando para lead apagado) continua invisível: o
-- EXISTS exige a linha, em vez do COALESCE(..., '{}') anterior.
--
-- Mesma assinatura da 20260830 → CREATE OR REPLACE puro, policies intactas.
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
            -- especialidade (20260826): lead classificado na atuação do gestor;
            -- lead de `leads` sem classificação (20260916), como no Kanban dele
            OR (
              tm.role = 'team_leader'
              AND p_lead_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM (
                  SELECT l.classification AS classes, true AS do_kanban
                    FROM public.leads l
                   WHERE p_lead_source_table = 'leads'
                     AND l.id = p_lead_id AND l.tenant_id = p_tenant_id
                  UNION ALL
                  SELECT k.classification, false
                    FROM public.kenlo_leads k
                   WHERE p_lead_source_table = 'kenlo_leads'
                     AND k.id = p_lead_id AND k.tenant_id = p_tenant_id
                ) lead
                WHERE lead.classes && public.classificacoes_da_atuacao(tm.permissions)
                   OR (lead.do_kanban AND (
                        lead.classes IS NULL
                        OR cardinality(lead.classes) = 0
                        OR NOT (lead.classes <@ ARRAY['lancamento', 'pronto', 'locacao'])
                      ))
              )
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
