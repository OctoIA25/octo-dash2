-- ============================================================
-- A.2 — o que faltava no "Enviar notificação" (20261005_comunicados_cargo_leitura_ciente.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/comunicados_a2.test.sql
--
-- Roda numa transação e DESFAZ tudo. Cria o próprio tenant: não depende do dump.
-- Sucesso = um NOTICE "OK" por bloco. Falha = ERROR com "FALHOU: <caso>".
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

-- A casa T: diretora, dois gerentes, três corretores com cargo "Corretor", um
-- corretor sem equipe e sem cargo, e o owner da plataforma como membro (nunca
-- recebe). A casa T2 é a vizinha: nada dela pode entrar num comunicado de T.
CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7c1a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7c1a0000-0000-4000-a000-000000000002'::uuid AS t2,
  '7c1b0000-0000-4000-a000-000000000001'::uuid AS diretora,
  '7c1b0000-0000-4000-a000-000000000002'::uuid AS gerente_a,
  '7c1b0000-0000-4000-a000-000000000003'::uuid AS gerente_b,
  '7c1b0000-0000-4000-a000-000000000004'::uuid AS cor_a1,
  '7c1b0000-0000-4000-a000-000000000005'::uuid AS cor_a2,
  '7c1b0000-0000-4000-a000-000000000006'::uuid AS cor_b1,
  '7c1b0000-0000-4000-a000-000000000007'::uuid AS cor_sem,
  '7c1b0000-0000-4000-a000-000000000008'::uuid AS dono,
  '7c1b0000-0000-4000-a000-000000000009'::uuid AS vizinho,
  '7c1c0000-0000-4000-a000-000000000001'::uuid AS equipe_a,
  '7c1c0000-0000-4000-a000-000000000002'::uuid AS equipe_b,
  '7c1e0000-0000-4000-a000-000000000001'::uuid AS cargo_corretor,
  '7c1e0000-0000-4000-a000-000000000002'::uuid AS cargo_diretoria,
  '7c1e0000-0000-4000-a000-000000000009'::uuid AS cargo_vizinho,
  '7c1f0000-0000-4000-a000-000000000001'::uuid AS lanc_t,
  '7c1f0000-0000-4000-a000-000000000002'::uuid AS lanc_t2,
  '7c1f0000-0000-4000-a000-000000000011'::uuid AS mat_publicado,
  '7c1f0000-0000-4000-a000-000000000012'::uuid AS mat_rascunho,
  '7c1f0000-0000-4000-a000-000000000013'::uuid AS mat_t2;

INSERT INTO tenants (id, code, name)
SELECT t, 'teste-comunicados-a2', 'Teste A2' FROM fx
UNION ALL SELECT t2, 'teste-comunicados-a2-viz', 'Vizinha A2' FROM fx
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT v.id, v.email, v.meta FROM fx, LATERAL (VALUES
  (fx.diretora,  'diretora@teste-a2.dev',  '{"name":"Ana Diretora"}'::jsonb),
  (fx.gerente_a, 'gerente-a@teste-a2.dev', '{"name":"Gil Gerente"}'::jsonb),
  (fx.gerente_b, 'gerente-b@teste-a2.dev', '{"name":"Bia Gerente"}'::jsonb),
  (fx.cor_a1,    'joao-a1@teste-a2.dev',   '{"name":"João A1"}'::jsonb),
  (fx.cor_a2,    'rui-a2@teste-a2.dev',    '{"name":"Rui A2"}'::jsonb),
  (fx.cor_b1,    'teo-b1@teste-a2.dev',    '{"name":"Téo B1"}'::jsonb),
  (fx.cor_sem,   'sol@teste-a2.dev',       '{"name":"Sol Sem Equipe"}'::jsonb),
  (fx.dono,      'dono@teste-a2.dev',      NULL),
  (fx.vizinho,   'vizinho@teste-a2.dev',   '{"name":"Vic Vizinho"}'::jsonb)
) AS v(id, email, meta)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.platform_owners (email) VALUES ('dono@teste-a2.dev') ON CONFLICT DO NOTHING;

INSERT INTO public.cargos (id, tenant_id, nome, role, nivel_acesso)
SELECT cargo_corretor, t, 'Corretor', 'corretor', 10 FROM fx
UNION ALL SELECT cargo_diretoria, t, 'Diretoria Comercial', 'admin', 100 FROM fx
UNION ALL SELECT cargo_vizinho, t2, 'Corretor da Vizinha', 'corretor', 10 FROM fx;

INSERT INTO public.teams (id, tenant_id, name, leader_user_id, leader_user_ids)
SELECT equipe_a, t, 'Equipe A', gerente_a, ARRAY[gerente_a] FROM fx
UNION ALL SELECT equipe_b, t, 'Equipe B', gerente_b, ARRAY[gerente_b] FROM fx;

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, team_id, leader_user_id, cargo_id)
SELECT t, diretora,  'admin',       NULL::uuid, NULL::uuid, cargo_diretoria FROM fx
UNION ALL SELECT t, gerente_a, 'team_leader', equipe_a, NULL,      NULL           FROM fx
UNION ALL SELECT t, gerente_b, 'team_leader', equipe_b, NULL,      NULL           FROM fx
UNION ALL SELECT t, cor_a1,    'corretor',    equipe_a, gerente_a, cargo_corretor FROM fx
UNION ALL SELECT t, cor_a2,    'corretor',    equipe_a, NULL,      cargo_corretor FROM fx
UNION ALL SELECT t, cor_b1,    'corretor',    equipe_b, gerente_b, cargo_corretor FROM fx
UNION ALL SELECT t, cor_sem,   'corretor',    NULL,     NULL,      NULL           FROM fx
UNION ALL SELECT t, dono,      'admin',       NULL,     NULL,      cargo_corretor FROM fx
UNION ALL SELECT t2, vizinho,  'admin',       NULL,     NULL,      cargo_vizinho  FROM fx
ON CONFLICT (tenant_id, user_id) DO NOTHING;

