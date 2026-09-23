-- ============================================================
-- Pedido de nota fiscal (P4.6 — preparar e avisar).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/pedido_de_nota.test.sql
--
-- O caso 2 é o que dá valor à tela: a pendência aparece PELO NOME. "Falta o
-- CNPJ da Construtora X" é a lista de compras de quem administra; um
-- "pronto: não" faria a pessoa adivinhar o quê.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa uuid := '2bbb0000-0000-4000-a000-000000000001';
  vizinha uuid := '2bbb0000-0000-4000-a000-000000000002';
  chefe uuid := '2bbb0001-0000-4000-a000-000000000001';
  corretor uuid := '2bbb0001-0000-4000-a000-000000000002';
  outro uuid := '2bbb0001-0000-4000-a000-000000000003';
  constr uuid := '2bbb0002-0000-4000-a000-000000000001';
  semcnpj uuid := '2bbb0002-0000-4000-a000-000000000002';
  v_ok uuid := '2bbb0003-0000-4000-a000-000000000001';
  v_sem uuid := '2bbb0003-0000-4000-a000-000000000002';
  v_emitida uuid := '2bbb0003-0000-4000-a000-000000000003';
  v_solta uuid := '2bbb0003-0000-4000-a000-000000000004';
  r record;
  n integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (chefe,'chefe@nota.dev'), (corretor,'corretor@nota.dev'), (outro,'outro@nota.dev')
    ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (casa,'teste-nota','Casa'), (vizinha,'teste-nota-2','Vizinha') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (casa, chefe,'admin'), (casa, corretor,'corretor'), (vizinha, outro,'admin')
    ON CONFLICT DO NOTHING;

  INSERT INTO construtoras (id, tenant_id, codigo, nome, razao_social) VALUES
    (constr, casa, 'com_cnpj', 'Construtora Com', 'Construtora Com Ltda'),
    (semcnpj, casa, 'sem_cnpj', 'Construtora Sem', NULL) ON CONFLICT DO NOTHING;
  -- DOIS CNPJs na mesma construtora, um deles principal. É o caso real: obra
  -- por SPE, cada empreendimento num CNPJ. Sem o segundo aqui, tirar o filtro
  -- `principal` não mudaria nada e o teste passaria cego — foi o que
  -- aconteceu na primeira bateria de sabotagem.
  INSERT INTO construtora_cnpjs (tenant_id, construtora_id, cnpj, principal) VALUES
    (casa, constr, '11222333000181', true),
    (casa, constr, '11444777000161', false) ON CONFLICT DO NOTHING;

  INSERT INTO vendas (id, tenant_id, data_venda, empreendimento, construtora_id,
                      comissao_bruta, recebimento_previsto_em, nf_numero, status) VALUES
    (v_ok,      casa, '2026-09-01', 'Residencial A', constr,  50000, '2026-10-01', NULL, 'a_faturar'),
    (v_sem,     casa, '2026-09-02', 'Residencial B', semcnpj, 30000, NULL,         NULL, 'a_faturar'),
    (v_emitida, casa, '2026-09-03', 'Residencial C', constr,  20000, NULL,      '12345', 'faturado'),
    (v_solta,   casa, '2026-09-04', 'Residencial D', NULL,        0, NULL,         NULL, 'a_faturar')
    ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------
  -- 1. A VENDA COM NOTA EMITIDA SAI DA LISTA
  -- ----------------------------------------------------------
  -- Três vendas, e TRÊS LINHAS: a construtora tem dois CNPJs, e sem o filtro
  -- de principal cada venda dela sairia duplicada na lista.
  SELECT count(*) INTO n FROM notas_a_emitir(casa);
  IF n <> 3 THEN RAISE EXCEPTION 'FALHOU: esperava 3 vendas sem nota, veio %', n; END IF;
  IF EXISTS (SELECT 1 FROM notas_a_emitir(casa) WHERE venda_id = v_emitida) THEN
    RAISE EXCEPTION 'FALHOU: venda com nota emitida continuou na lista';
  END IF;
  -- Venda com dinheiro recebido e SEM nota é o caso que mais interessa a quem
  -- administra: entrou dinheiro e não há nota. Ela não pode sumir da lista.
  INSERT INTO vendas (id, tenant_id, data_venda, empreendimento, construtora_id,
                      comissao_bruta, nf_numero, status)
  VALUES ('2bbb0003-0000-4000-a000-000000000005', casa, '2026-08-20', 'Residencial E',
          constr, 10000, NULL, 'recebido') ON CONFLICT DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM notas_a_emitir(casa)
                  WHERE venda_id = '2bbb0003-0000-4000-a000-000000000005') THEN
    RAISE EXCEPTION 'FALHOU: venda RECEBIDA sem nota sumiu da lista';
  END IF;
  DELETE FROM vendas WHERE id = '2bbb0003-0000-4000-a000-000000000005';
  RAISE NOTICE 'OK 1: nota emitida sai da lista; recebida sem nota fica';

  -- ----------------------------------------------------------
  -- 2. A PENDÊNCIA APARECE PELO NOME
  -- ----------------------------------------------------------
  SELECT * INTO r FROM notas_a_emitir(casa) WHERE venda_id = v_ok;
  IF array_length(r.pendencias, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: venda completa tinha pendência: %', r.pendencias;
  END IF;
  IF r.cnpj IS DISTINCT FROM '11222333000181' THEN
    RAISE EXCEPTION 'FALHOU: não trouxe o CNPJ principal (veio %)', r.cnpj;
  END IF;
  IF r.tomador IS DISTINCT FROM 'Construtora Com Ltda' THEN
    RAISE EXCEPTION 'FALHOU: o tomador devia ser a RAZÃO SOCIAL (veio %)', r.tomador;
  END IF;

  SELECT * INTO r FROM notas_a_emitir(casa) WHERE venda_id = v_sem;
  IF NOT ('falta o CNPJ de Construtora Sem' = ANY(r.pendencias)) THEN
    RAISE EXCEPTION 'FALHOU: a pendência não diz QUAL construtora: %', r.pendencias;
  END IF;
  -- Sem razão social, o tomador cai no nome — e não fica em branco.
  IF r.tomador IS DISTINCT FROM 'Construtora Sem' THEN
    RAISE EXCEPTION 'FALHOU: sem razão social o tomador devia cair no nome (veio %)', r.tomador;
  END IF;

  SELECT * INTO r FROM notas_a_emitir(casa) WHERE venda_id = v_solta;
  IF NOT ('a venda não está ligada a uma construtora cadastrada' = ANY(r.pendencias))
     OR NOT ('a comissão está zerada' = ANY(r.pendencias)) THEN
    RAISE EXCEPTION 'FALHOU: as duas pendências deviam aparecer juntas: %', r.pendencias;
  END IF;
  RAISE NOTICE 'OK 2: cada pendência aparece pelo nome, e elas somam';

  -- ----------------------------------------------------------
  -- 3. A DESCRIÇÃO DO SERVIÇO É MONTADA NO BANCO
  --
  -- O mesmo texto que se copia, que se avisa e que fica gravado no pedido.
  -- ----------------------------------------------------------
  SELECT * INTO r FROM notas_a_emitir(casa) WHERE venda_id = v_ok;
  IF r.descricao_servico IS DISTINCT FROM
     'Comissão de intermediação imobiliária — Residencial A — venda de 01/09/2026' THEN
    RAISE EXCEPTION 'FALHOU: descrição inesperada: %', r.descricao_servico;
  END IF;
  RAISE NOTICE 'OK 3: a descrição do serviço sai pronta e igual em todo lugar';

  -- ----------------------------------------------------------
  -- 4. AVISAR É DE QUEM CUIDA DO DINHEIRO
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', corretor, 'role', 'authenticated')::text, true);
  IF pedido_de_nota_avisar(v_ok, '{"x":1}') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: o corretor avisou a contabilidade';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', outro, 'role', 'authenticated')::text, true);
  IF pedido_de_nota_avisar(v_ok, '{"x":1}') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a vizinha avisou sobre uma venda desta casa';
  END IF;

  PERFORM set_config('request.jwt.claims', NULL, true);
  IF pedido_de_nota_avisar(v_ok, '{"x":1}') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: avisou sem usuário no token';
  END IF;

  -- O caso que só a guarda de `auth.uid()` pega, o mesmo do F.1:
  -- `is_platform_owner()` lê o E-MAIL do token, não o `sub`. Token com e-mail
  -- de dono e sem usuário passa pela permissão e estoura no NOT NULL de
  -- `avisado_por`, em vez de recusar limpo.
  INSERT INTO platform_owners (email) VALUES ('dono@nota.dev') ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claims', json_build_object(
    'role', 'authenticated', 'email', 'dono@nota.dev')::text, true);
  BEGIN
    IF pedido_de_nota_avisar(v_ok, '{"x":1}') IS NOT NULL THEN
      RAISE EXCEPTION 'FALHOU: dono sem usuário no token conseguiu avisar';
    END IF;
  EXCEPTION WHEN not_null_violation THEN
    RAISE EXCEPTION 'FALHOU: estourou no NOT NULL em vez de recusar limpo';
  END;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', chefe, 'role', 'authenticated', 'email', 'chefe@nota.dev')::text, true);
  IF pedido_de_nota_avisar(v_ok, '{"tomador":"Construtora Com Ltda"}', 'mandei no zap') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: quem administra não conseguiu avisar';
  END IF;
  RAISE NOTICE 'OK 4: só quem cuida do dinheiro avisa';

  -- ----------------------------------------------------------
  -- 5. A TELA PARA DE PERGUNTAR — E AVISAR DUAS VEZES NÃO DUPLICA
  -- ----------------------------------------------------------
  SELECT * INTO r FROM notas_a_emitir(casa) WHERE venda_id = v_ok;
  IF r.avisado_em IS NULL THEN RAISE EXCEPTION 'FALHOU: a lista não mostra que já foi avisado'; END IF;

  PERFORM pedido_de_nota_avisar(v_ok, '{"de novo":true}');
  SELECT count(*) INTO n FROM pedido_de_nota WHERE venda_id = v_ok;
  IF n <> 1 THEN RAISE EXCEPTION 'FALHOU: avisar duas vezes criou % linhas', n; END IF;
  SELECT count(*) INTO n FROM pedido_de_nota WHERE venda_id = v_ok AND conteudo ? 'de novo';
  IF n <> 1 THEN RAISE EXCEPTION 'FALHOU: o segundo aviso não atualizou o conteúdo'; END IF;

  -- Avisada continua na lista: a nota ainda NÃO foi emitida. Sumir daqui ao
  -- avisar esconderia justamente o que ainda falta.
  IF NOT EXISTS (SELECT 1 FROM notas_a_emitir(casa) WHERE venda_id = v_ok) THEN
    RAISE EXCEPTION 'FALHOU: avisar tirou a venda da lista antes da nota existir';
  END IF;

  -- Registrada a nota na venda, aí sim sai.
  UPDATE vendas SET nf_numero = '999' WHERE id = v_ok;
  IF EXISTS (SELECT 1 FROM notas_a_emitir(casa) WHERE venda_id = v_ok) THEN
    RAISE EXCEPTION 'FALHOU: com a nota registrada, devia sair da lista';
  END IF;
  RAISE NOTICE 'OK 5: avisar não esconde; registrar a nota é que tira da lista';

  -- ----------------------------------------------------------
  -- 6. A VIZINHA NÃO VÊ NOTA DESTA CASA
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM notas_a_emitir(vizinha);
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: a vizinha viu % vendas desta casa', n; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', outro, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM pedido_de_nota WHERE tenant_id = casa;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: a vizinha leu pedido de nota desta casa'; END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 6: nota não atravessa imobiliária';

  -- ----------------------------------------------------------
  -- 7. ANÔNIMO NÃO CHEGA PERTO
  -- ----------------------------------------------------------
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM pedido_de_nota;
    RESET ROLE;
    RAISE EXCEPTION 'FALHOU: o anônimo tem permissão na tabela';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE;
  END;
  RAISE NOTICE 'OK 7: o anônimo não tem permissão nenhuma';
END $$;

ROLLBACK;
