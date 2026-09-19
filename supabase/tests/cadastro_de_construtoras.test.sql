-- Testes de 20260918_cadastro_de_construtoras.sql.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cadastro_de_construtoras.test.sql
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

INSERT INTO auth.users (id, email) VALUES
  ('c0157000-0000-4000-a000-000000000001', 'admin@teste-construtora.dev'),
  ('c0157000-0000-4000-a000-000000000002', 'corretor@teste-construtora.dev'),
  ('c0157000-0000-4000-a000-000000000003', 'admin-b@teste-construtora.dev');

INSERT INTO public.tenants (id, code, name) VALUES
  ('c0157000-0000-4000-a000-00000000000a', 'teste-construtora-a', 'Teste Construtora A'),
  ('c0157000-0000-4000-a000-00000000000b', 'teste-construtora-b', 'Teste Construtora B');

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, permissions) VALUES
  ('c0157000-0000-4000-a000-00000000000a', 'c0157000-0000-4000-a000-000000000001', 'admin', '{}'),
  ('c0157000-0000-4000-a000-00000000000a', 'c0157000-0000-4000-a000-000000000002', 'corretor', '{}'),
  ('c0157000-0000-4000-a000-00000000000b', 'c0157000-0000-4000-a000-000000000003', 'admin', '{}');

INSERT INTO public.construtoras (tenant_id, codigo, nome, comissao_padrao_pct) VALUES
  ('c0157000-0000-4000-a000-00000000000a', 'santa_angela', 'Santa Ângela', 6.00),
  ('c0157000-0000-4000-a000-00000000000b', 'tebas', 'Tebas', 4.50);

-- ----------------------------------------------------------------------------
-- "Não existe mais construtora duplicada por grafia" — primeiro critério de
-- pronto do item. A trava é do banco, não da tela.
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.construtoras (tenant_id, codigo, nome)
    VALUES ('c0157000-0000-4000-a000-00000000000a', 'santa_angela_2', 'SANTA ANGELA')$q$),
  'mesmo nome com outra caixa e sem acento e recusado');

SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.construtoras (tenant_id, codigo, nome)
    VALUES ('c0157000-0000-4000-a000-00000000000a', 'santa_angela_3', 'Santa  Angela')$q$),
  'mesmo nome com espaco duplicado e recusado');

SELECT pg_temp.checa(
  NOT pg_temp.rejeitado($q$INSERT INTO public.construtoras (tenant_id, codigo, nome)
    VALUES ('c0157000-0000-4000-a000-00000000000b', 'santa_angela', 'Santa Ângela')$q$),
  'o mesmo nome em OUTRA imobiliaria e aceito');

SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.construtoras (tenant_id, codigo, nome)
    VALUES ('c0157000-0000-4000-a000-00000000000a', 'Codigo Invalido', 'Outra')$q$),
  'codigo com espaco e maiuscula e recusado');

SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.construtoras (tenant_id, codigo, nome, comissao_padrao_pct)
    VALUES ('c0157000-0000-4000-a000-00000000000a', 'fora_da_faixa', 'Fora', 150)$q$),
  'comissao acima de 100% e recusada');

-- ----------------------------------------------------------------------------
-- CNPJ: só dígitos, um principal por construtora, sem repetir na imobiliária.
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.construtora_cnpjs (tenant_id, construtora_id, cnpj)
    SELECT tenant_id, id, '12.345.678/0001-90' FROM public.construtoras WHERE codigo='santa_angela'
       AND tenant_id='c0157000-0000-4000-a000-00000000000a'$q$),
  'CNPJ com mascara e recusado (so digitos)');

INSERT INTO public.construtora_cnpjs (tenant_id, construtora_id, cnpj, principal)
SELECT tenant_id, id, '12345678000190', true FROM public.construtoras
 WHERE codigo='santa_angela' AND tenant_id='c0157000-0000-4000-a000-00000000000a';

SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.construtora_cnpjs (tenant_id, construtora_id, cnpj, principal)
    SELECT tenant_id, id, '99999999000199', true FROM public.construtoras WHERE codigo='santa_angela'
       AND tenant_id='c0157000-0000-4000-a000-00000000000a'$q$),
  'dois CNPJ principais na mesma construtora e recusado');

-- ----------------------------------------------------------------------------
-- A COMISSÃO. Terceiro critério: ela não chega a quem não pode ver.
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  has_column_privilege('authenticated','public.construtoras','nome','SELECT') IS TRUE,
  'quem loga LE o nome da construtora');

SELECT pg_temp.checa(
  has_column_privilege('authenticated','public.construtoras','comissao_padrao_pct','SELECT') IS FALSE,
  'quem loga NAO le a comissao');

SELECT pg_temp.checa(
  has_table_privilege('authenticated','public.construtoras','SELECT') IS FALSE,
  'nao ha SELECT de tabela: um select(*) falha alto em vez de trazer a comissao');

SELECT pg_temp.checa(
  has_table_privilege('anon','public.construtoras','SELECT') IS FALSE,
  'a chave publica do site NAO le construtora');

SELECT pg_temp.checa(
  has_table_privilege('anon','public.construtoras','INSERT') IS FALSE,
  'a chave publica do site NAO escreve construtora');

SELECT pg_temp.checa(
  has_table_privilege('anon','public.construtora_cnpjs','SELECT') IS FALSE,
  'a chave publica do site NAO le CNPJ');

-- ----------------------------------------------------------------------------
-- Isolamento entre imobiliárias e por papel.
-- ----------------------------------------------------------------------------
SELECT pg_temp.como('c0157000-0000-4000-a000-000000000001', 'admin@teste-construtora.dev');

SELECT pg_temp.checa(
  (SELECT count(*) FROM public.construtoras) = 1,
  'admin de A enxerga so as construtoras de A');

SELECT pg_temp.checa(
  (SELECT count(*) FROM public.construtoras_comissao('c0157000-0000-4000-a000-00000000000a')) = 1,
  'admin LE a comissao pela RPC');

SELECT pg_temp.checa(
  (SELECT count(*) FROM public.construtoras_comissao('c0157000-0000-4000-a000-00000000000b')) = 0,
  'admin de A NAO le a comissao da imobiliaria B pela RPC');

RESET ROLE;
SELECT pg_temp.como('c0157000-0000-4000-a000-000000000002', 'corretor@teste-construtora.dev');

SELECT pg_temp.checa(
  (SELECT count(*) FROM public.construtoras) = 1,
  'corretor LE o cadastro (precisa escolher no formulario)');

SELECT pg_temp.checa(
  (SELECT count(*) FROM public.construtoras_comissao('c0157000-0000-4000-a000-00000000000a')) = 0,
  'corretor NAO le a comissao nem pela RPC');

SELECT pg_temp.checa(
  pg_temp.rejeitado($q$INSERT INTO public.construtoras (tenant_id, codigo, nome)
    VALUES ('c0157000-0000-4000-a000-00000000000a', 'do_corretor', 'Inventada')$q$),
  'corretor NAO cadastra construtora');

RESET ROLE;

-- ----------------------------------------------------------------------------
-- O vínculo nas duas tabelas de hoje.
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name='lancamentos' AND column_name='construtora_id'),
  'lancamentos tem o vinculo');

SELECT pg_temp.checa(
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name='condominios' AND column_name='construtora_id'),
  'condominios tem o vinculo');

SELECT pg_temp.checa(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_name='lancamentos' AND column_name='construtora_id') = 'YES',
  'o vinculo e opcional: 82 linhas ficariam orfas se fosse obrigatorio hoje');

SELECT pg_temp.checa(
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_name='lancamentos' AND column_name='construtora'),
  'a coluna de texto continua la: o Portal publico le ela, dropar quebra o site');

ROLLBACK;

\echo 'OK: cadastro_de_construtoras — 21 casos passaram.'