INSERT INTO public.lancamentos (id, tenant_id, nome)
SELECT lanc_t, t, 'Reserva Teste' FROM fx
UNION ALL SELECT lanc_t2, t2, 'Reserva da Vizinha' FROM fx;

INSERT INTO public.materiais (id, tenant_id, titulo, ativo, publicado_em)
SELECT mat_publicado, t, 'Plano de carreira', true, now() FROM fx
UNION ALL SELECT mat_rascunho, t, 'Regimento (rascunho)', true, NULL FROM fx
UNION ALL SELECT mat_t2, t2, 'Material da vizinha', true, now() FROM fx;

-- Executa uma chamada como uma pessoa logada; devolve o resultado ou a mensagem de erro.
CREATE FUNCTION pg_temp.como(p_user uuid, p_email text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'email', p_email)::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.entregas(p_comunicado uuid) RETURNS uuid[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(user_id ORDER BY user_id), '{}') FROM public.notifications WHERE comunicado_id = p_comunicado
$$;
-- Um id que tinha que ter saído do envio; se veio erro, FALHOU com o erro.
CREATE FUNCTION pg_temp.id(p text, p_caso text) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  IF p IS NULL OR p !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'FALHOU: % (veio %)', p_caso, coalesce(p, 'nada'); END IF;
  RETURN p::uuid;
END $$;
CREATE FUNCTION pg_temp.ids(VARIADIC p uuid[]) RETURNS uuid[] LANGUAGE sql AS $$
  SELECT array_agg(x ORDER BY x) FROM unnest(p) x
$$;

