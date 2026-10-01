-- ============================================================
-- Kit de segurança do login (bloco A dos blocos do Gabriel).
--
-- O que o banco passa a garantir em todo caminho que grava senha por aqui
-- (membro novo, troca pelo admin, troca da própria senha, recuperação):
--   · a regra: 8+ caracteres, ao menos três tipos (minúscula, maiúscula,
--     número, símbolo), nada óbvio ("senha", "lotus", "12345678"…) e nada do
--     próprio e-mail;
--   · bcrypt custo 12 (o admin gravava custo 6: 16 contas em 01/10);
--   · todo mundo troca a senha uma vez depois da virada (seguranca_politica):
--     é o "todos trocando na hora" da reunião. A virada NÃO começa com a
--     migration nem com o deploy: o dono da plataforma liga na reunião
--     (ativar_kit_de_seguranca). Antes disso valem a regra e o custo 12 para
--     senha nova, e ninguém é obrigado a nada. Senha posta pelo admin não
--     conta como troca — quem a recebeu troca no primeiro acesso.
--
-- MFA: o Supabase faz o TOTP; aqui só se diz quem é obrigado (dono, admin e
-- líder) e o admin pode zerar o MFA de quem perdeu o celular.
--
-- FORA DO ALCANCE DO CÓDIGO (configuração do Supabase): o login vai direto do
-- navegador ao Supabase Auth — bloqueio por tentativa e lista de senhas
-- vazadas são do painel do Supabase, não daqui.
-- ============================================================

