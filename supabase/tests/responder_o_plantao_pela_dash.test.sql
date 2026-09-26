-- ============================================================
-- Responder o plantão pela Dash, e o aviso à LIA — 26/09
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/responder_o_plantao_pela_dash.test.sql
--
-- O caso 3 é o que sustenta o arquivo: dois gestores na mesma fila é o caso
-- COMUM, não o raro. Sem a guarda de "já respondida", o lead recebe duas
-- respostas e a segunda apaga a primeira da tela.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa uuid := 'deda0000-0000-4000-a000-00000000000e';
  quem uuid;
  pid  text := 'perg-teste-1';
  r    jsonb;
  ev   jsonb;
  n    int;
BEGIN
  SELECT user_id INTO quem FROM tenant_memberships LIMIT 1;
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-plantao', 'Casa do Plantao')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES (casa, quem, 'admin') ON CONFLICT DO NOTHING;

  INSERT INTO lia_perguntas_corretor
    (id, tenant_id, lead_id, lead_phone, pergunta, contexto, status, criado_em)
  VALUES (pid, casa, gen_random_uuid(), '5511999990000', 'Tem vaga coberta?',
          'imovel AP0687', 'pendente', now() - interval '2 hours');

  -- A RPC roda como o chamador; sem auth.uid() ela recusa por desenho.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', quem::text, 'role', 'authenticated')::text, true);

  -- ---------- 1. Responde, e o aviso sai junto ----------
  r := plantao_responder(pid, '  Sim, uma coberta por unidade.  ');
  IF (r->>'ok') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'FALHOU 1: nao respondeu -- %', r;
  END IF;

  IF (SELECT resposta_corretor FROM lia_perguntas_corretor WHERE id = pid)
     IS DISTINCT FROM 'Sim, uma coberta por unidade.' THEN
    RAISE EXCEPTION 'FALHOU 1b: a resposta nao foi gravada aparada';
  END IF;
  IF (SELECT status FROM lia_perguntas_corretor WHERE id = pid) IS DISTINCT FROM 'respondida' THEN
    RAISE EXCEPTION 'FALHOU 1c: o status nao virou respondida';
  END IF;
  RAISE NOTICE 'OK 1: respondeu, aparou o texto e virou respondida';

  -- ---------- 2. O AVISO, campo por campo ----------
  SELECT payload INTO ev FROM webhook_events
   WHERE event_type = 'plantao.respondida' AND source_id = pid;
  IF ev IS NULL THEN
    RAISE EXCEPTION 'FALHOU 2: nao enfileirou plantao.respondida';
  END IF;
  IF (ev->>'origem') IS DISTINCT FROM 'dash' THEN
    RAISE EXCEPTION 'FALHOU 2b: origem devia ser dash -- sem isso a LIA responde duas vezes';
  END IF;
  IF (ev->>'lead_phone') IS DISTINCT FROM '5511999990000'
     OR (ev->>'resposta') IS DISTINCT FROM 'Sim, uma coberta por unidade.'
     OR (ev->>'contexto') IS DISTINCT FROM 'imovel AP0687' THEN
    RAISE EXCEPTION 'FALHOU 2c: o payload combinado nao bate -- %', ev;
  END IF;
  -- Os cinco obrigatorios que a LIA listou.
  IF (ev->>'id') IS NULL OR (ev->>'tenant_id') IS NULL OR (ev->>'lead_phone') IS NULL
     OR (ev->>'resposta') IS NULL OR (ev->>'respondida_em') IS NULL THEN
    RAISE EXCEPTION 'FALHOU 2d: falta um dos cinco obrigatorios -- %', ev;
  END IF;
  RAISE NOTICE 'OK 2: o aviso saiu com origem=dash e os cinco obrigatorios';

  -- ---------- 3. O CASO QUE SUSTENTA O ARQUIVO ----------
  -- Segundo gestor na mesma fila. Nao responde de novo, e nao apaga a
  -- primeira resposta.
  r := plantao_responder(pid, 'Na verdade sao duas vagas.');
  IF (r->>'ok') IS DISTINCT FROM 'false' OR (r->>'motivo') IS DISTINCT FROM 'ja_respondida' THEN
    RAISE EXCEPTION 'FALHOU 3: respondeu duas vezes -- %', r;
  END IF;
  IF (SELECT resposta_corretor FROM lia_perguntas_corretor WHERE id = pid)
     IS DISTINCT FROM 'Sim, uma coberta por unidade.' THEN
    RAISE EXCEPTION 'FALHOU 3b: a segunda resposta apagou a primeira';
  END IF;
  SELECT count(*) INTO n FROM webhook_events
   WHERE event_type = 'plantao.respondida' AND source_id = pid;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FALHOU 3c: enfileirou % avisos para a mesma pergunta', n;
  END IF;
  RAISE NOTICE 'OK 3: o segundo gestor nao responde de novo, e nada e apagado';

  -- ---------- 4. Resposta vazia nao passa ----------
  INSERT INTO lia_perguntas_corretor (id, tenant_id, lead_id, lead_phone, pergunta, status, criado_em)
  VALUES ('perg-teste-2', casa, gen_random_uuid(), '5511999990002', 'Aceita pet?', 'pendente', now());
  r := plantao_responder('perg-teste-2', '   ');
  IF (r->>'motivo') IS DISTINCT FROM 'resposta_vazia' THEN
    RAISE EXCEPTION 'FALHOU 4: resposta em branco passou -- %', r;
  END IF;
  RAISE NOTICE 'OK 4: resposta em branco e recusada';

  -- ---------- 5. Pergunta de outra casa ----------
  r := plantao_responder('perg-que-nao-existe', 'qualquer coisa');
  IF (r->>'motivo') IS DISTINCT FROM 'pergunta_nao_encontrada' THEN
    RAISE EXCEPTION 'FALHOU 5: pergunta inexistente nao foi recusada -- %', r;
  END IF;
  RAISE NOTICE 'OK 5: pergunta inexistente e recusada';
END $$;

ROLLBACK;
