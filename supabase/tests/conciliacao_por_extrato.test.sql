-- ============================================================
-- Conciliação por extrato (P4.6).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/conciliacao_por_extrato.test.sql
--
-- A tela toda existe para responder uma pergunta: "o extrato do banco bate com
-- o que a Dash diz?". Os casos aqui são os quatro jeitos de responder ERRADO —
-- e errar aqui é dinheiro no lugar errado, que ninguém percebe até o fim do mês:
--
--   2. Importar o mesmo mês duas vezes e dobrar o extrato.
--   3. Escolher sozinho entre dois lançamentos do mesmo valor.
--   5. Conciliar o mesmo lançamento com dois movimentos (receber duas vezes).
--   6. Baixar pelo valor da Dash em vez do valor que caiu no banco.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '2fff5555-0000-4000-a000-000000000001';
  t2 uuid := '2fff5555-0000-4000-a000-000000000002';
  gestor uuid := '2fff5556-0000-4000-a000-000000000001';
  fora uuid := '2fff5556-0000-4000-a000-000000000009';
  conta uuid := '2fff5557-0000-4000-a000-000000000001';
  l_a uuid := '2fff5558-0000-4000-a000-00000000000a';
  l_b uuid := '2fff5558-0000-4000-a000-00000000000b';
  l_c uuid := '2fff5558-0000-4000-a000-00000000000c';
  l_pagar uuid := '2fff5558-0000-4000-a000-00000000000d';
  l_velho uuid := '2fff5558-0000-4000-a000-00000000000e';
  r jsonb;
  s jsonb;
  mov jsonb;
  lanc public.lancamentos_financeiros%ROWTYPE;
  tr public.extrato_transacoes%ROWTYPE;
  id_a uuid;
  id_b uuid;
  n integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (gestor, 'gestor@teste-conc.dev'), (fora, 'fora@teste-conc.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (t, 'teste-conc', 'Teste Conciliação'), (t2, 'teste-conc-2', 'Vizinha') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (t, gestor, 'admin'), (t2, fora, 'admin') ON CONFLICT DO NOTHING;
  INSERT INTO contas_bancarias (id, tenant_id, nome, banco)
    VALUES (conta, t, 'Conta corrente', '341') ON CONFLICT DO NOTHING;

  -- Três a receber de R$ 30.000 e um a pagar. Os dois primeiros vencem no mesmo
  -- dia de propósito: é assim que nasce a ambiguidade do caso 3.
  INSERT INTO lancamentos_financeiros (id, tenant_id, tipo, descricao, valor, competencia, vencimento)
  VALUES
    (l_a, t, 'receber', 'Comissão Reserva 101', 30000, '2026-09-01', '2026-09-10'),
    (l_b, t, 'receber', 'Comissão Reserva 202', 30000, '2026-09-01', '2026-09-10'),
    (l_c, t, 'receber', 'Comissão Reserva 303',  7500, '2026-09-01', '2026-09-12'),
    (l_pagar, t, 'pagar', 'Repasse ao corretor', 7500, '2026-09-01', '2026-09-12'),
    -- Mesmo valor do B5, mas de AGOSTO. Existe para a janela de dias ter o que
    -- barrar: sem ela, um valor repetido casaria com qualquer mês.
    (l_velho, t, 'receber', 'Comissão de agosto', 1200, '2026-08-01', '2026-08-01');

  -- ----------------------------------------------------------
  -- 1. IMPORTAR
  -- ----------------------------------------------------------
  mov := jsonb_build_array(
    -- Cai DOIS DIAS DEPOIS do vencimento, que é o normal: a construtora paga
    -- quando paga. A data do extrato e a da Dash precisam ser diferentes, senão
    -- o caso 6 não consegue provar qual das duas a baixa usou.
    jsonb_build_object('fitid','B1','data','2026-09-12','valor',30000,'tipo','credito','descricao','TED SANTA ANGELA'),
    jsonb_build_object('fitid','B2','data','2026-09-12','valor',7500,'tipo','credito','descricao','PIX RECEBIDO'),
    jsonb_build_object('fitid','B3','data','2026-09-12','valor',7500,'tipo','debito','descricao','PIX ENVIADO'),
    jsonb_build_object('fitid','B4','data','2026-09-13','valor',59.90,'tipo','debito','descricao','TARIFA PACOTE')
  );
  r := extrato_importar(t, conta, 'setembro.ofx', '2026-09-01', '2026-09-30', mov);
  IF (r->>'novas')::int IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'FALHOU: a importação devia trazer 4 movimentos, trouxe %', r->>'novas';
  END IF;
  RAISE NOTICE 'OK 1: extrato importado — 4 movimentos';

  -- ----------------------------------------------------------
  -- 2. REIMPORTAR O MESMO MÊS NÃO DOBRA O EXTRATO
  --
  -- É o erro mais fácil de cometer e o mais difícil de perceber: a pessoa baixa
  -- o extrato de novo porque faltavam dias. Sem a chave do `fitid`, o mês
  -- inteiro entraria duas vezes e a conciliação casaria dinheiro que não existe.
  -- ----------------------------------------------------------
  r := extrato_importar(t, conta, 'setembro-de-novo.ofx', '2026-09-01', '2026-09-30',
         mov || jsonb_build_array(jsonb_build_object(
           'fitid','B5','data','2026-09-20','valor',1200,'tipo','credito','descricao','PIX NOVO'))
         -- Um SEGUNDO crédito de 30.000: é ele que disputa o mesmo lançamento
         -- no caso 5. Sem um movimento do mesmo valor, a trava contra conciliar
         -- duas vezes nunca chega a ser testada — a recusa por valor vem antes.
         || jsonb_build_array(jsonb_build_object(
           'fitid','B6','data','2026-09-14','valor',30000,'tipo','credito','descricao','TED SANTA ANGELA 2')));
  IF (r->>'novas')::int IS DISTINCT FROM 2 OR (r->>'repetidas')::int IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'FALHOU: reimportação devia trazer 1 nova e 4 repetidas, deu % e %',
      r->>'novas', r->>'repetidas';
  END IF;
  SELECT count(*) INTO n FROM extrato_transacoes WHERE tenant_id = t;
  IF n IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'FALHOU: o extrato dobrou — % movimentos guardados em vez de 6', n;
  END IF;
  RAISE NOTICE 'OK 2: reimportar o mesmo mês não dobrou nada (2 novas, 4 repetidas)';

  -- ----------------------------------------------------------
  -- 3. DOIS CANDIDATOS = AMBÍGUA, E NÃO UM CHUTE
  --
  -- B1 (R$ 30.000 em 10/09) serve tanto para a comissão 101 quanto para a 202.
  -- Escolher uma seria adivinhar com o dinheiro dos outros.
  -- ----------------------------------------------------------
  s := extrato_sugestoes(t);
  SELECT x INTO r FROM jsonb_array_elements(s) x WHERE x->>'descricao' = 'TED SANTA ANGELA';
  IF r IS NULL THEN RAISE EXCEPTION 'FALHOU: a sugestão do movimento de 30.000 sumiu'; END IF;
  IF (r->>'quantos')::int IS DISTINCT FROM 2 OR (r->>'ambigua')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: dois lançamentos iguais deviam dar sugestão ambígua, deu % candidato(s), ambigua=%',
      r->>'quantos', r->>'ambigua';
  END IF;

  -- A tarifa do banco não tem lançamento nenhum, e isso também precisa aparecer.
  SELECT x INTO r FROM jsonb_array_elements(s) x WHERE x->>'descricao' = 'TARIFA PACOTE';
  IF (r->>'sem_candidato')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: a tarifa não tem lançamento e devia vir marcada como sem candidato';
  END IF;
  RAISE NOTICE 'OK 3: ambiguidade marcada, e a tarifa apareceu como sem candidato';

  -- ----------------------------------------------------------
  -- 4. O SENTIDO SEPARA O A RECEBER DO A PAGAR
  --
  -- B2 (crédito) e B3 (débito) valem os mesmos R$ 7.500 no mesmo dia. Sem o
  -- sentido, cada um teria dois candidatos e os dois viriam ambíguos.
  -- ----------------------------------------------------------
  SELECT x INTO r FROM jsonb_array_elements(s) x WHERE x->>'descricao' = 'PIX RECEBIDO';
  IF (r->>'quantos')::int IS DISTINCT FROM 1
     OR (r->'candidatos'->0->>'lancamento_id')::uuid IS DISTINCT FROM l_c THEN
    RAISE EXCEPTION 'FALHOU: o crédito de 7.500 devia casar só com o a receber, deu % candidato(s)',
      r->>'quantos';
  END IF;
  SELECT x INTO r FROM jsonb_array_elements(s) x WHERE x->>'descricao' = 'PIX ENVIADO';
  IF (r->'candidatos'->0->>'lancamento_id')::uuid IS DISTINCT FROM l_pagar THEN
    RAISE EXCEPTION 'FALHOU: o débito de 7.500 devia casar com o a pagar';
  END IF;
  RAISE NOTICE 'OK 4: crédito casou com a receber e débito com a pagar';

  -- ----------------------------------------------------------
  -- 4b. A JANELA DE DIAS BARRA O MÊS ERRADO
  --
  -- B5 (R$ 1.200 em 20/09) tem o mesmo valor de um a receber de AGOSTO. Sem a
  -- janela, valor repetido casaria com qualquer mês — e o de agosto seria dado
  -- como recebido com o dinheiro de setembro.
  -- ----------------------------------------------------------
  SELECT x INTO r FROM jsonb_array_elements(s) x WHERE x->>'descricao' = 'PIX NOVO';
  IF (r->>'sem_candidato')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: movimento de setembro casou com lançamento de agosto — %', r;
  END IF;
  RAISE NOTICE 'OK 4b: a janela de dias barrou o lançamento do mês errado';

  -- ----------------------------------------------------------
  -- 5. UM LANÇAMENTO NÃO SE CONCILIA COM DOIS MOVIMENTOS
  --
  -- Seria receber o mesmo dinheiro duas vezes — e o DRE ficaria maior que a
  -- conta bancária.
  -- ----------------------------------------------------------
  SELECT id INTO id_a FROM extrato_transacoes WHERE tenant_id = t AND fitid = 'B1';
  SELECT id INTO id_b FROM extrato_transacoes WHERE tenant_id = t AND fitid = 'B6';

  r := extrato_conciliar(t, jsonb_build_array(
         jsonb_build_object('transacao_id', id_a, 'lancamento_id', l_a)));
  IF (r->>'conciliados')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: a conciliação boa não passou: %', r;
  END IF;

  -- Agora B6, do MESMO valor, tenta levar o mesmo lançamento. Passa por valor
  -- e por sentido: só a trava do lançamento já conciliado o segura.
  r := extrato_conciliar(t, jsonb_build_array(
         jsonb_build_object('transacao_id', id_b, 'lancamento_id', l_a)));
  IF (r->>'conciliados')::int IS DISTINCT FROM 0
     OR r->'recusados'->0->>'motivo'
        IS DISTINCT FROM 'este lançamento já foi conciliado com outro movimento' THEN
    RAISE EXCEPTION 'FALHOU: o mesmo lançamento foi conciliado duas vezes — %', r;
  END IF;
  SELECT count(*) INTO n FROM extrato_transacoes WHERE lancamento_id = l_a;
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: o lançamento ficou preso a % movimentos', n;
  END IF;
  RAISE NOTICE 'OK 5: o lançamento não foi conciliado duas vezes';

  -- ----------------------------------------------------------
  -- 5b. E A TRAVA TAMBÉM ESTÁ NO BANCO
  --
  -- A RPC recusa, mas o `server/` escreve como service_role e passa por fora
  -- dela. O índice é a última linha: a regra "um lançamento, um movimento" vale
  -- para quem escrever, não só para quem usa a tela.
  -- ----------------------------------------------------------
  BEGIN
    UPDATE extrato_transacoes SET lancamento_id = l_a WHERE id = id_b;
    RAISE EXCEPTION 'FALHOU: o banco deixou dois movimentos apontarem para o mesmo lançamento';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 5b: o banco barra dois movimentos no mesmo lançamento';

  -- ----------------------------------------------------------
  -- 6. A BAIXA USA A DATA E O VALOR DO EXTRATO
  --
  -- É o que aconteceu no banco. Baixar pelo valor da Dash esconderia a
  -- diferença — que costuma ser a tarifa ou o desconto que o cliente pediu.
  -- ----------------------------------------------------------
  SELECT * INTO lanc FROM lancamentos_financeiros WHERE id = l_a;
  IF lanc.status IS DISTINCT FROM 'baixado' OR lanc.pago_em IS DISTINCT FROM DATE '2026-09-12'
     OR lanc.valor_pago IS DISTINCT FROM 30000 THEN
    RAISE EXCEPTION 'FALHOU: a baixa devia usar a data e o valor do extrato, deu status=% pago_em=% valor_pago=%',
      lanc.status, lanc.pago_em, lanc.valor_pago;
  END IF;

  -- E o lançamento baixado sai das sugestões: ninguém pode reconciliá-lo.
  s := extrato_sugestoes(t);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(s) x,
                    jsonb_array_elements(x->'candidatos') c
              WHERE (c->>'lancamento_id')::uuid = l_a) THEN
    RAISE EXCEPTION 'FALHOU: lançamento já baixado continua sendo sugerido';
  END IF;
  RAISE NOTICE 'OK 6: baixado com a data e o valor do banco, e fora das sugestões';

  -- ----------------------------------------------------------
  -- 7. VALOR OU SENTIDO ERRADO É RECUSADO COM MOTIVO
  --
  -- A tela filtra, mas quem chama a função não é obrigado a ser a tela.
  -- ----------------------------------------------------------
  SELECT id INTO id_b FROM extrato_transacoes WHERE tenant_id = t AND fitid = 'B3'; -- débito
  r := extrato_conciliar(t, jsonb_build_array(
         jsonb_build_object('transacao_id', id_b, 'lancamento_id', l_c)));          -- a receber
  IF (r->>'conciliados')::int IS DISTINCT FROM 0
     OR r->'recusados'->0->>'motivo' IS DISTINCT FROM 'valor ou sentido não batem' THEN
    RAISE EXCEPTION 'FALHOU: débito casado com a receber devia ser recusado, deu %', r;
  END IF;
  RAISE NOTICE 'OK 7: sentido errado recusado com motivo';

  -- ----------------------------------------------------------
  -- 7c. LANÇAMENTO CANCELADO NÃO SE CONCILIA
  --
  -- Passa por valor e por sentido: só o status o segura. Conciliar um
  -- cancelado o traria de volta baixado — o lançamento que alguém apagou
  -- reaparecendo como pago.
  -- ----------------------------------------------------------
  PERFORM financeiro_cancelar(l_c);
  SELECT id INTO id_b FROM extrato_transacoes WHERE tenant_id = t AND fitid = 'B2'; -- crédito 7.500
  r := extrato_conciliar(t, jsonb_build_array(
         jsonb_build_object('transacao_id', id_b, 'lancamento_id', l_c)));
  IF (r->>'conciliados')::int IS DISTINCT FROM 0
     OR r->'recusados'->0->>'motivo' IS DISTINCT FROM 'lançamento está cancelado, não aberto' THEN
    RAISE EXCEPTION 'FALHOU: lançamento cancelado foi conciliado — %', r;
  END IF;
  RAISE NOTICE 'OK 7c: lançamento cancelado recusado';

  -- ----------------------------------------------------------
  -- 7b. DESFAZER A BAIXA PELO FINANCEIRO SOLTA O MOVIMENTO
  --
  -- Bug achado ao sabotar o caso 6: o `financeiro_baixar(id, NULL)` da fase 1
  -- reabre o lançamento sem saber que existe conciliação. Sem o gatilho, o
  -- extrato continuava dizendo "conciliado" com o lançamento aberto — e o
  -- placar daria o mês por fechado com um dinheiro que não entrou.
  -- ----------------------------------------------------------
  SELECT id INTO id_a FROM extrato_transacoes WHERE tenant_id = t AND fitid = 'B1';
  PERFORM financeiro_baixar(l_a, NULL);
  SELECT * INTO tr FROM extrato_transacoes WHERE id = id_a;
  IF tr.lancamento_id IS NOT NULL OR tr.conciliada_em IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: o Financeiro reabriu o lançamento e o extrato continuou conciliado';
  END IF;
  -- E o movimento volta para a fila, que é onde ele tem de estar.
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(extrato_sugestoes(t)) x
                  WHERE (x->>'transacao_id')::uuid = id_a) THEN
    RAISE EXCEPTION 'FALHOU: o movimento solto não voltou para a fila';
  END IF;
  RAISE NOTICE 'OK 7b: reabrir pelo Financeiro soltou o movimento';

  -- Reconcilia para o caso 8 testar o desfazer pelo lado do extrato.
  PERFORM extrato_conciliar(t, jsonb_build_array(
    jsonb_build_object('transacao_id', id_a, 'lancamento_id', l_a)));

  -- ----------------------------------------------------------
  -- 8. DESFAZER REABRE O LANÇAMENTO
  -- ----------------------------------------------------------
  SELECT id INTO id_a FROM extrato_transacoes WHERE tenant_id = t AND fitid = 'B1';
  r := extrato_desconciliar(id_a);
  SELECT * INTO lanc FROM lancamentos_financeiros WHERE id = l_a;
  IF (r->>'desfeito')::boolean IS DISTINCT FROM true
     OR lanc.status IS DISTINCT FROM 'aberto' OR lanc.pago_em IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: desfazer devia reabrir o lançamento, deu status=% pago_em=%',
      lanc.status, lanc.pago_em;
  END IF;
  RAISE NOTICE 'OK 8: desfazer reabriu o lançamento';

  -- ----------------------------------------------------------
  -- 9. IGNORAR TIRA DA FILA SEM INVENTAR LANÇAMENTO
  --
  -- A tarifa do banco é despesa da casa, mas não nasceu na Dash. Ignorar é
  -- dizer "já olhei, não é daqui" — e é diferente de conciliar.
  -- ----------------------------------------------------------
  SELECT id INTO id_b FROM extrato_transacoes WHERE tenant_id = t AND fitid = 'B4';
  PERFORM extrato_ignorar(id_b, true, 'tarifa do banco');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(extrato_sugestoes(t)) x
              WHERE (x->>'transacao_id')::uuid = id_b) THEN
    RAISE EXCEPTION 'FALHOU: o movimento ignorado continua na fila';
  END IF;
  RAISE NOTICE 'OK 9: ignorado sai da fila sem virar lançamento';

  -- ----------------------------------------------------------
  -- 10. O PLACAR CONTA O QUE FALTA
  --
  -- É o número que diz se o mês pode fechar. Depois do desfazer do caso 8,
  -- nada está conciliado; um ignorado e quatro em aberto.
  -- ----------------------------------------------------------
  r := extrato_situacao(t, '2026-09-01', '2026-09-30');
  IF (r->>'movimentos')::int IS DISTINCT FROM 6
     OR (r->>'conciliados')::int IS DISTINCT FROM 0
     OR (r->>'ignorados')::int IS DISTINCT FROM 1
     OR (r->>'em_aberto')::int IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'FALHOU: o placar não bate — %', r;
  END IF;
  RAISE NOTICE 'OK 10: placar conta o que falta (5 em aberto)';

  -- ----------------------------------------------------------
  -- 11. A IMOBILIÁRIA VIZINHA NÃO VÊ NEM CONCILIA
  --
  -- É extrato bancário: o vazamento aqui é do movimento de dinheiro da casa.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', fora, 'role', 'authenticated', 'email', 'fora@teste-conc.dev')::text, true);
  IF extrato_sugestoes(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a vizinha viu as sugestões do extrato alheio';
  END IF;
  IF extrato_movimentos(t) IS NOT NULL OR extrato_situacao(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a vizinha viu os movimentos do extrato alheio';
  END IF;
  IF extrato_conciliar(t, jsonb_build_array(
       jsonb_build_object('transacao_id', id_a, 'lancamento_id', l_a))) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a vizinha conciliou lançamento alheio';
  END IF;
  IF extrato_desconciliar(id_a) IS NOT NULL OR extrato_ignorar(id_a) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a vizinha mexeu no extrato alheio pelo id do movimento';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 11: a vizinha não vê nem mexe';

  -- ----------------------------------------------------------
  -- 12. ARQUIVO VAZIO E CONTA NÃO ESCOLHIDA
  -- ----------------------------------------------------------
  BEGIN
    PERFORM extrato_importar(t, conta, 'vazio.ofx', NULL, NULL, '[]'::jsonb);
    RAISE EXCEPTION 'FALHOU: arquivo sem movimento foi aceito';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM extrato_importar(t, NULL, 'x.ofx', NULL, NULL, mov);
    RAISE EXCEPTION 'FALHOU: importou sem escolher a conta bancária';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 12: arquivo vazio e conta em branco recusados';
END $$;

-- ----------------------------------------------------------
-- 13. O ANÔNIMO NÃO LÊ O EXTRATO
--
-- O `pg_default_acl` desta base dá tudo ao anon em toda relação nova. Sem o
-- REVOKE da migration, o extrato bancário sairia pela API pública.
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
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM extrato_transacoes $$,
  'o anônimo leu o extrato bancário');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM extrato_importacoes $$,
  'o anônimo leu as importações de extrato');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK 13: anônimo barrado'; END $$;

ROLLBACK;