-- ------------------------------------------------------------
-- A regra da senha — a única cópia dela
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.problema_da_senha(p_senha text, p_email text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v text := coalesce(p_senha, '');
  v_min text := lower(v);
  v_tipos int;
  v_usuario text := lower(split_part(coalesce(p_email, ''), '@', 1));
BEGIN
  IF length(v) < 8 THEN RETURN 'A senha precisa de pelo menos 8 caracteres.'; END IF;
  -- bcrypt só considera os primeiros 72 bytes: mais que isso é ilusão de segurança.
  IF octet_length(v) > 72 THEN RETURN 'A senha pode ter no máximo 72 caracteres.'; END IF;
  v_tipos := (v ~ '[a-z]')::int + (v ~ '[A-Z]')::int + (v ~ '[0-9]')::int + (v ~ '[^A-Za-z0-9]')::int;
  IF v_tipos < 3 THEN RETURN 'Misture pelo menos três tipos: minúscula, maiúscula, número e símbolo.'; END IF;
  IF v_min ~ '(senha|password|lotus|japi|octo|imobiliaria|imobiliária|corretor|mudar|trocar|qwerty|abcdef|admin|brasil)'
     OR v_min ~ '(0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321)'
     OR v ~ '(.)\1\1\1' THEN
    RETURN 'Evite o óbvio: "senha", o nome da imobiliária, sequências como 1234 e letras repetidas.';
  END IF;
  IF length(v_usuario) >= 4 AND position(v_usuario IN v_min) > 0 THEN
    RETURN 'Não use o seu e-mail na senha.';
  END IF;
  RETURN NULL;
END $$;

-- ------------------------------------------------------------
-- A virada: depois dela, todo mundo troca uma vez (e o MFA passa a valer)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seguranca_politica (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  senha_desde timestamptz           -- NULO = a virada ainda não foi ligada
);
INSERT INTO public.seguranca_politica (id, senha_desde) VALUES (true, NULL) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.seguranca_senhas (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  trocada_em timestamptz NOT NULL,
  origem text NOT NULL CHECK (origem IN ('propria', 'recuperacao'))
);
ALTER TABLE public.seguranca_politica ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seguranca_senhas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seguranca_politica, public.seguranca_senhas FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.seguranca_politica, public.seguranca_senhas TO service_role;

CREATE OR REPLACE FUNCTION public.gravar_senha(p_user_id uuid, p_senha text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
  UPDATE auth.users SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf', 12)), updated_at = now()
   WHERE id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public.gravar_senha(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.problema_da_senha(text, text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Trocar a própria senha (pede a atual)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trocar_minha_senha(p_atual text, p_nova text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
  v_email text;
  v_problema text;
BEGIN
  SELECT encrypted_password, email INTO v_hash, v_email FROM auth.users WHERE id = v_uid;
  IF v_uid IS NULL OR v_hash IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Entre de novo para trocar a senha.'); END IF;
  IF v_hash <> extensions.crypt(coalesce(p_atual, ''), v_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A senha atual não confere.');
  END IF;
  IF p_nova = p_atual THEN RETURN jsonb_build_object('success', false, 'error', 'A nova senha precisa ser diferente da atual.'); END IF;
  v_problema := problema_da_senha(p_nova, v_email);
  IF v_problema IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', v_problema); END IF;
  PERFORM gravar_senha(v_uid, p_nova);
  INSERT INTO seguranca_senhas (user_id, trocada_em, origem) VALUES (v_uid, now(), 'propria')
  ON CONFLICT (user_id) DO UPDATE SET trocada_em = EXCLUDED.trocada_em, origem = EXCLUDED.origem;
  RETURN jsonb_build_object('success', true);
END $$;

-- ------------------------------------------------------------
-- Recuperação por e-mail: o link do Supabase abre uma sessão que prova posse
-- do e-mail — o GoTrue v2.195 a marca como amr "otp" (versões antigas, como
-- "recovery"; conferido seguindo o link de verdade no Supabase local). Só ela,
-- com um pedido de recuperação na última hora, troca a senha sem pedir a atual,
-- e por 30 minutos.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redefinir_senha_por_recuperacao(p_nova text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_problema text;
  v_recuperacao boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) a
                  WHERE a->>'method' IN ('otp', 'recovery')
                    AND to_timestamp((a->>'timestamp')::double precision) > now() - interval '30 minutes')
       AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_uid AND u.recovery_sent_at > now() - interval '1 hour')
    INTO v_recuperacao;
  IF v_uid IS NULL OR NOT v_recuperacao THEN
    RETURN jsonb_build_object('success', false, 'error', 'Abra o link de recuperação que chegou no seu e-mail (ele vale por 30 minutos).');
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  v_problema := problema_da_senha(p_nova, v_email);
  IF v_problema IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', v_problema); END IF;
  PERFORM gravar_senha(v_uid, p_nova);
  INSERT INTO seguranca_senhas (user_id, trocada_em, origem) VALUES (v_uid, now(), 'recuperacao')
  ON CONFLICT (user_id) DO UPDATE SET trocada_em = EXCLUDED.trocada_em, origem = EXCLUDED.origem;
  RETURN jsonb_build_object('success', true);
END $$;

-- ------------------------------------------------------------
-- O admin: a mesma regra e o mesmo custo. Senha que o admin sabe não vale
-- como troca — a pessoa troca no próximo acesso.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_user_password(p_user_id uuid, p_new_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'extensions' AS $$
DECLARE v_problema text;
BEGIN
  IF NOT public.caller_can_manage_user(p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para alterar este membro');
  END IF;
  v_problema := public.problema_da_senha(p_new_password, (SELECT email FROM auth.users WHERE id = p_user_id));
  IF v_problema IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', v_problema); END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 12)),
      updated_at = now()
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não encontrado');
  END IF;
  DELETE FROM public.seguranca_senhas WHERE user_id = p_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_auth_user(p_email text, p_password text, p_name text DEFAULT NULL::text, p_tenant_id uuid DEFAULT NULL::uuid, p_role text DEFAULT 'corretor'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id UUID;
  v_encrypted_password TEXT;
  v_problema TEXT;
BEGIN
  -- Só owner da plataforma ou admin/owner do tenant (mesma regra de add_tenant_member)
  IF NOT (
    public.is_platform_owner()
    OR EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email = 'octo.inteligenciaimobiliaria@gmail.com')
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.user_id = auth.uid() AND tm.tenant_id = p_tenant_id AND tm.role IN ('owner', 'admin')
    )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Você não tem permissão para criar usuários nesta imobiliária');
  END IF;

  -- Validar email
  IF p_email IS NULL OR p_email = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email é obrigatório');
  END IF;

  -- Validar senha: a regra do kit de segurança (a pessoa troca no primeiro acesso)
  v_problema := public.problema_da_senha(p_password, p_email);
  IF v_problema IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_problema);
  END IF;

  -- Verificar se email já existe
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(trim(p_email))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este email já está cadastrado');
  END IF;

  -- Gerar ID e criptografar senha (bcrypt custo 12)
  v_user_id := gen_random_uuid();
  v_encrypted_password := extensions.crypt(p_password, extensions.gen_salt('bf', 12));

  -- Inserir usuário (sem confirmed_at que é coluna gerada)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    email_change,
    reauthentication_token,
    phone_change,
    phone_change_token,
    is_sso_user,
    is_anonymous
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    lower(trim(p_email)),
    v_encrypted_password,
    NOW(),
    NOW(),
    NOW(),
    jsonb_build_object('provider', 'email', 'providers', ARRAY['email']),
    jsonb_build_object('name', COALESCE(p_name, split_part(p_email, '@', 1)), 'tenant_id', p_tenant_id, 'role', p_role),
    'authenticated',
    'authenticated',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    false,
    false
  );

  -- Criar identity
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    provider,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_user_id,
    lower(trim(p_email)),
    'email',
    jsonb_build_object('sub', v_user_id::text, 'email', lower(trim(p_email)), 'email_verified', true, 'phone_verified', false),
    NOW(),
    NOW(),
    NOW()
  );

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este email já está cadastrado');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ------------------------------------------------------------
-- O portão: o que a pessoa precisa fazer antes de entrar
-- ------------------------------------------------------------
-- Tudo só vale depois da virada:
-- precisa_trocar: não trocou a senha (ela mesma) depois da virada.
-- mfa_exigido: dono da plataforma, admin ou líder em alguma casa.
CREATE OR REPLACE FUNCTION public.minha_seguranca()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'kit_ativo', p.senha_desde IS NOT NULL,
    'precisa_trocar', p.senha_desde IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM seguranca_senhas s WHERE s.user_id = auth.uid() AND s.trocada_em >= p.senha_desde),
    'mfa_exigido', p.senha_desde IS NOT NULL
                   AND (coalesce(public.is_platform_owner(), false)
                        OR EXISTS (SELECT 1 FROM tenant_memberships tm WHERE tm.user_id = auth.uid() AND tm.role IN ('admin', 'team_leader'))),
    'mfa_ativo', EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified'),
    'aal', coalesce(auth.jwt()->>'aal', 'aal1'))
  FROM seguranca_politica p
  WHERE auth.uid() IS NOT NULL
$$;

-- A virada, na reunião: só o dono da plataforma liga, uma vez. Ligar de novo
-- não recomeça (quem já trocou não troca outra vez).
CREATE OR REPLACE FUNCTION public.ativar_kit_de_seguranca()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v timestamptz;
BEGIN
  IF NOT coalesce(public.is_platform_owner(), false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Só o dono da plataforma liga o kit de segurança.');
  END IF;
  UPDATE seguranca_politica SET senha_desde = coalesce(senha_desde, now()) RETURNING senha_desde INTO v;
  RETURN jsonb_build_object('success', true, 'desde', v);
END $$;

-- Perdeu o celular: quem administra a pessoa zera o MFA, e ela cadastra de novo.
CREATE OR REPLACE FUNCTION public.admin_remover_mfa(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $$
DECLARE v_n int;
BEGIN
  IF p_user_id = auth.uid() OR NOT public.caller_can_manage_user(p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão para zerar o MFA deste membro');
  END IF;
  DELETE FROM auth.mfa_factors WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'removidos', v_n);
END $$;

REVOKE ALL ON FUNCTION public.trocar_minha_senha(text, text), public.redefinir_senha_por_recuperacao(text),
                       public.minha_seguranca(), public.admin_remover_mfa(uuid), public.ativar_kit_de_seguranca()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trocar_minha_senha(text, text), public.redefinir_senha_por_recuperacao(text),
                          public.minha_seguranca(), public.admin_remover_mfa(uuid), public.ativar_kit_de_seguranca()
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
