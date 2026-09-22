-- ============================================================
-- `user_profiles` só mostra quem divide imobiliária.
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/user_profiles_so_colegas.test.sql
--
-- O caso 2 é o furo que existia: a view devolvia a plataforma inteira para
-- qualquer pessoa autenticada. Em produção, em 22/09, um corretor com 20
-- colegas lia o e-mail de 126 pessoas — a lista de funcionários das
-- imobiliárias concorrentes.
--
-- O caso 4 é o que impede o conserto de virar outro problema: o servidor
-- precisa da lista inteira, e ele não tem usuário no token.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa uuid := '2fffdddd-0000-4000-a000-000000000001';
  vizinha uuid := '2fffdddd-0000-4000-a000-000000000002';
  chefe uuid := '2fffddde-0000-4000-a000-000000000001';
  corretor uuid := '2fffddde-0000-4000-a000-000000000002';
  colega uuid := '2fffddde-0000-4000-a000-000000000003';
  estranho uuid := '2fffddde-0000-4000-a000-000000000009';
  sozinho uuid := '2fffddde-0000-4000-a000-00000000000a';
  n integer;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (chefe,    'chefe@casa.dev',    '{"name":"Chefe"}'),
    (corretor, 'corretor@casa.dev', '{"name":"Corretor"}'),
    (colega,   'colega@casa.dev',   '{"name":"Colega"}'),
    (estranho, 'estranho@vizinha.dev', '{"name":"Estranho"}'),
    (sozinho,  'sozinho@lugar.dev', '{"name":"Sem Vínculo"}')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (casa, 'teste-perfis', 'Casa'), (vizinha, 'teste-perfis-2', 'Vizinha') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (casa, chefe, 'admin'), (casa, corretor, 'corretor'), (casa, colega, 'corretor'),
    (vizinha, estranho, 'admin')
  ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------
  -- 1. EU ME VEJO, E VEJO MEUS COLEGAS
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', corretor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM user_profiles
   WHERE id IN (corretor, chefe, colega);
  RESET ROLE;
  IF n IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: o corretor devia ver a si, o chefe e o colega (3), viu %', n;
  END IF;
  RAISE NOTICE 'OK 1: vejo a mim e aos meus colegas de casa';

  -- ----------------------------------------------------------
  -- 2. NÃO VEJO QUEM É DE OUTRA IMOBILIÁRIA — ERA ESTE O FURO
  --
  -- A lista de funcionários da concorrência não é dado de ninguém aqui.
  -- ----------------------------------------------------------
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM user_profiles WHERE id = estranho;
  RESET ROLE;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: o corretor leu o perfil de quem é de outra imobiliária';
  END IF;

  -- E nem por e-mail, que é o campo que interessa a quem for garimpar.
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM user_profiles WHERE email = 'estranho@vizinha.dev';
  RESET ROLE;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: achou o e-mail da vizinha procurando por ele';
  END IF;
  RAISE NOTICE 'OK 2: não alcanço quem é de outra imobiliária';

  -- ----------------------------------------------------------
  -- 3. QUEM AINDA NÃO TEM VÍNCULO VÊ O PRÓPRIO PERFIL
  --
  -- Sem isto, um usuário recém-criado não conseguiria ler a si mesmo — e a
  -- tela de perfil abriria vazia no primeiro acesso.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', sozinho, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM user_profiles;
  RESET ROLE;
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: quem não tem vínculo devia ver só a si (1), viu %', n;
  END IF;
  RAISE NOTICE 'OK 3: sem vínculo, vejo só a mim';

  -- ----------------------------------------------------------
  -- 4. O SERVIDOR CONTINUA VENDO TUDO
  --
  -- Ele lê como `service_role`, sem usuário no token, e precisa da lista
  -- inteira para sincronização e relatório. Apertar demais aqui quebraria o
  -- servidor em silêncio — que é o jeito mais caro de consertar um vazamento.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT count(*) INTO n FROM user_profiles WHERE id IN (corretor, estranho, sozinho);
  IF n IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: o servidor perdeu acesso à lista (viu % de 3)', n;
  END IF;
  RAISE NOTICE 'OK 4: o servidor continua vendo a lista inteira';

  -- ----------------------------------------------------------
  -- 5. O CHEFE DA CASA NÃO VIRA DONO DA PLATAFORMA
  --
  -- Ser admin da própria imobiliária não é ver as outras.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', chefe, 'role', 'authenticated', 'email', 'chefe@casa.dev')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM user_profiles WHERE id = estranho;
  RESET ROLE;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: o admin da casa leu o perfil da vizinha';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 5: admin da casa não alcança a vizinha';
END $$;

-- ----------------------------------------------------------
-- 6. O ANÔNIMO NÃO ALCANÇA A VIEW
--
-- Antes ele tinha INSERT, UPDATE e DELETE nela — herança do `pg_default_acl`
-- desta base, que dá tudo em toda relação nova. Nunca serviu para nada:
-- ninguém grava em `auth.users` por aqui.
-- ----------------------------------------------------------
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(privilege_type, ', ' ORDER BY privilege_type) INTO v
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'user_profiles' AND grantee = 'anon';
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: o anônimo ainda tem % na view de perfis', v;
  END IF;
  RAISE NOTICE 'OK 6: o anônimo não tem permissão nenhuma na view';
END $$;

CREATE FUNCTION pg_temp.deve_barrar(p_sql text, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FALHOU: %  (passou e deveria ter sido barrado)', p_caso;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM user_profiles $$,
  'o anônimo leu a view de perfis');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK 6b: e é barrado na prática também'; END $$;

ROLLBACK;
