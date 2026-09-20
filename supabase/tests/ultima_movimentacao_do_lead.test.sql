-- ============================================================
-- `leads_ultima_movimentacao` — a regra do selo "dias parado" (P1.4).
--
-- Roda em BEGIN/ROLLBACK: nada sobra no banco.
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/ultima_movimentacao_do_lead.test.sql
--
-- Cada caso aqui é um jeito específico de o selo mentir. O selo existe para
-- dizer "olhe para este lead": um selo que mente sobre isso é pior do que
-- nenhum, porque manda o corretor para o lead errado e cala sobre o certo.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t uuid := '11111111-1111-4111-a111-111111111111';
  l1 text := 'aaaaaaaa-1111-4111-a111-111111111111';
  l2 text := 'aaaaaaaa-2222-4111-a111-111111111111';
  l3 text := 'aaaaaaaa-3333-4111-a111-111111111111';
  u uuid := '33333333-3333-4333-a333-333333333333';
  r record;
  n int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'toque@teste.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-mov', 'Teste Movimentacao') ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------
  -- 1. O nascimento do lead NÃO é movimento.
  --
  -- `lead.created` vem reconstruído de 2018 para boa parte da base. Contá-lo
  -- faria todo lead antigo parecer recém-mexido, e o selo nunca acenderia.
  -- ----------------------------------------------------------
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, ator_tipo, descricao, created_at)
  VALUES (t, l1, 'leads', 'lead.created', 'sistema', 'nasceu', now() - interval '2 days');

  SELECT count(*) INTO n FROM leads_ultima_movimentacao(t, ARRAY[l1]);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: lead.created foi contado como movimento (devolveu % linhas)', n;
  END IF;

  -- ----------------------------------------------------------
  -- 2. A roleta reatribuindo NÃO é movimento.
  --
  -- 3.100 dessas linhas em 1.051 leads em dez dias na Lotus. Contá-las
  -- deixaria quase todo card "fresco", e o selo não apontaria nada.
  -- ----------------------------------------------------------
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, ator_tipo, descricao, created_at)
  VALUES (t, l1, 'leads', 'lead.assigned', 'sistema', 'roleta', now() - interval '1 hour');

  SELECT count(*) INTO n FROM leads_ultima_movimentacao(t, ARRAY[l1]);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: lead.assigned do sistema foi contado como movimento';
  END IF;

  -- ----------------------------------------------------------
  -- 3. Mas uma PESSOA atribuindo é movimento.
  -- ----------------------------------------------------------
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, ator_tipo, descricao, created_at)
  VALUES (t, l1, 'leads', 'lead.assigned', 'usuario', 'na mao', now() - interval '5 days');

  SELECT * INTO r FROM leads_ultima_movimentacao(t, ARRAY[l1]);
  IF r.fonte IS DISTINCT FROM 'evento' THEN
    RAISE EXCEPTION 'FALHOU: atribuicao por pessoa nao contou como movimento';
  END IF;

  -- ----------------------------------------------------------
  -- 4. Vence o movimento MAIS RECENTE, venha da fonte que vier.
  --
  -- O selo responde "há quanto tempo ninguém mexe neste lead". Uma fonte que
  -- ganhasse das outras por ordem de consulta, e não por data, daria um
  -- número velho para um lead que acabou de ser trabalhado.
  -- ----------------------------------------------------------
  INSERT INTO lead_toques (tenant_id, lead_id, lead_source, canal, resultado, executado_por, executado_em)
  VALUES (t, l1, 'leads', 'whatsapp', 'respondeu', u, now() - interval '1 day');

  SELECT * INTO r FROM leads_ultima_movimentacao(t, ARRAY[l1]);
  IF r.fonte <> 'toque' THEN
    RAISE EXCEPTION 'FALHOU: o toque de ontem perdeu para o evento de 5 dias (veio "%")', r.fonte;
  END IF;

  -- E o contrário também: um evento mais novo que o toque vence o toque.
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, ator_tipo, descricao, created_at)
  VALUES (t, l1, 'leads', 'lead.stage_changed', 'usuario', 'mudou', now() - interval '2 hours');

  SELECT * INTO r FROM leads_ultima_movimentacao(t, ARRAY[l1]);
  IF r.fonte <> 'evento' THEN
    RAISE EXCEPTION 'FALHOU: o evento de 2 horas perdeu para o toque de ontem (veio "%")', r.fonte;
  END IF;

  -- ----------------------------------------------------------
  -- 5. Lead SEM movimento nenhum não devolve linha.
  --
  -- É a diferença entre "parado há 0 dias" e "não sei". Devolver uma linha
  -- com data nula faria a tela escrever "parado há N dias" a partir de um
  -- nada — 1.249 dos 1.681 leads da Lotus estão neste caso hoje.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM leads_ultima_movimentacao(t, ARRAY[l2]);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: lead sem movimento devolveu linha';
  END IF;

  -- ----------------------------------------------------------
  -- 6. Movimento no futuro é dado sujo, e não pode virar "parado há -3 dias".
  -- ----------------------------------------------------------
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, ator_tipo, descricao, created_at)
  VALUES (t, l3, 'leads', 'lead.stage_changed', 'usuario', 'do futuro', now() + interval '3 days');

  SELECT count(*) INTO n FROM leads_ultima_movimentacao(t, ARRAY[l3]);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: movimento no futuro passou';
  END IF;

  -- ----------------------------------------------------------
  -- 7. UM lead, UMA linha. Duas linhas para o mesmo lead fariam a tela
  --    escolher a primeira que chegasse — e o resultado mudaria a cada carga.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM leads_ultima_movimentacao(t, ARRAY[l1, l1, l2, l3]);
  IF n <> 1 THEN
    RAISE EXCEPTION 'FALHOU: esperava 1 linha (so o l1 tem movimento), veio %', n;
  END IF;

  -- ----------------------------------------------------------
  -- 8. ESCOPO DE IMOBILIÁRIA. A função é SECURITY DEFINER e passa por cima
  --    da RLS das três tabelas: pedir o lead de outra imobiliária não pode
  --    devolver nada.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n
  FROM leads_ultima_movimentacao('22222222-2222-4222-a222-222222222222'::uuid, ARRAY[l1]);
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: movimento vazou para outra imobiliaria';
  END IF;

  -- ----------------------------------------------------------
  -- 9. Lista vazia e nula não explodem nem devolvem a base inteira.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM leads_ultima_movimentacao(t, ARRAY[]::text[]);
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: lista vazia devolveu linhas'; END IF;

  SELECT count(*) INTO n FROM leads_ultima_movimentacao(t, NULL);
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: lista nula devolveu linhas'; END IF;

  RAISE NOTICE 'ultima_movimentacao_do_lead: 9 casos OK';
END $$;

ROLLBACK;
