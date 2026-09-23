-- ============================================================
-- Matriz, filial e franquia (F.3).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/rede_de_unidades.test.sql
--
-- O CASO 1 É O MAIS IMPORTANTE DESTE ARQUIVO: sem rede cadastrada, nada muda
-- para ninguém. É a promessa que a migration faz, e é a que quebraria em
-- silêncio — uma unidade solta passando a enxergar outra seria vazamento
-- entre imobiliárias concorrentes, e a tela não acusaria nada.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  rede uuid;
  matriz uuid := '2ddd0000-0000-4000-a000-000000000001';
  filial uuid := '2ddd0000-0000-4000-a000-000000000002';
  solta uuid := '2ddd0000-0000-4000-a000-000000000003';
  apagada uuid := '2ddd0000-0000-4000-a000-000000000004';
  chefe uuid := '2ddd0001-0000-4000-a000-000000000001';
  corretor uuid := '2ddd0001-0000-4000-a000-000000000002';
  dasolta uuid := '2ddd0001-0000-4000-a000-000000000003';
  cargo uuid;
  n integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (chefe, 'chefe@rede.dev'), (corretor, 'corretor@rede.dev'), (dasolta, 'outro@solta.dev')
    ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (matriz, 'teste-matriz', 'Matriz'), (filial, 'teste-filial', 'Filial'),
    (solta, 'teste-solta', 'Solta'), (apagada, 'teste-apagada', 'Apagada')
    ON CONFLICT DO NOTHING;
  UPDATE tenants SET deleted_at = now() WHERE id = apagada;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (matriz, chefe, 'admin'), (matriz, corretor, 'corretor'),
    (solta, dasolta, 'admin'), (apagada, corretor, 'corretor')
    ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------
  -- 1. SEM REDE, NADA MUDA — E A APAGADA NÃO CONTA
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', corretor, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM minhas_unidades();
  IF n <> 1 THEN
    RAISE EXCEPTION 'FALHOU: sem rede, o corretor devia ver só a própria unidade (viu %)', n;
  END IF;
  -- Ele TEM vínculo com a apagada; ela não pode entrar.
  IF EXISTS (SELECT 1 FROM minhas_unidades() WHERE tenant_id = apagada) THEN
    RAISE EXCEPTION 'FALHOU: unidade APAGADA entrou em minhas_unidades';
  END IF;
  IF EXISTS (SELECT 1 FROM minhas_unidades() WHERE tenant_id = solta) THEN
    RAISE EXCEPTION 'FALHOU: enxergou uma imobiliária de que não é membro';
  END IF;
  RAISE NOTICE 'OK 1: sem rede nada muda, e a unidade apagada não conta';

  -- ----------------------------------------------------------
  -- 2. TIPO DE UNIDADE EXIGE REDE
  -- ----------------------------------------------------------
  BEGIN
    UPDATE tenants SET tipo_unidade = 'matriz' WHERE id = solta;
    RAISE EXCEPTION 'FALHOU: unidade sem rede pôde dizer-se matriz';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO organizacoes (nome) VALUES ('Rede Teste') RETURNING id INTO rede;
    UPDATE tenants SET organizacao_id = rede, tipo_unidade = 'sede' WHERE id = matriz;
    RAISE EXCEPTION 'FALHOU: aceitou tipo de unidade fora da lista';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  SELECT id INTO rede FROM organizacoes WHERE nome = 'Rede Teste';
  IF rede IS NULL THEN
    INSERT INTO organizacoes (nome) VALUES ('Rede Teste') RETURNING id INTO rede;
  END IF;
  RAISE NOTICE 'OK 2: tipo de unidade exige rede, e só aceita os três valores';

  -- ----------------------------------------------------------
  -- 3. UMA REDE TEM NO MÁXIMO UMA MATRIZ
  -- ----------------------------------------------------------
  UPDATE tenants SET organizacao_id = rede, tipo_unidade = 'matriz' WHERE id = matriz;
  UPDATE tenants SET organizacao_id = rede, tipo_unidade = 'filial' WHERE id = filial;
  BEGIN
    UPDATE tenants SET tipo_unidade = 'matriz' WHERE id = filial;
    RAISE EXCEPTION 'FALHOU: a rede ficou com duas matrizes';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  UPDATE tenants SET tipo_unidade = 'filial' WHERE id = filial;
  RAISE NOTICE 'OK 3: uma matriz por rede — "quem manda?" tem resposta';

  -- ----------------------------------------------------------
  -- 4. ESTAR NA REDE NÃO BASTA: PRECISA DA PERMISSÃO
  --
  -- É o ponto do item. Sem esta separação, criar a rede daria a todo mundo os
  -- números de todas as unidades — que é o contrário do que uma franquia quer.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', corretor, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n FROM minhas_unidades();
  IF n <> 1 THEN
    RAISE EXCEPTION 'FALHOU: sem a permissão, o corretor devia ver 1 unidade (viu %)', n;
  END IF;
  RAISE NOTICE 'OK 4: estar na rede não abre a rede';

  -- ----------------------------------------------------------
  -- 5. COM A PERMISSÃO, A REDE INTEIRA
  -- ----------------------------------------------------------
  INSERT INTO cargos (tenant_id, nome, nivel_acesso, role)
  VALUES (matriz, 'Gestor da rede', 90, 'admin') RETURNING id INTO cargo;
  INSERT INTO cargo_permissoes (cargo_id, permissao_codigo)
  VALUES (cargo, 'rede.ver_consolidado') ON CONFLICT DO NOTHING;
  UPDATE tenant_memberships SET cargo_id = cargo
   WHERE tenant_id = matriz AND user_id = chefe;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', chefe, 'role', 'authenticated', 'email', 'chefe@rede.dev')::text, true);
  SELECT count(*) INTO n FROM minhas_unidades();
  IF n <> 2 THEN
    RAISE EXCEPTION 'FALHOU: com a permissão devia ver as 2 unidades da rede (viu %)', n;
  END IF;
  IF EXISTS (SELECT 1 FROM minhas_unidades() WHERE tenant_id = solta) THEN
    RAISE EXCEPTION 'FALHOU: a permissão abriu uma unidade de FORA da rede';
  END IF;
  RAISE NOTICE 'OK 5: com a permissão, a rede inteira — e só ela';

  -- ----------------------------------------------------------
  -- 6. APAGAR A REDE NÃO APAGA AS IMOBILIÁRIAS
  -- ----------------------------------------------------------
  DELETE FROM organizacoes WHERE id = rede;
  SELECT count(*) INTO n FROM tenants WHERE id IN (matriz, filial);
  IF n <> 2 THEN RAISE EXCEPTION 'FALHOU: apagar a rede levou as imobiliárias junto'; END IF;
  SELECT count(*) INTO n FROM tenants WHERE id IN (matriz, filial) AND organizacao_id IS NULL;
  IF n <> 2 THEN RAISE EXCEPTION 'FALHOU: as unidades ficaram apontando para rede apagada'; END IF;
  RAISE NOTICE 'OK 6: a rede some, as imobiliárias ficam';

  -- ----------------------------------------------------------
  -- 7. ANÔNIMO NÃO VÊ REDE NENHUMA
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', NULL, true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM organizacoes;
    RESET ROLE;
    RAISE EXCEPTION 'FALHOU: o anônimo tem permissão na tabela de redes';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE;
  END;
  RAISE NOTICE 'OK 7: o anônimo não tem permissão nenhuma';
END $$;

ROLLBACK;