-- ----------------------------------------------------------
-- 1. Público por cargo e por pessoa, pela tela
-- ----------------------------------------------------------
DO $$
DECLARE f fx%ROWTYPE; v text; v_id uuid;
BEGIN
  SELECT * INTO f FROM fx;

  -- "Todos os Corretores" chega nos corretores e em mais ninguém — nem no owner,
  -- que tem o mesmo cargo na casa.
  v := pg_temp.como(f.diretora, 'diretora@teste-a2.dev', format(
    $s$select comunicado_id::text from public.enviar_comunicado(%L, 'Aviso', 'Texto', 'normal', 'cargos', '{}', NULL, ARRAY[%L]::uuid[])$s$,
    f.t, f.cargo_corretor));
  v_id := pg_temp.id(v, 'diretoria envia por cargo');
  PERFORM pg_temp.checa(pg_temp.entregas(v_id) = pg_temp.ids(f.cor_a1, f.cor_a2, f.cor_b1),
    'cargo Corretor: só os três corretores, sem o owner e sem a diretora (veio ' || pg_temp.entregas(v_id)::text || ')');
  PERFORM pg_temp.checa((SELECT DISTINCT metadata->>'publico' FROM public.notifications WHERE comunicado_id = v_id) = 'Corretor',
    'o rótulo do público é o nome do cargo');

  v := pg_temp.como(f.diretora, 'diretora@teste-a2.dev', format(
    $s$select destinatarios::text from public.enviar_comunicado(%L, 'Aviso', 'Texto', 'normal', 'cargos', '{}', NULL, ARRAY[%L]::uuid[])$s$,
    f.t, f.cargo_vizinho));
  PERFORM pg_temp.checa(v = 'cargo_invalido', 'cargo da vizinha = cargo_invalido (veio ' || v || ')');

  v := pg_temp.como(f.gerente_a, 'gerente-a@teste-a2.dev', format(
    $s$select destinatarios::text from public.enviar_comunicado(%L, 'Aviso', 'Texto', 'normal', 'cargos', '{}', NULL, ARRAY[%L]::uuid[])$s$,
    f.t, f.cargo_corretor));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'gerente não envia por cargo (veio ' || v || ')');

  -- Pessoas: a Diretoria escolhe qualquer um da casa.
  v := pg_temp.como(f.diretora, 'diretora@teste-a2.dev', format(
    $s$select comunicado_id::text from public.enviar_comunicado(%L, 'Aviso', 'Texto', 'normal', 'pessoas', '{}', NULL, '{}', ARRAY[%L, %L]::uuid[])$s$,
    f.t, f.cor_sem, f.cor_b1));
  PERFORM pg_temp.checa(pg_temp.entregas(pg_temp.id(v, 'diretoria envia para pessoas')) = pg_temp.ids(f.cor_sem, f.cor_b1), 'diretoria envia para duas pessoas escolhidas');

  v := pg_temp.como(f.diretora, 'diretora@teste-a2.dev', format(
    $s$select destinatarios::text from public.enviar_comunicado(%L, 'Aviso', 'Texto', 'normal', 'pessoas', '{}', NULL, '{}', ARRAY[%L]::uuid[])$s$,
    f.t, f.vizinho));
  PERFORM pg_temp.checa(v = 'destinatario_desconhecido', 'pessoa da vizinha = destinatario_desconhecido (veio ' || v || ')');

  -- Gerente: só quem responde a ele.
  v := pg_temp.como(f.gerente_a, 'gerente-a@teste-a2.dev', format(
    $s$select comunicado_id::text from public.enviar_comunicado(%L, 'Aviso', 'Texto', 'normal', 'pessoas', '{}', NULL, '{}', ARRAY[%L]::uuid[])$s$,
    f.t, f.cor_a2));
  PERFORM pg_temp.checa(pg_temp.entregas(pg_temp.id(v, 'gerente envia para pessoa da equipe dele')) = ARRAY[f.cor_a2], 'gerente envia para uma pessoa da equipe dele (veio ' || v || ')');

  v := pg_temp.como(f.gerente_a, 'gerente-a@teste-a2.dev', format(
    $s$select destinatarios::text from public.enviar_comunicado(%L, 'Aviso', 'Texto', 'normal', 'pessoas', '{}', NULL, '{}', ARRAY[%L, %L]::uuid[])$s$,
    f.t, f.cor_a1, f.cor_b1));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'gerente não envia para pessoa de outra equipe, nem misturada (veio ' || v || ')');

  v := pg_temp.como(f.cor_a1, 'joao-a1@teste-a2.dev', format(
    $s$select destinatarios::text from public.enviar_comunicado(%L, 'Aviso', 'Texto', 'normal', 'pessoas', '{}', NULL, '{}', ARRAY[%L]::uuid[])$s$,
    f.t, f.cor_a2));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'corretor não envia (veio ' || v || ')');

  RAISE NOTICE 'OK 1: público por cargo e por pessoa';
END $$;

