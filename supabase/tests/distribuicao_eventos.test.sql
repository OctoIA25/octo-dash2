-- Testes de 20260919_distribuicao_eventos.sql.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/distribuicao_eventos.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = a linha final.
--
-- O extrato existe porque a decisão é de um lado (o Octo responde) e a
-- gravação é do outro (a Lia atribui). Sem ele não há como auditar nenhuma
-- das duas pontas.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

CREATE FUNCTION pg_temp.como(p_uid uuid, p_email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE FUNCTION pg_temp.rejeitado(p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql; RETURN false;
EXCEPTION
  WHEN check_violation OR not_null_violation OR insufficient_privilege
    OR foreign_key_violation THEN RETURN true;
END $$;

INSERT INTO auth.users (id, email) VALUES
  ('d1517000-0000-4000-a000-000000000001', 'corretor@teste-distrib.dev'),
  ('d1517000-0000-4000-a000-000000000002', 'outro@teste-distrib.dev');

INSERT INTO public.tenants (id, code, name) VALUES
  ('d1517000-0000-4000-a000-00000000000a', 'teste-distrib-a', 'Teste Distribuicao A'),
  ('d1517000-0000-4000-a000-00000000000b', 'teste-distrib-b', 'Teste Distribuicao B');

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, permissions) VALUES
  ('d1517000-0000-4000-a000-00000000000a', 'd1517000-0000-4000-a000-000000000001', 'corretor', '{}'),
  ('d1517000-0000-4000-a000-00000000000b', 'd1517000-0000-4000-a000-000000000002', 'corretor', '{}');

INSERT INTO public.distribuicao_eventos (tenant_id, evento, motivo, tipo, origem) VALUES
  ('d1517000-0000-4000-a000-00000000000a', 'consultado', 'roleta_em_ordem', 'indefinido', 'lia'),
  ('d1517000-0000-4000-a000-00000000000b', 'consultado', 'captador_do_imovel', 'terceiros', 'lia');

-- ----------------------------------------------------------------------------
-- O extrato só aceita acontecimento que existe, e sempre com motivo.
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.distribuicao_eventos (tenant_id, evento, motivo)
    VALUES ('d1517000-0000-4000-a000-00000000000a', 'inventado', 'x')$q$),
  'evento fora da lista e recusado');

SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.distribuicao_eventos (tenant_id, evento)
    VALUES ('d1517000-0000-4000-a000-00000000000a', 'enviado')$q$),
  'evento SEM motivo e recusado — o extrato responde "por que"');

SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.distribuicao_eventos (tenant_id, evento, motivo, origem)
    VALUES ('d1517000-0000-4000-a000-00000000000a', 'enviado', 'x', 'sei_la')$q$),
  'origem fora da lista e recusada');

SELECT pg_temp.checa(
  NOT pg_temp.rejeitado($q$INSERT INTO public.distribuicao_eventos (tenant_id, evento, motivo)
    VALUES ('d1517000-0000-4000-a000-00000000000a', 'expirou', 'passou_do_prazo')$q$),
  'os eventos previstos passam');

-- O lead pode ainda nao existir: a Lia pergunta ANTES de gravar.
SELECT pg_temp.checa(
  NOT pg_temp.rejeitado($q$INSERT INTO public.distribuicao_eventos (tenant_id, evento, motivo, lead_id, lead_ref)
    VALUES ('d1517000-0000-4000-a000-00000000000a', 'consultado', 'roleta_em_ordem', NULL, 'AP0961')$q$),
  'consulta sem lead ainda criado e aceita');

-- ----------------------------------------------------------------------------
-- Quem enxerga o quê
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  has_table_privilege('anon','public.distribuicao_eventos','SELECT') IS FALSE,
  'a chave publica do site NAO le o extrato');

SELECT pg_temp.checa(
  has_table_privilege('anon','public.distribuicao_eventos','INSERT') IS FALSE,
  'a chave publica do site NAO escreve no extrato');

SELECT pg_temp.checa(
  has_table_privilege('authenticated','public.distribuicao_eventos','SELECT') IS TRUE,
  'quem loga LE o extrato');

SELECT pg_temp.checa(
  has_table_privilege('authenticated','public.distribuicao_eventos','INSERT') IS FALSE,
  'quem loga NAO escreve: extrato que o usuario edita nao e extrato');

SELECT pg_temp.como('d1517000-0000-4000-a000-000000000001', 'corretor@teste-distrib.dev');

-- Tres linhas da imobiliaria A: a do INSERT inicial mais as duas dos casos
-- que PASSAM acima (eles inserem de verdade). A da imobiliaria B nao aparece.
SELECT pg_temp.checa(
  (SELECT count(*) FROM public.distribuicao_eventos) = 3,
  'o corretor enxerga so o extrato da propria imobiliaria');

SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.distribuicao_eventos WHERE motivo = 'captador_do_imovel'),
  'o corretor NAO enxerga o extrato de outra imobiliaria');

SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.distribuicao_eventos (tenant_id, evento, motivo)
    VALUES ('d1517000-0000-4000-a000-00000000000a', 'manual', 'inventei')$q$),
  'nem na propria imobiliaria o corretor escreve no extrato');

RESET ROLE;

ROLLBACK;

\echo 'OK: distribuicao_eventos — 12 casos passaram.'
