-- ============================================================
-- Etiqueta de quem enviou + assumir conversa (F.1).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/etiqueta_de_quem_enviou.test.sql
--
-- O caso 2 é o que protege a honestidade da tela: 'corretor' sem pessoa é
-- etiqueta que não diz nada, e foi assim que a marca antiga virou inútil.
-- O caso 5 protege a LIA de ser calada por quem não é da casa.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa uuid := '2eee0000-0000-4000-a000-000000000001';
  vizinha uuid := '2eee0000-0000-4000-a000-000000000002';
  corretor uuid := '2eee0001-0000-4000-a000-000000000001';
  estranho uuid := '2eee0001-0000-4000-a000-000000000002';
  conversa uuid := '2eee0002-0000-4000-a000-000000000001';
  lead uuid := '2eee0003-0000-4000-a000-000000000001';
  n integer;
  r jsonb;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (corretor, 'corretor@etiqueta.dev'), (estranho, 'estranho@etiqueta.dev')
    ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (casa, 'teste-etiqueta', 'Casa'), (vizinha, 'teste-etiqueta-2', 'Vizinha') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (casa, corretor, 'corretor'), (vizinha, estranho, 'admin') ON CONFLICT DO NOTHING;
  INSERT INTO whatsapp_conversations (id, tenant_id, contact_phone)
    VALUES (conversa, casa, '5511999990000') ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------
  -- 1. OS TRÊS VALORES, E MAIS NENHUM
  -- ----------------------------------------------------------
  INSERT INTO whatsapp_messages (conversation_id, tenant_id, direction, body, enviado_por)
  VALUES (conversa, casa, 'outbound', 'oi, sou a LIA', 'lia'),
         (conversa, casa, 'outbound', 'campanha', 'disparo');

  BEGIN
    INSERT INTO whatsapp_messages (conversation_id, tenant_id, direction, body, enviado_por)
    VALUES (conversa, casa, 'outbound', 'x', 'robo');
    RAISE EXCEPTION 'FALHOU: aceitou enviado_por fora da lista';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Recebida não leva etiqueta: a direção já diz que foi o cliente.
  BEGIN
    INSERT INTO whatsapp_messages (conversation_id, tenant_id, direction, body, enviado_por)
    VALUES (conversa, casa, 'inbound', 'oi', 'lia');
    RAISE EXCEPTION 'FALHOU: etiquetou uma mensagem RECEBIDA';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 1: só lia, corretor e disparo, e só no que foi enviado';

  -- ----------------------------------------------------------
  -- 2. 'CORRETOR' SEM PESSOA, NUNCA
  --
  -- Uma etiqueta "Corretor" que não sabe qual corretor não informa nada — e é
  -- exatamente o buraco em que a marca antiga caiu.
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO whatsapp_messages (conversation_id, tenant_id, direction, body, enviado_por)
    VALUES (conversa, casa, 'outbound', 'x', 'corretor');
    RAISE EXCEPTION 'FALHOU: aceitou corretor sem dizer quem';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO whatsapp_messages (conversation_id, tenant_id, direction, body, enviado_por, sent_by_user_id)
  VALUES (conversa, casa, 'outbound', 'aqui é o corretor', 'corretor', corretor);
  RAISE NOTICE 'OK 2: corretor só com pessoa junto';

  -- ----------------------------------------------------------
  -- 3. NULO CONTINUA VALENDO — É "NÃO REGISTRADO"
  --
  -- Sem isto, as 2.159 mensagens sem marca que já existem em produção não
  -- poderiam nem ser inseridas de volta, e a migration quebraria no histórico.
  -- ----------------------------------------------------------
  INSERT INTO whatsapp_messages (conversation_id, tenant_id, direction, body)
  VALUES (conversa, casa, 'outbound', 'mensagem anônima de setembro');
  SELECT count(*) INTO n FROM whatsapp_messages
   WHERE conversation_id = conversa AND direction = 'outbound' AND enviado_por IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FALHOU: a mensagem sem autor não entrou'; END IF;
  RAISE NOTICE 'OK 3: sem autor é estado válido, não erro';

  -- ----------------------------------------------------------
  -- 4. ASSUMIR CALA A LIA, DEVOLVER SOLTA
  -- ----------------------------------------------------------
  IF lia_pode_falar(casa, lead) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: lead nunca assumido devia deixar a LIA falar';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', corretor, 'role', 'authenticated')::text, true);

  r := lia_assumir_conversa(casa, lead, true);
  IF r IS NULL OR (r ->> 'assumida') <> 'true' THEN
    RAISE EXCEPTION 'FALHOU: o corretor da casa não conseguiu assumir';
  END IF;
  IF lia_pode_falar(casa, lead) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU: assumida, a LIA ainda podia falar';
  END IF;

  -- Assumir duas vezes não cria duas linhas nem quebra.
  PERFORM lia_assumir_conversa(casa, lead, true);
  SELECT count(*) INTO n FROM lia_conversa_assumida WHERE tenant_id = casa AND lead_id = lead;
  IF n <> 1 THEN RAISE EXCEPTION 'FALHOU: assumir duas vezes criou % linhas', n; END IF;

  PERFORM lia_assumir_conversa(casa, lead, false);
  IF lia_pode_falar(casa, lead) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: devolvida, a LIA continuou calada';
  END IF;

  -- E dá para assumir de novo depois de devolver — a linha é reaproveitada.
  PERFORM lia_assumir_conversa(casa, lead, true);
  IF lia_pode_falar(casa, lead) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU: não deu para assumir de novo depois de devolver';
  END IF;
  RAISE NOTICE 'OK 4: assumir cala, devolver solta, e dá para repetir';

  -- ----------------------------------------------------------
  -- 5. QUEM É DE OUTRA IMOBILIÁRIA NÃO CALA A LIA DESTA
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', estranho, 'role', 'authenticated')::text, true);
  IF lia_assumir_conversa(casa, lead, false) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a vizinha devolveu uma conversa desta casa';
  END IF;
  -- E a conversa continua como estava.
  IF lia_pode_falar(casa, lead) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU: a vizinha conseguiu soltar a LIA desta casa';
  END IF;

  -- Nem lê a linha.
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM lia_conversa_assumida WHERE tenant_id = casa;
  RESET ROLE;
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: a vizinha leu quem assumiu conversa desta casa'; END IF;

  -- Sem ninguém logado (o servidor, ou anônimo) também não assume.
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF lia_assumir_conversa(casa, lead, true) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: assumiu sem usuário nenhum no token';
  END IF;

  -- E o caso que só a guarda de `auth.uid()` pega: `is_platform_owner()` lê o
  -- E-MAIL do token, não o `sub`. Um token com e-mail de dono e sem usuário
  -- passa pela permissão — e sem a guarda estoura no NOT NULL de
  -- `assumido_por` em vez de recusar limpo. Erro 500 onde devia haver "não
  -- pode" é o tipo de coisa que vira chamado às 3h.
  INSERT INTO platform_owners (email) VALUES ('dono@etiqueta.dev') ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claims', json_build_object(
    'role', 'authenticated', 'email', 'dono@etiqueta.dev')::text, true);
  IF public.is_platform_owner() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: o teste não montou o token de dono direito';
  END IF;
  BEGIN
    IF lia_assumir_conversa(casa, lead, true) IS NOT NULL THEN
      RAISE EXCEPTION 'FALHOU: dono sem usuário no token conseguiu assumir';
    END IF;
  EXCEPTION WHEN not_null_violation THEN
    RAISE EXCEPTION 'FALHOU: estourou no NOT NULL em vez de recusar limpo';
  END;
  RAISE NOTICE 'OK 5: só quem é da casa assume e devolve';

  -- ----------------------------------------------------------
  -- 6. ANÔNIMO NÃO CHEGA PERTO
  -- ----------------------------------------------------------
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM lia_conversa_assumida;
    RESET ROLE;
    RAISE EXCEPTION 'FALHOU: o anônimo tem permissão na tabela';
  EXCEPTION WHEN insufficient_privilege THEN RESET ROLE;
  END;
  RAISE NOTICE 'OK 6: o anônimo não tem permissão nenhuma';
END $$;

ROLLBACK;
