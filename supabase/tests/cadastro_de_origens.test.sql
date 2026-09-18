-- Testes de 20260918_cadastro_de_origens.sql.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cadastro_de_origens.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = a linha final.

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
  WHEN check_violation OR unique_violation OR foreign_key_violation
    OR insufficient_privilege OR not_null_violation THEN RETURN true;
END $$;

-- ----------------------------------------------------------------------------
-- Duas imobiliárias, um admin e um corretor na primeira, um admin na segunda.
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('05e70000-0000-4000-a000-000000000001', 'admin-a@teste-origem.dev'),
  ('05e70000-0000-4000-a000-000000000002', 'corretor-a@teste-origem.dev'),
  ('05e70000-0000-4000-a000-000000000003', 'admin-b@teste-origem.dev');

INSERT INTO public.tenants (id, code, name) VALUES
  ('05e70000-0000-4000-a000-00000000000a', 'teste-origem-a', 'Teste Origem A'),
  ('05e70000-0000-4000-a000-00000000000b', 'teste-origem-b', 'Teste Origem B');

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, permissions) VALUES
  ('05e70000-0000-4000-a000-00000000000a', '05e70000-0000-4000-a000-000000000001', 'admin', '{}'),
  ('05e70000-0000-4000-a000-00000000000a', '05e70000-0000-4000-a000-000000000002', 'corretor', '{}'),
  ('05e70000-0000-4000-a000-00000000000b', '05e70000-0000-4000-a000-000000000003', 'admin', '{}');

INSERT INTO public.tenant_lead_origins (tenant_id, codigo, nome, cor, ordem, midia_paga) VALUES
  ('05e70000-0000-4000-a000-00000000000a', 'meta_leadads', 'Meta Lead Ads', '#1877F2', 1, true),
  ('05e70000-0000-4000-a000-00000000000b', 'site', 'Site', '#0F6B54', 1, false);

INSERT INTO public.tenant_lead_origin_map (tenant_id, texto_bruto, origem_codigo) VALUES
  ('05e70000-0000-4000-a000-00000000000a', 'facebook', 'meta_leadads');

-- ----------------------------------------------------------------------------
-- O código é chave de integração: tem que ser estável.
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.tenant_lead_origins (tenant_id, codigo, nome)
    VALUES ('05e70000-0000-4000-a000-00000000000a', 'Meta Lead Ads', 'x')$q$),
  'codigo com espaco e maiuscula e rejeitado');

SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.tenant_lead_origins (tenant_id, codigo, nome)
    VALUES ('05e70000-0000-4000-a000-00000000000a', 'meta-leadads', 'x')$q$),
  'codigo com hifen e rejeitado');

SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.tenant_lead_origins (tenant_id, codigo, nome)
    VALUES ('05e70000-0000-4000-a000-00000000000a', 'meta_leadads', 'Duplicada')$q$),
  'o mesmo codigo duas vezes na mesma imobiliaria e rejeitado');

SELECT pg_temp.checa(
  NOT pg_temp.rejeitado($q$INSERT INTO public.tenant_lead_origins (tenant_id, codigo, nome)
    VALUES ('05e70000-0000-4000-a000-00000000000b', 'meta_leadads', 'Mesmo codigo, outra imobiliaria')$q$),
  'o mesmo codigo em OUTRA imobiliaria e aceito');

SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.tenant_lead_origin_map (tenant_id, texto_bruto, origem_codigo)
    VALUES ('05e70000-0000-4000-a000-00000000000a', 'zap', 'codigo_que_nao_existe')$q$),
  'conversao apontando para codigo inexistente e rejeitada');

SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.tenant_lead_origin_map (tenant_id, texto_bruto, origem_codigo)
    VALUES ('05e70000-0000-4000-a000-00000000000a', 'facebook', 'meta_leadads')$q$),
  'o mesmo texto bruto nao pode apontar para dois lugares');

-- ----------------------------------------------------------------------------
-- Conversão órfã não pode existir: ela apontaria para um código apagado e o
-- lead sumiria do relatório.
-- ----------------------------------------------------------------------------
DELETE FROM public.tenant_lead_origins
 WHERE tenant_id = '05e70000-0000-4000-a000-00000000000a' AND codigo = 'meta_leadads';

SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.tenant_lead_origin_map
               WHERE tenant_id = '05e70000-0000-4000-a000-00000000000a'),
  'apagar a origem leva a conversao junto (sem orfa)');

