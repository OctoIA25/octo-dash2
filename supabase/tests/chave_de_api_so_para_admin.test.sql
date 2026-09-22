-- ============================================================
-- A chave da API não sai para quem não é admin.
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/chave_de_api_so_para_admin.test.sql
--
-- O caso 2 é o furo que existia: o corretor lia a chave `crm`, que autentica a
-- API interna, e a chave da OpenAI — as duas em texto puro, com o login normal
-- dele. O caso 5 cobre o que quase aconteceu junto: a permissão do `anon`
-- nunca tinha sido retirada, e só a política o segurava.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '2fff7777-0000-4000-a000-000000000001';
  t2 uuid := '2fff7777-0000-4000-a000-000000000002';
  chefe uuid := '2fff7778-0000-4000-a000-000000000001';
  lider uuid := '2fff7778-0000-4000-a000-000000000002';
  corretor uuid := '2fff7778-0000-4000-a000-000000000003';
  vizinho uuid := '2fff7778-0000-4000-a000-000000000009';
  n integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (chefe, 'chefe@teste-chave.dev'), (lider, 'lider@teste-chave.dev'),
    (corretor, 'corretor@teste-chave.dev'), (vizinho, 'vizinho@teste-chave.dev')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (t, 'teste-chave', 'Teste Chave'), (t2, 'teste-chave-2', 'Vizinha') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (t, chefe, 'admin'), (t, lider, 'team_leader'), (t, corretor, 'corretor'),
    (t2, vizinho, 'admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO tenant_api_keys (tenant_id, provider, api_key, status) VALUES
    (t, 'crm', 'octo_sk_NAO_PODE_VAZAR', 'active'),
    (t, 'openai', 'sk-proj-GASTA_DINHEIRO', 'active');

  -- ----------------------------------------------------------
  -- 1. O ADMIN LÊ
  --
  -- É ele quem gera e copia a chave na tela de Integrações. Se esta falhar, a
  -- trava fechou demais e quebrou o uso legítimo.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', chefe, 'role', 'authenticated', 'email', 'chefe@teste-chave.dev')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tenant_api_keys WHERE tenant_id = t;
  RESET ROLE;
  IF n IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: o admin devia ler as 2 chaves da casa dele, leu %', n;
  END IF;
  RAISE NOTICE 'OK 1: o admin lê as chaves da própria imobiliária';

  -- ----------------------------------------------------------
  -- 2. O CORRETOR NÃO LÊ — ERA ESTE O FURO
  --
  -- A chave `crm` autentica /api/v1/* como a imobiliária inteira: quem a tem
  -- fala com o servidor por fora de qualquer tela e de qualquer cargo.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', corretor, 'role', 'authenticated', 'email', 'corretor@teste-chave.dev')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tenant_api_keys WHERE tenant_id = t;
  RESET ROLE;
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: o corretor leu % chave(s) da casa — o furo continua aberto', n;
  END IF;
  RAISE NOTICE 'OK 2: o corretor não lê chave nenhuma';

  -- ----------------------------------------------------------
  -- 3. NEM O LÍDER DE EQUIPE
  --
  -- Ele manda em gente, não na infraestrutura. A chave não é assunto dele.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', lider, 'role', 'authenticated', 'email', 'lider@teste-chave.dev')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tenant_api_keys WHERE tenant_id = t;
  RESET ROLE;
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: o líder de equipe leu % chave(s)', n;
  END IF;
  RAISE NOTICE 'OK 3: o líder de equipe não lê';

  -- ----------------------------------------------------------
  -- 4. O ADMIN DA VIZINHA NÃO LÊ A DA CASA AO LADO
  --
  -- Ser admin não é ser admin de todo mundo.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', vizinho, 'role', 'authenticated', 'email', 'vizinho@teste-chave.dev')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM tenant_api_keys WHERE tenant_id = t;
  RESET ROLE;
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: o admin da vizinha leu % chave(s) alheia(s)', n;
  END IF;
  RAISE NOTICE 'OK 4: admin de outra imobiliária não alcança';

  -- ----------------------------------------------------------
  -- 4b. E NÃO ESCREVE
  --
  -- Gravar uma chave `crm` no tenant alheio daria acesso à API daquela casa.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', corretor, 'role', 'authenticated', 'email', 'corretor@teste-chave.dev')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO tenant_api_keys (tenant_id, provider, api_key, status)
    VALUES (t, 'crm', 'octo_sk_CHAVE_DO_CORRETOR', 'active');
    RESET ROLE;
    RAISE EXCEPTION 'FALHOU: o corretor criou uma chave de API para si mesmo';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE;
  END;
  RAISE NOTICE 'OK 4b: o corretor não cria chave para si';
END $$;

-- ----------------------------------------------------------
-- 5. O ANÔNIMO NÃO ALCANÇA A TABELA
--
-- Antes de 22/09 o `anon` tinha SELECT, INSERT, UPDATE e DELETE nesta tabela —
-- o `pg_default_acl` desta base concede tudo em toda relação nova, e ninguém
-- havia retirado. O que o segurava era só a política. Agora a permissão foi
-- retirada de verdade, e o teste confere no catálogo, não pelo efeito.
-- ----------------------------------------------------------
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(privilege_type, ', ' ORDER BY privilege_type) INTO v
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'tenant_api_keys' AND grantee = 'anon';
  IF v IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: o anônimo ainda tem % na tabela de chaves', v;
  END IF;
  RAISE NOTICE 'OK 5: o anônimo não tem permissão nenhuma no catálogo';
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
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM tenant_api_keys $$,
  'o anônimo leu a tabela de chaves de API');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK 5b: e é barrado na prática também'; END $$;

ROLLBACK;
