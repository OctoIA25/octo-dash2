-- Trava de regressão do desenho de 20260915_imovel_captador_edita_proprietario_protegido.sql.
--
-- Aquele desenho é frágil de um jeito silencioso: `imoveis_locais` NÃO tem
-- SELECT de tabela para `authenticated` — tem GRANT coluna a coluna. Então:
--   - coluna nova na tabela sem GRANT, mas presente em COLUNAS_IMOVEL_LOCAL
--     (imoveisLocaisService.ts), derruba a query INTEIRA com 42501. Não é a
--     coluna que some: é o Catálogo, os Prontos e os Rascunhos que param.
--   - GRANT dado por engano numa coluna proprietario_* devolve nome, telefone e
--     e-mail do proprietário a todo membro do tenant, desfazendo a proteção.
-- Nada no build pega nenhum dos dois. Este teste pega.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/imoveis_grants_por_coluna.test.sql
-- Falha = exceção "FALHOU: ...". Sucesso = a linha final.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

-- 1. O SELECT de tabela continua REVOGADO. Se voltar, o grant por coluna vira
--    decoração e o proprietário volta a ser legível por todo mundo.
SELECT pg_temp.checa(
  NOT has_table_privilege('authenticated', 'public.imoveis_locais', 'SELECT'),
  'imoveis_locais NAO tem SELECT de tabela para authenticated');

-- 2. Toda coluna que não é do proprietário é legível.
SELECT pg_temp.checa(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'imoveis_locais'
       AND c.column_name NOT LIKE 'proprietario%'
       AND NOT has_column_privilege('authenticated', 'public.imoveis_locais', c.column_name, 'SELECT')),
  'toda coluna nao-proprietario tem GRANT SELECT (coluna nova sem grant derruba o Catalogo)');

-- 3. E nenhuma coluna do proprietário é.
SELECT pg_temp.checa(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'imoveis_locais'
       AND c.column_name LIKE 'proprietario%'
       AND has_column_privilege('authenticated', 'public.imoveis_locais', c.column_name, 'SELECT')),
  'nenhuma coluna proprietario_* e legivel por authenticated');

-- 4. O caminho oficial para ler proprietário continua existindo.
SELECT pg_temp.checa(
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'imoveis_proprietarios'),
  'a RPC imoveis_proprietarios existe no banco');

SELECT 'OK: grants por coluna de imoveis_locais integros - 4 casos' AS resultado;

ROLLBACK;
