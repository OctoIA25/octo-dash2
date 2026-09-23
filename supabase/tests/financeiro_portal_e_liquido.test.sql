-- ============================================================
-- A tela "A receber" com portal, líquido e a quebra por tipo de venda.
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/financeiro_portal_e_liquido.test.sql
--
-- O caso 3 é o que sustenta este arquivo: um `INNER JOIN` no lugar do LEFT
-- faria o lançamento manual (e qualquer um cuja venda tenha sido apagada)
-- SUMIR da lista de contas a receber. Dinheiro desaparecendo da tela, sem erro
-- nenhum e sem ninguém procurando.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa  uuid := '2eee1111-0000-4000-a000-000000000001';
  lead1 uuid := '2eee2222-0000-4000-a000-000000000001';
  lead2 uuid := '2eee2222-0000-4000-a000-000000000002';
  v_lanc  uuid := '2eee3333-0000-4000-a000-000000000001';
  v_terc  uuid := '2eee3333-0000-4000-a000-000000000002';
  dados jsonb;
  linha jsonb;
  t jsonb;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-fin-portal', 'Casa')
  ON CONFLICT DO NOTHING;

  -- Dois leads, dois portais diferentes. Os nomes são os que existem de
  -- verdade na Lotus, para o teste falar a mesma língua que a produção.
  INSERT INTO leads (id, tenant_id, name, source) VALUES
    (lead1, casa, 'Cliente do ZAP', 'ZAP Imóveis'),
    (lead2, casa, 'Cliente do Insta', 'Instagram');

  -- Uma venda de LANÇAMENTO e uma de TERCEIROS. Os gatilhos do financeiro
  -- criam o "a receber" da comissão e o "a pagar" do imposto sozinhos.
  INSERT INTO vendas (id, tenant_id, lead_id, data_venda, empreendimento, tipo,
                      corretor_nome, vgv, comissao_pct, comissao_bruta,
                      imposto_pct, imposto_valor, comissao_liquida,
                      recebimento_previsto_em, status, observacao)
  VALUES
    (v_lanc, casa, lead1, CURRENT_DATE, 'Residencial A', 'lancamento',
     'Corretor 1', 1000000, 3, 30000, 10, 3000, 27000, CURRENT_DATE, 'a_faturar', ''),
    (v_terc, casa, lead2, CURRENT_DATE, 'Apartamento B', 'terceiros',
     'Corretor 2', 500000, 6, 30000, 10, 3000, 27000, CURRENT_DATE, 'a_faturar', '');

  -- ----------------------------------------------------------
  -- 1. A LINHA DA COMISSÃO TRAZ PORTAL, TIPO E LÍQUIDO
  -- ----------------------------------------------------------
  dados := public.financeiro_lancamentos(casa, CURRENT_DATE, CURRENT_DATE, 'receber');
  SELECT x INTO linha FROM jsonb_array_elements(dados->'linhas') x
   WHERE x->>'origem' = 'venda' AND x->>'origem_id' = v_lanc::text;

  IF linha IS NULL THEN RAISE EXCEPTION 'FALHOU 1: a comissão da venda nem apareceu'; END IF;
  IF linha->>'portal' IS DISTINCT FROM 'ZAP Imóveis' THEN
    RAISE EXCEPTION 'FALHOU 1: portal veio % (esperava ZAP Imóveis)', linha->>'portal';
  END IF;
  IF linha->>'venda_tipo' IS DISTINCT FROM 'lancamento' THEN
    RAISE EXCEPTION 'FALHOU 1: venda_tipo veio %', linha->>'venda_tipo';
  END IF;
  IF (linha->>'valor_liquido')::numeric IS DISTINCT FROM 27000 THEN
    RAISE EXCEPTION 'FALHOU 1: valor_liquido veio %', linha->>'valor_liquido';
  END IF;
  -- E o Valor continua sendo a comissão BRUTA, que é o que o chefe disse que
  -- essa coluna é. Se um dia virar a líquida, o líquido ao lado fica repetido.
  IF (linha->>'valor')::numeric IS DISTINCT FROM 30000 THEN
    RAISE EXCEPTION 'FALHOU 1: valor deixou de ser a bruta (veio %)', linha->>'valor';
  END IF;
  RAISE NOTICE 'OK 1: portal, tipo e líquido na linha da comissão';

  -- ----------------------------------------------------------
  -- 2. A LINHA DO IMPOSTO NÃO INVENTA UM LÍQUIDO
  --
  -- Ela tem venda por trás, então portal e tipo fazem sentido. "Líquido de um
  -- imposto" não faz — e somá-lo contaria o mesmo dinheiro duas vezes.
  -- ----------------------------------------------------------
  dados := public.financeiro_lancamentos(casa, CURRENT_DATE, CURRENT_DATE, 'pagar');
  SELECT x INTO linha FROM jsonb_array_elements(dados->'linhas') x
   WHERE x->>'origem' = 'imposto' AND x->>'origem_id' = v_lanc::text;
  IF linha IS NULL THEN RAISE EXCEPTION 'FALHOU 2: o imposto não apareceu'; END IF;
  IF linha->>'valor_liquido' IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 2: a linha de imposto veio com líquido %', linha->>'valor_liquido';
  END IF;
  IF linha->>'portal' IS DISTINCT FROM 'ZAP Imóveis' THEN
    RAISE EXCEPTION 'FALHOU 2: o imposto perdeu o portal da venda';
  END IF;
  RAISE NOTICE 'OK 2: imposto sem líquido, mas com o portal da venda';

  -- ----------------------------------------------------------
  -- 3. O LANÇAMENTO SEM VENDA CONTINUA NA LISTA
  --
  -- ESTE É O CASO QUE SUSTENTA O ARQUIVO. Trocar o LEFT JOIN por INNER faria
  -- esta linha sumir — e a conta a receber ficaria menor sem ninguém ver.
  -- ----------------------------------------------------------
  INSERT INTO lancamentos_financeiros
    (tenant_id, tipo, descricao, valor, competencia, vencimento, origem)
  VALUES (casa, 'receber', 'Aluguel de sala, digitado à mão', 5000,
          CURRENT_DATE, CURRENT_DATE, 'manual');

  dados := public.financeiro_lancamentos(casa, CURRENT_DATE, CURRENT_DATE, 'receber');
  SELECT x INTO linha FROM jsonb_array_elements(dados->'linhas') x
   WHERE x->>'origem' = 'manual';
  IF linha IS NULL THEN
    RAISE EXCEPTION 'FALHOU 3: o lançamento manual sumiu da lista — dinheiro fora da tela';
  END IF;
  IF linha->>'portal' IS NOT NULL OR linha->>'venda_tipo' IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 3: o manual inventou portal/tipo';
  END IF;
  RAISE NOTICE 'OK 3: lançamento sem venda fica na lista, sem portal inventado';

  -- ----------------------------------------------------------
  -- 4. OS TRÊS PEDAÇOS FECHAM COM O TOTAL
  --
  -- lançamento + terceiros + sem_venda tem que dar o total a receber. É o
  -- teste de que nenhum pedaço caiu fora da conta — três números que não
  -- somam é justamente como se descobre que um sumiu.
  -- ----------------------------------------------------------
  t := dados->'totais';
  IF (t->>'a_receber')::numeric IS DISTINCT FROM 65000 THEN
    RAISE EXCEPTION 'FALHOU 4: a_receber veio % (30000 + 30000 + 5000)', t->>'a_receber';
  END IF;
  IF (t->>'de_lancamento')::numeric IS DISTINCT FROM 30000 THEN
    RAISE EXCEPTION 'FALHOU 4: de_lancamento veio %', t->>'de_lancamento';
  END IF;
  IF (t->>'de_terceiros')::numeric IS DISTINCT FROM 30000 THEN
    RAISE EXCEPTION 'FALHOU 4: de_terceiros veio %', t->>'de_terceiros';
  END IF;
  IF (t->>'sem_venda')::numeric IS DISTINCT FROM 5000 THEN
    RAISE EXCEPTION 'FALHOU 4: sem_venda veio %', t->>'sem_venda';
  END IF;
  IF (t->>'de_lancamento')::numeric + (t->>'de_terceiros')::numeric
     + (t->>'sem_venda')::numeric IS DISTINCT FROM (t->>'a_receber')::numeric THEN
    RAISE EXCEPTION 'FALHOU 4: os pedaços não fecham com o total';
  END IF;
  RAISE NOTICE 'OK 4: lançamento + terceiros + sem venda = o total a receber';

  -- ----------------------------------------------------------
  -- 5. O LÍQUIDO SOMA SÓ AS COMISSÕES
  --
  -- 27000 + 27000. Não entra o manual (não tem líquido) nem o imposto (que
  -- é 'pagar', e cujo líquido seria o mesmo dinheiro contado de novo).
  -- ----------------------------------------------------------
  IF (t->>'liquido')::numeric IS DISTINCT FROM 54000 THEN
    RAISE EXCEPTION 'FALHOU 5: liquido veio % (esperava 54000)', t->>'liquido';
  END IF;
  IF (t->>'liquido')::numeric >= (t->>'a_receber')::numeric THEN
    RAISE EXCEPTION 'FALHOU 5: o líquido ficou maior ou igual ao bruto';
  END IF;
  RAISE NOTICE 'OK 5: o líquido soma só as comissões, e é menor que o bruto';

  -- ----------------------------------------------------------
  -- 6. LEAD SEM PORTAL NÃO VIRA TEXTO VAZIO
  --
  -- `source` em branco tem que chegar como nulo, senão a tela desenha uma
  -- célula com aspas vazias e parece dado.
  -- ----------------------------------------------------------
  UPDATE leads SET source = '   ' WHERE id = lead1;
  dados := public.financeiro_lancamentos(casa, CURRENT_DATE, CURRENT_DATE, 'receber');
  SELECT x INTO linha FROM jsonb_array_elements(dados->'linhas') x
   WHERE x->>'origem' = 'venda' AND x->>'origem_id' = v_lanc::text;
  IF linha->>'portal' IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 6: source em branco virou portal %', linha->>'portal';
  END IF;
  RAISE NOTICE 'OK 6: source em branco chega como nulo';

  -- ----------------------------------------------------------
  -- 7. O LÍQUIDO NÃO CONTA UMA LINHA QUE NÃO É COMISSÃO
  --
  -- ESTE CASO NASCEU DE UMA SABOTAGEM QUE PASSOU CEGA.
  --
  -- Tirei o filtro `origem = 'venda'` do total `liquido` e o teste continuou
  -- verde — porque, com os dados que ele tinha, as únicas linhas 'receber'
  -- com venda por trás JÁ eram as comissões. O filtro estava lá defendendo
  -- contra um estado que o teste nunca criava, e um guarda que nada exercita
  -- é indistinguível de um guarda que não serve.
  --
  -- Então o teste passa a criar esse estado. Não há restrição no banco
  -- ligando `origem` a `tipo`: um lançamento 'receber' com origem 'repasse' é
  -- aceito hoje. Ele tem venda por trás, logo tem `comissao_liquida` — e sem
  -- o filtro entraria no líquido, contando o mesmo dinheiro outra vez.
  -- ----------------------------------------------------------
  UPDATE leads SET source = 'ZAP Imóveis' WHERE id = lead1;  -- desfaz o caso 6

  INSERT INTO venda_repasses (id, tenant_id, venda_id, papel, nome, pct, valor, status)
  VALUES ('2eee4444-0000-4000-a000-000000000001', casa, v_lanc,
          'corretor', 'Corretor 1', 50, 13500, 'a_pagar');

  -- O gatilho do repasse já criou o lançamento dele, como 'pagar'. Viro o tipo
  -- na própria linha: não há restrição impedindo, e é assim que o estado
  -- aconteceria de verdade — alguém corrigindo o sentido de um lançamento.
  UPDATE lancamentos_financeiros
     SET tipo = 'receber', valor = 1000,
         descricao = 'Devolução de repasse adiantado',
         vencimento = CURRENT_DATE, competencia = CURRENT_DATE
   WHERE tenant_id = casa AND origem = 'repasse'
     AND origem_id = '2eee4444-0000-4000-a000-000000000001';

  dados := public.financeiro_lancamentos(casa, CURRENT_DATE, CURRENT_DATE, 'receber');
  t := dados->'totais';

  -- A linha nova entra no total a receber, como qualquer outra.
  IF (t->>'a_receber')::numeric IS DISTINCT FROM 66000 THEN
    RAISE EXCEPTION 'FALHOU 7: a_receber veio % (esperava 66000)', t->>'a_receber';
  END IF;
  -- Mas NÃO no líquido: ela não é a comissão, é outra coisa ligada à mesma venda.
  IF (t->>'liquido')::numeric IS DISTINCT FROM 54000 THEN
    RAISE EXCEPTION 'FALHOU 7: liquido veio % — contou uma linha que não é comissão', t->>'liquido';
  END IF;
  RAISE NOTICE 'OK 7: o líquido ignora a linha com venda por trás que não é a comissão';
END $$;

ROLLBACK;
