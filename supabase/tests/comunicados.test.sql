-- ============================================================
-- Comunicados e alertas (20261001_comunicados.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/comunicados.test.sql
--
-- Roda numa transação e DESFAZ tudo. Cria o próprio tenant: não depende do dump.
-- Sucesso = NOTICE final. Falha = ERROR com "FALHOU: <caso>".
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.checa(p_ok boolean, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_caso; END IF;
END $$;

-- Pessoas (7c0b…): a casa T tem diretoria, dois gerentes, quatro corretores e o
-- owner da plataforma como membro — ele NUNCA recebe nada da casa.
CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7c0a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7c0a0000-0000-4000-a000-000000000002'::uuid AS t2,
  '7c0b0000-0000-4000-a000-000000000001'::uuid AS diretora,
  '7c0b0000-0000-4000-a000-000000000002'::uuid AS gerente_a,
  '7c0b0000-0000-4000-a000-000000000003'::uuid AS gerente_b,
  '7c0b0000-0000-4000-a000-000000000004'::uuid AS cor_a1,
  '7c0b0000-0000-4000-a000-000000000005'::uuid AS cor_a2,
  '7c0b0000-0000-4000-a000-000000000006'::uuid AS cor_b1,
  '7c0b0000-0000-4000-a000-000000000007'::uuid AS cor_sem,
  '7c0b0000-0000-4000-a000-000000000008'::uuid AS dono,
  '7c0b0000-0000-4000-a000-000000000009'::uuid AS vizinho,
  '7c0b0000-0000-4000-a000-000000000010'::uuid AS ex_gerente,
  '7c0c0000-0000-4000-a000-000000000001'::uuid AS equipe_a,
  '7c0c0000-0000-4000-a000-000000000002'::uuid AS equipe_b,
  '7c0c0000-0000-4000-a000-000000000003'::uuid AS equipe_vazia,
  '7c0c0000-0000-4000-a000-000000000009'::uuid AS equipe_vizinha,
  '7c0d0000-0000-4000-a000-000000000001'::uuid AS lead_t,
  '7c0d0000-0000-4000-a000-000000000002'::uuid AS lead_t2,
  '7c0e0000-0000-4000-a000-000000000001'::uuid AS cargo_diretoria;

INSERT INTO tenants (id, code, name)
SELECT t, 'teste-comunicados', 'Teste Comunicados' FROM fx
UNION ALL SELECT t2, 'teste-comunicados-2', 'Vizinha Comunicados' FROM fx
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT v.id, v.email, v.meta FROM fx, LATERAL (VALUES
  (fx.diretora,   'diretora@teste-comunicados.dev',   '{"name":"Ana Diretora"}'::jsonb),
  (fx.gerente_a,  'gerente-a@teste-comunicados.dev',  '{"name":"Gil Gerente"}'::jsonb),
  (fx.gerente_b,  'gerente-b@teste-comunicados.dev',  '{"name":"Bia Gerente"}'::jsonb),
  (fx.cor_a1,     'joao-a1@teste-comunicados.dev',    '{"name":"João A1"}'::jsonb),
  (fx.cor_a2,     'rui-a2@teste-comunicados.dev',     '{"name":"Rui A2"}'::jsonb),
  (fx.cor_b1,     'teo-b1@teste-comunicados.dev',     '{"name":"Téo B1"}'::jsonb),
  (fx.cor_sem,    'sol@teste-comunicados.dev',        '{"name":"Sol Sem Equipe"}'::jsonb),
  (fx.dono,       'dono@teste-comunicados.dev',       NULL),
  (fx.vizinho,    'vizinho@teste-comunicados.dev',    '{"name":"Vic Vizinho"}'::jsonb),
  (fx.ex_gerente, 'ex@teste-comunicados.dev',         '{"name":"Ex Gerente"}'::jsonb)
) AS v(id, email, meta)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.platform_owners (email) VALUES ('dono@teste-comunicados.dev') ON CONFLICT DO NOTHING;

INSERT INTO public.cargos (id, tenant_id, nome, role, nivel_acesso)
SELECT cargo_diretoria, t, 'Diretoria Comercial', 'admin', 100 FROM fx;

INSERT INTO public.teams (id, tenant_id, name, leader_user_id, leader_user_ids)
SELECT equipe_a, t, 'Equipe A', gerente_a, ARRAY[gerente_a] FROM fx
UNION ALL SELECT equipe_b, t, 'Equipe B', gerente_b, ARRAY[gerente_b, ex_gerente] FROM fx
UNION ALL SELECT equipe_vazia, t, 'Equipe Vazia', NULL, '{}'::uuid[] FROM fx
UNION ALL SELECT equipe_vizinha, t2, 'Equipe Vizinha', NULL, '{}'::uuid[] FROM fx;

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, team_id, leader_user_id, cargo_id)
SELECT t, diretora,  'admin',       NULL::uuid, NULL::uuid, cargo_diretoria FROM fx
UNION ALL SELECT t, gerente_a, 'team_leader', equipe_a, NULL,      NULL FROM fx
UNION ALL SELECT t, gerente_b, 'team_leader', equipe_b, NULL,      NULL FROM fx
UNION ALL SELECT t, cor_a1,    'corretor',    equipe_a, gerente_a, NULL FROM fx
UNION ALL SELECT t, cor_a2,    'corretor',    equipe_a, NULL,      NULL FROM fx
UNION ALL SELECT t, cor_b1,    'corretor',    equipe_b, gerente_b, NULL FROM fx
UNION ALL SELECT t, cor_sem,   'corretor',    NULL,     NULL,      NULL FROM fx
UNION ALL SELECT t, dono,      'admin',       NULL,     NULL,      NULL FROM fx
UNION ALL SELECT t2, vizinho,  'admin',       NULL,     NULL,      NULL FROM fx
ON CONFLICT (tenant_id, user_id) DO NOTHING;

INSERT INTO public.leads (id, tenant_id, name)
SELECT lead_t, t, 'Maria Lead' FROM fx
UNION ALL SELECT lead_t2, t2, 'Lead da Vizinha' FROM fx
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION pg_temp.resp(p_user uuid) RETURNS uuid[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(r ORDER BY r), '{}') FROM public.responsaveis_pelo_membro((SELECT t FROM fx), p_user) r
$$;

-- ----------------------------------------------------------
-- 1. Quem responde por cada um
-- ----------------------------------------------------------
DO $$
DECLARE f fx%ROWTYPE; v_erro text;
BEGIN
  SELECT * INTO f FROM fx;

  PERFORM pg_temp.checa(pg_temp.resp(f.cor_a1) = ARRAY[f.gerente_a],
    'corretor com leader_user_id responde ao gerente dele');
  PERFORM pg_temp.checa(pg_temp.resp(f.cor_a2) = ARRAY[f.gerente_a],
    'corretor sem leader_user_id responde ao gestor da equipe (teams.leader_user_ids)');
  PERFORM pg_temp.checa(pg_temp.resp(f.cor_b1) = ARRAY[f.gerente_b],
    'gestor que já saiu da casa (ex_gerente) não conta');
  PERFORM pg_temp.checa(pg_temp.resp(f.cor_sem) = ARRAY[f.diretora],
    'sem gestor, responde a Diretoria — e o owner da plataforma (admin na casa) fica de fora');
  PERFORM pg_temp.checa(pg_temp.resp(f.gerente_a) = ARRAY[f.diretora],
    'o gerente não responde a si mesmo: cai na Diretoria');

  PERFORM pg_temp.checa(public.nome_de_exibicao(f.cor_a1) = 'João A1', 'nome vem do cadastro');
  PERFORM pg_temp.checa(public.nome_de_exibicao(f.dono) = 'dono@teste-comunicados.dev', 'sem nome, e-mail');

  -- Internas: ninguém de fora executa.
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', f.diretora, 'role', 'authenticated', 'email', 'diretora@teste-comunicados.dev')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.responsaveis_pelo_membro(f.t, f.cor_a1);
    v_erro := NULL;
  EXCEPTION WHEN insufficient_privilege THEN v_erro := 'negado';
  END;
  BEGIN
    PERFORM count(*) FROM public.comunicados;
  EXCEPTION WHEN insufficient_privilege THEN v_erro := v_erro || '+tabela';
  END;
  RESET ROLE;
  PERFORM pg_temp.checa(v_erro = 'negado+tabela',
    'authenticated não executa responsaveis_pelo_membro nem lê comunicados direto (veio: ' || coalesce(v_erro, 'nada') || ')');

  RAISE NOTICE 'OK 1: responsáveis, nome e fechamento';
END $$;

CREATE FUNCTION pg_temp.entregas(p_comunicado uuid) RETURNS uuid[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(user_id ORDER BY user_id), '{}') FROM public.notifications WHERE comunicado_id = p_comunicado
$$;
CREATE FUNCTION pg_temp.erro(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_detalhe text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_detalhe = PG_EXCEPTION_DETAIL;
  RETURN SQLERRM || coalesce(' | ' || nullif(v_detalhe, ''), '');
END $$;

-- ----------------------------------------------------------
-- 2. publicar_comunicado
-- ----------------------------------------------------------
DO $$
DECLARE
  f fx%ROWTYPE;
  r record;
  n public.notifications%ROWTYPE;
  v_antes bigint;
  v_erro text;
BEGIN
  SELECT * INTO f FROM fx;

  -- 2a. "todos": a casa inteira, menos o autor e o owner da plataforma.
  SELECT * INTO r FROM public.publicar_comunicado(
    p_tenant_id => f.t, p_origem => 'usuario', p_autor_user_id => f.diretora,
    p_categoria => 'comunicado', p_titulo => '  Reunião geral  ', p_mensagem => 'Amanhã às 9h.',
    p_prioridade => 'importante', p_publico_tipo => 'todos');
  PERFORM pg_temp.checa(r.criado AND r.destinatarios = 6, 'todos = 6 pessoas (veio ' || r.destinatarios || ')');
  PERFORM pg_temp.checa(pg_temp.entregas(r.comunicado_id) = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[
    f.gerente_a, f.gerente_b, f.cor_a1, f.cor_a2, f.cor_b1, f.cor_sem]) x), 'todos: nem autora, nem owner, nem vizinha');
  SELECT * INTO n FROM public.notifications WHERE comunicado_id = r.comunicado_id AND user_id = f.cor_a1;
  PERFORM pg_temp.checa(n.title = 'Reunião geral' AND n.type = 'comunicado', 'título sem espaços nas pontas e type = categoria');
  PERFORM pg_temp.checa(n.metadata->'remetente' = '{"tipo":"usuario","nome":"Ana Diretora","cargo":"Diretoria Comercial"}'::jsonb,
    'remetente é a fotografia do nome e do cargo (veio ' || (n.metadata->'remetente')::text || ')');
  PERFORM pg_temp.checa(n.metadata->>'publico' = 'Toda a imobiliária' AND n.metadata->>'prioridade' = 'importante', 'público e prioridade');

  -- 2b. equipe A: membros da equipe + gestores dela.
  SELECT * INTO r FROM public.publicar_comunicado(f.t, 'usuario', f.diretora, 'comunicado', 'Só A', 'x', 'normal',
    'equipes', ARRAY[f.equipe_a]);
  PERFORM pg_temp.checa(pg_temp.entregas(r.comunicado_id) = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[
    f.gerente_a, f.cor_a1, f.cor_a2]) x), 'equipe A = gerente + 2 corretores');
  PERFORM pg_temp.checa((SELECT metadata->>'publico' FROM public.notifications WHERE comunicado_id = r.comunicado_id LIMIT 1) = 'Equipe A',
    'rótulo da equipe');
  PERFORM pg_temp.checa((SELECT metadata->'remetente'->>'cargo' FROM public.notifications WHERE comunicado_id = r.comunicado_id LIMIT 1) = 'Diretoria Comercial',
    'cargo vem de cargos.nome');

  -- 2c. equipe B: o ex-gestor (fora da casa) não recebe.
  SELECT * INTO r FROM public.publicar_comunicado(f.t, 'usuario', f.gerente_b, 'comunicado', 'Só B', 'x', 'normal',
    'equipes', ARRAY[f.equipe_b]);
  PERFORM pg_temp.checa(pg_temp.entregas(r.comunicado_id) = ARRAY[f.cor_b1], 'equipe B enviada pela própria gerente = só o corretor');
  PERFORM pg_temp.checa((SELECT metadata->'remetente'->>'cargo' FROM public.notifications WHERE comunicado_id = r.comunicado_id) = 'Gerência',
    'sem cargo, team_leader vira Gerência');

  -- 2d. equipe vazia: erro e NADA gravado.
  SELECT count(*) INTO v_antes FROM public.comunicados WHERE tenant_id = f.t;
  v_erro := pg_temp.erro(format($f$select public.publicar_comunicado(%L, 'usuario', %L, 'comunicado', 't', 'm', 'normal', 'equipes', ARRAY[%L]::uuid[])$f$,
    f.t, f.diretora, f.equipe_vazia));
  PERFORM pg_temp.checa(v_erro LIKE 'sem_destinatarios%', 'equipe vazia = sem_destinatarios (veio ' || coalesce(v_erro, 'nada') || ')');
  PERFORM pg_temp.checa((SELECT count(*) FROM public.comunicados WHERE tenant_id = f.t) = v_antes, 'sem destinatário não grava comunicado');

  -- 2e. equipe de outra casa.
  v_erro := pg_temp.erro(format($f$select public.publicar_comunicado(%L, 'usuario', %L, 'comunicado', 't', 'm', 'normal', 'equipes', ARRAY[%L]::uuid[])$f$,
    f.t, f.diretora, f.equipe_vizinha));
  PERFORM pg_temp.checa(v_erro LIKE 'equipe_invalida%', 'equipe da vizinha = equipe_invalida');

  -- 2f. LIA, pessoa por e-mail com maiúsculas/espaço/repetido, com cópia ao gestor e link.
  SELECT * INTO r FROM public.publicar_comunicado(f.t, 'lia', NULL, 'alerta', 'Lead sem resposta há 2h', 'Maria espera.',
    'importante', 'pessoas', '{}', ARRAY[' JOAO-A1@Teste-Comunicados.dev', 'joao-a1@teste-comunicados.dev'], true,
    'lead', f.lead_t::text, 'lia:teste:1');
  PERFORM pg_temp.checa(r.destinatarios = 2 AND pg_temp.entregas(r.comunicado_id) = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[f.gerente_a, f.cor_a1]) x),
    'LIA: corretor + gerente dele, uma vez cada');
  SELECT * INTO n FROM public.notifications WHERE comunicado_id = r.comunicado_id AND user_id = f.gerente_a;
  PERFORM pg_temp.checa(n.type = 'alerta' AND n.link_type = 'lead' AND n.link_id = f.lead_t::text, 'alerta com link do lead');
  PERFORM pg_temp.checa(n.metadata->>'sobre' = 'João A1' AND n.metadata->>'publico' = 'Você, como gestor'
    AND (n.metadata->>'copia_gestor')::boolean, 'cópia do gestor diz sobre quem é');
  PERFORM pg_temp.checa(n.metadata->'remetente' = '{"tipo":"lia","nome":"LIA"}'::jsonb, 'remetente LIA');
  PERFORM pg_temp.checa((SELECT metadata->>'publico' FROM public.notifications WHERE comunicado_id = r.comunicado_id AND user_id = f.cor_a1) = 'Você',
    'destinatário direto: Para: Você');

  -- 2g. reenvio: mesma chave → mesmo comunicado, nenhuma entrega nova, mesmo com gente nova na casa.
  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, team_id, leader_user_id)
  VALUES (f.t, f.ex_gerente, 'corretor', f.equipe_a, f.gerente_a);
  SELECT count(*) INTO v_antes FROM public.notifications WHERE tenant_id = f.t;
  SELECT * INTO r FROM public.publicar_comunicado(f.t, 'lia', NULL, 'alerta', 'OUTRO TÍTULO', 'outra', 'normal', 'todos',
    '{}', '{}', false, NULL, NULL, 'lia:teste:1');
  PERFORM pg_temp.checa(NOT r.criado AND r.destinatarios = 2, 'reenvio devolve o original (criado = false)');
  PERFORM pg_temp.checa((SELECT count(*) FROM public.notifications WHERE tenant_id = f.t) = v_antes, 'reenvio não entrega nada');
  DELETE FROM public.tenant_memberships WHERE tenant_id = f.t AND user_id = f.ex_gerente;

  -- 2h. e-mail desconhecido (inclusive de membro de OUTRA casa): erro com a lista.
  v_erro := pg_temp.erro(format($f$select public.publicar_comunicado(%L, 'lia', NULL, 'alerta', 't', 'm', 'normal', 'pessoas', '{}',
    ARRAY['ninguem@x.dev', 'vizinho@teste-comunicados.dev', 'sol@teste-comunicados.dev'])$f$, f.t));
  PERFORM pg_temp.checa(v_erro = 'destinatario_desconhecido | ninguem@x.dev, vizinho@teste-comunicados.dev',
    'desconhecidos listados, conhecidos não (veio ' || coalesce(v_erro, 'nada') || ')');

  -- 2i. sem gestor, a cópia vai para a Diretoria.
  SELECT * INTO r FROM public.publicar_comunicado(f.t, 'lia', NULL, 'alerta', 't', 'm', 'normal', 'pessoas', '{}',
    ARRAY['sol@teste-comunicados.dev'], true);
  PERFORM pg_temp.checa(pg_temp.entregas(r.comunicado_id) = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[f.diretora, f.cor_sem]) x),
    'corretor sem gestor: cópia para a Diretoria, nunca para o owner');

  -- 2j. lead de outra casa.
  v_erro := pg_temp.erro(format($f$select public.publicar_comunicado(%L, 'lia', NULL, 'alerta', 't', 'm', 'normal', 'todos', '{}', '{}', false, 'lead', %L)$f$,
    f.t, f.lead_t2::text));
  PERFORM pg_temp.checa(v_erro LIKE 'lead_nao_encontrado%', 'lead da vizinha = lead_nao_encontrado');

  -- 2k. só o service_role executa.
  PERFORM pg_temp.checa(NOT has_function_privilege('authenticated',
    'public.publicar_comunicado(uuid,text,uuid,text,text,text,text,text,uuid[],text[],boolean,text,text,text,uuid[],uuid[],boolean)', 'execute'),
    'authenticated não executa publicar_comunicado');
  PERFORM pg_temp.checa(NOT has_function_privilege('anon',
    'public.publicar_comunicado(uuid,text,uuid,text,text,text,text,text,uuid[],text[],boolean,text,text,text,uuid[],uuid[],boolean)', 'execute'),
    'anon não executa publicar_comunicado');
  PERFORM pg_temp.checa(has_function_privilege('service_role',
    'public.publicar_comunicado(uuid,text,uuid,text,text,text,text,text,uuid[],text[],boolean,text,text,text,uuid[],uuid[],boolean)', 'execute'),
    'service_role executa publicar_comunicado');

  RAISE NOTICE 'OK 2: publicar_comunicado';