-- ----------------------------------------------------------
-- 2. Prévia: quantos e quem, sem gravar nada
-- ----------------------------------------------------------
DO $$
DECLARE f fx%ROWTYPE; v text; v_antes int;
BEGIN
  SELECT * INTO f FROM fx;
  v_antes := (SELECT count(*) FROM public.comunicados WHERE tenant_id = f.t);

  v := pg_temp.como(f.gerente_a, 'gerente-a@teste-a2.dev', format(
    $s$select string_agg(nome || '/' || coalesce(cargo, '-') || '/' || coalesce(equipe, '-'), ', ' order by nome)
         from public.previa_comunicado(%L, 'equipes', ARRAY[%L]::uuid[])$s$, f.t, f.equipe_a));
  PERFORM pg_temp.checa(v = 'João A1/Corretor/Equipe A, Rui A2/Corretor/Equipe A',
    'prévia da equipe A: os dois corretores com cargo e equipe, sem o próprio gerente (veio ' || coalesce(v, 'nada') || ')');

  v := pg_temp.como(f.diretora, 'diretora@teste-a2.dev', format(
    $s$select count(*)::text from public.previa_comunicado(%L, 'todos')$s$, f.t));
  PERFORM pg_temp.checa(v = '6', 'prévia da casa: 6 pessoas, sem a diretora e sem o owner (veio ' || v || ')');

  v := pg_temp.como(f.gerente_a, 'gerente-a@teste-a2.dev', format(
    $s$select count(*)::text from public.previa_comunicado(%L, 'equipes', ARRAY[%L]::uuid[])$s$, f.t, f.equipe_b));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'gerente não vê a prévia de equipe alheia (veio ' || v || ')');

  PERFORM pg_temp.checa((SELECT count(*) FROM public.comunicados WHERE tenant_id = f.t) = v_antes, 'prévia não grava comunicado');

  RAISE NOTICE 'OK 2: prévia';
END $$;

