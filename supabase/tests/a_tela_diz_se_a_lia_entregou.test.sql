-- ============================================================
-- A tela diz o que a LIA fez com a resposta — 26/09
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/a_tela_diz_se_a_lia_entregou.test.sql
--
-- O caso 3 é o que sustenta o arquivo: a LIA devolve 200 com
-- `resultado: 'desconhecida'` e NINGUÉM recebeu. Antes disso a tela pintava
-- de "respondida" e o gestor ia embora achando o cliente atendido.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa uuid := 'deda0000-0000-4000-a000-00000000000f';
  quem uuid;
  fila jsonb;

  FUNCTION_ENTREGA text;
BEGIN
  SELECT user_id INTO quem FROM tenant_memberships LIMIT 1;
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-entrega', 'Casa da Entrega')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES (casa, quem, 'admin') ON CONFLICT DO NOTHING;

  INSERT INTO lia_perguntas_corretor (id, tenant_id, lead_id, lead_phone, pergunta, status, resposta_corretor, respondida_em, criado_em)
  VALUES
    ('e-aceita',  casa, gen_random_uuid(), '5511900000001', 'P1', 'respondida', 'R1', now(), now()),
    ('e-jaresol', casa, gen_random_uuid(), '5511900000002', 'P2', 'respondida', 'R2', now(), now()),
    ('e-naoachou',casa, gen_random_uuid(), '5511900000003', 'P3', 'respondida', 'R3', now(), now()),
    ('e-nafila',  casa, gen_random_uuid(), '5511900000004', 'P4', 'respondida', 'R4', now(), now()),
    ('e-dowhats', casa, gen_random_uuid(), '5511900000005', 'P5', 'respondida', 'R5', now(), now());

  INSERT INTO webhook_events (tenant_id, event_type, source_table, source_id, payload, status, response_body)
  VALUES
    (casa,'plantao.respondida','lia_perguntas_corretor','e-aceita','{}','delivered','{"received":true,"resultado":"aceita"}'),
    (casa,'plantao.respondida','lia_perguntas_corretor','e-jaresol','{}','delivered','{"ok":true,"resultado":"ja-resolvida","motivo":"corretor respondeu antes"}'),
    (casa,'plantao.respondida','lia_perguntas_corretor','e-naoachou','{}','delivered','{"ok":true,"resultado":"desconhecida"}'),
    (casa,'plantao.respondida','lia_perguntas_corretor','e-nafila','{}','pending', NULL);
  -- 'e-dowhats' de proposito SEM evento: e a resposta que veio pelo WhatsApp.

  SELECT plantao_fila(casa, 'respondidas', 90) INTO fila;

  -- 1. Aceita: a LIA leva ao lead.
  IF (SELECT l->>'entrega' FROM jsonb_array_elements(fila->'linhas') l
       WHERE l->>'id' = 'e-aceita') IS DISTINCT FROM 'entregue' THEN
    RAISE EXCEPTION 'FALHOU 1: aceita nao virou entregue';
  END IF;
  RAISE NOTICE 'OK 1: aceita -> entregue';

  -- 2. Ja resolvida: o lead NAO recebe este texto.
  IF (SELECT l->>'entrega' FROM jsonb_array_elements(fila->'linhas') l
       WHERE l->>'id' = 'e-jaresol') IS DISTINCT FROM 'ja_resolvida' THEN
    RAISE EXCEPTION 'FALHOU 2: ja-resolvida nao foi reconhecida';
  END IF;
  RAISE NOTICE 'OK 2: ja-resolvida -> ja_resolvida';

  -- 3. O CASO QUE SUSTENTA O ARQUIVO.
  -- 200, sucesso na fila, e NINGUEM recebeu.
  IF (SELECT l->>'entrega' FROM jsonb_array_elements(fila->'linhas') l
       WHERE l->>'id' = 'e-naoachou') IS DISTINCT FROM 'nao_achou' THEN
    RAISE EXCEPTION 'FALHOU 3: desconhecida passou por entregue -- a tela mentiria';
  END IF;
  RAISE NOTICE 'OK 3: desconhecida -> nao_achou, e a tela pode dizer isso';

  -- 4. Ainda na fila nao e entregue.
  IF (SELECT l->>'entrega' FROM jsonb_array_elements(fila->'linhas') l
       WHERE l->>'id' = 'e-nafila') IS DISTINCT FROM 'na_fila' THEN
    RAISE EXCEPTION 'FALHOU 4: pendente apareceu como entregue';
  END IF;
  RAISE NOTICE 'OK 4: pendente -> na_fila';

  -- 5. Resposta que veio pelo WhatsApp nao tem evento, e `entrega` e NULA --
  --    nunca "falhou". Dizer que falhou seria inventar um problema.
  IF (SELECT l->'entrega' FROM jsonb_array_elements(fila->'linhas') l
       WHERE l->>'id' = 'e-dowhats') IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'FALHOU 5: resposta do WhatsApp devia ter entrega nula, veio %',
      (SELECT l->'entrega' FROM jsonb_array_elements(fila->'linhas') l WHERE l->>'id' = 'e-dowhats');
  END IF;
  RAISE NOTICE 'OK 5: resposta do WhatsApp fica com entrega NULA, nao "falhou"';
END $$;

ROLLBACK;
