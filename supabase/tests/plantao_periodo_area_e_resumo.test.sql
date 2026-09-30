-- Plantão: período, área e resumo — e quem pode responder e salvar na base.
-- Cenário inteiro criado aqui e desfeito no fim: não depende de dado de ninguém.
-- Asserções com IS DISTINCT FROM: `<>` não enxerga NULL e passaria cego.
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
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  -- 23:30 de ontem em São Paulo = 02:30 de HOJE em UTC. Quem cortar o dia em
  -- UTC põe esta pergunta no dia errado.
  ontem_2330 timestamptz := (hoje::timestamp - interval '30 minutes') AT TIME ZONE 'America/Sao_Paulo';
  r jsonb;
  ids text;
BEGIN
  INSERT INTO tenants (id, name, code) VALUES (t, 'Casa de Teste', 'teste-'||left(t::text,8));

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

  INSERT INTO lia_perguntas_corretor
    (id, tenant_id, pergunta, status, criado_em, respondida_em, resposta_corretor, corretor_id, lead_phone) VALUES
    -- 23:30 de três dias atrás: fica FORA de um período que começa em hoje-3.
    ('x-borda-antes', t, 'borda antes', 'respondida',
       ((hoje - 3)::timestamp - interval '30 minutes') AT TIME ZONE 'America/Sao_Paulo',
       ((hoje - 3)::timestamp) AT TIME ZONE 'America/Sao_Paulo', 'r', u_corr_a::text, NULL),
    ('x-ontem-2330', t, 'ontem 23h30', 'respondida', ontem_2330, ontem_2330 + interval '60 minutes',
       'resposta de uma hora', u_corr_a::text, NULL),
    ('x-a-velha', t, 'A velha', 'pendente', now() - interval '2 hours', NULL, NULL, u_corr_a::text, '5511999990001'),
    ('x-a-nova',  t, 'A nova',  'pendente', now() - interval '5 minutes', NULL, NULL, u_corr_a::text, NULL),
    ('x-b',       t, 'do B',    'pendente', now() - interval '10 minutes', NULL, NULL, u_corr_b::text, NULL),
    ('x-orfa',    t, 'sem dono', 'respondida', now() - interval '3 hours', now() - interval '1 hour',
       'resposta de duas horas', 'Fernanda Emilia', NULL);

  -- ---------- período ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_admin,'role','authenticated')::text, true);
  r := public.plantao_fila(t, 'todas', 200, NULL, hoje - 3, hoje);
  SELECT string_agg(l->>'id', ',' ORDER BY l->>'id') INTO ids FROM jsonb_array_elements(r->'linhas') l;
  IF ids IS DISTINCT FROM 'x-a-nova,x-a-velha,x-b,x-ontem-2330,x-orfa' THEN
    RAISE EXCEPTION 'FALHOU: periodo hoje-3..hoje devia trazer as 5 de dentro, trouxe %', ids; END IF;
  IF (r->'contadores'->>'na_janela')::int IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'FALHOU: contador do periodo diz %, a lista tem 5', r->'contadores'->>'na_janela'; END IF;
  RAISE NOTICE 'OK 1: o periodo corta no inicio do dia de Sao Paulo, e o contador acompanha';

  r := public.plantao_fila(t, 'todas', 200, NULL, hoje - 3, hoje - 1);
  IF r::text NOT LIKE '%x-ontem-2330%' THEN
    RAISE EXCEPTION 'FALHOU: o ultimo dia do periodo tem que entrar inteiro (ate 23h59 de Sao Paulo)'; END IF;
  IF r::text LIKE '%x-a-nova%' THEN
    RAISE EXCEPTION 'FALHOU: pergunta de hoje entrou num periodo que acaba ontem'; END IF;
  RAISE NOTICE 'OK 2: o dia final entra inteiro, e o seguinte nao';

  r := public.plantao_fila(t, 'todas', 200, NULL, hoje, hoje);
  IF r::text LIKE '%x-ontem-2330%' THEN
    RAISE EXCEPTION 'FALHOU: 23h30 de ontem (02h30 UTC de hoje) entrou em "hoje" -- o dia foi cortado em UTC'; END IF;
  RAISE NOTICE 'OK 3: 23h30 de ontem nao vira hoje por causa do UTC';

  -- ---------- resumo ----------
  r := public.plantao_fila(t, 'todas', 200, NULL, hoje - 3, hoje);
  IF (r->'contadores'->>'aguardando')::int IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: pendentes deviam ser 3, veio %', r->'contadores'->>'aguardando'; END IF;
  -- Régua padrão de 30 min: só a de 2 horas passou.
  IF (r->'contadores'->>'atrasadas')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: atrasadas deviam ser 1 (a de 2h), veio %', r->'contadores'->>'atrasadas'; END IF;
  -- Mediana de 60 e 120 minutos.
  IF (r->'contadores'->>'mediana_resposta_min')::int IS DISTINCT FROM 90 THEN
    RAISE EXCEPTION 'FALHOU: mediana devia ser 90 min, veio %', r->'contadores'->>'mediana_resposta_min'; END IF;
  RAISE NOTICE 'OK 4: resumo -- 3 pendentes, 1 atrasada, mediana de 90 min';

  -- ---------- cada linha diz a equipe e traz o telefone para abrir a conversa ----------
  SELECT l INTO r FROM jsonb_array_elements(
    public.plantao_fila(t, 'todas', 200, NULL, hoje - 3, hoje)->'linhas') l WHERE l->>'id' = 'x-a-velha';
  IF r->>'equipe_nome' IS DISTINCT FROM 'Time A' THEN
    RAISE EXCEPTION 'FALHOU: a linha devia dizer Time A, disse %', r->>'equipe_nome'; END IF;
  IF r->>'lead_telefone' IS DISTINCT FROM '5511999990001' THEN
    RAISE EXCEPTION 'FALHOU: sem o telefone do lead nao ha como abrir a conversa (veio %)', r->>'lead_telefone'; END IF;
  RAISE NOTICE 'OK 5: a linha diz a equipe e traz o telefone do lead';

  -- ---------- área ----------
  r := public.plantao_fila(t, 'todas', 200, NULL, hoje - 3, hoje, time_a::text);
  SELECT string_agg(l->>'id', ',' ORDER BY l->>'id') INTO ids FROM jsonb_array_elements(r->'linhas') l;
  IF ids IS DISTINCT FROM 'x-a-nova,x-a-velha,x-ontem-2330' THEN
    RAISE EXCEPTION 'FALHOU: filtro Time A trouxe %', ids; END IF;
  IF (r->'contadores'->>'na_janela')::int IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: o contador ignora o filtro de area (diz %)', r->'contadores'->>'na_janela'; END IF;
  RAISE NOTICE 'OK 6: filtro por area traz so a area, e o contador acompanha';

  r := public.plantao_fila(t, 'todas', 200, NULL, hoje - 3, hoje, 'sem_equipe');
  SELECT string_agg(l->>'id', ',' ORDER BY l->>'id') INTO ids FROM jsonb_array_elements(r->'linhas') l;
  IF ids IS DISTINCT FROM 'x-orfa' THEN
    RAISE EXCEPTION 'FALHOU: "sem equipe" devia trazer so a orfa, trouxe %', ids; END IF;
  RAISE NOTICE 'OK 7: "Sem equipe" junta as perguntas sem corretor identificado';

  -- As áreas que o admin pode escolher, com o total de cada uma ANTES do filtro.
  r := public.plantao_fila(t, 'todas', 200, NULL, hoje - 3, hoje, time_a::text);
  SELECT string_agg(e->>'nome' || '=' || (e->>'total'), ',' ORDER BY e->>'nome') INTO ids
    FROM jsonb_array_elements(r->'equipes') e;
  IF ids IS DISTINCT FROM 'Time A=3,Time B=1' OR NOT (r->'equipes' @> '[{"id":"sem_equipe","total":1}]') THEN
    RAISE EXCEPTION 'FALHOU: areas do admin vieram % / %', ids, r->'equipes'; END IF;
  RAISE NOTICE 'OK 8: o admin escolhe entre Time A, Time B e Sem equipe, com o total de cada';

  -- ---------- o filtro nunca amplia o recorte ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_corr_a,'role','authenticated')::text, true);
  r := public.plantao_fila(t, 'todas', 200, NULL, hoje - 3, hoje, time_b::text);
  IF jsonb_array_length(r->'linhas') IS DISTINCT FROM 0 OR r::text LIKE '%do B%' THEN
    RAISE EXCEPTION 'FALHOU: corretor A pediu o Time B e recebeu %', r->'linhas'; END IF;
  RAISE NOTICE 'OK 9: corretor pedindo a area alheia nao recebe nada dela';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_lider_a,'role','authenticated')::text, true);
  r := public.plantao_fila(t, 'todas', 200, NULL, hoje - 3, hoje);
  SELECT string_agg(e->>'id', ',' ORDER BY e->>'id') INTO ids FROM jsonb_array_elements(r->'equipes') e;
  IF ids IS DISTINCT FROM (SELECT string_agg(x, ',' ORDER BY x) FROM unnest(ARRAY[time_a::text, 'sem_equipe']) x) THEN
    RAISE EXCEPTION 'FALHOU: areas do lider A vieram % (so Time A e Sem equipe)', r->'equipes'; END IF;
  RAISE NOTICE 'OK 10: o lider so ve as areas do que ele enxerga';

  -- ---------- a chamada antiga continua valendo (front antigo durante o deploy) ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_admin,'role','authenticated')::text, true);
  r := public.plantao_fila(p_tenant_id => t, p_aba => 'todas', p_limite => 200, p_dias => 90);
  IF jsonb_array_length(r->'linhas') IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'FALHOU: chamada antiga (90 dias) devia trazer as 6, trouxe %', jsonb_array_length(r->'linhas'); END IF;
  RAISE NOTICE 'OK 11: a chamada antiga, sem datas, continua funcionando';

  -- ---------- responder: o corretor só responde as dele ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_corr_a,'role','authenticated')::text, true);
  r := public.plantao_responder('x-b', 'resposta intrusa');
  IF r->>'motivo' IS DISTINCT FROM 'sem_acesso' THEN
    RAISE EXCEPTION 'FALHOU: corretor A respondeu a pergunta do corretor B: %', r; END IF;
  IF (SELECT status FROM lia_perguntas_corretor WHERE id = 'x-b') IS DISTINCT FROM 'pendente' THEN
    RAISE EXCEPTION 'FALHOU: a pergunta do B mudou de status'; END IF;
  r := public.plantao_responder('x-a-nova', 'resposta minha');
  IF (r->>'ok')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: corretor A nao conseguiu responder a propria: %', r; END IF;
  RAISE NOTICE 'OK 12: corretor responde a propria e nao a do colega';

  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_lider_a,'role','authenticated')::text, true);
  r := public.plantao_responder('x-b', 'resposta do lider errado');
  IF r->>'motivo' IS DISTINCT FROM 'sem_acesso' THEN
    RAISE EXCEPTION 'FALHOU: lider A respondeu pergunta do Time B: %', r; END IF;
  RAISE NOTICE 'OK 13: lider nao responde pergunta de outra equipe';

  -- ---------- salvar na base: só a gestão ----------
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_corr_a,'role','authenticated')::text, true);
  r := public.plantao_salvar_na_base('x-ontem-2330', 'titulo', 'conteudo', NULL);
  IF r->>'motivo' IS DISTINCT FROM 'sem_acesso' THEN
    RAISE EXCEPTION 'FALHOU: corretor salvou na base (ensina a LIA para a casa inteira): %', r; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u_lider_a,'role','authenticated')::text, true);
  r := public.plantao_salvar_na_base('x-ontem-2330', 'titulo', 'conteudo', NULL);
  IF (r->>'ok')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: lider nao conseguiu salvar na base: %', r; END IF;
  RAISE NOTICE 'OK 14: corretor nao salva na base; o lider salva';
END $$;

ROLLBACK;