-- ----------------------------------------------------------
-- 3. Abrir ao tocar: lançamento, material, Metas, Bolsão
-- ----------------------------------------------------------
CREATE FUNCTION pg_temp.enviar_link(p_tipo text, p_id text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.como((SELECT diretora FROM fx), 'diretora@teste-a2.dev', format(
    $s$select comunicado_id::text from public.enviar_comunicado(%L, 'Aviso', 'Texto', 'normal', 'todos', '{}', NULL, '{}', '{}', %L, %L)$s$,
    (SELECT t FROM fx), p_tipo, p_id))
$$;

DO $$
DECLARE f fx%ROWTYPE; v text;
BEGIN
  SELECT * INTO f FROM fx;

  v := pg_temp.enviar_link('lancamento', f.lanc_t::text);
  PERFORM pg_temp.checa((SELECT DISTINCT link_type || ':' || link_id FROM public.notifications WHERE comunicado_id = pg_temp.id(v, 'envia com lançamento'))
    = 'lancamento:' || f.lanc_t, 'lançamento da casa vai no link de cada entrega (veio ' || v || ')');
  v := pg_temp.enviar_link('lancamento', f.lanc_t2::text);
  PERFORM pg_temp.checa(v = 'lancamento_nao_encontrado', 'lançamento da vizinha (veio ' || v || ')');

  v := pg_temp.enviar_link('material', f.mat_publicado::text);
  PERFORM pg_temp.checa(v ~ '^[0-9a-f-]{36}$', 'material publicado passa (veio ' || v || ')');
  v := pg_temp.enviar_link('material', f.mat_rascunho::text);
  PERFORM pg_temp.checa(v = 'material_nao_encontrado', 'material em rascunho não vira destino (veio ' || v || ')');
  v := pg_temp.enviar_link('material', f.mat_t2::text);
  PERFORM pg_temp.checa(v = 'material_nao_encontrado', 'material da vizinha (veio ' || v || ')');

  v := pg_temp.enviar_link('metas', NULL);
  PERFORM pg_temp.checa((SELECT DISTINCT link_type || ':' || coalesce(link_id, 'sem id') FROM public.notifications WHERE comunicado_id = pg_temp.id(v, 'envia com Metas'))
    = 'metas:sem id', 'Metas vai sem id (veio ' || v || ')');
  v := pg_temp.enviar_link('bolsao', NULL);
  PERFORM pg_temp.checa(v ~ '^[0-9a-f-]{36}$', 'Bolsão vai sem id (veio ' || v || ')');

  v := pg_temp.enviar_link('metas', f.lanc_t::text);
  PERFORM pg_temp.checa(v LIKE '%comunicados_link_check%', 'Metas com id é recusado pelo banco (veio ' || v || ')');
  v := pg_temp.enviar_link('site', 'https://x.dev');
  PERFORM pg_temp.checa(v LIKE '%comunicados_link_check%', 'destino fora da lista (URL livre) é recusado (veio ' || v || ')');

  RAISE NOTICE 'OK 3: abrir ao tocar';
END $$;

-- ----------------------------------------------------------
-- 4. Exige ciente: não sai do sino sem o "Ciente"
-- ----------------------------------------------------------
DO $$
DECLARE f fx%ROWTYPE; v text; v_id uuid; v_notif uuid; v_outra uuid;
BEGIN
  SELECT * INTO f FROM fx;

  v := pg_temp.como(f.diretora, 'diretora@teste-a2.dev', format(
    $s$select comunicado_id::text from public.enviar_comunicado(%L, 'Plantão', 'Leiam', 'importante', 'equipes', ARRAY[%L]::uuid[], NULL,
         '{}', '{}', NULL, NULL, true)$s$, f.t, f.equipe_a));
  v_id := pg_temp.id(v, 'envia com ciente');
  SELECT id INTO v_notif FROM public.notifications WHERE comunicado_id = v_id AND user_id = f.cor_a1;
  SELECT id INTO v_outra FROM public.notifications WHERE comunicado_id = v_id AND user_id = f.cor_a2;
  PERFORM pg_temp.checa((SELECT metadata->>'exige_ciente' FROM public.notifications WHERE id = v_notif) = 'true',
    'a entrega leva exige_ciente');

  -- "Marcar tudo como lido", do jeito que a tela faz: não tira do sino.
  v := pg_temp.como(f.cor_a1, 'joao-a1@teste-a2.dev', format(
    $s$with u as (update public.notifications set read_at = now() where user_id = %L and read_at is null returning 1)
       select count(*)::text from u$s$, f.cor_a1));
  PERFORM pg_temp.checa((SELECT read_at FROM public.notifications WHERE id = v_notif) IS NULL,
    'marcar como lida não lê o aviso que pede ciente (update devolveu ' || v || ')');

  -- Quem recebe não mexe no resto da linha: nem no exige_ciente, nem no ciente_em.
  v := pg_temp.como(f.cor_a1, 'joao-a1@teste-a2.dev', format(
    $s$update public.notifications set metadata = '{}' where id = %L returning 'passou'$s$, v_notif));
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'corretor não edita a metadata do aviso (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.cor_a1, 'joao-a1@teste-a2.dev', format(
    $s$update public.notifications set ciente_em = now() where id = %L returning 'passou'$s$, v_notif));
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'corretor não grava ciente_em direto (veio ' || coalesce(v, 'nada') || ')');

  -- O ciente de outra pessoa não passa.
  v := pg_temp.como(f.cor_a1, 'joao-a1@teste-a2.dev', format($s$select public.dar_ciente(%L)::text$s$, v_outra));
  PERFORM pg_temp.checa(v IS NULL AND (SELECT ciente_em FROM public.notifications WHERE id = v_outra) IS NULL,
    'ninguém dá ciente pelo colega');

  -- O Ciente: lê e registra quando.
  v := pg_temp.como(f.cor_a1, 'joao-a1@teste-a2.dev', format($s$select public.dar_ciente(%L)::text$s$, v_notif));
  PERFORM pg_temp.checa(v IS NOT NULL, 'dar_ciente devolve quando');
  PERFORM pg_temp.checa((SELECT ciente_em IS NOT NULL AND read_at IS NOT NULL FROM public.notifications WHERE id = v_notif),
    'ciente marca ciente_em e read_at juntos');

  -- Aviso comum continua sendo lido pelo "marcar como lida".
  v := pg_temp.como(f.diretora, 'diretora@teste-a2.dev', format(
    $s$select comunicado_id::text from public.enviar_comunicado(%L, 'Comum', 'Texto', 'normal', 'equipes', ARRAY[%L]::uuid[], NULL)$s$,
    f.t, f.equipe_b));
  PERFORM pg_temp.como(f.cor_b1, 'teo-b1@teste-a2.dev', format(
    $s$update public.notifications set read_at = now() where comunicado_id = %L returning 'ok'$s$, v));
  PERFORM pg_temp.checa((SELECT read_at FROM public.notifications WHERE comunicado_id = pg_temp.id(v, 'envia sem ciente') AND user_id = f.cor_b1) IS NOT NULL,
    'aviso sem ciente continua sendo marcado como lido');

  PERFORM pg_temp.checa(NOT has_function_privilege('anon', 'public.dar_ciente(uuid)', 'execute'), 'anon não executa dar_ciente');

  RAISE NOTICE 'OK 4: exige ciente';
