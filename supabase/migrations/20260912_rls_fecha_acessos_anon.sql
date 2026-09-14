-- Migration: fecha acessos anônimos que não servem a nenhuma tela
-- Data: 2026-09-12
-- Descrição: a anon key vai no bundle do front, então tudo que `anon` consegue
-- executar/ler/escrever está aberto para qualquer pessoa. Esta migration fecha só
-- o que comprovadamente nenhuma parte da dash usa por esses roles (checado no
-- código e no pg_stat_statements desde 10/09/2026):
--
-- 1. create_auth_user: criava usuário já confirmado para qualquer chamador.
--    Passa a exigir o mesmo que add_tenant_member (chamada logo em seguida no
--    fluxo de "novo membro"): owner da plataforma ou admin/owner do tenant.
--    Quem hoje consegue criar membro continua conseguindo; os demais só criavam
--    um auth.user órfão antes de add_tenant_member recusar.
-- 2. join_tenant_by_code: auto-cadastro removido do front (useAuth.ts).
-- 3. pick_roleta_broker(_excluding), pick_team_queue_member,
--    enqueue_recovery_from_kenlo_lead: só são chamadas por triggers/funções
--    SECURITY DEFINER (rodam como postgres) — não precisam de grant externo.
-- 4. expire_bolsao_leads: o front chama logado; só `anon` perde o acesso.
-- 5. octochat_*: policies `true` para anon/public (users com password_hash,
--    instances com evolution_data). Produto parado desde 02/2026, sem referência
--    no código. As policies por tenant para `authenticated` ficam.
-- 6. RLS ligado sem policy em tenant_zap_config e tenant_santa_angela_config
--    (só o servidor lê, com service_role) e proposal_attachments/party_links
--    (vazias, sem uso).
-- 7. commercial_sales_team_leader_summary: view sem security_invoker expondo
--    VGV de todos os tenants; sem uso no código.
--
-- Função criada no Postgres nasce com EXECUTE para PUBLIC, por isso os REVOKE
-- incluem PUBLIC — revogar só de anon não fecharia nada.

