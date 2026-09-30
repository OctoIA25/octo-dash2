-- ============================================================
-- Todo aviso diz para quem foi — e, na cópia do gestor, sobre quem é —
-- com nome, cargo e equipe (20261002_destinatario_nos_avisos.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/destinatario_nos_avisos.test.sql
--
-- Roda numa transação e DESFAZ tudo. Cria o próprio tenant.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

DO $$
DECLARE
  t uuid := '7c5a0000-0000-4000-a000-000000000001';
  eq uuid := '7c5c0000-0000-4000-a000-000000000001';
  cargo_corretor uuid := '7c5e0000-0000-4000-a000-000000000001';
  gerente uuid := '7c5b0000-0000-4000-a000-000000000001';
  rafaela uuid := '7c5b0000-0000-4000-a000-000000000002';
  diretora uuid := '7c5b0000-0000-4000-a000-000000000003';
  n public.notifications%ROWTYPE;
  r record;
  v_erro text;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-destinatario', 'Teste Destinatário') ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (gerente, 'gil@teste-destinatario.dev', '{"name":"Gil Moraes"}'),
    (rafaela, 'rafaela@teste-destinatario.dev', '{"name":"Rafaela Nunes"}'),
    (diretora, 'helena@teste-destinatario.dev', '{"name":"Helena Prado"}')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.cargos (id, tenant_id, nome, role, nivel_acesso) VALUES (cargo_corretor, t, 'Corretor', 'corretor', 10);
  INSERT INTO public.teams (id, tenant_id, name, leader_user_id, leader_user_ids) VALUES (eq, t, 'Equipe Jardins', gerente, ARRAY[gerente]);
  INSERT INTO tenant_memberships (tenant_id, user_id, role, team_id, leader_user_id, cargo_id) VALUES
    (t, gerente, 'team_leader', eq, NULL, NULL),
    (t, rafaela, 'corretor', eq, gerente, cargo_corretor),
    (t, diretora, 'admin', NULL, NULL, NULL)
  ON CONFLICT DO NOTHING;

  -- 1. Aviso do sistema (como o cron grava, sem metadata): ganha o retrato de quem recebe.
  INSERT INTO notifications (tenant_id, user_id, title, type) VALUES (t, rafaela, 'Você foi bloqueado', 'blocked')
  RETURNING * INTO n;
  PERFORM pg_temp.checa(n.metadata->'destinatario' = '{"nome":"Rafaela Nunes","cargo":"Corretor","equipe":"Equipe Jardins"}'::jsonb,
    'destinatário com nome, cargo e equipe (veio ' || coalesce((n.metadata->'destinatario')::text, 'nada') || ')');

  -- 2. Cópia do gestor com sobre_user_id: ganha também o retrato de sobre quem é.
  INSERT INTO notifications (tenant_id, user_id, title, type, metadata)
  VALUES (t, gerente, 'Corretor bloqueado · Rafaela Nunes', 'blocked', jsonb_build_object('copia_gestor', true, 'sobre', 'Rafaela Nunes', 'sobre_user_id', rafaela))
  RETURNING * INTO n;
  PERFORM pg_temp.checa(n.metadata->'destinatario' = '{"nome":"Gil Moraes","cargo":"Gerência","equipe":"Equipe Jardins"}'::jsonb,
    'sem cargo, team_leader vira Gerência');
  PERFORM pg_temp.checa(n.metadata->'sobre_perfil' = '{"nome":"Rafaela Nunes","cargo":"Corretor","equipe":"Equipe Jardins"}'::jsonb,
    'cópia do gestor diz sobre quem é, com cargo e equipe');

  -- 3. Quem já manda o retrato não é sobrescrito; admin sem equipe fica só com o cargo.
  INSERT INTO notifications (tenant_id, user_id, title, type, metadata)
  VALUES (t, diretora, 'x', 'info', '{"destinatario":{"nome":"Outro"}}') RETURNING * INTO n;
  PERFORM pg_temp.checa(n.metadata->'destinatario'->>'nome' = 'Outro', 'retrato já enviado é mantido');
  INSERT INTO notifications (tenant_id, user_id, title, type) VALUES (t, diretora, 'y', 'info') RETURNING * INTO n;
  PERFORM pg_temp.checa(n.metadata->'destinatario' = '{"nome":"Helena Prado","cargo":"Diretoria"}'::jsonb,
    'admin sem equipe: nome e cargo, sem equipe (veio ' || (n.metadata->'destinatario')::text || ')');

  -- 4. sobre_user_id que não é uuid não quebra a gravação.
  INSERT INTO notifications (tenant_id, user_id, title, type, metadata)
  VALUES (t, gerente, 'z', 'info', '{"sobre_user_id":"lixo"}') RETURNING * INTO n;
  PERFORM pg_temp.checa(NOT (n.metadata ? 'sobre_perfil'), 'sobre_user_id inválido é ignorado');

  -- 5. Comunicado da LIA para uma pessoa, com cópia ao gestor: a cópia aponta sobre quem é.
  SELECT * INTO r FROM public.publicar_comunicado(t, 'lia', NULL, 'alerta', 'Lead esperando', 'x', 'importante',
    'pessoas', '{}', ARRAY['rafaela@teste-destinatario.dev'], true);
  SELECT * INTO n FROM notifications WHERE comunicado_id = r.comunicado_id AND user_id = gerente;
  PERFORM pg_temp.checa((n.metadata->>'sobre_user_id')::uuid = rafaela AND n.metadata->'sobre_perfil'->>'equipe' = 'Equipe Jardins',
    'cópia do comunicado leva sobre_user_id e o retrato (veio ' || n.metadata::text || ')');
  SELECT * INTO n FROM notifications WHERE comunicado_id = r.comunicado_id AND user_id = rafaela;
  PERFORM pg_temp.checa(n.metadata->'destinatario'->>'nome' = 'Rafaela Nunes', 'destinatário direto do comunicado');

  -- 6. Remetente de pessoa leva a equipe junto do cargo.
  SELECT * INTO r FROM public.publicar_comunicado(t, 'usuario', gerente, 'comunicado', 'Reunião', 'x', 'normal', 'equipes', ARRAY[eq]);
  SELECT * INTO n FROM notifications WHERE comunicado_id = r.comunicado_id AND user_id = rafaela;
  PERFORM pg_temp.checa(n.metadata->'remetente' = '{"tipo":"usuario","nome":"Gil Moraes","cargo":"Gerência","equipe":"Equipe Jardins"}'::jsonb,
    'remetente com cargo e equipe (veio ' || (n.metadata->'remetente')::text || ')');

  -- 7. A função interna não é executável por fora.
  PERFORM pg_temp.checa(NOT has_function_privilege('authenticated', 'public.perfil_de_aviso(uuid,uuid)', 'execute'),
    'authenticated não executa perfil_de_aviso');
  PERFORM pg_temp.checa(NOT has_function_privilege('anon', 'public.perfil_de_aviso(uuid,uuid)', 'execute'),
    'anon não executa perfil_de_aviso');

  RAISE NOTICE 'OK — destinatario_nos_avisos: todos os casos passaram';
END $$;

ROLLBACK;