END $$;

-- ----------------------------------------------------------
-- 5. Enviados e quem leu, nome por nome
-- ----------------------------------------------------------
DO $$
DECLARE f fx%ROWTYPE; v text; v_id uuid;
BEGIN
  SELECT * INTO f FROM fx;

  v := pg_temp.como(f.gerente_b, 'gerente-b@teste-a2.dev', format(
    $s$select comunicado_id::text from public.enviar_comunicado(%L, 'Da Bia', 'Texto', 'normal', 'equipes', ARRAY[%L]::uuid[], NULL)$s$,
    f.t, f.equipe_b));
  v_id := pg_temp.id(v, 'gerente envia para a própria equipe');
  UPDATE public.notifications SET read_at = now() WHERE comunicado_id = v_id AND user_id = f.cor_b1;

  -- A diretoria vê todos os da casa; o gerente, só os dele; o corretor, nada.
  v := pg_temp.como(f.diretora, 'diretora@teste-a2.dev', format(
    $s$select count(*)::text from public.comunicados_enviados(%L)$s$, f.t));
  PERFORM pg_temp.checa(v::int = (SELECT count(*) FROM public.comunicados WHERE tenant_id = f.t),
    'diretoria vê todos os comunicados da casa (veio ' || v || ')');
  v := pg_temp.como(f.gerente_b, 'gerente-b@teste-a2.dev', format(
    $s$select string_agg(titulo || ':' || remetente || ':' || publico || ':' || leram || '/' || destinatarios, ', ')
         from public.comunicados_enviados(%L)$s$, f.t));
  PERFORM pg_temp.checa(v = 'Da Bia:Bia Gerente:Equipe B:1/1', 'gerente vê só o dele, com 1 de 1 lido (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.cor_b1, 'teo-b1@teste-a2.dev', format(
    $s$select count(*)::text from public.comunicados_enviados(%L)$s$, f.t));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'corretor não lista enviados (veio ' || v || ')');
  v := pg_temp.como(f.vizinho, 'vizinho@teste-a2.dev', format(
    $s$select count(*)::text from public.comunicados_enviados(%L)$s$, f.t));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'admin da vizinha não lista os enviados da casa ao lado (veio ' || v || ')');

  -- Quem leu e quem não leu: o comunicado da equipe A com ciente (bloco 4).
  SELECT c.id INTO v_id FROM public.comunicados c WHERE c.tenant_id = f.t AND c.exige_ciente;
  v := pg_temp.como(f.diretora, 'diretora@teste-a2.dev', format(
    $s$select string_agg(nome || '/' || coalesce(cargo, '-') || ':' || (lido_em is not null) || ':' || (ciente_em is not null), ', ')
         from public.leitura_do_comunicado(%L)$s$, v_id));
  PERFORM pg_temp.checa(v = 'Gil Gerente/Gerência:false:false, Rui A2/Corretor:false:false, João A1/Corretor:true:true',
    'nome por nome, quem não leu primeiro (veio ' || coalesce(v, 'nada') || ')');

  v := pg_temp.como(f.gerente_a, 'gerente-a@teste-a2.dev', format(
    $s$select count(*)::text from public.leitura_do_comunicado(%L)$s$, v_id));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'gerente não abre a leitura de comunicado alheio (veio ' || v || ')');
  v := pg_temp.como(f.vizinho, 'vizinho@teste-a2.dev', format(
    $s$select count(*)::text from public.leitura_do_comunicado(%L)$s$, v_id));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'admin da vizinha não abre (veio ' || v || ')');

  PERFORM pg_temp.checa(NOT has_function_privilege('anon', 'public.leitura_do_comunicado(uuid)', 'execute'), 'anon não executa leitura_do_comunicado');
  PERFORM pg_temp.checa(NOT has_function_privilege('anon', 'public.comunicados_enviados(uuid)', 'execute'), 'anon não executa comunicados_enviados');

  RAISE NOTICE 'OK 5: enviados e leitura';
