-- ============================================================
-- WhatsApp: leitura por usuário, busca no conteúdo e recrutamento (P1.9).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/whatsapp_filtros_e_leitura.test.sql
--
-- O caso 1 é o mais importante, e nasceu de um defeito real encontrado no
-- navegador: a função devolvia UMA LINHA POR CONVERSA e estourava o teto de
-- 1.000 linhas do PostgREST. A imobiliária tem 1.645 conversas; as 645
-- seguintes sumiam em silêncio, levando junto o estado de leitura e o vínculo
-- com candidato. Na tela, a aba Recrutamento mostrava zero com o candidato
-- cadastrado.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t  uuid := 'aaaaaaa1-1111-4111-a111-111111111111';
  u1 uuid := 'aaaaaaa2-2222-4111-a111-111111111111';
  u2 uuid := 'aaaaaaa3-3333-4111-a111-111111111111';
  cv_lida uuid; cv_cand uuid; cv_muda uuid;
  cand uuid;
  n int;
  r record;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u1, 'um@teste.dev'), (u2, 'dois@teste.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-wpp', 'Teste WPP') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES (t, u1, 'admin'), (t, u2, 'corretor') ON CONFLICT DO NOTHING;

  -- 40 conversas mudas, uma lida e uma de candidato.
  INSERT INTO whatsapp_conversations (tenant_id, contact_phone)
  SELECT t, '5511900' || lpad(i::text, 6, '0') FROM generate_series(1, 40) i;

  INSERT INTO whatsapp_conversations (tenant_id, contact_phone, last_message_at)
  VALUES (t, '5511988880001', now() - interval '1 hour') RETURNING id INTO cv_lida;
  INSERT INTO whatsapp_conversations (tenant_id, contact_phone, last_message_at)
  VALUES (t, '5511977770002', now() - interval '2 hours') RETURNING id INTO cv_cand;
  INSERT INTO whatsapp_conversations (tenant_id, contact_phone, last_message_at)
  VALUES (t, '5511966660003', now() - interval '3 hours') RETURNING id INTO cv_muda;

  INSERT INTO recrut_candidato (tenant_id, nome, telefone, estagio)
  VALUES (t, 'Candidata', '(11) 97777-0002', 'lead') RETURNING id INTO cand;

  INSERT INTO whatsapp_conversa_leitura (tenant_id, conversation_id, user_id, lida_em)
  VALUES (t, cv_lida, u1, now());

  -- ----------------------------------------------------------
  -- 1. SÓ AS LINHAS QUE DIZEM ALGUMA COISA.
  --
  -- Uma linha por conversa estouraria o teto de 1.000 do PostgREST numa
  -- imobiliária real, e a tela perderia em silêncio o que vem depois.
  -- ----------------------------------------------------------
  -- Como u1: `auth.uid()` nulo (postgres) nao casa leitura de ninguem, e o
  -- caso perderia o proprio sentido.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u1::text)::text, true);
  SELECT count(*) INTO n FROM whatsapp_conversas_extras(t);
  IF n <> 2 THEN
    RAISE EXCEPTION 'FALHOU: devolveu % linhas (esperava 2: a lida e a de candidato) de 43 conversas', n;
  END IF;

  -- ----------------------------------------------------------
  -- 2. A LEITURA É POR USUÁRIO.
  --
  -- Lida pelo gestor não é lida pelo corretor. Um contador único por conversa
  -- esconderia do corretor uma mensagem que ele nunca viu.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u2::text)::text, true);
  SELECT count(*) INTO n FROM whatsapp_conversas_extras(t) WHERE lida_em IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: a leitura de um usuario vazou para o outro (% linhas)', n;
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ----------------------------------------------------------
  -- 3. O CANDIDATO CASA MESMO COM O TELEFONE EM OUTRO FORMATO.
  --
  -- A base tem número com e sem o 55, com e sem o nono dígito, com e sem
  -- máscara. Comparar a string inteira não acharia ninguém.
  -- ----------------------------------------------------------
  SELECT * INTO r FROM whatsapp_conversas_extras(t) WHERE eh_recrutamento;
  IF r.conversation_id IS DISTINCT FROM cv_cand THEN
    RAISE EXCEPTION 'FALHOU: casou a conversa errada com o candidato';
  END IF;
  IF r.candidato_id IS DISTINCT FROM cand OR r.candidato_nome <> 'Candidata' THEN
    RAISE EXCEPTION 'FALHOU: nao devolveu o candidato para o botao "Ver candidato"';
  END IF;

  -- ----------------------------------------------------------
  -- 4. BUSCA NO CONTEÚDO DAS MENSAGENS.
  -- ----------------------------------------------------------
  INSERT INTO whatsapp_messages (tenant_id, conversation_id, direction, message_type, body, wa_timestamp)
  VALUES
    (t, cv_muda, 'inbound', 'text', 'Tenho interesse no Santa Ângela, qual o valor?', now()),
    (t, cv_lida, 'inbound', 'text', 'Bom dia', now());

  SELECT count(*) INTO n FROM whatsapp_busca_em_mensagens(t, 'santa âng');
  IF n <> 1 THEN RAISE EXCEPTION 'FALHOU: busca por pedaco de palavra achou %', n; END IF;

  SELECT count(*) INTO n FROM whatsapp_busca_em_mensagens(t, 'SANTA');
  IF n <> 1 THEN RAISE EXCEPTION 'FALHOU: busca ignorando caixa achou %', n; END IF;

  -- Menos de três letras não busca: varreria a tabela a cada tecla, e a tela
  -- já filtra por nome e telefone nesse caso.
  SELECT count(*) INTO n FROM whatsapp_busca_em_mensagens(t, 'sa');
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: termo curto disparou varredura'; END IF;

  SELECT count(*) INTO n FROM whatsapp_busca_em_mensagens(t, 'palavra que ninguem disse');
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: busca sem resultado devolveu %', n; END IF;

  -- ----------------------------------------------------------
  -- 5. ESCOPO DE IMOBILIÁRIA nas duas funções.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM whatsapp_conversas_extras('ffffffff-ffff-4fff-afff-ffffffffffff'::uuid);
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: extras vazaram para outra imobiliaria'; END IF;

  SELECT count(*) INTO n FROM whatsapp_busca_em_mensagens('ffffffff-ffff-4fff-afff-ffffffffffff'::uuid, 'santa');
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: busca vazou para outra imobiliaria'; END IF;

  -- ----------------------------------------------------------
  -- 6. A CHAVE DO NAVEGADOR NÃO LÊ A TABELA DE LEITURA.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name = 'whatsapp_conversa_leitura' AND grantee = 'anon';
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: anon tem % privilegio(s) na tabela de leitura', n; END IF;

  RAISE NOTICE 'whatsapp_filtros_e_leitura: 6 casos OK';
END $$;

ROLLBACK;