-- recria para os testes de RLS
INSERT INTO public.tenant_lead_origins (tenant_id, codigo, nome, cor, ordem, midia_paga) VALUES
  ('05e70000-0000-4000-a000-00000000000a', 'meta_leadads', 'Meta Lead Ads', '#1877F2', 1, true);

-- ----------------------------------------------------------------------------
-- Isolamento entre imobiliárias.
-- ----------------------------------------------------------------------------
SELECT pg_temp.como('05e70000-0000-4000-a000-000000000001', 'admin-a@teste-origem.dev');

SELECT pg_temp.checa(
  (SELECT count(*) FROM public.tenant_lead_origins) = 1,
  'admin de A enxerga so as origens de A');

SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.tenant_lead_origins WHERE codigo = 'site'),
  'admin de A NAO enxerga a origem cadastrada por B');

-- O admin PRECISA conseguir escrever. Faltava esta asserção: a tela mostrava
-- "Origem apagada" e a linha continuava lá, porque DELETE barrado por RLS
-- apaga zero linhas e NÃO levanta erro.
SELECT pg_temp.checa(
  NOT pg_temp.rejeitado($q$INSERT INTO public.tenant_lead_origins (tenant_id, codigo, nome)
    VALUES ('05e70000-0000-4000-a000-00000000000a', 'do_admin', 'Cadastrada pelo admin')$q$),
  'admin CADASTRA origem');

UPDATE public.tenant_lead_origins SET nome = 'Renomeada' WHERE codigo = 'do_admin';
SELECT pg_temp.checa(
  (SELECT nome FROM public.tenant_lead_origins WHERE codigo = 'do_admin') = 'Renomeada',
  'admin RENOMEIA origem');

DELETE FROM public.tenant_lead_origins WHERE codigo = 'do_admin';
SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.tenant_lead_origins WHERE codigo = 'do_admin'),
  'admin APAGA origem (DELETE barrado apagaria zero linhas em silencio)');

SELECT pg_temp.checa(
  NOT pg_temp.rejeitado($q$INSERT INTO public.tenant_lead_origin_map (tenant_id, texto_bruto, origem_codigo)
    VALUES ('05e70000-0000-4000-a000-00000000000a', 'facebook ads', 'meta_leadads')$q$),
  'admin SALVA conversao');

DELETE FROM public.tenant_lead_origin_map WHERE texto_bruto = 'facebook ads';
SELECT pg_temp.checa(
  NOT EXISTS (SELECT 1 FROM public.tenant_lead_origin_map WHERE texto_bruto = 'facebook ads'),
  'admin APAGA conversao');

-- Corretor LÊ (os gráficos dele precisam da cor e da ordem) mas não ESCREVE.
RESET ROLE;
SELECT pg_temp.como('05e70000-0000-4000-a000-000000000002', 'corretor-a@teste-origem.dev');

SELECT pg_temp.checa(
  (SELECT count(*) FROM public.tenant_lead_origins) = 1,
  'corretor le o cadastro da propria imobiliaria');

UPDATE public.tenant_lead_origins SET nome = 'Mexi' WHERE codigo = 'meta_leadads';

SELECT pg_temp.checa(
  (SELECT nome FROM public.tenant_lead_origins WHERE codigo = 'meta_leadads') = 'Meta Lead Ads',
  'corretor NAO altera o cadastro (a policy de escrita nao alcanca ele)');

SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.tenant_lead_origins (tenant_id, codigo, nome)
    VALUES ('05e70000-0000-4000-a000-00000000000a', 'inventada', 'Inventada pelo corretor')$q$),
  'corretor NAO cadastra origem nova');

RESET ROLE;

-- ----------------------------------------------------------------------------
-- Grants. O pg_default_acl do Supabase concede tudo a anon em relação nova:
-- sem o REVOKE da migration, a chave do browser nasceria podendo escrever.
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  has_table_privilege('anon', 'public.tenant_lead_origins', 'SELECT') IS FALSE,
  'anon NAO le o cadastro de origens');

SELECT pg_temp.checa(
  has_table_privilege('anon', 'public.tenant_lead_origins', 'INSERT') IS FALSE,
  'anon NAO escreve no cadastro de origens');

SELECT pg_temp.checa(
  has_table_privilege('anon', 'public.tenant_lead_origin_map', 'INSERT') IS FALSE,
  'anon NAO escreve na tabela de conversao');

SELECT pg_temp.checa(
  has_table_privilege('authenticated', 'public.tenant_lead_origins', 'SELECT') IS TRUE,
  'quem loga LE o cadastro (senao o grafico perde cor e ordem)');

ROLLBACK;

\echo 'OK: cadastro_de_origens — 22 casos passaram.'
