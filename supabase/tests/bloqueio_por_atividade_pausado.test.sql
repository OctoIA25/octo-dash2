-- ============================================================
-- Bloqueio por atividade pausado (20261020_bloqueio_por_atividade_pausado.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/bloqueio_por_atividade_pausado.test.sql
--
-- Roda numa transação e DESFAZ tudo. Sucesso = um NOTICE "OK" por bloco.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

INSERT INTO tenants (id, code, name) VALUES ('7f1a0000-0000-4000-a000-000000000001', 'teste-pausa', 'Teste Pausa');
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('7f1b0000-0000-4000-a000-000000000001', 'fabio@teste-pausa.dev', '{"name":"Fábio Teste"}');
INSERT INTO tenant_memberships (tenant_id, user_id, role, permissions)
VALUES ('7f1a0000-0000-4000-a000-000000000001', '7f1b0000-0000-4000-a000-000000000001', 'corretor', '{}');

-- Uma vencida e já avisada há 25h (era a que bloqueava) e uma vencida ainda sem aviso.
INSERT INTO agenda_eventos (id, tenant_id, corretor_email, titulo, data, horario, tipo, status, pending_notified_at) VALUES
  ('7f1c0000-0000-4000-a000-000000000001', '7f1a0000-0000-4000-a000-000000000001', 'fabio@teste-pausa.dev',
   'Retornar para o cliente', current_date - 3, '10:00', 'retornar_cliente', 'pendente', now() - interval '25 hours'),
  ('7f1c0000-0000-4000-a000-000000000002', '7f1a0000-0000-4000-a000-000000000001', 'fabio@teste-pausa.dev',
   'Visita agendada', current_date - 1, '10:00', 'visita_agendada', 'pendente', NULL);

SELECT public.processar_atividades_pendentes();

-- 1. Ninguém é bloqueado.
DO $$
DECLARE v jsonb;
BEGIN
  SELECT permissions INTO v FROM tenant_memberships
   WHERE user_id = '7f1b0000-0000-4000-a000-000000000001';
  PERFORM pg_temp.checa(COALESCE((v->>'bolsao_blocked_enabled')::boolean, false) = false,
    format('não bloqueia com atividade avisada há 25h (veio %s)', v));
  RAISE NOTICE 'OK 1: bloqueio pausado';
END $$;

-- 2. O aviso de vencida continua — e sem prometer bloqueio.
DO $$
DECLARE v text; n int;
BEGIN
  SELECT count(*), max(body) INTO n, v FROM notifications
   WHERE user_id = '7f1b0000-0000-4000-a000-000000000001' AND type = 'activity_pending';
  PERFORM pg_temp.checa(n = 1, format('um aviso de vencida (vieram %s)', n));
  PERFORM pg_temp.checa(v NOT ILIKE '%bloquead%', format('o aviso não fala em bloqueio (veio %s)', v));
  PERFORM pg_temp.checa(
    (SELECT pending_notified_at IS NOT NULL FROM agenda_eventos WHERE id = '7f1c0000-0000-4000-a000-000000000002'),
    'a visita vencida ficou marcada como avisada');
  RAISE NOTICE 'OK 2: aviso continua, sem ameaça de bloqueio';
END $$;

-- 3. Nenhum aviso de "você foi bloqueado".
DO $$
BEGIN
  PERFORM pg_temp.checa(NOT EXISTS (SELECT 1 FROM notifications
    WHERE user_id = '7f1b0000-0000-4000-a000-000000000001' AND type = 'blocked'), 'sem aviso de bloqueio');
  RAISE NOTICE 'OK 3: sem aviso de bloqueado';
END $$;

ROLLBACK;
