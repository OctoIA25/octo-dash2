-- ============================================================
-- Ninguém grava notificação pelo navegador (20261001_notifications_fecha_insert.sql).
--
-- O furo que existia: a policy notifications_insert_tenant só conferia se o
-- AUTOR era da casa — qualquer corretor gravava aviso para qualquer colega,
-- com qualquer título. Com comunicados, isso forjaria "Diretoria · Ana".
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/notifications_sem_insert_direto.test.sql
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '7c3a0000-0000-4000-a000-000000000001';
  corretor uuid := '7c3b0000-0000-4000-a000-000000000001';
  colega uuid := '7c3b0000-0000-4000-a000-000000000002';
  v_resultado text;
  n int;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-sem-insert', 'Teste Sem Insert') ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email) VALUES (corretor, 'c@teste-sem-insert.dev'), (colega, 'k@teste-sem-insert.dev')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES (t, corretor, 'corretor'), (t, colega, 'corretor')
  ON CONFLICT DO NOTHING;
  -- Uma notificação legítima do corretor (gravada como faria o banco).
  INSERT INTO notifications (tenant_id, user_id, title, type) VALUES (t, corretor, 'Minha', 'info');

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', corretor, 'role', 'authenticated', 'email', 'c@teste-sem-insert.dev')::text, true);
  SET LOCAL ROLE authenticated;

  -- 1. Para o colega, fingindo ser a Diretoria: era o furo.
  BEGIN
    INSERT INTO notifications (tenant_id, user_id, title, type, metadata)
    VALUES (t, colega, 'Reunião cancelada', 'comunicado', '{"remetente":{"tipo":"usuario","nome":"Ana","cargo":"Diretoria"}}');
    v_resultado := 'gravou';
  EXCEPTION WHEN insufficient_privilege THEN v_resultado := 'negado';
  END;
  IF v_resultado IS DISTINCT FROM 'negado' THEN
    RESET ROLE;
    RAISE EXCEPTION 'FALHOU: o corretor gravou aviso para o colega (%)', v_resultado;
  END IF;

  -- 2. Nem para si mesmo: nenhuma tela precisa disso.
  BEGIN
    INSERT INTO notifications (tenant_id, user_id, title, type) VALUES (t, corretor, 'Eu', 'info');
    v_resultado := 'gravou';
  EXCEPTION WHEN insufficient_privilege THEN v_resultado := 'negado';
  END;
  IF v_resultado IS DISTINCT FROM 'negado' THEN
    RESET ROLE;
    RAISE EXCEPTION 'FALHOU: o corretor gravou aviso para si (%)', v_resultado;
  END IF;

  -- 3. O que a tela faz continua funcionando: ler, marcar lida, apagar a lida.
  SELECT count(*) INTO n FROM notifications WHERE tenant_id = t;
  IF n IS DISTINCT FROM 1 THEN RESET ROLE; RAISE EXCEPTION 'FALHOU: corretor devia ler 1 (a dele), leu %', n; END IF;
  UPDATE notifications SET read_at = now() WHERE tenant_id = t AND user_id = corretor;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n IS DISTINCT FROM 1 THEN RESET ROLE; RAISE EXCEPTION 'FALHOU: marcar como lida atualizou % linha(s)', n; END IF;
  DELETE FROM notifications WHERE tenant_id = t AND user_id = corretor AND read_at IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n IS DISTINCT FROM 1 THEN RESET ROLE; RAISE EXCEPTION 'FALHOU: limpar lidas apagou % linha(s)', n; END IF;

  RESET ROLE;
  RAISE NOTICE 'OK — notifications_sem_insert_direto: todos os casos passaram';
END $$;

-- 4. No catálogo, não só pelo efeito: nem anon nem authenticated têm INSERT.
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.notifications', 'INSERT')
     OR has_table_privilege('anon', 'public.notifications', 'INSERT')
     OR has_table_privilege('anon', 'public.notifications', 'SELECT') THEN
    RAISE EXCEPTION 'FALHOU: ainda há permissão de INSERT (ou anon lendo) em notifications';
  END IF;
  RAISE NOTICE 'OK — catálogo sem INSERT para anon/authenticated';
END $$;

ROLLBACK;
