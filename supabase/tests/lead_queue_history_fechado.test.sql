-- Testes de 20260917_rls_lead_queue_history.sql: o histórico de fila do bolsão
-- só é legível por membro do próprio tenant, e ninguém logado escreve nele.
--
-- Roda numa transação e DESFAZ tudo (ROLLBACK no fim), então pode rodar contra o
-- banco real depois da migration:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/lead_queue_history_fechado.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = NOTICE final.
--
-- Os usuários "entram" como no PostgREST: role + request.jwt.claims.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ----------------------------------------------------------------------------
-- Helpers (mesmo padrão de imoveis_permissoes_proprietario.test.sql)
-- ----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.como(p_uid uuid, p_email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE FUNCTION pg_temp.como_servidor() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'service_role', true);
END $$;

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: %', p_caso;
  END IF;
END $$;

CREATE FUNCTION pg_temp.falha(p_sql text, p_sqlstate text, p_caso text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = p_sqlstate THEN RETURN; END IF;
    RAISE EXCEPTION 'FALHOU: % (esperado %, veio %: %)', p_caso, p_sqlstate, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FALHOU: % (esperado erro %, a operação passou)', p_caso, p_sqlstate;
END $$;

-- ----------------------------------------------------------------------------
-- Fixtures: dois tenants, um membro em cada, uma linha de histórico em cada.
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('19f10000-0000-4000-a000-000000000001', 'gestor-a@teste-fila.dev'),
  ('19f10000-0000-4000-a000-000000000002', 'gestor-b@teste-fila.dev');

INSERT INTO public.tenants (id, code, name) VALUES
  ('19f10000-0000-4000-a000-00000000000a', 'teste-fila-a', 'Teste Fila A'),
  ('19f10000-0000-4000-a000-00000000000b', 'teste-fila-b', 'Teste Fila B');

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, permissions) VALUES
  ('19f10000-0000-4000-a000-00000000000a', '19f10000-0000-4000-a000-000000000001', 'admin', '{}'),
  ('19f10000-0000-4000-a000-00000000000b', '19f10000-0000-4000-a000-000000000002', 'admin', '{}');

INSERT INTO public.lead_queue_history (id, tenant_id, redistributed_to_name, reason, success) VALUES
  ('19f10000-0000-4000-a000-0000000000f1', '19f10000-0000-4000-a000-00000000000a', 'Fulano A', 'expired_no_response_team_queue', true),
  ('19f10000-0000-4000-a000-0000000000f2', '19f10000-0000-4000-a000-00000000000b', 'Fulano B', 'expired_no_response_team_queue', true);

-- ----------------------------------------------------------------------------
-- 1. Grants: anon não tem nada; authenticated só lê.
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  NOT has_table_privilege('anon', 'public.lead_queue_history', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.lead_queue_history', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.lead_queue_history', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.lead_queue_history', 'DELETE'),
  'anon nao pode nada na tabela');

SELECT pg_temp.checa(
  has_table_privilege('authenticated', 'public.lead_queue_history', 'SELECT'),
  'authenticated mantem SELECT (BolsaoTeamsPanel le a tabela)');

SELECT pg_temp.checa(
  NOT has_table_privilege('authenticated', 'public.lead_queue_history', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.lead_queue_history', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.lead_queue_history', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.lead_queue_history', 'TRUNCATE'),
  'authenticated nao escreve');

-- ----------------------------------------------------------------------------
-- 2. Não sobrou policy permissiva aberta (o buraco original).
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'lead_queue_history'
       AND cmd = 'ALL' AND permissive = 'PERMISSIVE' AND btrim(coalesce(qual, '')) = 'true'),
  'nenhuma policy FOR ALL com USING (true)');

-- ----------------------------------------------------------------------------
-- 3. Comportamento: cada gestor lê só o próprio tenant.
-- ----------------------------------------------------------------------------
SELECT pg_temp.como('19f10000-0000-4000-a000-000000000001', 'gestor-a@teste-fila.dev');

SELECT pg_temp.checa(
  (SELECT count(*) FROM public.lead_queue_history
    WHERE id = '19f10000-0000-4000-a000-0000000000f1') = 1,
  'gestor do tenant A le a linha do tenant A');

SELECT pg_temp.checa(
  (SELECT count(*) FROM public.lead_queue_history
    WHERE id = '19f10000-0000-4000-a000-0000000000f2') = 0,
  'gestor do tenant A NAO le a linha do tenant B');

-- ----------------------------------------------------------------------------
-- 4. Comportamento: gestor logado não grava nem apaga (42501 = falta de grant).
-- ----------------------------------------------------------------------------
SELECT pg_temp.falha(
  $q$INSERT INTO public.lead_queue_history (tenant_id, reason, success)
     VALUES ('19f10000-0000-4000-a000-00000000000a', 'expired_no_response_team_queue', true)$q$,
  '42501', 'gestor logado nao insere no historico');

SELECT pg_temp.falha(
  $q$DELETE FROM public.lead_queue_history
      WHERE id = '19f10000-0000-4000-a000-0000000000f1'$q$,
  '42501', 'gestor logado nao apaga o historico');

-- ----------------------------------------------------------------------------
-- 5. O servidor (service_role) continua gravando — é quem alimenta a tabela.
-- ----------------------------------------------------------------------------
SELECT pg_temp.como_servidor();

INSERT INTO public.lead_queue_history (id, tenant_id, redistributed_to_name, reason, success)
VALUES ('19f10000-0000-4000-a000-0000000000f3', '19f10000-0000-4000-a000-00000000000a',
        'Fulano C', 'expired_no_response_team_queue', true);

SELECT pg_temp.checa(
  (SELECT count(*) FROM public.lead_queue_history
    WHERE id = '19f10000-0000-4000-a000-0000000000f3') = 1,
  'service_role continua gravando');

RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK: lead_queue_history fechado — 8 casos passaram'; END $$;

ROLLBACK;
