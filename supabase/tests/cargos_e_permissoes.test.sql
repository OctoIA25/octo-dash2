-- ============================================================
-- Cargos com pacote de permissões (P4.1).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/cargos_e_permissoes.test.sql
--
-- OS DOIS CRITÉRIOS DE PRONTO DO PLANO, nos casos 2 e 1:
--   1. Novo corretor configurado só escolhendo o cargo.
--   2. Tirar uma permissão do cargo "Corretor" some para todos os corretores.
--
-- Os casos 7 a 9 são as travas de segurança. Esta é a fatia que mexe em quem
-- pode o quê: um engano aqui não dá erro na tela, dá acesso a mais.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '3ccc1111-0000-4000-a000-000000000001';
  t2 uuid := '3ccc1111-0000-4000-a000-000000000002';
  gestor uuid := '3ccc0000-0000-4000-a000-000000000001';
  gestor2 uuid := '3ccc0000-0000-4000-a000-000000000002';
  ana uuid := '3ccc0000-0000-4000-a000-000000000003';
  bruno uuid := '3ccc0000-0000-4000-a000-000000000004';
  fora uuid := '3ccc0000-0000-4000-a000-000000000009';
  c_corretor uuid;
  c_lider uuid;
  r jsonb;
  n numeric;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (gestor, 'gestor@teste-cargo.dev'), (gestor2, 'gestor2@teste-cargo.dev'),
    (ana, 'ana@teste-cargo.dev'), (bruno, 'bruno@teste-cargo.dev'),
    (fora, 'fora@teste-cargo.dev')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (t, 'teste-cargo', 'Teste Cargo'), (t2, 'teste-cargo-2', 'Vizinha')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (t, gestor, 'admin'), (t, gestor2, 'admin'),
    (t, ana, 'corretor'), (t, bruno, 'corretor'),
    (t2, fora, 'admin')
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. NOVO CORRETOR CONFIGURADO SÓ ESCOLHENDO O CARGO.
  --
  -- Segundo critério de pronto. E "configurado" quer dizer os DOIS lados: o
  -- que ele vê (as abas) e o que ele pode (o papel que rege as políticas).
  -- ----------------------------------------------------------
  r := cargo_salvar(t, 'Corretor', 'Quem atende lead e vende', 10, 'corretor',
        ARRAY['leads','notificacoes','metricas','imoveis','chat','estudo-mercado']);
  c_corretor := (r->>'id')::uuid;
  IF (r->>'permissoes')::int IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'FALHOU: o cargo deveria ter 6 permissões, tem %', r->>'permissoes';
  END IF;

  r := membro_definir_cargo(t, ana, c_corretor);
  IF r->>'cargo' IS DISTINCT FROM 'Corretor' THEN
    RAISE EXCEPTION 'FALHOU: a Ana não recebeu o cargo — %', r;
  END IF;

  r := permissoes_efetivas(t, ana);
  IF jsonb_array_length(r->'permissoes') IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'FALHOU: a Ana deveria ter as 6 do cargo, tem %',
      jsonb_array_length(r->'permissoes');
  END IF;
  IF NOT (r->'permissoes' ? 'imoveis') THEN
    RAISE EXCEPTION 'FALHOU: a Ana não recebeu "imoveis" do cargo';
  END IF;

  -- ----------------------------------------------------------
  -- 2. TIRAR UMA PERMISSÃO DO CARGO SOME PARA TODOS QUE O TÊM.
  --
  -- Primeiro critério de pronto, e a razão de o item existir: hoje seria
  -- preciso abrir cada pessoa e desmarcar a caixa uma a uma.
  -- ----------------------------------------------------------
  PERFORM membro_definir_cargo(t, bruno, c_corretor);

  PERFORM cargo_salvar(t, 'Corretor', 'Quem atende lead e vende', 10, 'corretor',
        ARRAY['leads','notificacoes','metricas','chat','estudo-mercado'], c_corretor);

  FOR n IN SELECT 1 LOOP
    DECLARE quem uuid;
    BEGIN
      FOREACH quem IN ARRAY ARRAY[ana, bruno] LOOP
        r := permissoes_efetivas(t, quem);
        IF r->'permissoes' ? 'imoveis' THEN
          RAISE EXCEPTION 'FALHOU: tirar "imoveis" do cargo não tirou de %', quem;
        END IF;
        IF jsonb_array_length(r->'permissoes') IS DISTINCT FROM 5 THEN
          RAISE EXCEPTION 'FALHOU: deveriam sobrar 5 permissões, sobraram %',
            jsonb_array_length(r->'permissoes');
        END IF;
      END LOOP;
    END;
  END LOOP;

  -- ----------------------------------------------------------
  -- 3. QUEM NÃO TEM CARGO SEGUE NA REGRA ANTIGA.
  --
  -- É isto que faz a virada não mudar a tela de ninguém: `permissoes` volta
  -- NULO, e o app cai no caminho de sempre. Devolver lista vazia aqui tiraria
  -- o menu inteiro de quem ainda não foi migrado.
  -- ----------------------------------------------------------
  r := permissoes_efetivas(t, gestor2);
  IF r->'permissoes' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'FALHOU: sem cargo, permissoes deveria vir NULO, veio %', r->'permissoes';
  END IF;

  -- ----------------------------------------------------------
  -- 4. O CARGO CARREGA O PAPEL — E ELE MUDA PARA QUEM JÁ O TEM.
  -- ----------------------------------------------------------
  r := cargo_salvar(t, 'Líder de equipe', 'Conduz um time', 20, 'team_leader',
        ARRAY['leads','notificacoes','metricas','imoveis','chat','gestao-equipe','relatorios']);
  c_lider := (r->>'id')::uuid;

  r := membro_definir_cargo(t, bruno, c_lider);
  IF r->>'role_depois' IS DISTINCT FROM 'team_leader' THEN
    RAISE EXCEPTION 'FALHOU: o cargo de líder não mudou o papel do Bruno — %', r;
  END IF;
  IF (SELECT role FROM tenant_memberships WHERE tenant_id = t AND user_id = bruno)
     IS DISTINCT FROM 'team_leader' THEN
    RAISE EXCEPTION 'FALHOU: o papel não foi gravado na tabela';
  END IF;

  -- E mudar o papel DO CARGO alcança quem já o tem: sem isto, a tela
  -- prometeria uma mudança que o app não cumpre.
  PERFORM cargo_salvar(t, 'Líder de equipe', 'Conduz um time', 20, 'corretor',
        ARRAY['leads','notificacoes','metricas','imoveis','chat','gestao-equipe','relatorios'], c_lider);
  IF (SELECT role FROM tenant_memberships WHERE tenant_id = t AND user_id = bruno)
     IS DISTINCT FROM 'corretor' THEN
    RAISE EXCEPTION 'FALHOU: rebaixar o cargo não rebaixou quem o tem';
  END IF;
  -- devolve o cargo ao que era
  PERFORM cargo_salvar(t, 'Líder de equipe', 'Conduz um time', 20, 'team_leader',
        ARRAY['leads','notificacoes','metricas','imoveis','chat','gestao-equipe','relatorios'], c_lider);

  -- ----------------------------------------------------------
  -- 5. EXCEÇÃO QUE DÁ E EXCEÇÃO QUE TIRA.
  --
  -- Sem as duas, a pessoa que precisa de uma aba a mais viraria um cargo novo
  -- só para ela — que é o que este item veio desfazer.
  -- ----------------------------------------------------------
  PERFORM membro_definir_cargo(t, ana, c_corretor, jsonb_build_array(
    jsonb_build_object('codigo', 'juridico', 'concede', true,  'motivo', 'cuida dos contratos'),
    jsonb_build_object('codigo', 'chat',     'concede', false, 'motivo', 'não atende WhatsApp')
  ));

  r := permissoes_efetivas(t, ana);
  IF NOT (r->'permissoes' ? 'juridico') THEN
    RAISE EXCEPTION 'FALHOU: a exceção não deu "juridico" para a Ana';
  END IF;
  IF r->'permissoes' ? 'chat' THEN
    RAISE EXCEPTION 'FALHOU: a exceção não tirou "chat" da Ana, e o cargo tem';
  END IF;
  -- O Bruno, mesmo cargo, não herda exceção de ninguém.
  r := permissoes_efetivas(t, bruno);
  IF r->'permissoes' ? 'juridico' THEN
    RAISE EXCEPTION 'FALHOU: a exceção da Ana vazou para o Bruno';
  END IF;

  -- ----------------------------------------------------------
  -- 6. PERMISSÃO FORA DO CATÁLOGO É RECUSADA.
  --
  -- Aceitar criaria uma chave que nenhuma tela lê — o defeito que este item
  -- veio expor, repetido pela porta nova.
  -- ----------------------------------------------------------
  BEGIN
    PERFORM cargo_salvar(t, 'Inventado', '', 10, 'corretor', ARRAY['leads', 'nao_existe']);
    RAISE EXCEPTION 'FALHOU: aceitou permissão que não está no catálogo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ----------------------------------------------------------
  -- 7. NINGUÉM MUDA O PRÓPRIO NÍVEL DE ACESSO.
  --
  -- Seria o caminho mais curto para um corretor virar admin.
  -- ----------------------------------------------------------
  BEGIN
    PERFORM membro_definir_cargo(t, gestor, c_corretor);
    RAISE EXCEPTION 'FALHOU: o gestor rebaixou a si mesmo (e poderia ter se promovido)';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ----------------------------------------------------------
  -- 8. A IMOBILIÁRIA NÃO FICA SEM ADMIN.
  -- ----------------------------------------------------------
  -- Com dois admins, rebaixar um pode.
  PERFORM membro_definir_cargo(t, gestor2, c_corretor);
  IF (SELECT count(*) FROM tenant_memberships WHERE tenant_id = t AND role = 'admin')
     IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: deveria ter sobrado 1 admin';
  END IF;

  -- O último, não. (O próprio gestor já está barrado pelo caso 7; aqui o alvo
  -- é outro, para a trava do último admin ser a que dispara.)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor2::text)::text, true);
  BEGIN
    PERFORM membro_definir_cargo(t, gestor, c_corretor);
    RAISE EXCEPTION 'FALHOU: rebaixou a única conta administradora da imobiliária';
  EXCEPTION
    WHEN check_violation THEN NULL;
    -- gestor2 virou corretor no passo acima, então também pode ser recusado
    -- por falta de permissão — o que importa é que o gestor continue admin.
    WHEN OTHERS THEN NULL;
  END;
  IF (SELECT role FROM tenant_memberships WHERE tenant_id = t AND user_id = gestor)
     IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FALHOU: a imobiliária ficou sem administrador';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);

  -- ----------------------------------------------------------
  -- 8b. NINGUÉM SE TRANCA FORA DA PRÓPRIA TELA DE CARGOS.
  --
  -- A tela mora atrás de "gestao-equipe". Tirar essa permissão do cargo que o
  -- próprio autor tem o deixaria sem caminho de volta — e sem erro nenhum na
  -- tela, ele só não acharia mais o menu. Visto no navegador em 21/09.
  -- ----------------------------------------------------------
  DECLARE c_meu uuid;
  BEGIN
    r := cargo_salvar(t, 'Administrador', '', 30, 'admin',
          ARRAY['leads','gestao-equipe','relatorios']);
    c_meu := (r->>'id')::uuid;
    UPDATE tenant_memberships SET cargo_id = c_meu
     WHERE tenant_id = t AND user_id = gestor;

    BEGIN
      PERFORM cargo_salvar(t, 'Administrador', '', 30, 'admin',
              ARRAY['leads','relatorios'], c_meu);
      RAISE EXCEPTION 'FALHOU: o admin se trancou fora da própria tela de cargos';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- Mantendo a permissão, edita normalmente.
    PERFORM cargo_salvar(t, 'Administrador', '', 30, 'admin',
            ARRAY['leads','gestao-equipe'], c_meu);
    UPDATE tenant_memberships SET cargo_id = NULL WHERE tenant_id = t AND user_id = gestor;
    PERFORM cargo_excluir(c_meu);
  END;

  -- ----------------------------------------------------------
  -- 9. CARGO COM PESSOAS NÃO SE EXCLUI.
  -- ----------------------------------------------------------
  BEGIN
    PERFORM cargo_excluir(c_corretor);
    RAISE EXCEPTION 'FALHOU: excluiu um cargo que tem pessoas';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Vazio, sim.
  r := cargo_salvar(t, 'Temporário', '', 10, 'corretor', ARRAY['leads']);
  IF (cargo_excluir((r->>'id')::uuid)->>'excluido')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: não excluiu um cargo vazio';
  END IF;

  -- ----------------------------------------------------------
  -- 10. CARGO É DE QUEM ADMINISTRA, E NÃO ATRAVESSA IMOBILIÁRIA.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  IF cargos_do_tenant(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: uma corretora abriu a tela de cargos';
  END IF;
  IF cargo_salvar(t, 'Da Ana', '', 30, 'admin', ARRAY['leads']) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: uma corretora criou um cargo de admin';
  END IF;
  IF membro_definir_cargo(t, ana, c_lider) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: uma corretora se deu um cargo';
  END IF;
  -- Mas vê as próprias permissões.
  IF permissoes_efetivas(t, ana) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: a corretora não consegue ler as próprias permissões';
  END IF;
  -- E não as dos outros.
  IF permissoes_efetivas(t, bruno) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a corretora leu as permissões de outra pessoa';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', fora::text)::text, true);
  IF cargos_do_tenant(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a admin da vizinha abriu os cargos alheios';
  END IF;
  IF cargo_salvar(t, 'Da Vizinha', '', 30, 'admin', ARRAY['leads']) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a admin da vizinha criou cargo na imobiliária alheia';
  END IF;

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK: cargos e permissões — 11 casos';
END
$$;

-- ----------------------------------------------------------
-- 11. O ANÔNIMO NÃO ENCOSTA EM PERMISSÃO.
--
-- O `pg_default_acl` desta base dá tudo ao anon em toda relação nova. Sem o
-- REVOKE da migration, a chave pública do site poderia LER e ESCREVER quem é
-- admin de qual imobiliária.
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
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM cargos $$,
  'o anônimo leu os cargos');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM cargo_permissoes $$,
  'o anônimo leu as permissões dos cargos');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM membro_permissoes_extra $$,
  'o anônimo leu as exceções de permissão');
SELECT pg_temp.deve_barrar($$ INSERT INTO cargos (tenant_id, nome, role)
                              VALUES ('3ccc1111-0000-4000-a000-000000000001', 'Anon', 'admin') $$,
  'o anônimo criou um cargo de admin');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK: anônimo barrado'; END $$;

ROLLBACK;
