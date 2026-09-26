-- ============================================================
-- A limpeza das permissões mortas — 26/09
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/toda_permissao_do_catalogo_e_lida.test.sql
--
-- A migration roda dois UPDATE sobre `tenant_memberships`. No banco local, que
-- é sintético, os dois tocaram ZERO linha — e zero linha não prova nada. Este
-- arquivo monta o caso exato que existe em produção e confere.
--
-- O caso 2 é o que sustenta o arquivo: a limpeza não pode levar junto a
-- marcação que vale. Apagar demais é pior que apagar de menos — some uma
-- configuração que alguém fez de propósito, e sem erro nenhum.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  quem uuid;
  r jsonb;
BEGIN
  SELECT user_id INTO quem FROM tenant_memberships LIMIT 1;
  IF quem IS NULL THEN
    RAISE EXCEPTION 'FALHOU: banco sem nenhum membro — o teste não teria o que medir';
  END IF;

  -- A forma que produção tem: as duas listas misturando código vivo e morto.
  UPDATE tenant_memberships SET permissions = jsonb_build_object(
    'sidebar_permissions', jsonb_build_array('leads', 'octo-chat', 'imoveis', 'atividades'),
    'sub_permissions', jsonb_build_object(
      'leads-kpis',      false,   -- vale: alguém desmarcou de propósito
      'metricas-geral',  false,   -- morto
      'gestao-okrs',     true,    -- morto
      'gestao-metricas', false))  -- morto
   WHERE user_id = quem;

  -- ---- os dois UPDATE da migration, palavra por palavra ----
  UPDATE tenant_memberships SET permissions = jsonb_set(permissions, '{sub_permissions}',
    (permissions->'sub_permissions') - 'metricas-geral' - 'metricas-equipes' - 'metricas-corretores'
      - 'gestao-okrs' - 'gestao-pdi' - 'gestao-metricas')
   WHERE permissions->'sub_permissions' IS NOT NULL
     AND (permissions->'sub_permissions') ?| array['metricas-geral','metricas-equipes',
           'metricas-corretores','gestao-okrs','gestao-pdi','gestao-metricas'];

  UPDATE tenant_memberships SET permissions = jsonb_set(permissions, '{sidebar_permissions}',
    (SELECT coalesce(jsonb_agg(v), '[]'::jsonb)
       FROM jsonb_array_elements(permissions->'sidebar_permissions') v
      WHERE v#>>'{}' NOT IN ('octo-chat', 'atividades')))
   WHERE jsonb_typeof(permissions->'sidebar_permissions') = 'array'
     AND (permissions->'sidebar_permissions') ?| array['octo-chat','atividades'];

  SELECT permissions INTO r FROM tenant_memberships WHERE user_id = quem;

  -- 1. O código morto sai. Deixado ali, no dia em que alguém reaproveitar o
  --    nome a marcação velha decide por uma tela nova.
  IF (r->'sub_permissions') ?| array['metricas-geral','gestao-okrs','gestao-metricas'] THEN
    RAISE EXCEPTION 'FALHOU 1: codigo morto continua gravado -- %', r->'sub_permissions';
  END IF;
  RAISE NOTICE 'OK 1: os codigos sem tela sairam de sub_permissions';

  -- 2. E A MARCAÇÃO QUE VALE FICA. ESTE É O CASO QUE SUSTENTA O ARQUIVO.
  IF (r->'sub_permissions'->>'leads-kpis') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'FALHOU 2: a limpeza levou junto a marcacao que valia -- %', r->'sub_permissions';
  END IF;
  RAISE NOTICE 'OK 2: leads-kpis=false sobreviveu';

  -- 3. A outra lista é um ARRAY, não um objeto — o `-` de jsonb não serve, e
  --    é por isso que o segundo UPDATE reconstrói com jsonb_agg.
  IF (r->'sidebar_permissions') ?| array['octo-chat','atividades'] THEN
    RAISE EXCEPTION 'FALHOU 3: octo-chat/atividades continuam na lista -- %', r->'sidebar_permissions';
  END IF;
  IF NOT ((r->'sidebar_permissions') ?& array['leads','imoveis']) THEN
    RAISE EXCEPTION 'FALHOU 3b: a limpeza derrubou aba que valia -- %', r->'sidebar_permissions';
  END IF;
  RAISE NOTICE 'OK 3: sidebar_permissions perdeu so as duas mortas';
END $$;

-- ------------------------------------------------------------
-- 4. O catálogo não guarda mais nada que ninguém lê
--
-- É a pergunta do chefe virada em asserção: se uma permissão voltar a entrar
-- sem leitor, este teste é quem avisa.
-- ------------------------------------------------------------
DO $$
DECLARE inertes text;
BEGIN
  SELECT string_agg(codigo, ', ' ORDER BY codigo) INTO inertes
    FROM permissoes WHERE em_uso = false;
  IF inertes IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 4: permissao no catalogo sem ninguem que leia -- %', inertes;
  END IF;
  RAISE NOTICE 'OK 4: as % do catalogo sao lidas', (SELECT count(*) FROM permissoes);
END $$;

ROLLBACK;
