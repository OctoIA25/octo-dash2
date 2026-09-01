-- =============================================================================
-- RPCs de credenciais chamadas pelo front (EquipeSection) que nunca existiram
-- no banco: admin_update_user_email e admin_update_user_password.
-- Sem elas, "Salvar email" / "Salvar senha" falham com PGRST202.
--
-- Autorização (mesma para as duas):
--   - caller é o owner da plataforma (email hardcoded, convenção já usada nas
--     policies de tenants), OU
--   - caller é admin/owner em TODOS os tenants do usuário alvo (não basta um:
--     credenciais são globais, e um admin do tenant A não pode sequestrar o
--     acesso que um usuário compartilhado tem ao tenant B), e o alvo não é
--     owner de nenhum tenant (owner outranks admin).
--
-- A conta do owner da plataforma só pode ser alterada por ela mesma.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.caller_can_manage_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    -- Ninguém além do próprio owner mexe na conta do owner da plataforma.
    CASE WHEN EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = p_user_id
        AND lower(u.email) = 'octo.inteligenciaimobiliaria@gmail.com'
        AND u.id <> auth.uid()
    ) THEN false
    WHEN (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com' THEN true
    ELSE
      -- Alvo com role owner em qualquer tenant: só o owner da plataforma.
      NOT EXISTS (
        SELECT 1 FROM public.tenant_memberships t
        WHERE t.user_id = p_user_id AND t.role = 'owner'
      )
      -- Pelo menos um tenant em comum onde o caller é admin/owner...
      AND EXISTS (
        SELECT 1
        FROM public.tenant_memberships me
        JOIN public.tenant_memberships alvo ON alvo.tenant_id = me.tenant_id
        WHERE me.user_id = auth.uid()
          AND me.role IN ('admin', 'owner')
          AND alvo.user_id = p_user_id
      )
      -- ...e NENHUM tenant do alvo fora do alcance do caller (credenciais são
      -- globais; admin do tenant A não pode mexer em quem também é do tenant B).
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_memberships t
        WHERE t.user_id = p_user_id
          AND NOT EXISTS (
            SELECT 1 FROM public.tenant_memberships c
            WHERE c.tenant_id = t.tenant_id
              AND c.user_id = auth.uid()
              AND c.role IN ('admin', 'owner')
          )
      )
    END;
$$;

-- DROP antes do CREATE: se alguma versão antiga existir no banco com outro
-- tipo de retorno, CREATE OR REPLACE falharia.
DROP FUNCTION IF EXISTS public.admin_update_user_email(uuid, text);

CREATE FUNCTION public.admin_update_user_email(p_user_id uuid, p_new_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_new_email text := lower(trim(p_new_email));
  v_old_email text;
BEGIN
  IF NOT public.caller_can_manage_user(p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para alterar este membro');
  END IF;

  IF v_new_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email inválido');
  END IF;

  SELECT email INTO v_old_email FROM auth.users WHERE id = p_user_id;
  IF v_old_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não encontrado');
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email) = v_new_email AND id <> p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Já existe um usuário com este email');
  END IF;

  UPDATE auth.users
  SET email = v_new_email,
      updated_at = now()
  WHERE id = p_user_id;

  -- Identidade do provider email (o login por senha e o painel do Supabase
  -- leem daqui também; a coluna gerada identities.email acompanha).
  UPDATE auth.identities
  SET identity_data = identity_data || jsonb_build_object('email', v_new_email),
      updated_at = now()
  WHERE user_id = p_user_id
    AND provider = 'email';

  -- Espelhos no domínio: brokers e Corretores são casados por email em vários
  -- fluxos (identidade, attended_by). Mesmo usuário, todos os tenants.
  UPDATE public.tenant_brokers
  SET email = v_new_email
  WHERE auth_user_id = p_user_id
     OR lower(email) = lower(v_old_email);

  UPDATE public."Corretores"
  SET email = v_new_email
  WHERE lower(email) = lower(v_old_email);

  RETURN jsonb_build_object('success', true);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_update_user_password(uuid, text);

CREATE FUNCTION public.admin_update_user_password(p_user_id uuid, p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF NOT public.caller_can_manage_user(p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para alterar este membro');
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A senha deve ter pelo menos 6 caracteres');
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não encontrado');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Só usuários logados executam; a autorização fina é feita dentro da função.
REVOKE ALL ON FUNCTION public.caller_can_manage_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_user_email(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_user_password(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_can_manage_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_email(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_password(uuid, text) TO authenticated;
