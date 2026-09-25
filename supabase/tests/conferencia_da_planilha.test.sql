-- ============================================================
-- A Conferência de vendas lendo a planilha — item 5 do chefe (24/09),
-- reduzida a espelho em 25/09.
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/conferencia_da_planilha.test.sql
--
-- "Nas conferências de vendas deixe apenas as informações da planilha que
-- enviei." Saíram o gerente, o tipo do negócio e a forma de pagamento — os
-- três eram DERIVADOS do que a Dash já sabe, e nenhum existe no arquivo.
--
-- Por isso o caso que sustenta este arquivo mudou de natureza: não é mais
-- conferir que um número está certo, é conferir que **nada além da planilha
-- volta na resposta**. Uma coluna derivada que reapareça não quebra tela
-- nenhuma — ela só volta a mostrar, com cara de dado da planilha, uma coisa
-- que a planilha não tem.
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
  r       jsonb;
  achadas text[];
  esperadas text[] := ARRAY[
    -- As colunas do arquivo do Drive, lidas em 24/09, mais o `id` que a tela
    -- usa como chave de linha. Esta lista é a definição de "só a planilha".
    'id',
    'empreendimento', 'unidade_codigo', 'origem', 'area_m2', 'valor_m2',
    'total_unidade', 'valor_vgv', 'comissao_total_venda', 'cliente_nome',
    'corretor_nome', 'nivel_corretor', 'repasse_corretor', 'team_leader_valor',
    'comissao_imobiliaria', 'data_assinatura', 'data_recebimento',
    'status_recebimento'
  ];
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

  -- A equipe e o cadastro de empreendimentos ficam no cenário DE PROPÓSITO.
  -- Eram eles que alimentavam o gerente e o tipo do negócio: com os dois
  -- presentes, o caso 1 prova que a função parou de derivar, e não que faltou
  -- dado para derivar.
  INSERT INTO teams (id, tenant_id, name, leader_user_id)
  VALUES (equipe, casa, 'Equipe da Gisele', u_lider);
  UPDATE tenant_memberships SET team_id = equipe WHERE tenant_id = casa AND user_id = u_ana;

  INSERT INTO vendas_empreendimento_alias (tenant_id, nome_bruto, nome_canonico, tipo) VALUES
    (casa, 'Reserva Castanheira', 'Reserva Castanheira', 'lancamento'),
    (casa, 'TERCEIROS',           'Terceiros',           'terceiros');

  -- `commercial_sales` tem 19 colunas NOT NULL (area_m2, valor_m2, os quatro
  -- repasses, valor_conta_japi, raw_row…). Todas entram, mesmo as que este
  -- caso não usa: é a forma da tabela real, e um cenário que só preenchesse o
  -- que interessa passaria a divergir dela em silêncio.
  INSERT INTO commercial_sales
    (id, tenant_id, empreendimento, quadra, unidade, origem, area_m2, valor_m2,
     total_unidade, valor_vgv, valor_vgc, valor_imovel, comissao_total_venda,
     valor_conta_japi, cliente_nome, corretor_nome, tipo,
     repasse_20, repasse_40, repasse_45, repasse_50, team_leader_valor,
     data_assinatura, data_recebimento, observacoes, raw_row, is_active)
  VALUES
    -- Os números vêm de uma linha real da Lotus, conferida em 24/09:
    -- comissão 23.860,37 − corretor 9.544,15 − team leader 4.772,07 = 9.544,15,
    -- que é exatamente a "Comissão Imobiliária" da planilha.
    (v_lanc, casa, 'Reserva Castanheira', 'H', '1', 'Permuta', 282.61, 1740.80,
     453346.97, 439746.56, 0, 0, 23860.37,
     0, 'Eric&Juliana', 'Ana Vendedora', 'PL',
     0, 9544.15, 0, 0, 4772.07,
     '2026-09-10', '2026-09-20', 'ok', '{}'::jsonb, true),
    (v_terc, casa, 'TERCEIROS', NULL, NULL, 'Santa', 0, 0,
     0, 300000, 0, 0, 18000,
     0, 'Cliente Dois', 'Ana Vendedora', 'PL',
     0, 7200, 0, 0, 3600,
     '2026-09-12', NULL, NULL, '{}'::jsonb, true),
    -- Um empreendimento que ninguém classificou, e um corretor que não é
    -- membro: é o estado real de boa parte da planilha.
    (v_orfa, casa, 'Nome Que Ninguem Cadastrou', NULL, NULL, NULL, 0, 0,
     0, 100000, 0, 0, 6000,
     0, 'Cliente Tres', 'Fulano Externo', 'PL',
     0, 2400, 0, 0, 1200,
     '2026-09-14', NULL, NULL, '{}'::jsonb, true);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role','authenticated')::text, true);

  -- ----------------------------------------------------------
  -- 1. SÓ A PLANILHA VOLTA — ESTE É O CASO QUE SUSTENTA O ARQUIVO
  --
  -- Compara o CONJUNTO de chaves, e não a presença de uma ou outra: assim ele
  -- pega tanto a coluna derivada que volta (gerente, tipo_negocio,
  -- pagamento_forma) quanto a coluna da planilha que some sem ninguém notar.
  -- ----------------------------------------------------------
  r := public.vendas_planilha_conferencia(casa);

  SELECT array_agg(k ORDER BY k) INTO achadas
    FROM jsonb_object_keys(r -> 'linhas' -> 0) k;

  IF (SELECT array_agg(x ORDER BY x) FROM unnest(achadas) x)
     IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(esperadas) x) THEN
    RAISE EXCEPTION 'FALHOU 1: a linha nao traz exatamente as colunas da planilha.
  sobrando: %
  faltando: %',
      (SELECT coalesce(array_agg(x), '{}') FROM unnest(achadas) x WHERE x <> ALL(esperadas)),
      (SELECT coalesce(array_agg(x), '{}') FROM unnest(esperadas) x WHERE x <> ALL(achadas));
  END IF;
  RAISE NOTICE 'OK 1: a linha traz as 18 chaves da planilha, e nenhuma a mais';

  -- E no topo da resposta, o mesmo: os três contadores de "quantas linhas
  -- estão sem cada coluna" existiam para explicar coluna vazia. Sem a coluna,
  -- um contador que sobrasse ficaria contando o que ninguém mostra.
  IF r ? 'sem_gerente' OR r ? 'sem_tipo' OR r ? 'sem_pagamento' THEN
    RAISE EXCEPTION 'FALHOU 1b: sobrou contador de coluna que nao existe mais — %',
      (SELECT array_agg(k) FROM jsonb_object_keys(r) k WHERE k LIKE 'sem\_%');
  END IF;
  RAISE NOTICE 'OK 1b: os contadores das colunas derivadas sairam junto';

  -- ----------------------------------------------------------
  -- 2. A "COMISSÃO IMOBILIÁRIA" BATE COM A DA PLANILHA, AO CENTAVO
  --
  -- É a "Líquida" que o chefe definiu: comissão total menos corretor menos
  -- team leader. Ela é CALCULADA e não lida de `valor_conta_japi`, que está
  -- zerada na importação — por isso precisa de caso próprio.
  -- ----------------------------------------------------------
  IF (r -> 'linhas' -> 2 ->> 'comissao_imobiliaria')::numeric IS DISTINCT FROM 9544.15 THEN
    RAISE EXCEPTION 'FALHOU 2: a comissao imobiliaria deu %, esperado 9544.15',
      r -> 'linhas' -> 2 ->> 'comissao_imobiliaria';
  END IF;
  IF (r -> 'linhas' -> 2 ->> 'repasse_corretor')::numeric IS DISTINCT FROM 9544.15 THEN
    RAISE EXCEPTION 'FALHOU 2b: os quatro percentuais nao viraram uma coluna so — %',
      r -> 'linhas' -> 2 ->> 'repasse_corretor';
  END IF;
  RAISE NOTICE 'OK 2: a comissao imobiliaria e a mesma conta da planilha';

  -- ----------------------------------------------------------
  -- 3. O RODAPÉ É A SOMA DAS LINHAS
  --
  -- Um total que não fecha com a lista é o defeito mais caro desta tela: ele é
  -- plausível, ninguém soma à mão para conferir, e é o número que vai para a
  -- reunião.
  -- ----------------------------------------------------------
  IF (r ->> 'total_linhas')::int IS DISTINCT FROM 3
     OR (r ->> 'total_comissao')::numeric IS DISTINCT FROM 47860.37
     OR (r ->> 'total_imobiliaria')::numeric IS DISTINCT FROM (9544.15 + 7200 + 2400) THEN
    RAISE EXCEPTION 'FALHOU 3: o rodape nao fecha com as linhas — linhas %, comissao %, imobiliaria %',
      r ->> 'total_linhas', r ->> 'total_comissao', r ->> 'total_imobiliaria';
  END IF;

  -- "Recebido" é só o que tem data de recebimento. Sem o filtro, o total de
  -- recebido seria igual ao de comissão e a tela diria que tudo entrou.
  IF (r ->> 'total_recebido')::numeric IS DISTINCT FROM 23860.37 THEN
    RAISE EXCEPTION 'FALHOU 3b: o recebido ignorou a data de recebimento — %',
      r ->> 'total_recebido';
  END IF;
  RAISE NOTICE 'OK 3: o rodape fecha, e o recebido so conta quem tem data';

  -- ----------------------------------------------------------
  -- 4. O FILTRO QUE SOBROU É O DE CORRETOR — E ELE É COLUNA DA PLANILHA
  --
  -- O filtro Lançamentos/Prontos saiu com o tipo do negócio. Se alguém o
  -- devolver por um caminho lateral, a chamada de 4 argumentos passa a existir
  -- de novo e este caso não vê — por isso o caso 1 é o que sustenta o arquivo,
  -- não este.
  -- ----------------------------------------------------------
  IF (public.vendas_planilha_conferencia(casa, NULL, NULL, 'Fulano Externo') ->> 'total_linhas')::int
     IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU 4: o filtro por corretor nao trouxe exatamente 1';
  END IF;
  IF (public.vendas_planilha_conferencia(casa, '2026-09-13', NULL) ->> 'total_linhas')::int
     IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU 4b: o recorte por data nao trouxe exatamente 1';
  END IF;
  RAISE NOTICE 'OK 4: corretor e periodo continuam recortando';

  -- ----------------------------------------------------------
  -- 5. A TABELA DE PAGAMENTO CONTINUA SE DEFENDENDO
  --
  -- A tela saiu; a tabela FICA, com o que já estiver preenchido — foi o que
  -- ele decidiu em 25/09. Enquanto ela existir, as travas dela valem: no dia
  -- em que a coluna voltar, ela não pode voltar aceitando "à vista com 5
  -- parcelas".
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO venda_pagamento (venda_planilha_id, tenant_id, forma, parcelas_total, parcelas_pagas)
    VALUES (v_lanc, casa, 'a_vista', 5, 3);
    RAISE EXCEPTION 'FALHOU 5: o banco aceitou "a vista" com 5 parcelas';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO venda_pagamento (venda_planilha_id, tenant_id, forma, parcelas_total)
    VALUES (v_terc, casa, 'parcelado', NULL);
    RAISE EXCEPTION 'FALHOU 5b: o banco aceitou "parcelado" sem dizer quantas';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO venda_pagamento (venda_planilha_id, tenant_id, forma, parcelas_total, parcelas_pagas)
    VALUES (v_terc, casa, 'parcelado', 5, 6);
    RAISE EXCEPTION 'FALHOU 5c: o banco aceitou 6 pagas de 5 parcelas';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 5: a tabela de pagamento segue recusando o que se contradiz';

  -- Uma linha preenchida NÃO pode reaparecer na resposta: é o teste de que a
  -- leitura saiu de verdade, e não só a coluna da tela.
  PERFORM public.venda_pagamento_gravar(v_lanc, 'parcelado', 5, 3);
  IF (public.vendas_planilha_conferencia(casa) -> 'linhas' -> 0) ? 'pagamento_forma' THEN
    RAISE EXCEPTION 'FALHOU 5d: o pagamento gravado voltou na conferencia';
  END IF;
  RAISE NOTICE 'OK 5d: pagamento gravado nao volta na conferencia';

  -- ----------------------------------------------------------
  -- 6. O CORRETOR NÃO ABRE A CONFERÊNCIA
  --
  -- É a planilha de comissão da casa inteira. O guarda é o mesmo das outras 20
  -- funções do Financeiro, e está no BANCO — não na rota da tela.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_ana, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.vendas_planilha_conferencia(casa);
    RAISE EXCEPTION 'FALHOU 6: a corretora leu a conferencia de vendas';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM public.venda_pagamento_gravar(v_terc, 'a_vista');
    RAISE EXCEPTION 'FALHOU 6b: a corretora gravou o pagamento';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 6: a conferencia e do financeiro, conferido pelo banco';
END $$;

ROLLBACK;
