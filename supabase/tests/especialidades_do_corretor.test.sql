-- ============================================================
-- Especialidades do corretor (20261003).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/especialidades_do_corretor.test.sql
--
-- Casos 1–3: o teto de 5 e a forma única de "nenhuma" (NULL, nunca '{}').
-- Caso 4: o site (anon) lê a especialidade — e continua SEM ler `permissions`,
--         que carrega WhatsApp e limite de leads.
-- Caso 5: quem grava é o admin da casa; corretor não mexe no colega.
-- Roda em transação e desfaz tudo no fim.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  -- O site só lê a Lotus: a policy portal_anon_select_memberships tem o id fixo.
  lotus uuid := '65c69875-dc83-4062-90f6-6f6adc30df26';
  chefe uuid := '2fffeeee-0000-4000-a000-000000000001';
  corretor uuid := '2fffeeee-0000-4000-a000-000000000002';
  colega uuid := '2fffeeee-0000-4000-a000-000000000003';
  lido text[];
  n integer;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (chefe,    'chefe@esp.dev',    '{"name":"Chefe"}'),
    (corretor, 'corretor@esp.dev', '{"name":"Corretor"}'),
    (colega,   'colega@esp.dev',   '{"name":"Colega"}')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (lotus, 'teste-esp', 'Lotus') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (lotus, chefe, 'admin'), (lotus, corretor, 'corretor'), (lotus, colega, 'corretor')
  ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------
  -- 1. ATÉ CINCO ENTRAM
  -- ----------------------------------------------------------
  UPDATE tenant_memberships
     SET especialidades = ARRAY['Lançamentos','Alto padrão','Apartamento','Casa em condomínio','Investidor']
   WHERE tenant_id = lotus AND user_id = corretor;
  RAISE NOTICE 'OK 1: cinco especialidades gravadas';

  -- ----------------------------------------------------------
  -- 2. A SEXTA É RECUSADA
  -- ----------------------------------------------------------
  BEGIN
    UPDATE tenant_memberships
       SET especialidades = ARRAY['a','b','c','d','e','f']
     WHERE tenant_id = lotus AND user_id = corretor;
    RAISE EXCEPTION 'FALHOU: seis especialidades foram aceitas';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 2: a sexta é recusada';
  END;

  -- ----------------------------------------------------------
  -- 3. "NENHUMA" É NULL: '{}' E ELEMENTO NULO SÃO RECUSADOS
  --
  -- É o caso que array_length deixaria passar: array_length('{}') é NULL e
  -- o CHECK aceitaria.
  -- ----------------------------------------------------------
  BEGIN
    UPDATE tenant_memberships SET especialidades = '{}'
     WHERE tenant_id = lotus AND user_id = corretor;
    RAISE EXCEPTION 'FALHOU: lista vazia foi aceita';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 3a: lista vazia é recusada';
  END;
  BEGIN
    UPDATE tenant_memberships SET especialidades = ARRAY['Locação', NULL]
     WHERE tenant_id = lotus AND user_id = corretor;
    RAISE EXCEPTION 'FALHOU: elemento nulo foi aceito';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 3b: elemento nulo é recusado';
  END;
  UPDATE tenant_memberships SET especialidades = NULL
   WHERE tenant_id = lotus AND user_id = colega;
  RAISE NOTICE 'OK 3c: NULL é aceito';

  -- ----------------------------------------------------------
  -- 4. O SITE LÊ A ESPECIALIDADE, E SÓ ELA
  -- ----------------------------------------------------------
  SET LOCAL ROLE anon;
  SELECT especialidades INTO lido FROM tenant_memberships
   WHERE tenant_id = lotus AND user_id = corretor;
  RESET ROLE;
  IF lido IS DISTINCT FROM ARRAY['Lançamentos','Alto padrão','Apartamento','Casa em condomínio','Investidor'] THEN
    RAISE EXCEPTION 'FALHOU: o site devia ler as 5 especialidades, leu %', lido;
  END IF;
  RAISE NOTICE 'OK 4a: o site lê as especialidades';

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM permissions FROM tenant_memberships WHERE tenant_id = lotus;
    RESET ROLE;
    RAISE EXCEPTION 'FALHOU: o site leu permissions';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'OK 4b: permissions continua fechado para o site';
  END;

  -- ----------------------------------------------------------
  -- 5. QUEM GRAVA É O ADMIN DA CASA
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', chefe, 'role', 'authenticated', 'email', 'chefe@esp.dev')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE tenant_memberships SET especialidades = ARRAY['Locação']
   WHERE tenant_id = lotus AND user_id = colega;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: o admin devia gravar a especialidade do colega (1 linha), gravou %', n;
  END IF;
  RAISE NOTICE 'OK 5a: o admin grava';

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', corretor, 'role', 'authenticated', 'email', 'corretor@esp.dev')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE tenant_memberships SET especialidades = ARRAY['Nada a ver']
   WHERE tenant_id = lotus AND user_id = colega;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: o corretor alterou a especialidade do colega (% linha)', n;
  END IF;
  RAISE NOTICE 'OK 5b: o corretor não mexe no colega';

  RAISE NOTICE 'especialidades_do_corretor: TODOS OS CASOS PASSARAM';
END $$;

ROLLBACK;
