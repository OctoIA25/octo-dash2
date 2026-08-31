-- =============================================================================
-- Gestor (team_leader) vê as conversas WhatsApp da PRÓPRIA ESPECIALIDADE.
--
-- Pedido (Victor, 26/ago/2026): "Gestor de Lançamentos precisa ver todas as
-- conversas relacionadas a lançamentos e vice-versa". Antes (20260816), o
-- team_leader via somente as conversas atribuídas a ele — igual a corretor.
--
-- Como "especialidade" e "relacionada" são resolvidos:
--   • especialidade do gestor = tenant_memberships.permissions.atuacao
--     (mesma fonte da roleta e do Bolsão: lancamentos | prontos | alugados);
--   • conversa relacionada = whatsapp_conversations.lead_id/lead_source_table
--     → leads/kenlo_leads.classification (text[], 20260818), com o mapeamento
--     já usado no resto do sistema: lancamentos→lancamento, prontos→pronto,
--     alugados→locacao.
--
-- Decisões (diferentes do fail-open de `atuacoesDe` do front — de propósito):
--   • FAIL-CLOSED: gestor SEM atuacao configurada não ganha visibilidade nova
--     (continua vendo só as dele). Fail-open aqui exporia o telefone de todos
--     os leads a qualquer team_leader — contra a decisão da 20260816
--     ("somente admin e owner veem tudo"). Legado 'ambos' é escolha EXPLÍCITA
--     e vale tudo; ausente/lixo vale nada.
--   • 'indefinido' e classification NULL NÃO casam com nenhuma atuação: a
--     conversa de lead não classificado segue visível só para admin/owner e
--     para o dono. Para incluir indefinido, acrescente-o nos 3 braços de
--     `classificacoes_da_atuacao`.
--   • Conversa sem lead vinculado (lead_id NULL — ex.: criada por deep-link)
--     não tem especialidade; regra antiga vale.
--
-- A regra continua num LUGAR SÓ (`can_read_whatsapp_conversation`); as
-- policies de whatsapp_messages herdam via EXISTS e não mudam. A função ganha
-- os 2 parâmetros do vínculo com o lead, então as duas policies de
-- whatsapp_conversations são recriadas passando as colunas novas.
--
-- Idempotente: pode ser reaplicada com segurança.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Atuação do gestor → classificações de lead que ela cobre.
--
-- Espelha a normalização de `atuacoesDe` (src/types/permissions.ts) e
-- `atuacoesOf` (server/leadAssignment.js), EXCETO o fail-open final (ver
-- cabeçalho). Ao mudar o vocabulário lá, mude aqui.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.classificacoes_da_atuacao(p_permissions JSONB)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- legado string (2026-08-11/12): 'prontos' era "tudo que não é lançamento"
    WHEN p_permissions->>'atuacao' = 'lancamentos' THEN ARRAY['lancamento']
    WHEN p_permissions->>'atuacao' = 'prontos'     THEN ARRAY['pronto', 'locacao']
    WHEN p_permissions->>'atuacao' = 'ambos'       THEN ARRAY['lancamento', 'pronto', 'locacao']
    -- formato atual: array multi-seleção
    WHEN jsonb_typeof(p_permissions->'atuacao') = 'array' THEN
      COALESCE(
        (SELECT array_agg(m.classificacao)
           FROM (VALUES ('lancamentos', 'lancamento'),
                        ('prontos',     'pronto'),
                        ('alugados',    'locacao')) AS m(atuacao, classificacao)
          WHERE p_permissions->'atuacao' ? m.atuacao),
        '{}'::text[])
    ELSE '{}'::text[]
  END;
$$;

-- As policies dependem da assinatura antiga — saem antes do DROP da função e
-- voltam logo abaixo com os parâmetros novos.
DROP POLICY IF EXISTS "whatsapp_conversations_select_tenant" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "whatsapp_conversations_write_tenant"  ON public.whatsapp_conversations;
DROP FUNCTION IF EXISTS public.can_read_whatsapp_conversation(UUID, UUID);

-- -----------------------------------------------------------------------------
-- Regra única de visibilidade de uma conversa (evolui a 20260816):
--   admin/owner do tenant OU dono da conversa OU team_leader cuja atuação
--   cobre a classificação do lead vinculado.
--
-- SECURITY DEFINER: além de tenant_memberships, agora também lê
-- leads/kenlo_leads sem depender das RLS dessas tabelas. A pertinência ao
-- tenant segue obrigatória em todos os braços.
-- -----------------------------------------------------------------------------
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
          )
      );
$$;

-- Policies idênticas às da 20260816, agora passando o vínculo com o lead.
CREATE POLICY "whatsapp_conversations_select_tenant"
  ON public.whatsapp_conversations
  FOR SELECT
  TO authenticated
  USING (public.can_read_whatsapp_conversation(tenant_id, assigned_user_id, lead_id, lead_source_table));

CREATE POLICY "whatsapp_conversations_write_tenant"
  ON public.whatsapp_conversations
  FOR ALL
  TO authenticated
  USING (public.can_read_whatsapp_conversation(tenant_id, assigned_user_id, lead_id, lead_source_table))
  WITH CHECK (public.can_read_whatsapp_conversation(tenant_id, assigned_user_id, lead_id, lead_source_table));

-- -----------------------------------------------------------------------------
-- Prova do mapeamento atuação → classificações (roda no Postgres real e aborta
-- a migration se a normalização quebrar).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  -- formato atual (array)
  ASSERT public.classificacoes_da_atuacao('{"atuacao": ["lancamentos"]}'::jsonb) = ARRAY['lancamento'];
  ASSERT public.classificacoes_da_atuacao('{"atuacao": ["prontos", "alugados"]}'::jsonb) @> ARRAY['pronto', 'locacao'];
  -- legado string
  ASSERT public.classificacoes_da_atuacao('{"atuacao": "prontos"}'::jsonb) = ARRAY['pronto', 'locacao'];
  ASSERT public.classificacoes_da_atuacao('{"atuacao": "ambos"}'::jsonb) = ARRAY['lancamento', 'pronto', 'locacao'];
  -- fail-closed: ausente, vazio ou lixo = nenhuma visibilidade extra
  ASSERT public.classificacoes_da_atuacao('{}'::jsonb) = '{}'::text[];
  ASSERT public.classificacoes_da_atuacao('{"atuacao": []}'::jsonb) = '{}'::text[];
  ASSERT public.classificacoes_da_atuacao('{"atuacao": "lixo"}'::jsonb) = '{}'::text[];
  ASSERT public.classificacoes_da_atuacao(NULL) = '{}'::text[];
  RAISE NOTICE 'classificacoes_da_atuacao: asserts OK';
END $$;
