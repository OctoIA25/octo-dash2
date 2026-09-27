-- Quem enxerga qual pergunta do plantão.
-- Cenário inteiro criado aqui e desfeito no fim: não depende de dado de ninguém.
BEGIN;

DO $$
DECLARE
  t uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid();
  u_lider_a uuid := gen_random_uuid();
  u_corr_a uuid := gen_random_uuid();
  u_lider_b uuid := gen_random_uuid();
  u_corr_b uuid := gen_random_uuid();
  time_a uuid := gen_random_uuid();
  time_b uuid := gen_random_uuid();
  r jsonb;

BEGIN
  INSERT INTO tenants (id, name, code) VALUES (t, 'Casa de Teste', 'teste-'||left(t::text,8));

  -- `user_profiles` e VIEW sobre auth.users: o nome sai de raw_user_meta_data.
  -- Inserir la e o unico jeito, e e o mesmo caminho do sistema de verdade.
  INSERT INTO auth.users (id, email, aud, role, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          raw_user_meta_data)
  SELECT x.id, x.id||'@teste.local', 'authenticated', 'authenticated', now(), now(), '', '', '', '',
         jsonb_build_object('name', 'Pessoa '||left(x.id::text,4))
    FROM (VALUES (u_admin),(u_lider_a),(u_corr_a),(u_lider_b),(u_corr_b)) AS x(id);

  INSERT INTO teams (id, tenant_id, name, leader_user_ids) VALUES
    (time_a, t, 'Time A', ARRAY[u_lider_a]),
    (time_b, t, 'Time B', ARRAY[u_lider_b]);

  INSERT INTO tenant_memberships (tenant_id, user_id, role, team_id, leader_user_id) VALUES
    (t, u_admin,   'admin',       NULL,   NULL),
    (t, u_lider_a, 'team_leader', time_a, NULL),
    (t, u_corr_a,  'corretor',    time_a, u_lider_a),
    (t, u_lider_b, 'team_leader', time_b, NULL),
    (t, u_corr_b,  'corretor',    time_b, u_lider_b);

  INSERT INTO lia_perguntas_corretor (id, tenant_id, pergunta, status, criado_em, corretor_id) VALUES
    ('t-lider-a', t, 'do lider A',  'pendente', now(), u_lider_a::text),
    ('t-corr-a',  t, 'do corretor A','pendente', now(), u_corr_a::text),
    ('t-lider-b', t, 'do lider B',  'pendente', now(), u_lider_b::text),
    ('t-corr-b',  t, 'do corretor B','pendente', now(), u_corr_b::text),
    ('t-orfa',    t, 'sem dono',    'pendente', now(), 'Fernanda Emilia');

  -- ---------- admin ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_admin,'role','authenticated')::text, true);
  r := public.plantao_fila(t, 'todas');
  IF jsonb_array_length(r->'linhas') <> 5 THEN
    RAISE EXCEPTION 'FALHOU: admin devia ver as 5, viu %', jsonb_array_length(r->'linhas'); END IF;
  IF (r->>'recorte') <> 'imobiliaria' THEN
    RAISE EXCEPTION 'FALHOU: recorte do admin veio %', r->>'recorte'; END IF;
  IF (r->'contadores'->>'sem_dono_oculto')::int <> 0 THEN
    RAISE EXCEPTION 'FALHOU: nada foi escondido do admin, mas diz %', r->'contadores'->>'sem_dono_oculto'; END IF;
  RAISE NOTICE 'OK 1: admin ve as 5, e nada lhe foi escondido';

  -- ---------- líder A ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_lider_a,'role','authenticated')::text, true);
  r := public.plantao_fila(t, 'todas');
  IF jsonb_array_length(r->'linhas') <> 2 THEN
    RAISE EXCEPTION 'FALHOU: lider A devia ver 2 (a sua e a do corretor A), viu %', jsonb_array_length(r->'linhas'); END IF;
  IF r::text LIKE '%do corretor B%' OR r::text LIKE '%do lider B%' THEN
    RAISE EXCEPTION 'FALHOU: lider A enxergou o time B'; END IF;
  IF r::text LIKE '%sem dono%' THEN
    RAISE EXCEPTION 'FALHOU: lider A enxergou a pergunta sem dono'; END IF;
  IF (r->>'recorte') <> 'equipe' THEN
    RAISE EXCEPTION 'FALHOU: recorte do lider veio %', r->>'recorte'; END IF;
  RAISE NOTICE 'OK 2: lider A ve a sua e a do seu corretor, e mais nada';

  -- ---------- os contadores usam o mesmo recorte ----------
  IF (r->'contadores'->>'aguardando')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: contador diz % e a lista tem 2 -- a tela se contradiria',
      r->'contadores'->>'aguardando'; END IF;
  IF (r->'contadores'->>'sem_dono_oculto')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: 1 sem dono foi escondida e a tela diz %',
      r->'contadores'->>'sem_dono_oculto'; END IF;
  RAISE NOTICE 'OK 3: contador bate com a lista, e a tela sabe quantas escondeu';

  -- ---------- corretor ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_corr_a,'role','authenticated')::text, true);
  r := public.plantao_fila(t, 'todas');
  IF jsonb_array_length(r->'linhas') <> 1 THEN
    RAISE EXCEPTION 'FALHOU: corretor devia ver so a sua, viu %', jsonb_array_length(r->'linhas'); END IF;
  IF (r->'linhas'->0->>'pergunta') <> 'do corretor A' THEN
    RAISE EXCEPTION 'FALHOU: corretor viu a pergunta errada: %', r->'linhas'->0->>'pergunta'; END IF;
  IF (r->>'recorte') <> 'proprias' THEN
    RAISE EXCEPTION 'FALHOU: recorte do corretor veio %', r->>'recorte'; END IF;
  RAISE NOTICE 'OK 4: corretor ve so a dele -- e nao mais que o proprio lider';

  -- ---------- time de vários gestores ----------
  UPDATE teams SET leader_user_ids = ARRAY[u_lider_a, u_lider_b] WHERE id = time_a;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_lider_b,'role','authenticated')::text, true);
  r := public.plantao_fila(t, 'todas');
  IF jsonb_array_length(r->'linhas') <> 4 THEN
    RAISE EXCEPTION 'FALHOU: lider B virou gestor do time A e devia ver 4, viu %', jsonb_array_length(r->'linhas'); END IF;
  RAISE NOTICE 'OK 5: o segundo gestor do time (leader_user_ids) tambem alcanca';

  -- ---------- de outra casa ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gen_random_uuid(),'role','authenticated')::text, true);
  IF public.plantao_fila(t, 'todas') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: quem nao e da casa recebeu resposta'; END IF;
  RAISE NOTICE 'OK 6: de fora da imobiliaria nao ve nada';
END $$;

ROLLBACK;
