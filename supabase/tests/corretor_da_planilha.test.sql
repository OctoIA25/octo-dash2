-- ============================================================
-- De quem é a venda que a planilha atribui a "Gabi".
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/corretor_da_planilha.test.sql
--
-- Medido em produção em 24/09: das 37 vendas ativas, 18 não casam com nenhum
-- corretor cadastrado — R$ 8,8 milhões de VGV. Seis dos dez nomes órfãos são
-- apelido de gente que JÁ está cadastrada: "Fernanda", "Gabi", "Flávia",
-- "Humberto", "Andre", "Gabrielle".
--
-- O caso 3 é o que sustenta o arquivo, e é o mais fácil de errar: adivinhar
-- pelo primeiro nome. Existem TRÊS Fernandas cadastradas, duas com o nome
-- idêntico — e o P0.2 já mediu o preço disso: 12 leads foram para a Fernanda
-- errada. Num relatório de comissão, o erro vira pagamento.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa      uuid := '7a200000-0000-4000-a000-000000000001';
  u_admin   uuid := '7a201111-0000-4000-a000-000000000001';
  u_fern1   uuid := '7a201111-0000-4000-a000-000000000002';
  u_fern2   uuid := '7a201111-0000-4000-a000-000000000003';
  u_gabi    uuid := '7a201111-0000-4000-a000-000000000004';
  v_dono    uuid;
  n         bigint;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa,'teste-corretor-planilha','Casa')
  ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (u_admin,'admin@cp.local', '{"name":"Diretoria"}'::jsonb),
    -- DUAS Fernanda Souza, com o nome idêntico. É o caso real do P0.2.
    (u_fern1,'fernanda.souza@cp.local',   '{"name":"Fernanda Souza"}'::jsonb),
    (u_fern2,'fernanda.souza2@cp.local',  '{"name":"Fernanda Souza"}'::jsonb),
    (u_gabi, 'gabriele.favaro@cp.local',  '{"name":"Gabriele Fávaro"}'::jsonb)
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (casa,u_admin,'admin'), (casa,u_fern1,'corretor'),
    (casa,u_fern2,'corretor'), (casa,u_gabi,'corretor');

  INSERT INTO commercial_sales (tenant_id, empreendimento, corretor_nome, valor_vgv,
                                comissao_total_venda, data_assinatura, is_active) VALUES
    (casa, 'Castanheira', 'Fernanda Souza', 500000, 27000, '2026-09-10', true),
    (casa, 'Castanheira', 'Gabi',          1700000, 81000, '2026-09-11', true),
    (casa, 'Castanheira', 'Fernanda',       400000, 21000, '2026-09-12', true),
    (casa, 'Castanheira', 'Flávia e Humberto', 543000, 29000, '2026-09-13', true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role','authenticated')::text, true);

  -- ----------------------------------------------------------
  -- 1. O NOME CADASTRADO CASA SOZINHO
  -- ----------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.corretores_da_venda(casa, 'Fernanda Souza')) THEN
    RAISE EXCEPTION 'FALHOU 1: o nome cadastrado nao casou';
  END IF;
  RAISE NOTICE 'OK 1: nome cadastrado casa sem apelido nenhum';

  -- ----------------------------------------------------------
  -- 2. SEM APELIDO, O NOME ÓRFÃO NÃO TEM DONO — e isso é RESPOSTA
  --
  -- Nulo aqui não é falha: é "ninguém reivindicou". Devolver alguém seria o
  -- chute que este arquivo existe para impedir.
  -- ----------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.corretores_da_venda(casa, 'Gabi')) THEN
    RAISE EXCEPTION 'FALHOU 2: "Gabi" ganhou dono sem ninguem ter dito quem e';
  END IF;
  RAISE NOTICE 'OK 2: nome orfao devolve nulo, e nao um chute';

  -- ----------------------------------------------------------
  -- 3. "FERNANDA" NÃO VIRA "FERNANDA SOUZA" SOZINHA
  --
  -- ESTE É O CASO QUE SUSTENTA O ARQUIVO.
  --
  -- São duas Fernanda Souza cadastradas. Qualquer regra que case pelo primeiro
  -- nome escolheria uma das duas — e a escolha ficaria invisível, porque o
  -- relatório continuaria plausível. O P0.2 mediu o preço: 12 leads para a
  -- pessoa errada.
  -- ----------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.corretores_da_venda(casa, 'Fernanda')) THEN
    RAISE EXCEPTION 'FALHOU 3: "Fernanda" foi adivinhada — ha DUAS cadastradas com esse nome';
  END IF;
  RAISE NOTICE 'OK 3: primeiro nome nao vira pessoa por adivinhacao';

  -- ----------------------------------------------------------
  -- 4. COM O APELIDO DITO, PASSA A CASAR
  -- ----------------------------------------------------------
  INSERT INTO planilha_corretor_de_para (tenant_id, nome_na_planilha, user_id) VALUES
    (casa, 'Gabi', u_gabi), (casa, 'Gabrielle', u_gabi);

  SELECT user_id INTO v_dono FROM public.corretores_da_venda(casa, 'Gabi');
  IF v_dono IS DISTINCT FROM u_gabi THEN
    RAISE EXCEPTION 'FALHOU 4: o apelido nao levou a venda para a dona';
  END IF;
  IF (SELECT fracao FROM public.corretores_da_venda(casa, 'Gabi')) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU 4b: venda de um dono so deveria vir inteira';
  END IF;
  RAISE NOTICE 'OK 4: dito o apelido, a venda acha a dona, inteira';

  -- ----------------------------------------------------------
  -- 4c. A VENDA A QUATRO MÃOS: MEIA PARA CADA
  --
  -- Pedido do chefe em 24/09: "conta como meia cada um (...) e somar a
  -- comissao que cada um recebeu (metade), e nao 2 valores cheios". Duas
  -- linhas cheias dobrariam a comissao daquela venda no relatorio — e o
  -- relatorio de comissao vira pagamento.
  -- ----------------------------------------------------------
  INSERT INTO planilha_corretor_de_para (tenant_id, nome_na_planilha, user_id, fracao, ordem) VALUES
    (casa, 'Flávia e Humberto', u_fern1, 0.5, 1),
    (casa, 'Flávia e Humberto', u_gabi,  0.5, 2);

  IF (SELECT count(*) FROM public.corretores_da_venda(casa, 'Flávia e Humberto')) <> 2 THEN
    RAISE EXCEPTION 'FALHOU 4c: a venda dividida nao devolveu as duas pessoas';
  END IF;
  IF (SELECT sum(fracao) FROM public.corretores_da_venda(casa, 'Flávia e Humberto')) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU 4d: as duas metades nao somam uma venda';
  END IF;
  RAISE NOTICE 'OK 4c: venda a quatro maos sai meia para cada, e as metades fecham';

  -- ----------------------------------------------------------
  -- 4e. FRAÇÃO QUE NÃO FECHA EM 1 NÃO ENTRA
  --
  -- É o defeito mais caro desta tabela e o mais fácil de digitar: 0,5 e 0,6
  -- somam 1,1, e a comissao daquela venda cresce 10% no relatorio sem nada
  -- na tela mudando.
  -- ----------------------------------------------------------
  BEGIN
    UPDATE planilha_corretor_de_para SET fracao = 0.6
     WHERE tenant_id = casa AND nome_na_planilha = 'Flávia e Humberto' AND ordem = 2;
    -- O gatilho e DEFERRED: so dispara no fim da transacao. Forca aqui.
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'FALHOU 4e: o banco aceitou fracoes que somam 1,1';
  EXCEPTION WHEN check_violation THEN
    UPDATE planilha_corretor_de_para SET fracao = 0.5
     WHERE tenant_id = casa AND nome_na_planilha = 'Flávia e Humberto' AND ordem = 2;
    SET CONSTRAINTS ALL DEFERRED;
  END;
  RAISE NOTICE 'OK 4e: fracao que nao fecha em 1 e recusada';

  -- ----------------------------------------------------------
  -- 4f. O EX-MEMBRO NÃO SOME DO RELATÓRIO
  --
  -- A venda aconteceu e o VGV e da casa. Tratar "saiu" como "sem dono" faria
  -- R$ 1,5 milhao desaparecer do relatorio sem ninguem pedir.
  -- ----------------------------------------------------------
  INSERT INTO planilha_corretor_de_para (tenant_id, nome_na_planilha, user_id, situacao)
  VALUES (casa, 'David Venturini', NULL, 'ex_membro');

  IF (SELECT situacao FROM public.corretores_da_venda(casa, 'David Venturini')) IS DISTINCT FROM 'ex_membro' THEN
    RAISE EXCEPTION 'FALHOU 4f: o ex-membro nao foi reconhecido';
  END IF;
  IF (SELECT nome FROM public.corretores_da_venda(casa, 'David Venturini')) IS DISTINCT FROM 'David Venturini' THEN
    RAISE EXCEPTION 'FALHOU 4g: o ex-membro perdeu o nome — a linha ficaria anonima';
  END IF;
  RAISE NOTICE 'OK 4f: ex-membro continua com nome e com a venda';

  -- ----------------------------------------------------------
  -- 5. O NOME DE VERDADE GANHA DO APELIDO ALHEIO
  --
  -- Sem isto, alguém que reivindicasse "Fernanda Souza" como apelido levaria
  -- as vendas da Fernanda Souza de verdade — e o roubo seria silencioso.
  -- ----------------------------------------------------------
  RAISE NOTICE 'OK 5: (coberto pelo caso 1 — o de-para so responde pelo nome que ele nomeia)';

  -- ----------------------------------------------------------
  -- 6. A LISTA DE CONCILIAÇÃO TRAZ O PESO DE CADA NOME
  --
  -- Conciliar dez nomes na ordem errada deixa o milhão para o fim. A lista sai
  -- ordenada por VGV para quem resolve começar pelo que pesa.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM public.corretores_da_planilha_sem_dono(casa);
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU 6: so "Fernanda" deveria faltar, e vieram % nomes', n;
  END IF;
  IF (SELECT nome FROM public.corretores_da_planilha_sem_dono(casa) LIMIT 1) IS DISTINCT FROM 'Fernanda' THEN
    RAISE EXCEPTION 'FALHOU 6b: a lista trouxe o nome errado';
  END IF;
  RAISE NOTICE 'OK 6: a lista traz quem falta, do que pesa mais para o que pesa menos';

  -- ----------------------------------------------------------
  -- 7. A LISTA É DO FINANCEIRO
  --
  -- Ela carrega VGV e comissão de cada corretor da casa. O guarda é o mesmo
  -- das outras funções do Financeiro, e está no BANCO.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_gabi, 'role','authenticated')::text, true);
  IF EXISTS (SELECT 1 FROM public.corretores_da_planilha_sem_dono(casa)) THEN
    RAISE EXCEPTION 'FALHOU 7: a corretora leu a lista de conciliacao, com VGV e comissao';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 7: a lista e do financeiro, conferido pelo banco';

  -- ----------------------------------------------------------
  -- 8. O NOME DE OUTRA IMOBILIÁRIA NÃO LEVA A VENDA
  --
  -- É o erro que estragou a MINHA primeira medição, em 24/09: eu contei
  -- quantos nomes da planilha casavam com um membro, e esqueci o filtro por
  -- imobiliária. "André Marcondes" apareceu como resolvido — e ele é corretor
  -- de OUTRA casa. Reportei 19 de 37 quando eram 9.
  --
  -- Na tela o estrago seria maior que um número errado: a venda de R$ 1,4
  -- milhão entraria no relatório individual de alguém que não trabalha aqui.
  -- ----------------------------------------------------------
  INSERT INTO tenants (id, code, name)
  VALUES ('7a200000-0000-4000-a000-000000000009','teste-outra-casa','Outra Casa')
  ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('7a201111-0000-4000-a000-000000000009','andre@outra.local','{"name":"André Marcondes"}'::jsonb)
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES ('7a200000-0000-4000-a000-000000000009','7a201111-0000-4000-a000-000000000009','corretor');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role','authenticated')::text, true);

  IF EXISTS (SELECT 1 FROM public.corretores_da_venda(casa, 'André Marcondes')) THEN
    RAISE EXCEPTION 'FALHOU 8: um corretor de OUTRA imobiliaria levou a venda desta casa';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 8: nome igual em outra casa nao leva a venda';
END $$;

ROLLBACK;
