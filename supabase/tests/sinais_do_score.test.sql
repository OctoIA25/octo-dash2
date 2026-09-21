-- ============================================================
-- `leads_sinais_de_score` e a tabela de pesos (P1.7).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/sinais_do_score.test.sql
--
-- Esta função devolve FATOS, nunca pontos. Cada caso aqui é um jeito de o
-- fato sair errado — e fato errado vira score errado, que ordena a lista de
-- trabalho do corretor na ordem errada sem ninguém perceber.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t  uuid := '55555555-5555-4555-a555-555555555555';
  u  uuid := '66666666-6666-4666-a666-666666666666';
  l1 uuid := 'cccccccc-1111-4111-a111-111111111111';  -- respondeu rápido
  l2 uuid := 'cccccccc-2222-4111-a111-111111111111';  -- conversa sem resposta
  l3 uuid := 'cccccccc-3333-4111-a111-111111111111';  -- só sinais da LIA
  l4 uuid := 'cccccccc-4444-4111-a111-111111111111';  -- casca de conversa
  c1 uuid; c2 uuid; c4 uuid;
  r record;
  n int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'score@teste.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-score', 'Teste Score') ON CONFLICT DO NOTHING;
  INSERT INTO leads (id, tenant_id, name, status) VALUES
    (l1, t, 'Respondeu rapido', 'Novos Leads'),
    (l2, t, 'Sem resposta', 'Novos Leads'),
    (l3, t, 'Sinais da Lia', 'Novos Leads'),
    (l4, t, 'Casca', 'Novos Leads');

  -- ----------------------------------------------------------
  -- 1. TEMPO DE RESPOSTA: da primeira saída até a primeira entrada.
  -- ----------------------------------------------------------
  INSERT INTO whatsapp_conversations (tenant_id, contact_phone, lead_id, last_message_at)
  VALUES (t, '11999990001', l1, now() - interval '1 hour') RETURNING id INTO c1;

  INSERT INTO whatsapp_messages (tenant_id, conversation_id, direction, wa_timestamp, message_type)
  VALUES
    (t, c1, 'outbound', now() - interval '2 hours', 'text'),
    (t, c1, 'inbound',  now() - interval '2 hours' + interval '4 min', 'text'),
    (t, c1, 'outbound', now() - interval '1 hour', 'text');

  SELECT * INTO r FROM leads_sinais_de_score(t, ARRAY[l1::text]);
  IF NOT r.respondeu THEN RAISE EXCEPTION 'FALHOU: nao viu que o lead respondeu'; END IF;
  IF r.minutos_para_responder IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'FALHOU: tempo de resposta deu % (esperava 4)', r.minutos_para_responder;
  END IF;
  IF NOT r.conversou_recente THEN RAISE EXCEPTION 'FALHOU: conversa de 1h atras nao contou como recente'; END IF;

  -- ----------------------------------------------------------
  -- 2. CONVERSA SEM RESPOSTA: respondeu = falso, tempo = NULO.
  --
  -- Tempo nulo é "não sei". Devolver zero aqui daria a todo lead que nunca
  -- respondeu o bônus de resposta instantânea — o inverso da verdade.
  -- ----------------------------------------------------------
  INSERT INTO whatsapp_conversations (tenant_id, contact_phone, lead_id, last_message_at)
  VALUES (t, '11999990002', l2, now() - interval '12 days') RETURNING id INTO c2;
  INSERT INTO whatsapp_messages (tenant_id, conversation_id, direction, wa_timestamp, message_type)
  VALUES (t, c2, 'outbound', now() - interval '12 days', 'text');

  SELECT * INTO r FROM leads_sinais_de_score(t, ARRAY[l2::text]);
  IF r.respondeu THEN RAISE EXCEPTION 'FALHOU: lead que nunca respondeu apareceu como respondeu'; END IF;
  IF r.minutos_para_responder IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: tempo de resposta inventado (%) para quem nao respondeu', r.minutos_para_responder;
  END IF;
  IF r.sem_resposta_ha_dias IS DISTINCT FROM 12 THEN
    RAISE EXCEPTION 'FALHOU: dias sem conversa deu % (esperava 12)', r.sem_resposta_ha_dias;
  END IF;
  IF r.conversou_recente THEN RAISE EXCEPTION 'FALHOU: conversa de 12 dias contou como recente'; END IF;

  -- ----------------------------------------------------------
  -- 3. CASCA DE CONVERSA NÃO É CONVERSA.
  --
  -- Há 1.247 conversas na Lotus com lead vinculado e NENHUMA mensagem. Contar
  -- uma casca faria "sem conversa há N dias" nascer de uma data que nunca
  -- existiu.
  -- ----------------------------------------------------------
  INSERT INTO whatsapp_conversations (tenant_id, contact_phone, lead_id, last_message_at)
  VALUES (t, '11999990004', l4, NULL) RETURNING id INTO c4;

  SELECT * INTO r FROM leads_sinais_de_score(t, ARRAY[l4::text]);
  IF r.respondeu OR r.sem_resposta_ha_dias IS NOT NULL OR r.conversou_recente THEN
    RAISE EXCEPTION 'FALHOU: casca de conversa virou conversa';
  END IF;

  -- ----------------------------------------------------------
  -- 4. OS SINAIS DA LIA.
  --
  -- `lia.sinal_*` é namespace novo. Os tipos antigos contam outra coisa, e
  -- reusá-los misturaria "a LIA passou o lead" com "o lead tem renda".
  -- ----------------------------------------------------------
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, ator_tipo, descricao, created_at) VALUES
    (t, l3::text, 'leads', 'lia.sinal_renda_compativel', 'lia', 'cabe', now()),
    (t, l3::text, 'leads', 'lia.sinal_pediu_simulacao', 'lia', 'perguntou parcela', now()),
    (t, l3::text, 'leads', 'lia.handoff_corretor', 'lia', 'passou', now());

  SELECT * INTO r FROM leads_sinais_de_score(t, ARRAY[l3::text]);
  IF NOT r.renda_compativel OR NOT r.pediu_simulacao THEN
    RAISE EXCEPTION 'FALHOU: sinal da LIA nao foi lido (% / %)', r.renda_compativel, r.pediu_simulacao;
  END IF;
  IF r.renda_incompativel OR r.so_pesquisando THEN
    RAISE EXCEPTION 'FALHOU: sinal que a LIA nao mandou apareceu como verdadeiro';
  END IF;
  -- E o handoff NÃO pode virar sinal de score.
  IF r.pediu_visita THEN
    RAISE EXCEPTION 'FALHOU: handoff da LIA foi lido como pedido de visita';
  END IF;

  -- ----------------------------------------------------------
  -- 5. TODO LEAD PEDIDO VOLTA — mesmo sem sinal nenhum.
  --
  -- Ausência de linha obrigaria a tela a inventar o padrão, e cada tela
  -- inventaria o seu.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM leads_sinais_de_score(t, ARRAY[l1::text, l2::text, l3::text, l4::text]);
  IF n IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'FALHOU: pedi 4 leads e vieram %', n; END IF;

  -- ----------------------------------------------------------
  -- 6. ESCOPO DE IMOBILIÁRIA.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n
  FROM leads_sinais_de_score('77777777-7777-4777-a777-777777777777'::uuid, ARRAY[l1::text]);
  IF n IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'FALHOU: sinais vazaram para outra imobiliaria'; END IF;

  -- ----------------------------------------------------------
  -- 7. OS PESOS: a tabela nasce com os números do plano.
  -- ----------------------------------------------------------
  INSERT INTO tenant_score_config (tenant_id) VALUES (t);
  SELECT * INTO r FROM tenant_score_config WHERE tenant_id = t;
  IF r.ponto_de_partida IS DISTINCT FROM 50 OR r.peso_pediu_visita IS DISTINCT FROM 25
     OR r.peso_sem_resposta_7_dias IS DISTINCT FROM -15 OR r.limite_morno IS DISTINCT FROM 40 OR r.limite_quente IS DISTINCT FROM 70 THEN
    RAISE EXCEPTION 'FALHOU: a tabela nao nasce com os pesos do plano';
  END IF;

  -- Morno depois de Quente não pode: sumiria a faixa Morno inteira.
  BEGIN
    UPDATE tenant_score_config SET limite_morno = 80 WHERE tenant_id = t;
    RAISE EXCEPTION 'FALHOU: aceitou limite de Morno acima do de Quente';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ----------------------------------------------------------
  -- 8. A CHAVE DO NAVEGADOR NÃO LÊ OS PESOS.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name IN ('tenant_score_config', 'tenant_score_origem')
    AND grantee = 'anon';
  IF n IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'FALHOU: anon tem % privilegio(s) nas tabelas do score', n; END IF;

  RAISE NOTICE 'sinais_do_score: 8 casos OK';
END $$;

ROLLBACK;
