-- ============================================================
-- Financeiro fase 1 (P4.5).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/financeiro_fase_1.test.sql
--
-- OS TRÊS CRITÉRIOS DE PRONTO DO PLANO, nos casos 1, 5 e 8:
--   1. Uma venda gera a receber e os repasses geram a pagar, SEM DIGITAÇÃO.
--   5. O DRE do mês fecha com a soma dos lançamentos.
--   8. A exportação sai com todas as colunas.
--
-- O caso 3 é o que protege contra o defeito mais provável desta fatia: dois
-- gatilhos que escrevem um no outro podem entrar em laço infinito.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '2fff1111-0000-4000-a000-000000000001';
  t2 uuid := '2fff1111-0000-4000-a000-000000000002';
  gestor uuid := '2fff0000-0000-4000-a000-000000000001';
  ana uuid := '2fff0000-0000-4000-a000-000000000002';
  fora uuid := '2fff0000-0000-4000-a000-000000000009';
  constr uuid := '2fff2222-0000-4000-a000-000000000001';
  lanc uuid := '2fff3333-0000-4000-a000-000000000001';
  lead1 uuid;
  prop uuid;
  venda public.vendas%ROWTYPE;
  l public.lancamentos_financeiros%ROWTYPE;
  rep uuid;
  r jsonb;
  n numeric;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (gestor, 'gestor@teste-fin.dev'), (ana, 'ana@teste-fin.dev'), (fora, 'fora@teste-fin.dev')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (t, 'teste-fin', 'Teste Financeiro'), (t2, 'teste-fin-2', 'Vizinha')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role, nivel) VALUES
    (t, gestor, 'admin', NULL),
    (t, ana, 'corretor', 'junior'),
    (t2, fora, 'admin', NULL)
  ON CONFLICT DO NOTHING;

  INSERT INTO construtoras (id, tenant_id, codigo, nome, comissao_padrao_pct)
    VALUES (constr, t, 'santa_angela', 'Santa Ângela', 5) ON CONFLICT DO NOTHING;
  INSERT INTO lancamentos (id, tenant_id, nome, construtora, construtora_id)
    VALUES (lanc, t, 'Reserva Castanheira', 'Santa Ângela', constr) ON CONFLICT DO NOTHING;
  INSERT INTO tenant_fiscal_config (tenant_id, regime_tributario, imposto_pct)
    VALUES (t, 'simples', 6) ON CONFLICT (tenant_id) DO UPDATE SET imposto_pct = 6;

  -- ----------------------------------------------------------
  -- 1. ASSINAR A PROPOSTA GERA O "A RECEBER" E O IMPOSTO.
  --
  -- Primeiro critério de pronto: sem digitação nenhuma. Ninguém abriu o
  -- Financeiro nesta imobiliária até aqui — o plano de contas nasce junto.
  -- ----------------------------------------------------------
  INSERT INTO leads (tenant_id, name, phone, status, created_at)
  VALUES (t, 'Cliente do Financeiro', '11944443333', 'Novos Leads', '2026-09-01')
  RETURNING id INTO lead1;

  INSERT INTO proposals (tenant_id, lead_id, stage_id, value, agent_user_id, agent_name,
                         forecast_empreendimento, signed_at)
  VALUES (t, lead1, 'proposta-assinada', 600000, ana, 'Ana', 'Reserva Castanheira', '2026-09-10')
  RETURNING id INTO prop;

  SELECT * INTO venda FROM vendas WHERE proposta_id = prop;
  IF venda.comissao_bruta IS DISTINCT FROM 30000 THEN
    RAISE EXCEPTION 'FALHOU: fixture — a comissão bruta deveria ser 30000, deu %', venda.comissao_bruta;
  END IF;

  SELECT * INTO l FROM lancamentos_financeiros
   WHERE tenant_id = t AND origem = 'venda' AND origem_id = venda.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHOU: a venda não gerou o "a receber"';
  END IF;
  -- A BRUTA, e não a líquida: é o que a construtora deposita.
  IF l.valor IS DISTINCT FROM 30000 OR l.tipo IS DISTINCT FROM 'receber' THEN
    RAISE EXCEPTION 'FALHOU: o a receber deveria ser 30000 do tipo receber, veio % / %', l.valor, l.tipo;
  END IF;
  IF l.competencia IS DISTINCT FROM DATE '2026-09-01' THEN
    RAISE EXCEPTION 'FALHOU: a competência deveria ser o mês da venda, veio %', l.competencia;
  END IF;
  IF l.status IS DISTINCT FROM 'aberto' THEN
    RAISE EXCEPTION 'FALHOU: sem recebimento o lançamento deveria estar aberto, está %', l.status;
  END IF;

  -- O plano de contas nasceu sozinho, e o lançamento caiu na conta certa.
  IF (SELECT codigo FROM plano_contas WHERE id = l.conta_id) IS DISTINCT FROM '1.1' THEN
    RAISE EXCEPTION 'FALHOU: o a receber não caiu em Comissões de venda';
  END IF;

  -- E o imposto virou um "a pagar" próprio.
  SELECT * INTO l FROM lancamentos_financeiros
   WHERE tenant_id = t AND origem = 'imposto' AND origem_id = venda.id;
  IF NOT FOUND OR l.valor IS DISTINCT FROM 1800 OR l.tipo IS DISTINCT FROM 'pagar' THEN
    RAISE EXCEPTION 'FALHOU: o imposto de 1800 deveria virar um a pagar, veio %', l;
  END IF;

  -- ----------------------------------------------------------
  -- 2. OS REPASSES GERAM OS "A PAGAR", E SÓ UM POR LINHA.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  PERFORM venda_gravar_repasses(venda.id, jsonb_build_array(
    jsonb_build_object('papel', 'corretor', 'parte', 'Ana', 'nivel', 'junior',
                       'percentual', 40, 'valor', 12000),
    jsonb_build_object('papel', 'lider', 'parte', 'Carla', 'nivel', 'coordenador',
                       'percentual', 20, 'valor', 6000),
    jsonb_build_object('papel', 'lotus', 'parte', 'Lotus', 'nivel', NULL,
                       'percentual', 40, 'valor', 12000)));

  SELECT count(*), sum(valor) INTO n, r
    FROM lancamentos_financeiros WHERE tenant_id = t AND origem = 'repasse';
  IF n IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: 3 repasses deveriam virar 3 a pagar, viraram %', n;
  END IF;
  SELECT sum(valor) INTO n FROM lancamentos_financeiros WHERE tenant_id = t AND origem = 'repasse';
  IF n IS DISTINCT FROM 30000 THEN
    RAISE EXCEPTION 'FALHOU: os a pagar dos repasses somam % e deveriam somar 30000', n;
  END IF;

  -- ----------------------------------------------------------
  -- 3. MEXER NA VENDA VÁRIAS VEZES NÃO DUPLICA NADA.
  --
  -- O gatilho roda em TODO update. Sem a chave única por (origem, origem_id),
  -- cada edição criaria outro "a receber" e o DRE somaria a mesma comissão
  -- várias vezes — um erro que só apareceria no fim do mês.
  -- ----------------------------------------------------------
  UPDATE vendas SET observacao = 'primeira' WHERE id = venda.id;
  UPDATE vendas SET observacao = 'segunda'  WHERE id = venda.id;
  UPDATE vendas SET observacao = 'terceira' WHERE id = venda.id;

  SELECT count(*) INTO n FROM lancamentos_financeiros
   WHERE tenant_id = t AND origem = 'venda' AND origem_id = venda.id;
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: três edições da venda viraram % lançamentos de a receber', n;
  END IF;

  -- ----------------------------------------------------------
  -- 4. A BAIXA VAI E VOLTA — E NÃO ENTRA EM LAÇO.
  --
  -- O plano pede os dois sentidos: "marcar recebido na venda baixa o
  -- lançamento, e vice-versa". Dois gatilhos que escrevem um no outro entram
  -- em laço infinito se escreverem sempre; cada lado só escreve quando o valor
  -- muda. Se este caso travar a sessão, é exatamente esse defeito.
  -- ----------------------------------------------------------
  -- Ida: a venda marca recebido, o lançamento baixa sozinho.
  PERFORM venda_atualizar(venda.id, 'NF-900', '2026-09-30', NULL, '2026-10-10', '2026-10-09', 30000, '');
  SELECT * INTO l FROM lancamentos_financeiros
   WHERE tenant_id = t AND origem = 'venda' AND origem_id = venda.id;
  IF l.status IS DISTINCT FROM 'baixado' OR l.pago_em IS DISTINCT FROM DATE '2026-10-09' THEN
    RAISE EXCEPTION 'FALHOU: marcar recebido na venda não baixou o lançamento — %', l;
  END IF;

  -- Volta: desfazer a baixa no lançamento desmarca o recebimento da venda.
  PERFORM financeiro_baixar(l.id, NULL, NULL);
  SELECT * INTO venda FROM vendas WHERE id = venda.id;
  IF venda.recebido_em IS NOT NULL OR venda.valor_recebido IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: desfazer a baixa não desmarcou o recebimento da venda — % / %',
      venda.recebido_em, venda.valor_recebido;
  END IF;

  -- E baixar de novo pelo Financeiro marca a venda.
  PERFORM financeiro_baixar(l.id, '2026-10-15', 30000);
  SELECT * INTO venda FROM vendas WHERE id = venda.id;
  IF venda.recebido_em IS DISTINCT FROM DATE '2026-10-15' THEN
    RAISE EXCEPTION 'FALHOU: baixar o lançamento não marcou a venda — %', venda.recebido_em;
  END IF;

  -- O repasse também: baixar o a pagar marca o repasse como pago.
  SELECT id INTO rep FROM venda_repasses WHERE venda_id = venda.id AND papel = 'corretor';
  SELECT * INTO l FROM lancamentos_financeiros
   WHERE tenant_id = t AND origem = 'repasse' AND origem_id = rep;
  PERFORM financeiro_baixar(l.id, '2026-10-20', 12000);
  IF (SELECT status FROM venda_repasses WHERE id = rep) IS DISTINCT FROM 'pago' THEN
    RAISE EXCEPTION 'FALHOU: baixar o a pagar não marcou o repasse como pago';
  END IF;

  -- ----------------------------------------------------------
  -- 5. O DRE FECHA COM A SOMA DOS LANÇAMENTOS.
  --
  -- Segundo critério de pronto do plano. As linhas e os totais vêm da MESMA
  -- consulta — duas poderiam discordar entre si.
  -- ----------------------------------------------------------
  r := financeiro_dre(t, '2026-09-01', '2026-09-30');

  SELECT sum((x->>'total')::numeric) INTO n
    FROM jsonb_array_elements(r->'linhas') x WHERE x->>'tipo' = 'receita';
  IF n IS DISTINCT FROM (r->'totais'->>'receitas')::numeric THEN
    RAISE EXCEPTION 'FALHOU: as receitas das linhas somam % e o total diz %',
      n, r->'totais'->>'receitas';
  END IF;

  SELECT sum((x->>'total')::numeric) INTO n
    FROM jsonb_array_elements(r->'linhas') x WHERE x->>'tipo' = 'despesa';
  IF n IS DISTINCT FROM (r->'totais'->>'despesas')::numeric THEN
    RAISE EXCEPTION 'FALHOU: as despesas das linhas somam % e o total diz %',
      n, r->'totais'->>'despesas';
  END IF;

  -- E fecha com a tabela, não só consigo mesmo.
  SELECT COALESCE(sum(valor) FILTER (WHERE tipo = 'receber'), 0)
       - COALESCE(sum(valor) FILTER (WHERE tipo = 'pagar'), 0) INTO n
    FROM lancamentos_financeiros
   WHERE tenant_id = t AND status <> 'cancelado' AND competencia BETWEEN '2026-09-01' AND '2026-09-30';
  IF n IS DISTINCT FROM (r->'totais'->>'resultado')::numeric THEN
    RAISE EXCEPTION 'FALHOU: o resultado do DRE (%) não bate com a soma da tabela (%)',
      r->'totais'->>'resultado', n;
  END IF;

  -- Receita 30.000 menos repasses 30.000 menos imposto 1.800 = −1.800.
  -- (A casa fica com 12.000 dos repasses; o negativo é só o imposto.)
  IF (r->'totais'->>'resultado')::numeric IS DISTINCT FROM -1800 THEN
    RAISE EXCEPTION 'FALHOU: o resultado deveria ser -1800, deu %', r->'totais'->>'resultado';
  END IF;

  -- ----------------------------------------------------------
  -- 6. RECALCULAR A FOLHA NÃO DEIXA "A PAGAR" ÓRFÃO.
  --
  -- Apagar as linhas antigas sem apagar o a pagar delas faria o Financeiro
  -- dever a quem não recebe mais.
  -- ----------------------------------------------------------
  UPDATE venda_repasses SET status = 'a_pagar', pago_em = NULL WHERE venda_id = venda.id;
  PERFORM venda_gravar_repasses(venda.id, jsonb_build_array(
    jsonb_build_object('papel', 'corretor', 'parte', 'Ana', 'nivel', 'junior',
                       'percentual', 50, 'valor', 15000),
    jsonb_build_object('papel', 'lotus', 'parte', 'Lotus', 'nivel', NULL,
                       'percentual', 50, 'valor', 15000)));

  SELECT count(*) INTO n FROM lancamentos_financeiros WHERE tenant_id = t AND origem = 'repasse';
  IF n IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: depois de recalcular deveriam sobrar 2 a pagar, sobraram %', n;
  END IF;

  -- ----------------------------------------------------------
  -- 7. VENDA SEM COMISSÃO NÃO VIRA LANÇAMENTO.
  --
  -- Ela existe na conferência com o aviso de percentual zerado. Um "a receber"
  -- de R$ 0 encheria o Financeiro de linha que não é dinheiro.
  -- ----------------------------------------------------------
  INSERT INTO vendas (tenant_id, data_venda, empreendimento, vgv, comissao_bruta, comissao_liquida, corretor_nome)
  VALUES (t, '2026-09-18', 'Venda sem construtora', 300000, 0, 0, 'Bruno');

  IF EXISTS (SELECT 1 FROM lancamentos_financeiros
              WHERE tenant_id = t AND descricao ILIKE '%sem construtora%') THEN
    RAISE EXCEPTION 'FALHOU: venda com comissão zerada gerou lançamento';
  END IF;

  -- ----------------------------------------------------------
  -- 8. A EXPORTAÇÃO SAI COM TODAS AS COLUNAS.
  --
  -- Terceiro critério de pronto. Conferido por nome de coluna: uma exportação
  -- a que falta o centro de custo ou a conta não serve para o contador.
  -- ----------------------------------------------------------
  r := financeiro_exportacao(t, '2026-09-01', '2026-09-30');
  IF jsonb_array_length(r->'linhas') < 1 THEN
    RAISE EXCEPTION 'FALHOU: a exportação veio vazia';
  END IF;

  FOR n IN SELECT 1 LOOP
    DECLARE
      faltando text[] := ARRAY[]::text[];
      campo text;
      primeira jsonb := r->'linhas'->0;
    BEGIN
      FOREACH campo IN ARRAY ARRAY['competencia','tipo','conta_codigo','conta_nome','descricao',
                                   'centro_custo','valor','vencimento','pago_em','valor_pago',
                                   'status','origem','anexo','observacao'] LOOP
        IF NOT (primeira ? campo) THEN faltando := faltando || campo; END IF;
      END LOOP;
      IF array_length(faltando, 1) > 0 THEN
        RAISE EXCEPTION 'FALHOU: faltam colunas na exportação: %', array_to_string(faltando, ', ');
      END IF;
    END;
  END LOOP;

  -- ----------------------------------------------------------
  -- 9. LANÇAMENTO MANUAL, COM RECORRÊNCIA.
  -- ----------------------------------------------------------
  r := financeiro_lancar(t, 'pagar',
    (SELECT id FROM plano_contas WHERE tenant_id = t AND codigo = '2.6'),
    'Assinatura do sistema', 500, '2026-09-01', '2026-09-10', '', '', NULL, 2);
  IF (r->>'criados')::int IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: repetir por 2 meses deveria criar 3 lançamentos, criou %', r->>'criados';
  END IF;
  IF (SELECT count(*) FROM lancamentos_financeiros
       WHERE tenant_id = t AND descricao = 'Assinatura do sistema'
         AND competencia IN ('2026-09-01','2026-10-01','2026-11-01')) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: a recorrência não caiu em setembro, outubro e novembro';
  END IF;

  -- Valor zero é engano de digitação, não um lançamento de zero.
  BEGIN
    PERFORM financeiro_lancar(t, 'pagar', NULL, 'Nada', 0, '2026-09-01');
    RAISE EXCEPTION 'FALHOU: aceitou lançamento de valor zero';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ----------------------------------------------------------
  -- 10. O AUTOMÁTICO NÃO SE CANCELA PELO FINANCEIRO.
  --
  -- Cancelá-lo aqui faria o Financeiro dizer que não há a receber de uma
  -- comissão que a conferência de vendas mostra na tela.
  -- ----------------------------------------------------------
  SELECT * INTO l FROM lancamentos_financeiros
   WHERE tenant_id = t AND origem = 'venda' AND origem_id = venda.id;
  BEGIN
    PERFORM financeiro_cancelar(l.id);
    RAISE EXCEPTION 'FALHOU: cancelou um lançamento que veio da venda';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- O manual, sim.
  SELECT * INTO l FROM lancamentos_financeiros
   WHERE tenant_id = t AND origem = 'manual' LIMIT 1;
  PERFORM financeiro_cancelar(l.id);
  IF (SELECT status FROM lancamentos_financeiros WHERE id = l.id) IS DISTINCT FROM 'cancelado' THEN
    RAISE EXCEPTION 'FALHOU: não cancelou o lançamento manual';
  END IF;
  -- E o cancelado sai do DRE.
  r := financeiro_dre(t, '2026-09-01', '2026-09-30');
  IF (r->'totais'->>'resultado')::numeric IS DISTINCT FROM -1800 THEN
    RAISE EXCEPTION 'FALHOU: o cancelado continuou no DRE — resultado %', r->'totais'->>'resultado';
  END IF;

  -- ----------------------------------------------------------
  -- 11. O FLUXO DE CAIXA PARTE DO SALDO DA CASA.
  --
  -- Sem o saldo inicial, o gráfico começaria do zero e diria que a casa está
  -- quebrada no dia 1.
  -- ----------------------------------------------------------
  PERFORM financeiro_conta_bancaria(t, 'Conta corrente', 'Itaú', 50000);
  r := financeiro_fluxo_de_caixa(t, '2026-10-01', '2026-10-31', 'dia');
  IF (r->>'saldo_inicial')::numeric IS DISTINCT FROM 50000 THEN
    RAISE EXCEPTION 'FALHOU: o saldo inicial de outubro deveria ser 50000, deu %', r->>'saldo_inicial';
  END IF;

  -- No dia 15 entrou a comissão; no dia 20 saiu o repasse do corretor.
  SELECT (x->>'saldo')::numeric INTO n
    FROM jsonb_array_elements(r->'linhas') x WHERE x->>'quando' = '2026-10-15';
  IF n IS DISTINCT FROM 80000 THEN
    RAISE EXCEPTION 'FALHOU: o saldo em 15/10 deveria ser 80000 (50000 + 30000), deu %', n;
  END IF;

  -- ----------------------------------------------------------
  -- 12. O FINANCEIRO É DE QUEM CUIDA DO DINHEIRO.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  IF financeiro_dre(t, '2026-09-01', '2026-09-30') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: uma corretora abriu o DRE da casa';
  END IF;
  IF financeiro_lancamentos(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: uma corretora abriu os lançamentos da casa';
  END IF;
  IF financeiro_exportacao(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: uma corretora exportou o financeiro da casa';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', fora::text)::text, true);
  IF financeiro_dre(t, '2026-09-01', '2026-09-30') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a admin da vizinha abriu o DRE alheio';
  END IF;

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK: financeiro fase 1 — 12 casos';
END
$$;

-- ----------------------------------------------------------
-- 13. O ANÔNIMO NÃO ENCOSTA NO FINANCEIRO.
--
-- O `pg_default_acl` desta base dá tudo ao anon em toda relação nova. Sem o
-- REVOKE da migration, quanto a imobiliária fatura sairia pela API pública.
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
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM lancamentos_financeiros $$,
  'o anônimo leu os lançamentos financeiros');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM plano_contas $$,
  'o anônimo leu o plano de contas');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM contas_bancarias $$,
  'o anônimo leu as contas bancárias e o saldo da casa');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK: anônimo barrado'; END $$;

ROLLBACK;
