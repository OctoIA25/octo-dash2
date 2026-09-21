-- ============================================================
-- Materiais de estudo (P4.2).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/materiais_de_estudo.test.sql
--
-- OS DOIS CRITÉRIOS DE PRONTO DO PLANO, nos casos 1 e 6:
--   1. O corretor encontra o plano de carreira e as regras de comissão.
--   6. O gestor vê quem ainda NÃO leu um material obrigatório.
--
-- O caso 4 é o que dá sentido ao item: uma versão nova zera a leitura. Sem
-- isso, revisar uma regra passaria despercebido por todo mundo que já leu a
-- versão antiga uma vez.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '4ddd1111-0000-4000-a000-000000000001';
  t2 uuid := '4ddd1111-0000-4000-a000-000000000002';
  gestor uuid := '4ddd0000-0000-4000-a000-000000000001';
  ana uuid := '4ddd0000-0000-4000-a000-000000000002';
  bruno uuid := '4ddd0000-0000-4000-a000-000000000003';
  fora uuid := '4ddd0000-0000-4000-a000-000000000009';
  c_lider uuid;
  m_carreira uuid;
  m_regimento uuid;
  m_so_lider uuid;
  r jsonb;
  n numeric;
  v_aceite timestamptz;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (gestor, 'gestor@teste-mat.dev'), (ana, 'ana@teste-mat.dev'),
    (bruno, 'bruno@teste-mat.dev'), (fora, 'fora@teste-mat.dev')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (t, 'teste-mat', 'Teste Materiais'), (t2, 'teste-mat-2', 'Vizinha')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (t, gestor, 'admin'), (t, ana, 'corretor'), (t, bruno, 'corretor'),
    (t2, fora, 'admin')
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. O CORRETOR ENCONTRA O PLANO DE CARREIRA E AS REGRAS.
  --
  -- Primeiro critério de pronto. O plano de carreira é do tipo
  -- `niveis_de_comissao`: ele NÃO guarda corpo, porque os níveis e percentuais
  -- já vivem no motor de comissão. Copiá-los para cá seria a segunda fonte que
  -- o chefe proíbe.
  -- ----------------------------------------------------------
  r := material_salvar(t, 'Plano de carreira', 'plano_de_carreira', 'niveis_de_comissao',
        '', 'Os níveis e o percentual de cada um');
  m_carreira := (r->>'id')::uuid;

  r := material_salvar(t, 'Regras de Comissão Lotus', 'comissao', 'texto',
        'A comissão total é dividida em pontas...', 'Como a comissão é dividida');
  m_regimento := (r->>'id')::uuid;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  r := materiais_listar(t);
  IF jsonb_array_length(r->'materiais') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: a corretora deveria ver 2 materiais, vê %',
      jsonb_array_length(r->'materiais');
  END IF;
  IF (r->>'pode_gerir')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU: a corretora não pode gerir materiais';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'materiais') x
                  WHERE x->>'categoria' = 'plano_de_carreira') THEN
    RAISE EXCEPTION 'FALHOU: a corretora não encontrou o plano de carreira';
  END IF;

  -- E o plano de carreira não carrega corpo nenhum: a tela o desenha do motor.
  IF (SELECT x->>'conteudo' FROM jsonb_array_elements(r->'materiais') x
       WHERE x->>'tipo' = 'niveis_de_comissao') IS DISTINCT FROM '' THEN
    RAISE EXCEPTION 'FALHOU: o plano de carreira guardou corpo, duplicando o motor de comissão';
  END IF;

  -- ----------------------------------------------------------
  -- 2. RASCUNHO NÃO APARECE PARA QUEM NÃO GERE.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  PERFORM material_salvar(t, 'Ainda escrevendo', 'scripts', 'texto', 'rascunho...', '',
          NULL, NULL, false, 'todos', NULL, NULL, false);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  IF jsonb_array_length((materiais_listar(t))->'materiais') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: a corretora viu um rascunho';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  IF jsonb_array_length((materiais_listar(t, true))->'materiais') IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: o gestor não viu o próprio rascunho';
  END IF;

  -- ----------------------------------------------------------
  -- 3. MATERIAL DE CARGO SÓ ALCANÇA QUEM TEM O CARGO.
  -- ----------------------------------------------------------
  r := cargo_salvar(t, 'Líder de equipe', '', 20, 'team_leader', ARRAY['leads']);
  c_lider := (r->>'id')::uuid;
  PERFORM membro_definir_cargo(t, bruno, c_lider);

  PERFORM material_salvar(t, 'Manual do líder', 'treinamentos', 'texto',
          'Como conduzir a reunião semanal', '', NULL, NULL, false, 'cargo', c_lider);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements((materiais_listar(t))->'materiais') x
              WHERE x->>'titulo' = 'Manual do líder') THEN
    RAISE EXCEPTION 'FALHOU: a corretora viu material que é só do cargo de líder';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', bruno::text)::text, true);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements((materiais_listar(t))->'materiais') x
                  WHERE x->>'titulo' = 'Manual do líder') THEN
    RAISE EXCEPTION 'FALHOU: o líder não viu o material do próprio cargo';
  END IF;

  -- ----------------------------------------------------------
  -- 4. VERSÃO NOVA ZERA A LEITURA.
  --
  -- É o que dá sentido ao item. Sem isso, revisar uma regra passaria
  -- despercebido por todo mundo que já leu a versão antiga.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  PERFORM material_salvar(t, 'Regimento interno', 'regimento', 'texto',
          'Versão 1 do regimento', '', NULL, NULL, true, 'todos');
  SELECT id INTO m_regimento FROM materiais WHERE tenant_id = t AND titulo = 'Regimento interno';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  PERFORM material_registrar_leitura(m_regimento, true);

  r := materiais_pendentes(t);
  IF jsonb_array_length(r) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: a Ana aceitou e ainda aparece pendente — %', r;
  END IF;

  -- O gestor revisa o regimento.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  r := material_salvar(t, 'Regimento interno', 'regimento', 'texto',
        'Versão 2, com a regra nova', '', NULL, NULL, true, 'todos', NULL, NULL,
        true, m_regimento, true, 'Mudou a regra de férias');
  IF (r->>'versao')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: a nova versão deveria ser a 2, é %', r->>'versao';
  END IF;
  -- E a função diz quantas pessoas precisam ler de novo.
  IF (r->>'releitura')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: deveria avisar que 1 pessoa precisa reler, avisou %', r->>'releitura';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  r := materiais_pendentes(t);
  IF jsonb_array_length(r) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: a versão nova deveria voltar a pendente para a Ana — %', r;
  END IF;

  -- A versão 1 continua no histórico, com quem a leu.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  r := material_versoes(m_regimento);
  IF jsonb_array_length(r) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: o histórico deveria ter 2 versões, tem %', jsonb_array_length(r);
  END IF;
  IF (SELECT (x->>'leram')::int FROM jsonb_array_elements(r) x WHERE (x->>'versao')::int = 1)
     IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: o histórico perdeu quem leu a versão 1';
  END IF;

  -- ----------------------------------------------------------
  -- 5. LER NÃO É ACEITAR, E REABRIR NÃO REESCREVE A DATA.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bruno::text)::text, true);
  PERFORM material_registrar_leitura(m_regimento, false);
  IF (SELECT aceito_em FROM materiais_leitura
       WHERE material_id = m_regimento AND versao = 2 AND user_id = bruno) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: abrir o material marcou como aceito';
  END IF;
  -- Continua pendente, porque é obrigatório e ele não aceitou.
  IF jsonb_array_length(materiais_pendentes(t)) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: quem só abriu deveria seguir pendente';
  END IF;

  PERFORM material_registrar_leitura(m_regimento, true);
  IF (SELECT aceito_em FROM materiais_leitura
       WHERE material_id = m_regimento AND versao = 2 AND user_id = bruno) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: o aceite não foi registrado';
  END IF;

  -- Reabrir depois de aceitar não reescreve a data do aceite.
  SELECT aceito_em INTO v_aceite FROM materiais_leitura
   WHERE material_id = m_regimento AND versao = 2 AND user_id = bruno;
  PERFORM pg_sleep(0.05);
  PERFORM material_registrar_leitura(m_regimento, true);
  IF (SELECT aceito_em FROM materiais_leitura
       WHERE material_id = m_regimento AND versao = 2 AND user_id = bruno)
     IS DISTINCT FROM v_aceite THEN
    RAISE EXCEPTION 'FALHOU: reabrir o material reescreveu a data do aceite';
  END IF;

  -- ----------------------------------------------------------
  -- 6. O GESTOR VÊ QUEM AINDA NÃO LEU.
  --
  -- Segundo critério de pronto. O valor está em QUEM FALTA — a lista de quem
  -- leu não move ninguém a cobrar nada.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  r := material_relatorio(m_regimento);

  -- Alcança os três (todos), 1 leu-e-aceitou (Bruno), a Ana não leu a v2.
  IF (r->>'alcanca')::int IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: o material de "todos" deveria alcançar 3 pessoas, alcança %',
      r->>'alcanca';
  END IF;
  IF (r->>'aceitaram')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: deveria ter 1 aceite na versão 2, tem %', r->>'aceitaram';
  END IF;
  -- A Ana aparece na lista SEM data — é ela que o gestor precisa cobrar.
  IF (SELECT x->>'aceito_em' FROM jsonb_array_elements(r->'pessoas') x
       WHERE x->>'user_id' = ana::text) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a Ana não leu a versão 2 e aparece como aceita';
  END IF;
  -- E quem não é alcançado não entra no relatório (o material do líder).
  SELECT id INTO m_so_lider FROM materiais WHERE tenant_id = t AND titulo = 'Manual do líder';
  IF (material_relatorio(m_so_lider)->>'alcanca')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: o relatório do material de cargo deveria alcançar só 1 pessoa';
  END IF;

  -- ----------------------------------------------------------
  -- 7. NÃO SE GRAVA LEITURA DO QUE NÃO ALCANÇA A PESSOA.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  IF material_registrar_leitura(m_so_lider, true) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a corretora registrou leitura de material que não a alcança';
  END IF;

  -- ----------------------------------------------------------
  -- 8. MATERIAL SEM CORPO É RECUSADO.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  BEGIN
    PERFORM material_salvar(t, 'Vazio', 'outros', 'texto', '');
    RAISE EXCEPTION 'FALHOU: aceitou material de texto sem conteúdo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM material_salvar(t, 'Só do cargo', 'outros', 'texto', 'x', '',
            NULL, NULL, false, 'cargo', NULL);
    RAISE EXCEPTION 'FALHOU: aceitou material de cargo sem dizer qual cargo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ----------------------------------------------------------
  -- 9. ARQUIVAR NÃO APAGA O REGISTRO DE QUEM ACEITOU.
  --
  -- O aceite é registro. Apagar a linha o levaria junto.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM materiais_leitura WHERE material_id = m_regimento;
  PERFORM material_excluir(m_regimento);
  IF (SELECT count(*) FROM materiais_leitura WHERE material_id = m_regimento)
     IS DISTINCT FROM n THEN
    RAISE EXCEPTION 'FALHOU: arquivar o material apagou o registro de leitura';
  END IF;
  IF (SELECT ativo FROM materiais WHERE id = m_regimento) IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU: o material não foi arquivado';
  END IF;

  -- ----------------------------------------------------------
  -- 10. MATERIAL NÃO ATRAVESSA IMOBILIÁRIA.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', fora::text)::text, true);
  IF materiais_listar(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a admin da vizinha leu os materiais alheios';
  END IF;
  IF material_salvar(t, 'Da vizinha', 'outros', 'texto', 'x') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a admin da vizinha criou material na imobiliária alheia';
  END IF;
  IF material_relatorio(m_carreira) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a admin da vizinha abriu o relatório alheio';
  END IF;

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK: materiais de estudo — 10 casos';
END
$$;

-- ----------------------------------------------------------
-- 11. O ANÔNIMO NÃO ENCOSTA NOS MATERIAIS.
-- ----------------------------------------------------------
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
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM materiais $$,
  'o anônimo leu os materiais');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM materiais_leitura $$,
  'o anônimo leu quem leu o quê');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM materiais_versoes $$,
  'o anônimo leu o histórico de versões');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK: anônimo barrado'; END $$;

ROLLBACK;
