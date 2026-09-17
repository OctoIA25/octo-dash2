-- Testes de 20260917_revoga_escrita_anonima_imoveis.sql: o visitante anônimo lê
-- o portal e não escreve nada.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/escrita_anonima_imoveis.test.sql
-- Falha = exceção "FALHOU: <caso>". Sucesso = a linha final.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
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
  RAISE EXCEPTION 'FALHOU: % (esperado erro %, a operacao passou)', p_caso, p_sqlstate;
END $$;

-- 1. Grants: anon não escreve em nenhuma das duas.
SELECT pg_temp.checa(
  NOT has_table_privilege('anon', 'public.' || t, 'INSERT')
  AND NOT has_table_privilege('anon', 'public.' || t, 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.' || t, 'DELETE')
  AND NOT has_table_privilege('anon', 'public.' || t, 'TRUNCATE'),
  'anon nao escreve em ' || t)
FROM unnest(ARRAY['imoveis_locais', 'condominios']) AS t;

-- 2. O portal continua com leitura por coluna (o que o site público usa).
SELECT pg_temp.checa(
  has_column_privilege('anon', 'public.imoveis_locais', 'titulo', 'SELECT')
  AND has_column_privilege('anon', 'public.condominios', 'nome', 'SELECT'),
  'anon mantem SELECT das colunas publicas');

-- 3. E o proprietário segue fora do alcance do anônimo (proteção de 15/09).
SELECT pg_temp.checa(
  NOT has_column_privilege('anon', 'public.imoveis_locais', 'proprietario_nome', 'SELECT'),
  'anon nao le proprietario');

-- 4. Comportamento: como visitante, ler funciona e gravar dá 42501.
SET LOCAL role = 'anon';

-- count(*) puro exigiria privilégio de tabela; o anon tem por COLUNA, então a
-- consulta nomeia uma coluna pública, como o portal faz.
SELECT pg_temp.checa(
  (SELECT count(*) FROM (SELECT titulo FROM public.imoveis_locais LIMIT 1) x) >= 0,
  'anon consegue consultar o portal');

SELECT pg_temp.falha(
  $q$INSERT INTO public.condominios (nome) VALUES ('invasao')$q$,
  '42501', 'anon nao insere condominio');

RESET ROLE;

SELECT 'OK: escrita anonima fechada - 5 casos passaram' AS resultado;

ROLLBACK;