-- 1 -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_auth_user(p_email text, p_password text, p_name text DEFAULT NULL::text, p_tenant_id uuid DEFAULT NULL::uuid, p_role text DEFAULT 'corretor'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id UUID;
  v_encrypted_password TEXT;
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

  -- Validar senha
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Senha deve ter pelo menos 6 caracteres');
  END IF;

  -- Verificar se email já existe
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(trim(p_email))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este email já está cadastrado');
  END IF;

  -- Gerar ID e criptografar senha
  v_user_id := gen_random_uuid();
  v_encrypted_password := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

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

REVOKE EXECUTE ON FUNCTION public.create_auth_user(text, text, text, uuid, text) FROM PUBLIC, anon;

-- 2 -------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.join_tenant_by_code(text) FROM PUBLIC, anon, authenticated;

-- 3 -------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.pick_roleta_broker(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pick_roleta_broker_excluding(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pick_team_queue_member(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_recovery_from_kenlo_lead(public.kenlo_leads) FROM PUBLIC, anon, authenticated;

-- 4 -------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.expire_bolsao_leads() FROM PUBLIC, anon;

-- 5 -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read ai_config" ON public.octochat_ai_config;
DROP POLICY IF EXISTS "Public write ai_config" ON public.octochat_ai_config;
DROP POLICY IF EXISTS "Public read instances" ON public.octochat_instances;
DROP POLICY IF EXISTS "Public write instances" ON public.octochat_instances;
DROP POLICY IF EXISTS "Allow public read for login" ON public.octochat_tenants;
DROP POLICY IF EXISTS "Allow select octochat_tenants" ON public.octochat_tenants;
DROP POLICY IF EXISTS "Allow update octochat_tenants" ON public.octochat_tenants;
DROP POLICY IF EXISTS "Public read tenants" ON public.octochat_tenants;
DROP POLICY IF EXISTS "Allow public read for auth" ON public.octochat_users;
DROP POLICY IF EXISTS "Public read users" ON public.octochat_users;
DROP POLICY IF EXISTS "Public write users" ON public.octochat_users;

-- 6 -------------------------------------------------------------------------
ALTER TABLE public.tenant_zap_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_santa_angela_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_party_links ENABLE ROW LEVEL SECURITY;

-- 7 -------------------------------------------------------------------------
ALTER VIEW public.commercial_sales_team_leader_summary SET (security_invoker = true);
REVOKE SELECT ON public.commercial_sales_team_leader_summary FROM anon, authenticated;

-- ROLLBACK (estado anterior capturado em 14/09/2026, antes de aplicar) --------
-- 1: recriar create_auth_user sem o bloco "Só owner da plataforma ou admin/owner
--    do tenant" (o resto do corpo é idêntico) e
--    GRANT EXECUTE ON FUNCTION public.create_auth_user(text, text, text, uuid, text) TO PUBLIC, anon;
-- 2-4:
--    GRANT EXECUTE ON FUNCTION public.join_tenant_by_code(text) TO anon, authenticated;
--    GRANT EXECUTE ON FUNCTION public.pick_roleta_broker(uuid) TO PUBLIC, anon, authenticated;
--    GRANT EXECUTE ON FUNCTION public.pick_roleta_broker_excluding(uuid, text) TO PUBLIC, anon, authenticated;
--    GRANT EXECUTE ON FUNCTION public.pick_team_queue_member(uuid, text) TO PUBLIC, anon, authenticated;
--    GRANT EXECUTE ON FUNCTION public.enqueue_recovery_from_kenlo_lead(public.kenlo_leads) TO PUBLIC, anon, authenticated;
--    GRANT EXECUTE ON FUNCTION public.expire_bolsao_leads() TO PUBLIC, anon;
-- 5:
--    CREATE POLICY "Public read ai_config" ON public.octochat_ai_config AS PERMISSIVE FOR SELECT TO anon USING (true);
--    CREATE POLICY "Public write ai_config" ON public.octochat_ai_config AS PERMISSIVE FOR ALL TO anon USING (true) WITH CHECK (true);
--    CREATE POLICY "Public read instances" ON public.octochat_instances AS PERMISSIVE FOR SELECT TO anon USING (true);
--    CREATE POLICY "Public write instances" ON public.octochat_instances AS PERMISSIVE FOR ALL TO anon USING (true) WITH CHECK (true);
--    CREATE POLICY "Allow public read for login" ON public.octochat_tenants AS PERMISSIVE FOR SELECT TO public USING (true);
--    CREATE POLICY "Allow select octochat_tenants" ON public.octochat_tenants AS PERMISSIVE FOR SELECT TO public USING (true);
--    CREATE POLICY "Allow update octochat_tenants" ON public.octochat_tenants AS PERMISSIVE FOR UPDATE TO public USING (true) WITH CHECK (true);
--    CREATE POLICY "Public read tenants" ON public.octochat_tenants AS PERMISSIVE FOR SELECT TO anon USING (true);
--    CREATE POLICY "Allow public read for auth" ON public.octochat_users AS PERMISSIVE FOR SELECT TO public USING (true);
--    CREATE POLICY "Public read users" ON public.octochat_users AS PERMISSIVE FOR SELECT TO anon USING (true);
--    CREATE POLICY "Public write users" ON public.octochat_users AS PERMISSIVE FOR ALL TO anon USING (true) WITH CHECK (true);
-- 6: ALTER TABLE ... DISABLE ROW LEVEL SECURITY; nas quatro tabelas.
-- 7: ALTER VIEW public.commercial_sales_team_leader_summary RESET (security_invoker);
--    GRANT SELECT ON public.commercial_sales_team_leader_summary TO authenticated;
