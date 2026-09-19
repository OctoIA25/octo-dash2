-- O ponteiro da roleta, contra o Postgres de verdade.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/distribuicao_ponteiro.test.sql
--
-- POR QUE ESTE TESTE EXISTE E POR QUE ELE É SQL. A leitura do ponteiro filtra
-- as linhas que não têm posição gravada. A primeira versão usava
-- `detalhes->posicao IS NULL`, e o jsonb `null` NÃO é SQL NULL: as linhas de
-- captador, de lançamento e de "ninguém" passavam pelo filtro, a leitura caía
-- em -1 e a roleta VOLTAVA PARA O PRIMEIRO da fila a cada lead de captador —
-- o caso mais comum da Lotus, onde 22 dos 29 imóveis têm captador.
--
-- O teste do servidor NÃO pega isso: o falso de banco trata `not` como um
-- no-op. Só o Postgres conhece a diferença entre as duas setas.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

-- ----------------------------------------------------------------------------
-- A semântica, nua
-- ----------------------------------------------------------------------------
SELECT pg_temp.checa(
  (('{"posicao": null}'::jsonb -> 'posicao') IS NULL) IS FALSE,
  'a seta SIMPLES nao enxerga jsonb null — e por isso que o filtro antigo vazava');

SELECT pg_temp.checa(
  (('{"posicao": null}'::jsonb ->> 'posicao') IS NULL) IS TRUE,
  'a seta DUPLA enxerga jsonb null');

SELECT pg_temp.checa(
  ('{"posicao": 0}'::jsonb ->> 'posicao') = '0',
  'a seta dupla devolve "0" — a posicao zero NAO pode ser confundida com ausente');

-- ----------------------------------------------------------------------------
-- O caso real: captador grava posicao null, e a leitura tem que IGNORAR
-- ----------------------------------------------------------------------------
INSERT INTO public.tenants (id, code, name)
VALUES ('90417e00-0000-4000-a000-00000000000a', 'teste-ponteiro', 'Teste Ponteiro');

INSERT INTO public.distribuicao_eventos (tenant_id, evento, motivo, corretor_id, detalhes, created_at) VALUES
  -- Mais antigo: a roleta parou na posicao 2.
  ('90417e00-0000-4000-a000-00000000000a', 'consultado', 'roleta_em_ordem',
   '90417e00-0000-4000-a000-0000000000c2', '{"posicao": 2}'::jsonb, now() - interval '10 min'),
  -- Mais recente: lead de captador, sem posicao. NAO pode virar o ponteiro.
  ('90417e00-0000-4000-a000-00000000000a', 'consultado', 'captador_do_imovel',
   '90417e00-0000-4000-a000-0000000000c9', '{"posicao": null}'::jsonb, now() - interval '1 min');

-- A leitura NOVA (seta dupla): acha a linha da roleta, ignorando a do captador.
SELECT pg_temp.checa(
  (SELECT (detalhes ->> 'posicao')::int
     FROM public.distribuicao_eventos
    WHERE tenant_id = '90417e00-0000-4000-a000-00000000000a'
      AND evento = 'consultado'
      AND detalhes ->> 'posicao' IS NOT NULL
    ORDER BY created_at DESC LIMIT 1) = 2,
  'a leitura NOVA devolve 2 — a roleta continua de onde parou');

-- A leitura ANTIGA (seta simples): pega a linha do captador e perde o ponteiro.
SELECT pg_temp.checa(
  (SELECT detalhes -> 'posicao'
     FROM public.distribuicao_eventos
    WHERE tenant_id = '90417e00-0000-4000-a000-00000000000a'
      AND evento = 'consultado'
      AND detalhes -> 'posicao' IS NOT NULL
    ORDER BY created_at DESC LIMIT 1) = 'null'::jsonb,
  'a leitura ANTIGA pegava a linha do captador — e a roleta reiniciava no primeiro');

-- E o id de quem recebeu vem junto, que e a ancora de verdade.
SELECT pg_temp.checa(
  (SELECT corretor_id FROM public.distribuicao_eventos
    WHERE tenant_id = '90417e00-0000-4000-a000-00000000000a'
      AND evento = 'consultado'
      AND detalhes ->> 'posicao' IS NOT NULL
    ORDER BY created_at DESC LIMIT 1) = '90417e00-0000-4000-a000-0000000000c2',
  'a leitura traz QUEM recebeu, nao so o indice');

ROLLBACK;

\echo 'OK: distribuicao_ponteiro — 6 casos passaram.'
