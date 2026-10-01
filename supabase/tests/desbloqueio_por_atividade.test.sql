-- ============================================================
-- Desbloqueio por atividade (20261014_desbloqueio_por_atividade_no_banco).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/desbloqueio_por_atividade.test.sql
--
-- O caso 2 é o defeito real: o corretor conclui a última atividade com o
-- PRÓPRIO login e continua bloqueado, porque a tela não tinha permissão de
-- gravar o desbloqueio. Aqui a conclusão roda como `authenticated`, igual à
-- tela, e não como postgres.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t   uuid := 'd1b10c00-0000-4000-a000-000000000001';
  t2  uuid := 'd1b10c00-0000-4000-a000-000000000002';
  adm uuid := 'd1b10c00-0000-4000-a000-0000000000a0';
  c1  uuid := 'd1b10c00-0000-4000-a000-0000000000c1';
  c2  uuid := 'd1b10c00-0000-4000-a000-0000000000c2';
  c3  uuid := 'd1b10c00-0000-4000-a000-0000000000c3';
  c4  uuid := 'd1b10c00-0000-4000-a000-0000000000c4';
  c5  uuid := 'd1b10c00-0000-4000-a000-0000000000c5';
  -- o que o laço 3 de processar_atividades_pendentes grava
  bloqueio jsonb := jsonb_build_object(
    'bolsao_blocked_enabled', true, 'bolsao_blocked_until', NULL,
    'bolsao_blocked_reason', 'atividade_pendente', 'bolsao_blocked_duration', 'indefinido');
  vencida timestamptz := now() - interval '30 hours';
  a1 uuid; a2 uuid; a_c2 uuid; a_c3 uuid; a_c4_velha uuid; a_c5 uuid; a_t2 uuid;
  p jsonb;
  n int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (adm, 'adm@desbloqueio.teste'), (c1, 'c1@desbloqueio.teste'),
    (c2, 'c2@desbloqueio.teste'), (c3, 'c3@desbloqueio.teste'),
    (c4, 'c4@desbloqueio.teste'), (c5, 'c5@desbloqueio.teste');
  INSERT INTO tenants (id, code, name) VALUES
    (t, 'teste-desbloqueio', 'Teste desbloqueio'),
    (t2, 'teste-desbloqueio-2', 'Teste desbloqueio 2');
  INSERT INTO tenant_memberships (tenant_id, user_id, role, permissions) VALUES
    (t, adm, 'admin', '{}'),
    (t, c1, 'corretor', bloqueio),
    (t, c2, 'corretor', bloqueio),
    (t, c3, 'corretor', bloqueio),
    (t, c4, 'corretor', bloqueio),
    -- bloqueio com outro motivo: não é deste gatilho
    (t, c5, 'corretor', bloqueio || '{"bolsao_blocked_reason": "manual"}'),
    -- o mesmo corretor em outra casa, bloqueado lá por pendência de lá
    (t2, c1, 'corretor', bloqueio);

  INSERT INTO agenda_eventos (tenant_id, corretor_email, titulo, data, horario, tipo, status, pending_notified_at)
  VALUES (t, 'C1@desbloqueio.teste', 'Retornar', current_date - 3, '10:00', 'retornar_cliente', 'pendente', vencida)
  RETURNING id INTO a1;
  INSERT INTO agenda_eventos (tenant_id, corretor_email, titulo, data, horario, tipo, status, pending_notified_at)
  VALUES (t, 'c1@desbloqueio.teste', 'Visita', current_date - 3, '11:00', 'visita_agendada', 'confirmado', vencida)
  RETURNING id INTO a2;
  INSERT INTO agenda_eventos (tenant_id, corretor_email, titulo, data, horario, tipo, status, pending_notified_at)
  VALUES (t2, 'c1@desbloqueio.teste', 'Retornar', current_date - 3, '10:00', 'retornar_cliente', 'pendente', vencida)
  RETURNING id INTO a_t2;
  INSERT INTO agenda_eventos (tenant_id, corretor_email, titulo, data, horario, tipo, status, pending_notified_at)
  VALUES (t, 'c2@desbloqueio.teste', 'Retornar', current_date - 3, '10:00', 'retornar_cliente', 'pendente', vencida)
  RETURNING id INTO a_c2;
  INSERT INTO agenda_eventos (tenant_id, corretor_email, titulo, data, horario, tipo, status, pending_notified_at)
  VALUES (t, 'c3@desbloqueio.teste', 'Retornar', current_date - 3, '10:00', 'retornar_cliente', 'pendente', vencida)
  RETURNING id INTO a_c3;
  INSERT INTO agenda_eventos (tenant_id, corretor_email, titulo, data, horario, tipo, status, pending_notified_at)
  VALUES (t, 'c4@desbloqueio.teste', 'Retornar', current_date - 3, '10:00', 'retornar_cliente', 'pendente', vencida)
  RETURNING id INTO a_c4_velha;
  -- cobrada há 2h: ainda dentro das 24h, não bloqueia ninguém sozinha
  INSERT INTO agenda_eventos (tenant_id, corretor_email, titulo, data, horario, tipo, status, pending_notified_at)
  VALUES (t, 'c4@desbloqueio.teste', 'Retornar', current_date, '00:00', 'retornar_cliente', 'pendente', now() - interval '2 hours');
  INSERT INTO agenda_eventos (tenant_id, corretor_email, titulo, data, horario, tipo, status, pending_notified_at)
  VALUES (t, 'c5@desbloqueio.teste', 'Retornar', current_date - 3, '10:00', 'retornar_cliente', 'pendente', vencida)
  RETURNING id INTO a_c5;

  -- ----------------------------------------------------------
  -- 1. AINDA DEVE, SEGUE BLOQUEADO.
  --
  -- O corretor conclui uma de duas atividades vencidas. A outra continua
  -- cobrada há mais de 24h: o bloqueio tem que ficar.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', c1::text, 'email', 'c1@desbloqueio.teste', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE agenda_eventos SET status = 'concluido' WHERE id = a1;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: o corretor nao conseguiu concluir a propria atividade (% linhas)', n;
  END IF;
  SELECT permissions INTO p FROM tenant_memberships WHERE tenant_id = t AND user_id = c1;
  IF (p->>'bolsao_blocked_enabled') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'FALHOU: liberou com uma atividade ainda vencida (permissions = %)', p;
  END IF;

  -- ----------------------------------------------------------
  -- 2. CONCLUIU TUDO COM O PRÓPRIO LOGIN, SAI DO BLOQUEIO.
  --
  -- O defeito de 01/10: aqui a tela tentava gravar o desbloqueio como
  -- corretor, a RLS recusava em silêncio e ele ficava preso.
  -- ----------------------------------------------------------
  SET LOCAL ROLE authenticated;
  UPDATE agenda_eventos SET status = 'concluido' WHERE id = a2;
  RESET ROLE;
  SELECT permissions INTO p FROM tenant_memberships WHERE tenant_id = t AND user_id = c1;
  IF (p->>'bolsao_blocked_enabled') IS DISTINCT FROM 'false'
     OR p->>'bolsao_blocked_reason' IS NOT NULL
     OR p->>'bolsao_blocked_duration' IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: concluiu tudo e continua bloqueado (permissions = %)', p;
  END IF;

  -- ----------------------------------------------------------
  -- 3. CADA CASA É UMA CASA.
  --
  -- O mesmo corretor, bloqueado na outra imobiliária por pendência de lá,
  -- não sai de lá porque concluiu aqui.
  -- ----------------------------------------------------------
  SELECT permissions INTO p FROM tenant_memberships WHERE tenant_id = t2 AND user_id = c1;
  IF (p->>'bolsao_blocked_enabled') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'FALHOU: concluir numa casa liberou o bloqueio da outra (permissions = %)', p;
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- ----------------------------------------------------------
  -- 4. ATIVIDADE APAGADA LIBERA.
  -- ----------------------------------------------------------
  DELETE FROM agenda_eventos WHERE id = a_c2;
  SELECT permissions INTO p FROM tenant_memberships WHERE tenant_id = t AND user_id = c2;
  IF (p->>'bolsao_blocked_enabled') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'FALHOU: a atividade sumiu e o bloqueio ficou (permissions = %)', p;
  END IF;

  -- ----------------------------------------------------------
  -- 5. ATIVIDADE PASSADA PARA OUTRO CORRETOR LIBERA QUEM A TINHA.
  --
  -- Na Lotus, Humberto ficou bloqueado sem nenhuma atividade cobrada no nome.
  -- ----------------------------------------------------------
  UPDATE agenda_eventos SET corretor_email = 'adm@desbloqueio.teste' WHERE id = a_c3;
  SELECT permissions INTO p FROM tenant_memberships WHERE tenant_id = t AND user_id = c3;
  IF (p->>'bolsao_blocked_enabled') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'FALHOU: a atividade foi para outro e o bloqueio ficou (permissions = %)', p;
  END IF;

  -- ----------------------------------------------------------
  -- 6. COBRADA HÁ MENOS DE 24H NÃO SEGURA O BLOQUEIO.
  --
  -- É a mesma condição que bloqueia: com ela sozinha a rotina não teria
  -- bloqueado, então ela também não impede a saída.
  -- ----------------------------------------------------------
  UPDATE agenda_eventos SET status = 'concluido' WHERE id = a_c4_velha;
  SELECT permissions INTO p FROM tenant_memberships WHERE tenant_id = t AND user_id = c4;
  IF (p->>'bolsao_blocked_enabled') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'FALHOU: uma cobranca de 2h segurou o bloqueio (permissions = %)', p;
  END IF;

  -- ----------------------------------------------------------
  -- 7. BLOQUEIO POR OUTRO MOTIVO NÃO É DESTE GATILHO.
  -- ----------------------------------------------------------
  UPDATE agenda_eventos SET status = 'concluido' WHERE id = a_c5;
  SELECT permissions INTO p FROM tenant_memberships WHERE tenant_id = t AND user_id = c5;
  IF (p->>'bolsao_blocked_enabled') IS DISTINCT FROM 'true'
     OR (p->>'bolsao_blocked_reason') IS DISTINCT FROM 'manual' THEN
    RAISE EXCEPTION 'FALHOU: liberou um bloqueio que nao era por atividade (permissions = %)', p;
  END IF;

  RAISE NOTICE 'desbloqueio_por_atividade: 7 casos passaram';
END $$;

ROLLBACK;
