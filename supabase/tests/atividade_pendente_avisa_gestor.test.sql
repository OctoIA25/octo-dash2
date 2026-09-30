-- ============================================================
-- Atividade vencida e bloqueio chegam também a quem responde pelo corretor.
-- O lembrete de 1h continua só com o corretor.
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/atividade_pendente_avisa_gestor.test.sql
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7c1a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7c1b0000-0000-4000-a000-000000000001'::uuid AS gerente,
  '7c1b0000-0000-4000-a000-000000000002'::uuid AS corretor,
  '7c1b0000-0000-4000-a000-000000000003'::uuid AS diretora,
  '7c1b0000-0000-4000-a000-000000000004'::uuid AS sozinho;

INSERT INTO tenants (id, code, name) SELECT t, 'teste-avisa-gestor', 'Teste Avisa Gestor' FROM fx ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT gerente, 'gerente@teste-avisa.dev', '{"name":"Gil Gerente"}'::jsonb FROM fx
UNION ALL SELECT corretor, 'corretor@teste-avisa.dev', '{"name":"João Corretor"}'::jsonb FROM fx
UNION ALL SELECT diretora, 'diretora@teste-avisa.dev', '{"name":"Ana Diretora"}'::jsonb FROM fx
UNION ALL SELECT sozinho, 'sozinho@teste-avisa.dev', '{"name":"Sol Sozinho"}'::jsonb FROM fx
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.tenant_memberships (tenant_id, user_id, role, leader_user_id)
SELECT t, gerente, 'team_leader', NULL FROM fx
UNION ALL SELECT t, corretor, 'corretor', gerente FROM fx
UNION ALL SELECT t, diretora, 'admin', NULL FROM fx
UNION ALL SELECT t, sozinho, 'corretor', NULL FROM fx
ON CONFLICT (tenant_id, user_id) DO NOTHING;

CREATE FUNCTION pg_temp.atividade(p_email text, p_tipo text, p_data date, p_horario text) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.agenda_eventos (tenant_id, corretor_email, titulo, data, horario, tipo, status, lead_nome)
  SELECT t, p_email, 'Retorno Maria', p_data, p_horario, p_tipo, 'pendente', 'Maria' FROM fx
  RETURNING id
$$;
CREATE FUNCTION pg_temp.avisos(p_evento uuid, p_user uuid, p_type text) RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.notifications WHERE link_id = p_evento::text AND user_id = p_user AND type = p_type
$$;

DO $$
DECLARE
  f fx%ROWTYPE;
  v_vencida uuid;
  v_sozinho uuid;
  v_lembrete uuid;
  v_agora_sp timestamp := (now() AT TIME ZONE 'America/Sao_Paulo') + interval '30 minutes';
  n public.notifications%ROWTYPE;
BEGIN
  SELECT * INTO f FROM fx;
  v_vencida  := pg_temp.atividade('corretor@teste-avisa.dev', 'retornar_cliente', current_date - 3, '09:00');
  v_sozinho  := pg_temp.atividade('sozinho@teste-avisa.dev',  'visita_agendada',  current_date - 3, '09:00');
  v_lembrete := pg_temp.atividade('corretor@teste-avisa.dev', 'tarefa', v_agora_sp::date, to_char(v_agora_sp, 'HH24:MI'));

  PERFORM public.processar_atividades_pendentes();

  -- Laço 2: vencida
  PERFORM pg_temp.checa(pg_temp.avisos(v_vencida, f.corretor, 'activity_pending') = 1, 'corretor recebe a cobrança');
  PERFORM pg_temp.checa(pg_temp.avisos(v_vencida, f.gerente, 'activity_pending') = 1, 'o gerente dele recebe a cópia');
  PERFORM pg_temp.checa(pg_temp.avisos(v_vencida, f.diretora, 'activity_pending') = 0, 'com gerente, a Diretoria não recebe');
  SELECT * INTO n FROM public.notifications WHERE link_id = v_vencida::text AND user_id = f.gerente;
  PERFORM pg_temp.checa(n.title = 'Atividade pendente · João Corretor', 'título da cópia diz de quem é (veio ' || n.title || ')');
  PERFORM pg_temp.checa(n.body LIKE '"Retorno Maria" (Retorno ao lead) de João Corretor passou do prazo.%', 'corpo em terceira pessoa');
  PERFORM pg_temp.checa(n.metadata @> jsonb_build_object('copia_gestor', true, 'sobre', 'João Corretor', 'sobre_user_id', f.corretor, 'motivo', 'vencida'),
    'metadata da cópia');
  PERFORM pg_temp.checa(pg_temp.avisos(v_sozinho, f.diretora, 'activity_pending') = 1, 'sem gerente, a Diretoria recebe');

  -- Laço 1: lembrete não copia ninguém
  PERFORM pg_temp.checa(pg_temp.avisos(v_lembrete, f.corretor, 'activity_pending') = 1, 'lembrete chega ao corretor');
  PERFORM pg_temp.checa(pg_temp.avisos(v_lembrete, f.gerente, 'activity_pending') = 0, 'lembrete não vai para o gerente');

  -- Rodar de novo não duplica
  PERFORM public.processar_atividades_pendentes();
  PERFORM pg_temp.checa(pg_temp.avisos(v_vencida, f.gerente, 'activity_pending') = 1, 'segunda rodada não duplica a cópia');

  -- Laço 3: 24h depois da cobrança, bloqueio + cópia
  UPDATE public.agenda_eventos SET pending_notified_at = now() - interval '25 hours' WHERE id = v_vencida;
  PERFORM public.processar_atividades_pendentes();
  PERFORM pg_temp.checa(pg_temp.avisos(v_vencida, f.corretor, 'blocked') = 1, 'corretor recebe o bloqueio');
  SELECT * INTO n FROM public.notifications WHERE link_id = v_vencida::text AND user_id = f.gerente AND type = 'blocked';
  PERFORM pg_temp.checa(n.title = 'Corretor bloqueado · João Corretor', 'gerente sabe do bloqueio (veio ' || coalesce(n.title, 'nada') || ')');
  PERFORM public.processar_atividades_pendentes();
  PERFORM pg_temp.checa(pg_temp.avisos(v_vencida, f.gerente, 'blocked') = 1, 'bloqueio não se repete');

  RAISE NOTICE 'OK — atividade_pendente_avisa_gestor: todos os casos passaram';
END $$;

ROLLBACK;
