-- ============================================================
-- pessoas_da_casa (20261017_pessoas_da_casa.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/pessoas_da_casa.test.sql
--
-- Roda numa transação e DESFAZ tudo. Sucesso = um NOTICE "OK" por bloco.
-- Falha = ERROR com "FALHOU: <caso>".
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

-- Executa como uma pessoa logada; devolve o resultado (texto) ou a mensagem de erro.
CREATE FUNCTION pg_temp.como(p_user uuid, p_email text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'email', p_email)::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END $$;

CREATE TEMP TABLE fx AS SELECT
  '7d1a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7d1a0000-0000-4000-a000-000000000002'::uuid AS t2,
  '7d1b0000-0000-4000-a000-000000000001'::uuid AS corretor,
  '7d1b0000-0000-4000-a000-000000000002'::uuid AS lia,
  '7d1b0000-0000-4000-a000-000000000003'::uuid AS teste,
  '7d1b0000-0000-4000-a000-000000000004'::uuid AS admin,
  '7d1b0000-0000-4000-a000-000000000005'::uuid AS fora;
GRANT SELECT ON fx TO authenticated;

INSERT INTO tenants (id, code, name) SELECT t, 'teste-pessoas', 'Teste Pessoas' FROM fx
UNION ALL SELECT t2, 'teste-pessoas-viz', 'Vizinha Pessoas' FROM fx ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT v.id, v.email, v.meta FROM fx, LATERAL (VALUES
  (fx.corretor, 'fernanda@teste-pc.dev', '{"name":"Fernanda  Souza "}'::jsonb),
  (fx.lia,      'lia@teste-pc.dev',      '{"name":"Lia"}'::jsonb),
  (fx.teste,    'teste@teste-pc.dev',    '{"name":"Conta Teste"}'::jsonb),
  (fx.admin,    'diretora@teste-pc.dev', '{}'::jsonb),
  (fx.fora,     'fora@teste-pc.dev',     '{"name":"De Fora"}'::jsonb)
) AS v(id, email, meta) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, permissions)
SELECT t, corretor, 'corretor', '{}'::jsonb FROM fx
UNION ALL SELECT t, lia,   'corretor', '{"lead_limit":{"motivo":"assistente-ia"}}' FROM fx
UNION ALL SELECT t, teste, 'corretor', '{"conta_de_teste":true}' FROM fx
UNION ALL SELECT t, admin, 'admin',    '{}'::jsonb FROM fx
UNION ALL SELECT t2, fora, 'corretor', '{}'::jsonb FROM fx;

-- 1. O CORRETOR vê a lista inteira da casa — sem a Lia, sem a conta de teste.
--    (Era o caso que `usuario_assistente_ia` não cobria: para ele dava nulo.)
DO $$
DECLARE f fx; v text;
BEGIN
  SELECT * INTO f FROM fx;
  v := pg_temp.como(f.corretor, 'fernanda@teste-pc.dev', format(
    $q$SELECT string_agg(nome, '|' ORDER BY nome) FROM public.pessoas_da_casa(%L)$q$, f.t));
  PERFORM pg_temp.checa(v = 'diretora|Fernanda Souza',
    format('corretor vê só gente, nome do cadastro sem espaço sobrando (veio %s)', v));
  RAISE NOTICE 'OK 1: sem Lia e sem conta de teste, para o corretor também';
END $$;

-- 2. Quem é de outra casa não lista ninguém daqui.
DO $$
DECLARE f fx; v text;
BEGIN
  SELECT * INTO f FROM fx;
  v := pg_temp.como(f.fora, 'fora@teste-pc.dev', format(
    $q$SELECT count(*)::text FROM public.pessoas_da_casa(%L)$q$, f.t));
  PERFORM pg_temp.checa(v = '0', format('de fora não vê a casa (veio %s)', v));
  RAISE NOTICE 'OK 2: outra casa não enxerga';
END $$;

-- 3. anon não chama.
DO $$
DECLARE f fx; v text;
BEGIN
  SELECT * INTO f FROM fx;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN
    EXECUTE format('SELECT count(*)::text FROM public.pessoas_da_casa(%L)', f.t) INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.checa(v LIKE 'permission denied%', format('anon barrado (veio %s)', v));
  RAISE NOTICE 'OK 3: anon recebe permission denied';
END $$;

ROLLBACK;
