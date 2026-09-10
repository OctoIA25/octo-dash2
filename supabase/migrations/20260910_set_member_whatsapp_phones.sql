-- =============================================================================
-- Número de WhatsApp do membro: quem pode alterar.
--
-- PROBLEMA
-- O número mora em `tenant_memberships.permissions.whatsapp_phones` e o front
-- grava com um UPDATE direto na tabela (updateMemberPermissions). A única
-- policy de UPDATE é `memberships_update_tenant_admin` (admin/owner do tenant),
-- então corretor e gestor recebem "Nenhuma permissão foi salva" ao tentar
-- corrigir o próprio número.
--
-- POR QUE NÃO ABRIR A POLICY
-- `permissions` é um jsonb que também guarda sidebar_permissions,
-- can_manage_roleta, lead_limit e nivel_comissao. Um UPDATE liberado na coluna
-- deixaria qualquer corretor se auto-promover (basta reescrever o jsonb) —
-- escalonamento de privilégio pelo mesmo caminho do número.
--
-- SOLUÇÃO
-- Uma RPC SECURITY DEFINER que escreve APENAS a chave whatsapp_phones e decide
-- a autorização por si:
--   - o próprio membro;
--   - admin/owner do tenant do membro;
--   - team_leader do tenant que lidera o membro (leader_user_id primário OU
--     teams.leader_user_ids, mesmo recorte de 20260830_whatsapp_gestor_equipe_visibility);
--   - owner da plataforma.
-- Nenhuma policy é alterada; o resto do drawer continua admin-only.
--
-- Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.can_manage_member_phones(p_membership_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_owner()
      OR EXISTS (
        SELECT 1
        FROM public.tenant_memberships alvo
        LEFT JOIN public.teams t ON t.id = alvo.team_id
        WHERE alvo.id = p_membership_id
          AND auth.uid() IS NOT NULL
          AND (
            -- o próprio número
            alvo.user_id = auth.uid()
            -- admin/owner do tenant do membro
            OR EXISTS (
              SELECT 1 FROM public.tenant_memberships me
              WHERE me.tenant_id = alvo.tenant_id
                AND me.user_id = auth.uid()
                AND me.role IN ('admin', 'owner')
            )
            -- gestor da equipe do membro (primário ou secundário)
            OR (
              (alvo.leader_user_id = auth.uid() OR t.leader_user_ids @> ARRAY[auth.uid()])
              AND EXISTS (
                SELECT 1 FROM public.tenant_memberships me
                WHERE me.tenant_id = alvo.tenant_id
                  AND me.user_id = auth.uid()
                  AND me.role = 'team_leader'
              )
            )
          )
      );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_member_phones(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_member_phones(uuid) TO authenticated;

-- DROP antes do CREATE: versão antiga com outro tipo de retorno quebraria o
-- CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.set_member_whatsapp_phones(uuid, text[]);

CREATE FUNCTION public.set_member_whatsapp_phones(p_membership_id uuid, p_phones text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phones text[];
BEGIN
  IF NOT public.can_manage_member_phones(p_membership_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para alterar o número deste membro');
  END IF;

  -- Guardados como digitados (a normalização acontece na leitura, em
  -- useCorretorPhones), mas cada número precisa de DDD + celular: abaixo de 10
  -- dígitos o filtro do chat descartaria o número em silêncio.
  SELECT array_agg(btrim(u.raw) ORDER BY u.ord)
    INTO v_phones
    FROM unnest(p_phones) WITH ORDINALITY AS u(raw, ord)
   WHERE length(regexp_replace(u.raw, '\D', '', 'g')) >= 10;

  IF v_phones IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Informe ao menos um número com DDD + celular');
  END IF;

  UPDATE public.tenant_memberships
     SET permissions = COALESCE(permissions, '{}'::jsonb)
                       || jsonb_build_object('whatsapp_phones', to_jsonb(v_phones))
   WHERE id = p_membership_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Membro não encontrado');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_member_whatsapp_phones(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_member_whatsapp_phones(uuid, text[]) TO authenticated;

-- VERIFICAÇÃO (rodar depois, logado como corretor via app):
--   SELECT public.set_member_whatsapp_phones('<id da PRÓPRIA membership>', ARRAY['(11) 99999-8888']);
--   -- success: true; e com o id de um membro de outra equipe: success: false.
