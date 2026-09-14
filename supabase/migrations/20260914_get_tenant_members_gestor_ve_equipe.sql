-- =============================================================================
-- get_tenant_members: gestor (team_leader) vê a própria equipe.
--
-- PROBLEMA
-- A RPC só devolvia linhas para owner/admin; para os demais voltava vazio.
-- fetchTenantMembers então caía na leitura direta de tenant_memberships, onde a
-- RLS (memberships_select_own) só libera a própria linha — e a tabela não tem
-- e-mail, então o mapper usava o user_id como nome. Resultado em Gestão de
-- Equipe → Acessos e Permissões: o gestor via só a si mesmo, com um UUID.
--
-- SOLUÇÃO (mesma assinatura → CREATE OR REPLACE puro, front não muda)
--   - owner da plataforma / admin/owner do tenant: todos os membros (igual antes);
--   - qualquer membro: a própria linha, com e-mail (antes vinha pelo fallback sem);
--   - team_leader: + os membros que lidera — leader_user_id primário OU
--     teams.leader_user_ids (mesmo recorte de can_manage_member_phones,
--     20260910_set_member_whatsapp_phones).
--
-- SEGURANÇA
-- auth.uid() nulo era tratado como owner, e a função tinha EXECUTE para anon:
-- qualquer um com a anon key (que vai no bundle) listava membros + e-mails de
-- qualquer tenant. pg_stat_statements desde o reset só mostra chamadas de
-- `authenticated`. Revoga de PUBLIC/anon (mesmo motivo da 20260912); o ramo de
-- uid nulo fica só para service_role/postgres.
--
-- Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_members(p_tenant_id uuid)
 RETURNS TABLE(id uuid, user_id uuid, tenant_id uuid, role text, email text, name text, permissions jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_see_all BOOLEAN;
  v_is_leader BOOLEAN;
BEGIN
  -- uid nulo: só service_role/postgres chegam aqui (anon não tem EXECUTE)
  v_see_all := v_caller_id IS NULL
    OR EXISTS (SELECT 1 FROM auth.users au WHERE au.id = v_caller_id AND au.email = 'octo.inteligenciaimobiliaria@gmail.com')
    OR EXISTS (
      SELECT 1 FROM tenant_memberships tmx
      WHERE tmx.user_id = v_caller_id AND tmx.tenant_id = p_tenant_id AND tmx.role IN ('owner', 'admin')
    );

  v_is_leader := NOT v_see_all AND EXISTS (
    SELECT 1 FROM tenant_memberships tmx
    WHERE tmx.user_id = v_caller_id AND tmx.tenant_id = p_tenant_id AND tmx.role = 'team_leader'
  );

  RETURN QUERY
  SELECT
    tm.id,
    tm.user_id,
    tm.tenant_id,
    tm.role,
    COALESCE(tb.email, au.email, '')::TEXT as email,
    COALESCE(tb.name, '')::TEXT as name,
    COALESCE(tm.permissions, '{}'::jsonb) as permissions,
    tm.created_at
  FROM tenant_memberships tm
  LEFT JOIN tenant_brokers tb ON tb.auth_user_id = tm.user_id AND tb.tenant_id = tm.tenant_id
  LEFT JOIN auth.users au ON au.id = tm.user_id
  LEFT JOIN teams t ON t.id = tm.team_id
  WHERE tm.tenant_id = p_tenant_id
    AND (
      v_see_all
      OR tm.user_id = v_caller_id
      OR (v_is_leader AND (tm.leader_user_id = v_caller_id OR t.leader_user_ids @> ARRAY[v_caller_id]))
    )
  ORDER BY tm.created_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_tenant_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_members(uuid) TO authenticated, service_role;

-- VERIFICAÇÃO (logado como gestor, via app ou simulando o JWT):
--   SELECT email, role FROM public.get_tenant_members('<tenant>');
--   -- a própria linha + liderados, todos com e-mail; como corretor, só a própria.
