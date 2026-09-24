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
  IF public.corretor_da_planilha_por_apelido(casa, 'Fernanda Souza') IS NULL THEN
    RAISE EXCEPTION 'FALHOU 1: o nome cadastrado nao casou';
  END IF;
  RAISE NOTICE 'OK 1: nome cadastrado casa sem apelido nenhum';

  -- ----------------------------------------------------------
  -- 2. SEM APELIDO, O NOME ÓRFÃO NÃO TEM DONO — e isso é RESPOSTA
  --
  -- Nulo aqui não é falha: é "ninguém reivindicou". Devolver alguém seria o
  -- chute que este arquivo existe para impedir.
  -- ----------------------------------------------------------
  IF public.corretor_da_planilha_por_apelido(casa, 'Gabi') IS NOT NULL THEN
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
  IF public.corretor_da_planilha_por_apelido(casa, 'Fernanda') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 3: "Fernanda" foi adivinhada — ha DUAS cadastradas com esse nome';
  END IF;
  RAISE NOTICE 'OK 3: primeiro nome nao vira pessoa por adivinhacao';

  -- ----------------------------------------------------------
  -- 4. COM O APELIDO DITO, PASSA A CASAR
  -- ----------------------------------------------------------
  UPDATE tenant_memberships SET apelidos = ARRAY['Gabi', 'Gabrielle']
   WHERE tenant_id = casa AND user_id = u_gabi;

  v_dono := public.corretor_da_planilha_por_apelido(casa, 'Gabi');
  IF v_dono IS DISTINCT FROM u_gabi THEN
    RAISE EXCEPTION 'FALHOU 4: o apelido nao levou a venda para a dona';
  END IF;
  IF public.corretor_da_planilha_por_apelido(casa, 'Gabrielle') IS DISTINCT FROM u_gabi THEN
    RAISE EXCEPTION 'FALHOU 4b: o segundo apelido nao casou';
  END IF;
  RAISE NOTICE 'OK 4: dito o apelido, a venda acha a dona';

  -- ----------------------------------------------------------
  -- 5. O NOME DE VERDADE GANHA DO APELIDO ALHEIO
  --
  -- Sem isto, alguém que reivindicasse "Fernanda Souza" como apelido levaria
  -- as vendas da Fernanda Souza de verdade — e o roubo seria silencioso.
  -- ----------------------------------------------------------
  UPDATE tenant_memberships SET apelidos = ARRAY['Fernanda Souza']
   WHERE tenant_id = casa AND user_id = u_gabi;

  IF public.corretor_da_planilha_por_apelido(casa, 'Fernanda Souza') = u_gabi THEN
    RAISE EXCEPTION 'FALHOU 5: um apelido levou a venda de quem tem aquele nome';
  END IF;
  UPDATE tenant_memberships SET apelidos = ARRAY['Gabi'] WHERE tenant_id = casa AND user_id = u_gabi;
  RAISE NOTICE 'OK 5: o nome cadastrado ganha do apelido alheio';

  -- ----------------------------------------------------------
  -- 6. A LISTA DE CONCILIAÇÃO TRAZ O PESO DE CADA NOME
  --
  -- Conciliar dez nomes na ordem errada deixa o milhão para o fim. A lista sai
  -- ordenada por VGV para quem resolve começar pelo que pesa.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM public.corretores_da_planilha_sem_dono(casa);
  IF n IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU 6: esperava 2 nomes sem dono ("Fernanda" e "Flavia e Humberto"), veio %', n;
  END IF;

  IF (SELECT nome FROM public.corretores_da_planilha_sem_dono(casa) LIMIT 1)
     IS DISTINCT FROM 'Flávia e Humberto' THEN
    RAISE EXCEPTION 'FALHOU 6b: a lista nao veio ordenada pelo VGV';
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
END $$;

ROLLBACK;
