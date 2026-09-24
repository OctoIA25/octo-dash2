-- ============================================================
-- A Conferência de vendas lendo a planilha — item 5 do chefe, 24/09.
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/conferencia_da_planilha.test.sql
--
-- Três dos cinco pedidos batem em dado que a planilha não tem: o gerente, o
-- tipo do negócio e a forma de pagamento. Os dois primeiros são DERIVADOS do
-- que a Dash já sabe; o terceiro é campo novo.
--
-- Por isso os casos que mais importam aqui não são os que conferem o número:
-- são os que conferem que a tela SABE O QUE NÃO SABE (caso 5) e que uma
-- afirmação contraditória não entra no banco (caso 4).
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa    uuid := '4d0e0000-0000-4000-a000-000000000001';
  u_admin uuid := '4d0e1111-0000-4000-a000-000000000001';
  u_lider uuid := '4d0e1111-0000-4000-a000-000000000002';
  u_ana   uuid := '4d0e1111-0000-4000-a000-000000000003';
  equipe  uuid := '4d0e2222-0000-4000-a000-000000000001';
  v_lanc  uuid := '4d0e3333-0000-4000-a000-000000000001';
  v_terc  uuid := '4d0e3333-0000-4000-a000-000000000002';
  v_orfa  uuid := '4d0e3333-0000-4000-a000-000000000003';
  r jsonb;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa,'teste-conferencia','Casa')
  ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (u_admin,'admin@conf.local', '{"name":"Diretoria"}'::jsonb),
    (u_lider,'lider@conf.local', '{"name":"Gerente Gisele"}'::jsonb),
    (u_ana,  'ana@conf.local',   '{"name":"Ana Vendedora"}'::jsonb)
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (casa,u_admin,'admin'), (casa,u_lider,'team_leader'), (casa,u_ana,'corretor');

  INSERT INTO teams (id, tenant_id, name, leader_user_id)
  VALUES (equipe, casa, 'Equipe da Gisele', u_lider);
  UPDATE tenant_memberships SET team_id = equipe WHERE tenant_id = casa AND user_id = u_ana;

  -- O cadastro que diz o que é lançamento e o que é de terceiros. A planilha
  -- não diz — a coluna `tipo` dela guarda o nível do corretor.
  INSERT INTO vendas_empreendimento_alias (tenant_id, nome_bruto, nome_canonico, tipo) VALUES
    (casa, 'Reserva Castanheira', 'Reserva Castanheira', 'lancamento'),
    (casa, 'TERCEIROS',           'Terceiros',           'terceiros');

  INSERT INTO commercial_sales
    (id, tenant_id, empreendimento, quadra, unidade, cliente_nome, corretor_nome,
     tipo, valor_vgv, comissao_total_venda, data_assinatura, is_active)
  VALUES
    (v_lanc, casa, 'Reserva Castanheira', 'B', '27', 'Cliente Um',  'Ana Vendedora',
     'PL', 500000, 25000, '2026-09-10', true),
    (v_terc, casa, 'TERCEIROS',           NULL, NULL, 'Cliente Dois','Ana Vendedora',
     'PL', 300000, 18000, '2026-09-12', true),
    -- Um empreendimento que ninguém classificou, e um corretor que não é
    -- membro: é o estado real de boa parte da planilha.
    (v_orfa, casa, 'Nome Que Ninguem Cadastrou', NULL, NULL, 'Cliente Tres', 'Fulano Externo',
     'PL', 100000, 6000, '2026-09-14', true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role','authenticated')::text, true);

  -- ----------------------------------------------------------
  -- 1. O GERENTE VEM DA EQUIPE, NÃO DA PLANILHA
  --
  -- É o pedido "além do corretor, colocar o gerente em uma coluna". Medido em
  -- produção em 24/09: `team_leader_nome` está vazia em 72 das 74 linhas, e as
  -- 2 preenchidas trazem "R$ 0,00" — é coluna de valor lida como nome.
  -- ----------------------------------------------------------
  r := public.vendas_planilha_conferencia(casa);
  IF (r -> 'linhas' -> 0 ->> 'gerente') IS DISTINCT FROM 'Gerente Gisele'
     AND (r -> 'linhas' -> 1 ->> 'gerente') IS DISTINCT FROM 'Gerente Gisele' THEN
    RAISE EXCEPTION 'FALHOU 1: o gerente nao saiu da equipe do corretor — %', r -> 'linhas';
  END IF;
  RAISE NOTICE 'OK 1: o gerente vem da equipe do corretor';

  -- ----------------------------------------------------------
  -- 2. O FILTRO LANÇAMENTOS / PRONTOS
  --
  -- Sai do cadastro de empreendimentos, que é onde a casa já disse o que cada
  -- nome é. Um lançamento e um de terceiros, e o filtro separa os dois.
  -- ----------------------------------------------------------
  IF (public.vendas_planilha_conferencia(casa, NULL, NULL, 'lancamento') ->> 'total_linhas')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU 2: o filtro de lancamento nao trouxe exatamente 1';
  END IF;
  IF (public.vendas_planilha_conferencia(casa, NULL, NULL, 'terceiros') ->> 'total_linhas')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU 2: o filtro de terceiros nao trouxe exatamente 1';
  END IF;
  IF (public.vendas_planilha_conferencia(casa) ->> 'total_linhas')::int <> 3 THEN
    RAISE EXCEPTION 'FALHOU 2: "todas" deveria trazer as 3, inclusive a sem tipo';
  END IF;
  RAISE NOTICE 'OK 2: o filtro separa lancamento de terceiros, e "todas" traz tudo';

  -- ----------------------------------------------------------
  -- 3. A VENDA SEM TIPO NÃO SOME DE "TODAS"
  --
  -- Sem este caso, filtrar por tipo com um JOIN apertado esconderia a linha
  -- órfã em toda visão — e ela é justamente a que precisa de cadastro.
  -- ----------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.vendas_planilha_conferencia(casa) -> 'linhas') x
     WHERE x ->> 'empreendimento' = 'Nome Que Ninguem Cadastrou'
  ) THEN
    RAISE EXCEPTION 'FALHOU 3: a venda sem tipo sumiu de "todas"';
  END IF;
  RAISE NOTICE 'OK 3: a venda sem classificacao continua visivel';

  -- ----------------------------------------------------------
  -- 4. "À VISTA, 3 DE 5 PARCELAS" NÃO ENTRA NO BANCO
  --
  -- ESTE É O CASO QUE SUSTENTA O ARQUIVO.
  --
  -- A coluna nova é preenchida à mão, e a forma mais fácil de ela mentir é
  -- guardar duas afirmações contrárias na mesma linha. A tela mostraria
  -- "à vista · 3 de 5" e ninguém saberia qual metade acreditar.
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO venda_pagamento (venda_planilha_id, tenant_id, forma, parcelas_total, parcelas_pagas)
    VALUES (v_lanc, casa, 'a_vista', 5, 3);
    RAISE EXCEPTION 'FALHOU 4: o banco aceitou "a vista" com 5 parcelas';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO venda_pagamento (venda_planilha_id, tenant_id, forma, parcelas_total)
    VALUES (v_terc, casa, 'parcelado', NULL);
    RAISE EXCEPTION 'FALHOU 4b: o banco aceitou "parcelado" sem dizer quantas';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO venda_pagamento (venda_planilha_id, tenant_id, forma, parcelas_total, parcelas_pagas)
    VALUES (v_terc, casa, 'parcelado', 5, 6);
    RAISE EXCEPTION 'FALHOU 4c: o banco aceitou 6 pagas de 5 parcelas';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 4: o banco recusa pagamento que se contradiz';

  -- ----------------------------------------------------------
  -- 5. A TELA SABE O QUE NÃO SABE
  --
  -- Os três contadores existem para a coluna vazia não parecer defeito da
  -- tela. Sem eles, quem abre conclui que o sistema perdeu o dado, quando o
  -- certo é "ninguém preencheu ainda".
  -- ----------------------------------------------------------
  PERFORM public.venda_pagamento_gravar(v_lanc, 'parcelado', 5, 3);
  r := public.vendas_planilha_conferencia(casa);
  IF (r ->> 'sem_gerente')::int   IS DISTINCT FROM 1  -- só a do Fulano Externo
     OR (r ->> 'sem_tipo')::int    IS DISTINCT FROM 1  -- só a não cadastrada
     OR (r ->> 'sem_pagamento')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU 5: os contadores do que falta estao errados — gerente %, tipo %, pagamento %',
      r ->> 'sem_gerente', r ->> 'sem_tipo', r ->> 'sem_pagamento';
  END IF;
  RAISE NOTICE 'OK 5: a tela conta quantas linhas faltam em cada coluna';

  -- ----------------------------------------------------------
  -- 6. "NINGUÉM PREENCHEU" É DIFERENTE DE "À VISTA"
  --
  -- Limpar tem de APAGAR a linha, não gravar 'a_vista'. Guardar à vista por
  -- omissão afirmaria que a venda foi paga de uma vez — e o contador do que
  -- falta zeraria sozinho, escondendo o trabalho que resta.
  -- ----------------------------------------------------------
  PERFORM public.venda_pagamento_gravar(v_lanc, NULL);
  IF EXISTS (SELECT 1 FROM venda_pagamento WHERE venda_planilha_id = v_lanc) THEN
    RAISE EXCEPTION 'FALHOU 6: limpar deixou linha no banco';
  END IF;
  IF (public.vendas_planilha_conferencia(casa) ->> 'sem_pagamento')::int IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU 6b: limpar nao devolveu a venda para a conta do que falta';
  END IF;
  RAISE NOTICE 'OK 6: limpar volta a contar como pendente';

  -- ----------------------------------------------------------
  -- 7. O CORRETOR NÃO ABRE A CONFERÊNCIA
  --
  -- É a planilha de comissão da casa inteira. O guarda é o mesmo das outras 20
  -- funções do Financeiro, e está no BANCO — não na rota da tela.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_ana, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.vendas_planilha_conferencia(casa);
    RAISE EXCEPTION 'FALHOU 7: a corretora leu a conferencia de vendas';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.venda_pagamento_gravar(v_terc, 'a_vista');
    RAISE EXCEPTION 'FALHOU 7b: a corretora gravou o pagamento';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 7: a conferencia e do financeiro, conferido pelo banco';
END $$;

ROLLBACK;