END $$;

-- ----------------------------------------------------------
-- 6. Opções do compositor e as funções internas fechadas
-- ----------------------------------------------------------
DO $$
DECLARE f fx%ROWTYPE; v text; v_erro text;
BEGIN
  SELECT * INTO f FROM fx;

  v := pg_temp.como(f.diretora, 'diretora@teste-a2.dev', format(
    $s$select jsonb_build_object(
         'equipes', jsonb_array_length(o->'equipes'), 'cargos', o->'cargos',
         'pessoas', jsonb_array_length(o->'pessoas'), 'lancamentos', jsonb_array_length(o->'lancamentos'),
         'materiais', jsonb_array_length(o->'materiais'))::text
         from public.opcoes_do_comunicado(%L) o$s$, f.t));
  PERFORM pg_temp.checa(v::jsonb = jsonb_build_object('equipes', 2, 'pessoas', 6, 'lancamentos', 1, 'materiais', 1,
      'cargos', jsonb_build_array(jsonb_build_object('id', f.cargo_corretor, 'nome', 'Corretor', 'pessoas', 3))),
    'diretoria: 2 equipes, o cargo com 3 pessoas (sem o owner), 6 pessoas, 1 lançamento, só o material publicado (veio ' || v || ')');

  v := pg_temp.como(f.gerente_a, 'gerente-a@teste-a2.dev', format(
    $s$select jsonb_build_object('equipes', o->'equipes', 'cargos', o->'cargos',
         'pessoas', (select jsonb_agg(p->>'nome') from jsonb_array_elements(o->'pessoas') p))::text
         from public.opcoes_do_comunicado(%L) o$s$, f.t));
  PERFORM pg_temp.checa(v::jsonb = jsonb_build_object('equipes', jsonb_build_array(jsonb_build_object('id', f.equipe_a, 'nome', 'Equipe A')),
      'cargos', '[]'::jsonb, 'pessoas', '["João A1", "Rui A2"]'::jsonb),
    'gerente: só a equipe dele, sem cargos, só as pessoas dele (veio ' || v || ')');

  v := pg_temp.como(f.cor_a1, 'joao-a1@teste-a2.dev', format($s$select public.opcoes_do_comunicado(%L)::text$s$, f.t));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'corretor não pede opções (veio ' || v || ')');
  v := pg_temp.como(f.vizinho, 'vizinho@teste-a2.dev', format($s$select public.opcoes_do_comunicado(%L)::text$s$, f.t));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'admin da vizinha não vê lançamentos e materiais da casa ao lado (veio ' || left(v, 60) || ')');

  -- Internas: ninguém de fora executa.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', f.diretora, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.membros_do_publico(f.t, 'todos', '{}');
    v_erro := 'passou';
  EXCEPTION WHEN insufficient_privilege THEN v_erro := 'negado';
  END;
  BEGIN
    PERFORM public.checar_envio_de_comunicado(f.t, 'todos', '{}', '{}');
    v_erro := v_erro || '+passou';
  EXCEPTION WHEN insufficient_privilege THEN v_erro := v_erro || '+negado';
  END;
  RESET ROLE;
  PERFORM pg_temp.checa(v_erro = 'negado+negado', 'authenticated não executa as internas (veio ' || v_erro || ')');
  PERFORM pg_temp.checa(NOT has_function_privilege('anon', 'public.opcoes_do_comunicado(uuid)', 'execute')
      AND NOT has_function_privilege('anon', 'public.previa_comunicado(uuid,text,uuid[],uuid[],uuid[])', 'execute')
      AND NOT has_function_privilege('anon', 'public.membros_do_publico(uuid,text,uuid[])', 'execute'),
    'anon não executa opções, prévia nem internas');

  RAISE NOTICE 'OK 6: opções e fechamento';
END $$;

ROLLBACK;
