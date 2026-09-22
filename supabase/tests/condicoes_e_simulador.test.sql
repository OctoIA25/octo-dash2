-- ============================================================
-- Condições de pagamento e simulações (P2.2).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/condicoes_e_simulador.test.sql
--
-- O que estes casos protegem, em uma frase cada:
--   3. duas tabelas vigentes ao mesmo tempo fariam o simulador escolher uma
--      sozinha, e metade das propostas sairia pela regra velha;
--   5. um corretor que baixe a entrada mínima fecha negócio que a construtora
--      recusa — e o erro só aparece na assinatura;
--   7. a renda declarada de uma família não é dado de colega nenhum.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa uuid := '2ccc0000-0000-4000-a000-000000000001';
  vizinha uuid := '2ccc0000-0000-4000-a000-000000000002';
  chefe uuid := '2ccc0001-0000-4000-a000-000000000001';
  corretor uuid := '2ccc0001-0000-4000-a000-000000000002';
  outro uuid := '2ccc0001-0000-4000-a000-000000000003';
  construtora uuid := '2ccc0002-0000-4000-a000-000000000001';
  lanc uuid := '2ccc0003-0000-4000-a000-000000000001';
  cond_lanc uuid;
  cond_constr uuid;
  n integer;
  achou uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (chefe, 'chefe@cond.dev'), (corretor, 'corretor@cond.dev'), (outro, 'outro@cond.dev')
    ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (casa, 'teste-cond', 'Casa'), (vizinha, 'teste-cond-2', 'Vizinha') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (casa, chefe, 'admin'), (casa, corretor, 'corretor'), (vizinha, outro, 'admin')
    ON CONFLICT DO NOTHING;
  INSERT INTO construtoras (id, tenant_id, codigo, nome) VALUES (construtora, casa, 'construtora_teste', 'Construtora Teste')
    ON CONFLICT DO NOTHING;
  INSERT INTO lancamentos (id, tenant_id, nome, construtora_id) VALUES
    (lanc, casa, 'Residencial Teste', construtora) ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------
  -- 1. UMA CONDIÇÃO É DO EMPREENDIMENTO *OU* DA CONSTRUTORA
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO condicoes_pagamento (tenant_id, lancamento_id, construtora_id, nome, vigente_de)
    VALUES (casa, lanc, construtora, 'Das duas', '2026-01-01');
    RAISE EXCEPTION 'FALHOU: aceitou condição com empreendimento E construtora';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO condicoes_pagamento (tenant_id, nome, vigente_de) VALUES (casa, 'De ninguém', '2026-01-01');
    RAISE EXCEPTION 'FALHOU: aceitou condição sem dono';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 1: a condição tem exatamente um dono';

  -- ----------------------------------------------------------
  -- 2. OS LIMITES SÃO CONFERIDOS PELO BANCO
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO condicoes_pagamento (tenant_id, lancamento_id, nome, vigente_de, entrada_min_pct)
    VALUES (casa, lanc, 'Entrada de 150%', '2026-01-01', 150);
    RAISE EXCEPTION 'FALHOU: aceitou entrada mínima de 150%%';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO condicoes_pagamento (tenant_id, lancamento_id, nome, vigente_de, vigente_ate)
    VALUES (casa, lanc, 'Vigência ao contrário', '2026-06-01', '2026-01-01');
    RAISE EXCEPTION 'FALHOU: aceitou vigência que acaba antes de começar';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO condicoes_pagamento (tenant_id, lancamento_id, nome, vigente_de, mensais_tipo)
    VALUES (casa, lanc, 'Tipo inventado', '2026-01-01', 'quinzenais');
    RAISE EXCEPTION 'FALHOU: aceitou mensais_tipo fora da lista';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 2: limites impossíveis são recusados na escrita';

  -- ----------------------------------------------------------
  -- 3. DUAS TABELAS VIGENTES AO MESMO TEMPO, NUNCA
  --
  -- Este é o erro que ninguém veria: o simulador pegaria uma das duas em
  -- silêncio e metade das propostas sairia pela tabela errada.
  -- ----------------------------------------------------------
  INSERT INTO condicoes_pagamento (tenant_id, lancamento_id, nome, vigente_de, vigente_ate,
                                   entrada_min_pct, mensais_max_qtd, permite_balao)
  VALUES (casa, lanc, 'Tabela jan/26', '2026-01-01', '2026-06-30', 20, 36, true)
  RETURNING id INTO cond_lanc;

  BEGIN
    INSERT INTO condicoes_pagamento (tenant_id, lancamento_id, nome, vigente_de, vigente_ate)
    VALUES (casa, lanc, 'Tabela sobreposta', '2026-06-01', '2026-12-31');
    RAISE EXCEPTION 'FALHOU: aceitou duas tabelas vigentes no mesmo dia';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;

  -- Encostadas, sem sobrepor, pode: é a troca normal de tabela.
  INSERT INTO condicoes_pagamento (tenant_id, lancamento_id, nome, vigente_de, vigente_ate)
  VALUES (casa, lanc, 'Tabela jul/26', '2026-07-01', NULL);

  -- E a sobreposição vale também para o fim aberto.
  BEGIN
    INSERT INTO condicoes_pagamento (tenant_id, lancamento_id, nome, vigente_de)
    VALUES (casa, lanc, 'Outra sem fim', '2027-01-01');
    RAISE EXCEPTION 'FALHOU: duas tabelas sem data de fim conviveram';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 3: nunca duas tabelas vigentes ao mesmo tempo';

  -- ----------------------------------------------------------
  -- 4. A DO EMPREENDIMENTO MANDA; SEM ELA, A DA CONSTRUTORA
  -- ----------------------------------------------------------
  INSERT INTO condicoes_pagamento (tenant_id, construtora_id, nome, vigente_de, entrada_min_pct)
  VALUES (casa, construtora, 'Padrão da construtora', '2020-01-01', 30)
  RETURNING id INTO cond_constr;

  SELECT id INTO achou FROM condicao_vigente(lanc, '2026-03-01');
  IF achou IS DISTINCT FROM cond_lanc THEN
    RAISE EXCEPTION 'FALHOU: em março devia valer a do empreendimento';
  END IF;

  -- Em 2025 o empreendimento ainda não tinha tabela: cai na da construtora.
  SELECT id INTO achou FROM condicao_vigente(lanc, '2025-03-01');
  IF achou IS DISTINCT FROM cond_constr THEN
    RAISE EXCEPTION 'FALHOU: sem tabela do empreendimento devia cair na da construtora';
  END IF;
  -- Data nula tem de valer "hoje". O PostgREST manda os parâmetros por nome, e
  -- `p_data: null` NÃO usa o DEFAULT da função — usa NULL. Sem este caso, a
  -- tela dizia "não há tabela cadastrada" com a tabela cadastrada na frente.
  INSERT INTO condicoes_pagamento (tenant_id, lancamento_id, nome, vigente_de)
  VALUES (casa, lanc, 'Vigente hoje', CURRENT_DATE - 1)
  ON CONFLICT DO NOTHING;
  SELECT id INTO achou FROM condicao_vigente(lanc, NULL);
  IF achou IS NULL THEN
    RAISE EXCEPTION 'FALHOU: com data nula devia valer a de hoje, não veio nada';
  END IF;
  RAISE NOTICE 'OK 4: a do empreendimento manda, a da construtora é a reserva, e sem data vale hoje';

  -- ----------------------------------------------------------
  -- 5. CORRETOR SIMULA, MAS NÃO MUDA A REGRA
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', corretor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO n FROM condicoes_pagamento WHERE tenant_id = casa;
  IF n < 1 THEN RESET ROLE; RAISE EXCEPTION 'FALHOU: o corretor não consegue LER a condição'; END IF;

  BEGIN
    UPDATE condicoes_pagamento SET entrada_min_pct = 5 WHERE id = cond_lanc;
    IF FOUND THEN RESET ROLE; RAISE EXCEPTION 'FALHOU: o corretor baixou a entrada mínima'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM condicoes_pagamento WHERE id = cond_lanc;
    IF FOUND THEN RESET ROLE; RAISE EXCEPTION 'FALHOU: o corretor apagou a tabela de condição'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT entrada_min_pct INTO n FROM condicoes_pagamento WHERE id = cond_lanc;
  IF n IS DISTINCT FROM 20 THEN RAISE EXCEPTION 'FALHOU: a entrada mínima mudou (está %)', n; END IF;
  RAISE NOTICE 'OK 5: corretor simula, quem administra é que muda a regra';

  -- ----------------------------------------------------------
  -- 6. A CASA VIZINHA NÃO ENXERGA A TABELA DESTA
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', outro, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM condicoes_pagamento WHERE tenant_id = casa;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: a vizinha leu a tabela de condição desta casa'; END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 6: a regra comercial não atravessa a imobiliária';

  -- ----------------------------------------------------------
  -- 7. A SIMULAÇÃO É DE QUEM FEZ
  --
  -- Ela guarda a renda declarada de uma família. Um corretor não tem por que
  -- ler a do colega; quem administra a casa, sim.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', corretor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO simulacoes (tenant_id, corretor_id, lancamento_id, condicao_id, entradas, resultado)
  VALUES (casa, corretor, lanc, cond_lanc, '{"rendaFamiliarCentavos": 1000000}', '{"ok": true}');

  -- E não consegue gravar no nome de outra pessoa.
  BEGIN
    INSERT INTO simulacoes (tenant_id, corretor_id, lancamento_id, entradas, resultado)
    VALUES (casa, chefe, lanc, '{}', '{}');
    RESET ROLE;
    RAISE EXCEPTION 'FALHOU: gravou simulação no nome do chefe';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- A simulação do CHEFE, para o corretor tentar ler. Sem uma simulação de
  -- outra pessoa no banco, "o corretor só vê as suas" passa mesmo quando a
  -- regra deixa ele ver todas — não há o que ver.
  INSERT INTO simulacoes (tenant_id, corretor_id, lancamento_id, entradas, resultado)
  VALUES (casa, chefe, lanc, '{"rendaFamiliarCentavos": 5000000}', '{"ok": true}');

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', corretor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM simulacoes;
  RESET ROLE;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FALHOU: o corretor devia ver só a própria simulação (viu %)', n;
  END IF;

  -- O chefe, que administra, vê a do corretor.
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', chefe, 'role', 'authenticated', 'email', 'chefe@cond.dev')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM simulacoes WHERE tenant_id = casa;
  RESET ROLE;
  IF n <> 2 THEN RAISE EXCEPTION 'FALHOU: quem administra devia ver as 2 simulações da casa (viu %)', n; END IF;

  -- A vizinha não vê nada.
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', outro, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM simulacoes;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: a vizinha leu simulação com renda declarada'; END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 7: a simulação é de quem fez e de quem administra';

  -- ----------------------------------------------------------
  -- 8. APAGAR A TABELA NÃO APAGA O QUE FOI APRESENTADO
  -- ----------------------------------------------------------
  DELETE FROM condicoes_pagamento WHERE id = cond_lanc;
  SELECT count(*) INTO n FROM simulacoes WHERE tenant_id = casa;
  IF n <> 2 THEN RAISE EXCEPTION 'FALHOU: apagar a condição levou a simulação junto'; END IF;
  -- A do corretor apontava para a tabela apagada; tem de sobrar, sem o ponteiro.
  SELECT count(*) INTO n FROM simulacoes
   WHERE tenant_id = casa AND corretor_id = corretor AND condicao_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FALHOU: a simulação não sobreviveu à tabela apagada'; END IF;
  RAISE NOTICE 'OK 8: o histórico do que foi apresentado sobrevive';

  -- ----------------------------------------------------------
  -- 9. ANÔNIMO NÃO CHEGA PERTO
  -- ----------------------------------------------------------
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM condicoes_pagamento;
    RESET ROLE;
    RAISE EXCEPTION 'FALHOU: o anônimo tem permissão na tabela de condição';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE;
  END;
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM simulacoes;
    RESET ROLE;
    RAISE EXCEPTION 'FALHOU: o anônimo tem permissão nas simulações';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE;
  END;
  RAISE NOTICE 'OK 9: o anônimo não tem permissão nenhuma';
END $$;

ROLLBACK;
