-- ============================================================
-- Kit de segurança (20261013_kit_de_seguranca.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/kit_de_seguranca.test.sql
--
-- Roda numa transação e DESFAZ tudo. Cria o próprio tenant: não depende do dump.
-- Sucesso = um NOTICE "OK" por bloco. Falha = ERROR com "FALHOU: <caso>".
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

-- Como uma pessoa logada, com o JWT que quisermos (amr, aal).
CREATE FUNCTION pg_temp.como(p_user uuid, p_sql text, p_extra jsonb DEFAULT '{}') RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', (jsonb_build_object('sub', p_user, 'role', 'authenticated') || p_extra)::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.hash(p_user uuid) RETURNS text LANGUAGE sql AS $$
  SELECT encrypted_password FROM auth.users WHERE id = p_user;
$$;

CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7b1a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7b1b0000-0000-4000-a000-000000000001'::uuid AS admin,
  '7b1b0000-0000-4000-a000-000000000002'::uuid AS lider,
  '7b1b0000-0000-4000-a000-000000000003'::uuid AS corretor,
  '7b1b0000-0000-4000-a000-000000000004'::uuid AS outro,   -- de outra casa
  '7b1b0000-0000-4000-a000-000000000005'::uuid AS dono;    -- dono da plataforma

INSERT INTO tenants (id, code, name) SELECT t, 'teste-seg', 'Teste Segurança' FROM fx ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
SELECT v.id, v.email, extensions.crypt('Antiga#2025', extensions.gen_salt('bf', 6)), '{}'::jsonb FROM fx, LATERAL (VALUES
  (fx.admin, 'diana@teste-seg.dev'), (fx.lider, 'leo@teste-seg.dev'),
  (fx.corretor, 'carla.corretora@teste-seg.dev'), (fx.outro, 'otto@teste-seg.dev'), (fx.dono, 'dono@teste-seg.dev')
) AS v(id, email) ON CONFLICT (id) DO NOTHING;
INSERT INTO tenant_memberships (tenant_id, user_id, role)
SELECT t, admin, 'admin' FROM fx UNION ALL SELECT t, lider, 'team_leader' FROM fx UNION ALL SELECT t, corretor, 'corretor' FROM fx;
INSERT INTO platform_owners (email, user_id) SELECT 'dono@teste-seg.dev', dono FROM fx;
-- O teste parte do kit desligado, como a migration deixa.
UPDATE seguranca_politica SET senha_desde = NULL;

-- 0. A virada: desligada até o dono ligar --------------------------------------------
DO $$
DECLARE f record; s jsonb; r jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  s := pg_temp.como(f.admin, 'SELECT public.minha_seguranca()::text')::jsonb;
  PERFORM pg_temp.checa(NOT (s->>'kit_ativo')::boolean AND NOT (s->>'precisa_trocar')::boolean AND NOT (s->>'mfa_exigido')::boolean,
    'antes da virada, ninguém é obrigado a nada (veio ' || s::text || ')');
  r := pg_temp.como(f.admin, 'SELECT public.ativar_kit_de_seguranca()::text')::jsonb;
  PERFORM pg_temp.checa(NOT (r->>'success')::boolean, 'admin de uma casa não liga a virada de todas');
  r := pg_temp.como(f.dono, 'SELECT public.ativar_kit_de_seguranca()::text', '{"email":"dono@teste-seg.dev"}')::jsonb;
  PERFORM pg_temp.checa((r->>'success')::boolean, 'o dono liga (veio ' || r::text || ')');
  PERFORM pg_temp.checa((SELECT senha_desde FROM seguranca_politica) IS NOT NULL, 'a virada ficou gravada');
  UPDATE seguranca_politica SET senha_desde = now() - interval '1 day';
  r := pg_temp.como(f.dono, 'SELECT public.ativar_kit_de_seguranca()::text', '{"email":"dono@teste-seg.dev"}')::jsonb;
  PERFORM pg_temp.checa((SELECT senha_desde FROM seguranca_politica) < now() - interval '23 hours', 'ligar de novo não recomeça a virada');
  UPDATE seguranca_politica SET senha_desde = now() - interval '1 minute';
  RAISE NOTICE 'OK 0 · a virada só começa quando o dono liga';
END $$;

-- 1. A regra da senha -----------------------------------------------------------------
DO $$
DECLARE ruim text; v text;
BEGIN
  FOREACH ruim IN ARRAY ARRAY['Curta#1', 'semnumeroesimbolo', 'tudominusculo123', 'SenhaForte#2026', 'Lotus@2026',
                              'Abc#12345', 'Aaaa#9999', 'carla.corretora#1A'] LOOP
    PERFORM pg_temp.checa(public.problema_da_senha(ruim, 'carla.corretora@teste-seg.dev') IS NOT NULL, 'recusada: ' || ruim);
  END LOOP;
  PERFORM pg_temp.checa(public.problema_da_senha(repeat('Ab1#', 19)) = 'A senha pode ter no máximo 72 caracteres.', 'mais de 72 bytes');
  PERFORM pg_temp.checa(public.problema_da_senha('Curta#1') = 'A senha precisa de pelo menos 8 caracteres.', 'mensagem do tamanho');
  PERFORM pg_temp.checa(public.problema_da_senha('tudominusculo') LIKE 'Misture pelo menos três tipos%', 'mensagem dos tipos');
  PERFORM pg_temp.checa(public.problema_da_senha('Otto.ribeiro#7', 'otto.ribeiro@teste-seg.dev') = 'Não use o seu e-mail na senha.',
    'o próprio e-mail, e só ele, derruba a senha');
  FOREACH v IN ARRAY ARRAY['Pato-Azul-97', 'café com 3 Pães', 'Xq7!vLm2'] LOOP
    PERFORM pg_temp.checa(public.problema_da_senha(v, 'carla.corretora@teste-seg.dev') IS NULL, 'aceita: ' || v);
  END LOOP;
  RAISE NOTICE 'OK 1 · 8+ caracteres, três tipos, nada óbvio nem do próprio e-mail';
END $$;

-- 2. Trocar a própria senha: pede a atual, grava com custo 12 e conta como troca ----
DO $$
DECLARE f record; r jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  PERFORM pg_temp.checa((pg_temp.como(f.corretor, 'SELECT public.minha_seguranca()::text')::jsonb->>'precisa_trocar')::boolean,
    'antes de trocar, precisa trocar');
  r := pg_temp.como(f.corretor, $q$SELECT public.trocar_minha_senha('errada', 'Pato-Azul-97')::text$q$)::jsonb;
  PERFORM pg_temp.checa(r->>'error' = 'A senha atual não confere.', 'senha atual errada (veio ' || r::text || ')');
  r := pg_temp.como(f.corretor, $q$SELECT public.trocar_minha_senha('Antiga#2025', '12345678')::text$q$)::jsonb;
  PERFORM pg_temp.checa(NOT (r->>'success')::boolean AND pg_temp.hash(f.corretor) LIKE '$2a$06$%', 'senha fraca não grava nada');
  r := pg_temp.como(f.corretor, $q$SELECT public.trocar_minha_senha('Antiga#2025', 'Antiga#2025')::text$q$)::jsonb;
  PERFORM pg_temp.checa(r->>'error' = 'A nova senha precisa ser diferente da atual.', 'igual à atual');
  r := pg_temp.como(f.corretor, $q$SELECT public.trocar_minha_senha('Antiga#2025', 'Pato-Azul-97')::text$q$)::jsonb;
  PERFORM pg_temp.checa((r->>'success')::boolean, 'trocou (veio ' || r::text || ')');
  PERFORM pg_temp.checa(pg_temp.hash(f.corretor) LIKE '$2a$12$%', 'bcrypt custo 12 (veio ' || left(pg_temp.hash(f.corretor), 7) || ')');
  PERFORM pg_temp.checa(pg_temp.hash(f.corretor) = extensions.crypt('Pato-Azul-97', pg_temp.hash(f.corretor)), 'a nova senha confere');
  PERFORM pg_temp.checa(NOT (pg_temp.como(f.corretor, 'SELECT public.minha_seguranca()::text')::jsonb->>'precisa_trocar')::boolean,
    'trocou depois da virada: não precisa mais');
  RAISE NOTICE 'OK 2 · trocar a própria senha pede a atual, aplica a regra e grava custo 12';
END $$;

-- 3. O admin: mesma regra, custo 12, e a pessoa troca de novo no próximo acesso ----
DO $$
DECLARE f record; r jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  r := pg_temp.como(f.admin, format($q$SELECT public.admin_update_user_password(%L, 'mudar123')::text$q$, f.corretor))::jsonb;
  PERFORM pg_temp.checa(NOT (r->>'success')::boolean AND r->>'error' LIKE 'Misture%', 'admin também não põe senha fraca (veio ' || r::text || ')');
  r := pg_temp.como(f.admin, format($q$SELECT public.admin_update_user_password(%L, 'Xq7!vLm2')::text$q$, f.corretor))::jsonb;
  PERFORM pg_temp.checa((r->>'success')::boolean AND pg_temp.hash(f.corretor) LIKE '$2a$12$%', 'admin grava custo 12 (veio ' || r::text || ')');
  PERFORM pg_temp.checa((pg_temp.como(f.corretor, 'SELECT public.minha_seguranca()::text')::jsonb->>'precisa_trocar')::boolean,
    'senha que o admin sabe não vale: a pessoa troca no próximo acesso');
  r := pg_temp.como(f.corretor, format($q$SELECT public.admin_update_user_password(%L, 'Xq7!vLm2zz')::text$q$, f.admin))::jsonb;
  PERFORM pg_temp.checa(NOT (r->>'success')::boolean, 'corretor não troca a senha do admin');

  r := pg_temp.como(f.admin, format($q$SELECT public.create_auth_user('nova@teste-seg.dev', 'curta', 'Nova', %L, 'corretor')::text$q$, f.t))::jsonb;
  PERFORM pg_temp.checa(r->>'error' = 'A senha precisa de pelo menos 8 caracteres.', 'membro novo com senha fraca: recusado (veio ' || r::text || ')');
  r := pg_temp.como(f.admin, format($q$SELECT public.create_auth_user('nova@teste-seg.dev', 'Xq7!vLm2', 'Nova', %L, 'corretor')::text$q$, f.t))::jsonb;
  PERFORM pg_temp.checa((r->>'success')::boolean AND pg_temp.hash((r->>'user_id')::uuid) LIKE '$2a$12$%', 'membro novo com custo 12 (veio ' || r::text || ')');
  PERFORM pg_temp.checa(NOT EXISTS (SELECT 1 FROM seguranca_senhas WHERE user_id = (r->>'user_id')::uuid), 'e troca no primeiro acesso');
  RAISE NOTICE 'OK 3 · o admin segue a regra, grava custo 12, e quem recebeu a senha troca';
END $$;

-- 4. Recuperação: só a sessão do link (amr "otp", até 30 min, com pedido recente) troca sem a atual
DO $$
DECLARE f record; r jsonb; agora double precision := extract(epoch FROM now());
BEGIN
  SELECT * INTO f FROM fx;
  -- Sessão de código, mas sem pedido de recuperação: não serve.
  r := pg_temp.como(f.lider, $q$SELECT public.redefinir_senha_por_recuperacao('Xq7!vLm2')::text$q$,
                    jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', agora))))::jsonb;
  PERFORM pg_temp.checa(NOT (r->>'success')::boolean, 'código sem pedido de recuperação não redefine');
  UPDATE auth.users SET recovery_sent_at = now() - interval '5 minutes' WHERE id = f.lider;
  r := pg_temp.como(f.lider, $q$SELECT public.redefinir_senha_por_recuperacao('Xq7!vLm2')::text$q$,
                    jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', agora))))::jsonb;
  PERFORM pg_temp.checa(NOT (r->>'success')::boolean AND r->>'error' LIKE 'Abra o link%', 'sessão comum não redefine sem a atual');
  r := pg_temp.como(f.lider, $q$SELECT public.redefinir_senha_por_recuperacao('Xq7!vLm2')::text$q$,
                    jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', agora - 3600))))::jsonb;
  PERFORM pg_temp.checa(NOT (r->>'success')::boolean, 'link de uma hora atrás já não vale');
  r := pg_temp.como(f.lider, $q$SELECT public.redefinir_senha_por_recuperacao('leo12345')::text$q$,
                    jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', agora))))::jsonb;
  PERFORM pg_temp.checa(NOT (r->>'success')::boolean, 'a regra vale também na recuperação');
  r := pg_temp.como(f.lider, $q$SELECT public.redefinir_senha_por_recuperacao('Xq7!vLm2')::text$q$,
                    jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', agora))))::jsonb;
  PERFORM pg_temp.checa((r->>'success')::boolean AND pg_temp.hash(f.lider) LIKE '$2a$12$%', 'recuperou com custo 12 (veio ' || r::text || ')');
  PERFORM pg_temp.checa(NOT (pg_temp.como(f.lider, 'SELECT public.minha_seguranca()::text')::jsonb->>'precisa_trocar')::boolean,
    'redefinir pelo link conta como troca');
  RAISE NOTICE 'OK 4 · recuperação só pela sessão do link, com a mesma regra';
END $$;

-- 5. MFA: quem é obrigado, quem está ativo, e o admin zera -------------------------------
DO $$
DECLARE f record; s jsonb; r jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  s := pg_temp.como(f.admin, 'SELECT public.minha_seguranca()::text')::jsonb;
  PERFORM pg_temp.checa((s->>'mfa_exigido')::boolean AND NOT (s->>'mfa_ativo')::boolean, 'admin: obrigado, ainda sem MFA');
  PERFORM pg_temp.checa((pg_temp.como(f.lider, 'SELECT public.minha_seguranca()::text')::jsonb->>'mfa_exigido')::boolean, 'líder: obrigado');
  PERFORM pg_temp.checa(NOT (pg_temp.como(f.corretor, 'SELECT public.minha_seguranca()::text')::jsonb->>'mfa_exigido')::boolean, 'corretor: não');

  INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
  VALUES (gen_random_uuid(), f.lider, 'Octo Dash', 'totp', 'verified', now(), now(), 'SEGREDO');
  s := pg_temp.como(f.lider, 'SELECT public.minha_seguranca()::text', '{"aal":"aal2"}')::jsonb;
  PERFORM pg_temp.checa((s->>'mfa_ativo')::boolean AND s->>'aal' = 'aal2', 'líder com MFA ativo e sessão aal2 (veio ' || s::text || ')');

  r := pg_temp.como(f.corretor, format('SELECT public.admin_remover_mfa(%L)::text', f.lider))::jsonb;
  PERFORM pg_temp.checa(NOT (r->>'success')::boolean, 'corretor não zera o MFA de ninguém');
  r := pg_temp.como(f.outro, format('SELECT public.admin_remover_mfa(%L)::text', f.lider))::jsonb;
  PERFORM pg_temp.checa(NOT (r->>'success')::boolean, 'quem é de fora também não');
  r := pg_temp.como(f.admin, format('SELECT public.admin_remover_mfa(%L)::text', f.lider))::jsonb;
  PERFORM pg_temp.checa((r->>'success')::boolean AND (r->>'removidos')::int = 1, 'o admin zera o MFA de quem perdeu o celular (veio ' || r::text || ')');
  PERFORM pg_temp.checa(NOT EXISTS (SELECT 1 FROM auth.mfa_factors WHERE user_id = f.lider), 'e o fator saiu');
  r := pg_temp.como(f.admin, format('SELECT public.admin_remover_mfa(%L)::text', f.admin))::jsonb;
  PERFORM pg_temp.checa(NOT (r->>'success')::boolean, 'ninguém zera o próprio MFA por aqui');
  RAISE NOTICE 'OK 5 · MFA exigido de dono, admin e líder; o admin zera o de quem perdeu o celular';
END $$;

-- 6. Nada disso se lê nem se chama de fora -------------------------------------------------
DO $$
DECLARE f record; v text;
BEGIN
  SELECT * INTO f FROM fx;
  v := pg_temp.como(f.corretor, 'SELECT count(*)::text FROM public.seguranca_senhas');
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'a tabela de trocas não se lê (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.corretor, format($q$SELECT public.gravar_senha(%L, 'Xq7!vLm2zz')::text$q$, f.admin));
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'ninguém grava senha alheia direto (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.corretor, $q$SELECT public.problema_da_senha('x')$q$);
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'a regra não é exposta (a tela recebe o erro de quem grava)');
  RAISE NOTICE 'OK 6 · as peças internas não se chamam de fora';
END $$;

ROLLBACK;