END $$;

-- ----------------------------------------------------------
-- 3. enviar_comunicado: quem pode enviar para quem
-- ----------------------------------------------------------
CREATE FUNCTION pg_temp.enviar_como(p_user uuid, p_email text, p_tenant uuid, p_publico text, p_equipes uuid[])
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_resultado text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'email', p_email)::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT 'ok:' || destinatarios INTO v_resultado
      FROM public.enviar_comunicado(p_tenant, 'Aviso', 'Texto', 'normal', p_publico, p_equipes, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_resultado := SQLERRM;
  END;
  RESET ROLE;
  RETURN v_resultado;
END $$;

CREATE FUNCTION pg_temp.enviar_com_chave(p_user uuid, p_tenant uuid, p_equipe uuid, p_chave text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_resultado text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT 'criado:' || criado INTO v_resultado
    FROM public.enviar_comunicado(p_tenant, 'Aviso', 'Texto', 'normal', 'equipes', ARRAY[p_equipe], p_chave);
  RESET ROLE;
  RETURN v_resultado;
END $$;

DO $$
DECLARE f fx%ROWTYPE; v text;
BEGIN
  SELECT * INTO f FROM fx;

  v := pg_temp.enviar_como(f.diretora, 'diretora@teste-comunicados.dev', f.t, 'todos', '{}');
  PERFORM pg_temp.checa(v = 'ok:6', 'Diretoria envia para todos (veio ' || v || ')');

  v := pg_temp.enviar_como(f.gerente_a, 'gerente-a@teste-comunicados.dev', f.t, 'equipes', ARRAY[f.equipe_a]);
  PERFORM pg_temp.checa(v = 'ok:2', 'gerente envia para a própria equipe, sem receber de volta (veio ' || v || ')');

  v := pg_temp.enviar_como(f.gerente_a, 'gerente-a@teste-comunicados.dev', f.t, 'equipes', ARRAY[f.equipe_a, f.equipe_b]);
  PERFORM pg_temp.checa(v = 'sem_permissao', 'gerente não envia para equipe alheia, nem misturada com a dele');

  v := pg_temp.enviar_como(f.gerente_a, 'gerente-a@teste-comunicados.dev', f.t, 'todos', '{}');
  PERFORM pg_temp.checa(v = 'sem_permissao', 'gerente não envia para a casa inteira');

  v := pg_temp.enviar_como(f.cor_a1, 'joao-a1@teste-comunicados.dev', f.t, 'equipes', ARRAY[f.equipe_a]);
  PERFORM pg_temp.checa(v = 'sem_permissao', 'corretor não envia');

  v := pg_temp.enviar_como(f.vizinho, 'vizinho@teste-comunicados.dev', f.t, 'todos', '{}');
  PERFORM pg_temp.checa(v = 'sem_permissao', 'admin da vizinha não envia para a casa ao lado');

  -- Desde 20261005 a tela envia para pessoas (comunicados_a2.test.sql); sem ninguém escolhido, não sai.
  v := pg_temp.enviar_como(f.diretora, 'diretora@teste-comunicados.dev', f.t, 'pessoas', '{}');
  PERFORM pg_temp.checa(v = 'sem_destinatarios', 'pessoas sem ninguém escolhido não envia (veio ' || v || ')');

  v := pg_temp.enviar_como(f.dono, 'dono@teste-comunicados.dev', f.t2, 'todos', '{}');
  PERFORM pg_temp.checa(v = 'ok:1', 'owner da plataforma envia mesmo sem ser membro da casa (veio ' || v || ')');

  -- O remetente da tela é SEMPRE quem está logado.
  PERFORM pg_temp.checa((SELECT metadata->'remetente'->>'nome' FROM public.notifications n
                          JOIN public.comunicados c ON c.id = n.comunicado_id
                         WHERE c.autor_user_id = f.gerente_a LIMIT 1) = 'Gil Gerente', 'remetente é o chamador');

  PERFORM pg_temp.checa(NOT has_function_privilege('anon',
    'public.enviar_comunicado(uuid,text,text,text,text,uuid[],text,uuid[],uuid[],text,text,boolean)', 'execute'), 'anon não executa enviar_comunicado');

  -- Chave da tela não colide com a da LIA, e o replay do mesmo remetente continua deduplicando.
  v := pg_temp.enviar_com_chave(f.gerente_a, f.t, f.equipe_a, 'lia:colisao:1');
  PERFORM pg_temp.checa(v = 'criado:true', 'gerente envia com chave nova (veio ' || v || ')');
  PERFORM pg_temp.checa((SELECT criado FROM public.publicar_comunicado(f.t, 'lia', NULL, 'alerta', 't', 'm',
    'normal', 'todos', '{}', '{}', false, NULL, NULL, 'lia:colisao:1')),
    'publicação da LIA com a mesma chave não é suprimida');
  v := pg_temp.enviar_com_chave(f.gerente_a, f.t, f.equipe_a, 'lia:colisao:1');
  PERFORM pg_temp.checa(v = 'criado:false', 'mesmo remetente reenviando com a mesma chave deduplica (veio ' || v || ')');

  RAISE NOTICE 'OK 3: enviar_comunicado';
END $$;

ROLLBACK;
