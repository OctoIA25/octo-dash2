-- ============================================================
-- Visita da Lia na agenda (20261021_visitas_da_lia_na_agenda.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/visitas_da_lia_na_agenda.test.sql
--
-- Roda numa transação e DESFAZ tudo. Sucesso = um NOTICE "OK" por bloco.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

INSERT INTO tenants (id, code, name) VALUES ('7a1a0000-0000-4000-a000-000000000001', 'teste-visita', 'Teste Visita');
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('7a1b0000-0000-4000-a000-000000000001', 'marcos@tv.dev',    '{"name":"Marcos Lafratta"}'),
  ('7a1b0000-0000-4000-a000-000000000002', 'gabriele@tv.dev',  '{"name":"Gabriele Fávaro"}'),
  ('7a1b0000-0000-4000-a000-000000000003', 'humberto@tv.dev',  '{"name":"Humberto Martinez"}');
INSERT INTO tenant_memberships (tenant_id, user_id, role, permissions)
SELECT '7a1a0000-0000-4000-a000-000000000001', id, 'corretor', '{}'::jsonb FROM auth.users WHERE email LIKE '%@tv.dev';

INSERT INTO leads (id, tenant_id, name, phone, assigned_agent_id) VALUES
  ('7a1c0000-0000-4000-a000-000000000001', '7a1a0000-0000-4000-a000-000000000001', 'Cliente Um',   '5511900000001', '7a1b0000-0000-4000-a000-000000000003'),
  ('7a1c0000-0000-4000-a000-000000000002', '7a1a0000-0000-4000-a000-000000000001', 'Cliente Dois', '5511900000002', '7a1b0000-0000-4000-a000-000000000003'),
  ('7a1c0000-0000-4000-a000-000000000003', '7a1a0000-0000-4000-a000-000000000001', 'Cliente Três', '5511900000003', '7a1b0000-0000-4000-a000-000000000003');

CREATE FUNCTION pg_temp.evento(p_lead text, p_tipo text, p_desc text, p_meta jsonb) RETURNS void LANGUAGE sql AS $$
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, descricao, ator_tipo, metadata)
  VALUES ('7a1a0000-0000-4000-a000-000000000001', p_lead, 'leads', p_tipo, p_desc, 'lia', p_meta);
$$;

-- Plantão visita lead de outro; apelido; nome que não casa.
SELECT pg_temp.evento('7a1c0000-0000-4000-a000-000000000001', 'lia.visita_agendada',
  'Visita ao Auten Jundiaí em 2026-12-03 às 08:30, aguardando confirmação de Marcos Lafratta',
  '{"data":"2026-12-03","horario":"08:30","empreendimento":"Auten Jundiaí","visitaId":"v-1"}');
SELECT pg_temp.evento('7a1c0000-0000-4000-a000-000000000002', 'lia.visita_agendada',
  'Visita ao CA054 em 2026-12-05 às 10:30, aguardando confirmação de Gabi Favaro', '{}');
SELECT pg_temp.evento('7a1c0000-0000-4000-a000-000000000003', 'lia.visita_agendada',
  'Visita ao Gioviale em 2026-12-06 às 11:00, aguardando confirmação de Fulano de Tal', '{}');

-- 1. Cada visita vira atividade, na agenda de quem vai fazer a visita.
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(split_part(corretor_email, '@', 1) || ' ' || data || ' ' || horario || ' ' || titulo, ' | ' ORDER BY data) INTO v
    FROM agenda_eventos WHERE tenant_id = '7a1a0000-0000-4000-a000-000000000001' AND tipo = 'visita_agendada';
  PERFORM pg_temp.checa(v IS NOT DISTINCT FROM
    'marcos 2026-12-03 08:30 Visita — Auten Jundiaí | gabriele 2026-12-05 10:30 Visita — CA054 | humberto 2026-12-06 11:00 Visita — Gioviale',
    format('plantão, apelido e dono do lead de reserva (veio %s)', v));
  RAISE NOTICE 'OK 1: visita na agenda de quem visita (apelido casa; sem nome, vai ao dono)';
END $$;

-- 2. A mesma visita repetida não duplica.
SELECT pg_temp.evento('7a1c0000-0000-4000-a000-000000000001', 'lia.visita_agendada',
  'Visita ao Auten Jundiaí em 2026-12-03 às 08:30, aguardando confirmação de Marcos Lafratta',
  '{"data":"2026-12-03","horario":"08:30","empreendimento":"Auten Jundiaí","visitaId":"v-1"}');
DO $$
BEGIN
  PERFORM pg_temp.checa((SELECT count(*) FROM agenda_eventos WHERE lead_uuid = '7a1c0000-0000-4000-a000-000000000001') = 1,
    'evento repetido não duplica');
  RAISE NOTICE 'OK 2: sem duplicata';
END $$;

-- 3. Remarcar muda a data; confirmar marca confirmado; recusar cancela.
SELECT pg_temp.evento('7a1c0000-0000-4000-a000-000000000001', 'lia.visita_remarcada',
  'Visita ao Auten Jundiaí remarcada por Marcos Lafratta para 2026-12-04 às 14:00', '{"visitaId":"v-1","decisao":"remarcar"}');
SELECT pg_temp.evento('7a1c0000-0000-4000-a000-000000000001', 'lia.visita_confirmada',
  'Visita ao Auten Jundiaí confirmada por Marcos Lafratta para 2026-12-04 às 14:00', '{"visitaId":"v-1","decisao":"confirmar"}');
SELECT pg_temp.evento('7a1c0000-0000-4000-a000-000000000002', 'lia.visita_recusada',
  'Visita ao CA054 não confirmada por Gabriele Fávaro: já está em contato', '{}');
DO $$
DECLARE v1 text; v2 text;
BEGIN
  SELECT data || ' ' || horario || ' ' || status INTO v1 FROM agenda_eventos WHERE lead_uuid = '7a1c0000-0000-4000-a000-000000000001';
  SELECT status INTO v2 FROM agenda_eventos WHERE lead_uuid = '7a1c0000-0000-4000-a000-000000000002';
  PERFORM pg_temp.checa(v1 IS NOT DISTINCT FROM '2026-12-04 14:00 confirmado', format('remarcada + confirmada (veio %s)', v1));
  PERFORM pg_temp.checa(v2 IS NOT DISTINCT FROM 'cancelado', format('recusada cancela (veio %s)', v2));
  RAISE NOTICE 'OK 3: remarcar, confirmar e recusar acompanham';
END $$;

-- 4. Evento torto não derruba o registro da Lia.
SELECT pg_temp.evento('7a1c0000-0000-4000-a000-000000000003', 'lia.visita_agendada',
  'Visita ao X em data ruim', '{"data":"2026-99-99","horario":"10:00"}');
DO $$
BEGIN
  PERFORM pg_temp.checa(EXISTS (SELECT 1 FROM lead_events WHERE descricao = 'Visita ao X em data ruim'),
    'o evento da Lia foi gravado mesmo com a agenda falhando');
  RAISE NOTICE 'OK 4: falha na agenda não derruba a Lia';
END $$;

ROLLBACK;
