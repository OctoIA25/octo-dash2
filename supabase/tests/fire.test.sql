-- ============================================================
-- A.6 · Fire (20261011_fire.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/fire.test.sql
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

-- Executa como uma pessoa logada; devolve o resultado (texto) ou a mensagem de erro.
CREATE FUNCTION pg_temp.como(p_user uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END $$;

-- Executa como postgres e devolve a mensagem de erro (ou 'passou').
CREATE FUNCTION pg_temp.erro(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'passou';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7e1a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7e1a0000-0000-4000-a000-000000000002'::uuid AS t2,
  '7e1b0000-0000-4000-a000-000000000001'::uuid AS admin,
  '7e1b0000-0000-4000-a000-000000000002'::uuid AS lider,
  '7e1b0000-0000-4000-a000-000000000003'::uuid AS cl1,
  '7e1b0000-0000-4000-a000-000000000004'::uuid AS cl2,
  '7e1b0000-0000-4000-a000-000000000005'::uuid AS cp1,
  '7e1b0000-0000-4000-a000-000000000006'::uuid AS sem,
  '7e1b0000-0000-4000-a000-000000000007'::uuid AS fora,
  '7e1b0000-0000-4000-a000-000000000008'::uuid AS dono,
  '7e1b0000-0000-4000-a000-000000000009'::uuid AS novo,     -- entra na casa depois do fechamento
  '7e1c0000-0000-4000-a000-000000000001'::uuid AS equipe_l,
  '7e1c0000-0000-4000-a000-000000000002'::uuid AS equipe_p,
  '7e1d0000-0000-4000-a000-00000000000a'::uuid AS la,
  '7e1d0000-0000-4000-a000-00000000000b'::uuid AS lb,
  '7e1d0000-0000-4000-a000-00000000000c'::uuid AS lc,
  '7e1d0000-0000-4000-a000-00000000000d'::uuid AS ld,
  (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje;

INSERT INTO tenants (id, code, name) SELECT t, 'teste-fire', 'Teste Fire' FROM fx
UNION ALL SELECT t2, 'teste-fire-viz', 'Vizinha Fire' FROM fx ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT v.id, v.email, v.meta FROM fx, LATERAL (VALUES
  (fx.admin, 'admin@teste-fire.dev', '{"name":"Ana Diretora"}'::jsonb),
  (fx.lider, 'lider@teste-fire.dev', '{"name":"Leo Líder"}'::jsonb),
  (fx.cl1,   'cl1@teste-fire.dev',   '{"name":"Lúcia Lançamento"}'::jsonb),
  (fx.cl2,   'cl2@teste-fire.dev',   '{"name":"Luan Lançamento"}'::jsonb),
  (fx.cp1,   'cp1@teste-fire.dev',   '{"name":"Paulo Pronto"}'::jsonb),
  (fx.sem,   'sem@teste-fire.dev',   '{"name":"Sérgio Sem Atuação"}'::jsonb),
  (fx.fora,  'fora@teste-fire.dev',  '{"name":"Fred de Fora"}'::jsonb),
  (fx.dono,  'dono@teste-fire.dev',  '{"name":"Dono da Plataforma"}'::jsonb),
  (fx.novo,  'novo@teste-fire.dev',  '{"name":"Nina Nova"}'::jsonb)
) AS v(id, email, meta) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teams (id, tenant_id, name, leader_user_id, leader_user_ids)
SELECT equipe_l, t, 'Lançamentos', lider, ARRAY[lider] FROM fx
UNION ALL SELECT equipe_p, t, 'Prontos', NULL, '{}'::uuid[] FROM fx;

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, team_id, permissions)
SELECT t, admin, 'admin', NULL::uuid, '{}'::jsonb FROM fx
UNION ALL SELECT t, lider, 'team_leader', equipe_l, '{"atuacao":["lancamentos"]}' FROM fx
UNION ALL SELECT t, cl1,   'corretor', equipe_l, '{"atuacao":["lancamentos"]}' FROM fx
UNION ALL SELECT t, cl2,   'corretor', equipe_l, '{"atuacao":["lancamentos"]}' FROM fx
UNION ALL SELECT t, cp1,   'corretor', equipe_p, '{"atuacao":["prontos"]}' FROM fx
UNION ALL SELECT t, sem,   'corretor', equipe_p, '{}'::jsonb FROM fx
UNION ALL SELECT t2, fora, 'admin',    NULL, '{}'::jsonb FROM fx
UNION ALL SELECT t, dono,  'corretor', equipe_l, '{"atuacao":["lancamentos"]}' FROM fx;
INSERT INTO public.platform_owners (email, user_id) SELECT 'dono@teste-fire.dev', dono FROM fx;

-- O que aconteceu, com os gatilhos de usuário desligados.
SET LOCAL session_replication_role = replica;
INSERT INTO public.leads (id, tenant_id, name, status, assigned_agent_id)
SELECT la, t, 'Lead A', 'Visita Realizada', cl1::text FROM fx
UNION ALL SELECT lb, t, 'Lead B', 'Visita Realizada', cl1::text FROM fx
UNION ALL SELECT lc, t, 'Lead C', 'Visita Realizada', cp1::text FROM fx
UNION ALL SELECT ld, t, 'Lead D', 'Interação', cl1::text FROM fx;

INSERT INTO public.imoveis_locais (id, tenant_id, codigo_imovel, captador_id, created_at)
SELECT '7e1e0000-0000-4000-a000-000000000001'::uuid, t, 'FIRE-1', cl1, now() FROM fx
UNION ALL SELECT '7e1e0000-0000-4000-a000-000000000002'::uuid, t, 'FIRE-2', cp1, now() FROM fx;

-- Visitas: a da Lúcia no Lead A aparece no evento E na agenda (é uma só).
INSERT INTO public.lead_events (tenant_id, lead_id, lead_source, event_type, para, ator_tipo, ator_user_id, metadata, created_at)
SELECT t, la::text, 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', cl1, '{}'::jsonb, now() FROM fx
UNION ALL SELECT t, lb::text, 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', cl1, '{}'::jsonb, now() FROM fx
UNION ALL SELECT t, lc::text, 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', cp1, '{}'::jsonb, now() FROM fx
UNION ALL SELECT t, lc::text, 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', cl2, '{}'::jsonb, now() - interval '30 days' FROM fx;
INSERT INTO public.agenda_eventos (tenant_id, corretor_id, corretor_email, titulo, data, horario, tipo, status, lead_uuid)
SELECT t, cl1::text, 'cl1@teste-fire.dev', 'Visita no plantão', hoje, '10:00', 'visita_agendada', 'concluido', la FROM fx;

-- Propostas: a P1 nasceu e foi assinada hoje; a P0 nasceu antes da edição e
-- foi assinada hoje (vale a venda, não a proposta). Sem atuação e dono vendem
-- e não pontuam.
INSERT INTO public.proposals (id, tenant_id, agent_user_id, lead_id, value, stage_id, signed_at, created_at)
SELECT '7e1f0000-0000-4000-a000-000000000001'::uuid, t, cl1, la, 500000, 'proposta-assinada', now(), now() FROM fx
UNION ALL SELECT '7e1f0000-0000-4000-a000-000000000000'::uuid, t, cl1, lb, 300000, 'proposta-assinada', now(), now() - interval '20 days' FROM fx
UNION ALL SELECT '7e1f0000-0000-4000-a000-0000000000a1'::uuid, t, sem, NULL, 999999, 'proposta-assinada', now(), now() FROM fx
UNION ALL SELECT '7e1f0000-0000-4000-a000-0000000000a2'::uuid, t, dono, NULL, 100000, 'proposta-assinada', now(), now() FROM fx;
SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE ed (id uuid, id2 uuid, desafio uuid) ON COMMIT DROP;
INSERT INTO ed VALUES (NULL, NULL, NULL);

CREATE FUNCTION pg_temp.painel(p_user uuid, p_edicao uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.como(p_user, format('SELECT public.fire_painel(%L, %L)::text', (SELECT t FROM fx), p_edicao))::jsonb;
$$;
CREATE FUNCTION pg_temp.pontos(p jsonb, p_user uuid) RETURNS int LANGUAGE sql AS $$
  SELECT (x->>'pontos')::int FROM jsonb_array_elements(p->'edicao'->'classificacao') x WHERE x->>'user_id' = p_user::text;
$$;
CREATE FUNCTION pg_temp.saldo(p_user uuid) RETURNS int LANGUAGE sql AS $$
  SELECT coalesce(sum(pontos), 0)::int FROM fire_pontos WHERE edicao_id = (SELECT id FROM ed) AND user_id = p_user;
$$;

-- 1. A diretoria monta a edição; ninguém mais --------------------------------------
DO $$
DECLARE f record; v text; v_id uuid;
BEGIN
  SELECT * INTO f FROM fx;
  v := pg_temp.como(f.cl1, format($q$SELECT public.fire_salvar_edicao(%L, NULL, 'Fire', %L, %L, NULL)::text$q$, f.t, f.hoje - 10, f.hoje + 10));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'corretor não cria edição (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.lider, format($q$SELECT public.fire_salvar_edicao(%L, NULL, 'Fire', %L, %L, NULL)::text$q$, f.t, f.hoje - 10, f.hoje + 10));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'líder não cria edição (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.admin, format($q$SELECT public.fire_salvar_edicao(%L, NULL, 'Fire', %L, %L, '{"prontos":{"visita":-1}}')::text$q$, f.t, f.hoje - 10, f.hoje + 10));
  PERFORM pg_temp.checa(v = 'pontuacao_invalida', 'ponto negativo recusado (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.admin, format($q$SELECT public.fire_salvar_edicao(%L, NULL, 'Fire', %L, %L, NULL)::text$q$, f.t, f.hoje, f.hoje - 1));
  PERFORM pg_temp.checa(v = 'periodo_invalido', 'fim antes do início recusado (veio ' || coalesce(v, 'nada') || ')');

  -- Prontos: visita vale 15 (peso por atuação); o resto, a sugestão do plano.
  v := pg_temp.como(f.admin, format($q$SELECT public.fire_salvar_edicao(%L, NULL, 'Fire de Outubro', %L, %L, '{"prontos":{"visita":15}}')::text$q$, f.t, f.hoje - 10, f.hoje + 10));
  v_id := v::uuid;
  UPDATE ed SET id = v_id;
  PERFORM pg_temp.checa((SELECT jsonb_object_agg(atuacao || ':' || evento, pontos) FROM fire_pontuacoes WHERE edicao_id = v_id)
      = '{"lancamentos:captacao":5,"lancamentos:visita":10,"lancamentos:proposta":20,"lancamentos:venda":50,
          "prontos:captacao":5,"prontos:visita":15,"prontos:proposta":20,"prontos:venda":50}'::jsonb,
    'pontuação por atuação, com a sugestão do plano no que não veio');

  PERFORM pg_temp.checa(pg_temp.painel(f.cl1)->'edicao' = 'null'::jsonb AND pg_temp.painel(f.cl1)->'edicoes' = '[]'::jsonb,
    'o corretor não vê rascunho');
  PERFORM pg_temp.checa(pg_temp.painel(f.admin)->'edicao'->>'status' = 'rascunho', 'a diretoria vê o rascunho');

  v := pg_temp.como(f.admin, format($q$SELECT public.fire_salvar_desafio(%L, '3 visitas até sexta', 'visita', 3, %L, %L, 30)::text$q$, v_id, f.hoje - 10, f.hoje + 11));
  PERFORM pg_temp.checa(v = 'prazo_fora_da_edicao', 'desafio além do fim recusado (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.admin, format($q$SELECT public.fire_salvar_desafio(%L, '3 visitas até sexta', 'visita', 3, %L, %L, 30)::text$q$, v_id, f.hoje - 10, f.hoje + 2));
  UPDATE ed SET desafio = v::uuid;
  PERFORM pg_temp.checa((SELECT count(*) FROM fire_desafios WHERE edicao_id = v_id) = 1, 'desafio criado');
  RAISE NOTICE 'OK 1 · a diretoria monta a edição, com peso por atuação e desafio';
END $$;

-- 2. Ativar pontua o que é real, uma vez só ------------------------------------------
DO $$
DECLARE f record; e record; v text; p jsonb;
BEGIN
  SELECT * INTO f FROM fx; SELECT * INTO e FROM ed;
  v := pg_temp.como(f.admin, format('SELECT public.fire_ativar(%L)::text', e.id));
  PERFORM pg_temp.checa(v ~ '^\d+$', 'ativou (veio ' || coalesce(v, 'nada') || ')');

  -- Lúcia: captação 5 + 2 visitas (A e B; a do A na agenda é a mesma) 20 + proposta P1 20 + vendas P1 e P0 100.
  PERFORM pg_temp.checa(pg_temp.saldo(f.cl1) = 145, 'Lúcia: 5 + 20 + 20 + 100 = 145 (veio ' || pg_temp.saldo(f.cl1) || ')');
  PERFORM pg_temp.checa(pg_temp.saldo(f.cp1) = 20, 'Paulo (Prontos): captação 5 + visita 15 = 20 (veio ' || pg_temp.saldo(f.cp1) || ')');
  PERFORM pg_temp.checa(pg_temp.saldo(f.cl2) = 0, 'Luan: a visita de 30 dias atrás é de antes da edição');
  PERFORM pg_temp.checa(pg_temp.saldo(f.sem) = 0 AND pg_temp.saldo(f.dono) = 0, 'sem atuação e a conta dona não pontuam');
  PERFORM pg_temp.checa(NOT EXISTS (SELECT 1 FROM fire_pontos WHERE edicao_id = e.id AND evento = 'proposta'
                                     AND origem_id = '7e1f0000-0000-4000-a000-000000000000'),
    'a proposta P0 nasceu antes da edição: só a venda dela pontua');

  -- Reprocessar não pontua de novo.
  PERFORM public.fire_processar(e.id);
  PERFORM public.fire_processar(e.id);
  PERFORM pg_temp.checa(pg_temp.saldo(f.cl1) = 145, 'reprocessar duas vezes não muda nada');

  -- A terceira visita fecha o desafio: +10 da visita, +30 do desafio, uma vez.
  SET LOCAL session_replication_role = replica;
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, para, ator_tipo, ator_user_id, metadata, created_at)
  VALUES (f.t, f.ld::text, 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', f.cl1, '{}'::jsonb, now());
  SET LOCAL session_replication_role = origin;
  PERFORM public.fire_processar(e.id);
  PERFORM public.fire_processar(e.id);
  PERFORM pg_temp.checa(pg_temp.saldo(f.cl1) = 185, 'terceira visita + desafio = 185 (veio ' || pg_temp.saldo(f.cl1) || ')');
  PERFORM pg_temp.checa((SELECT count(*) FROM fire_pontos WHERE edicao_id = e.id AND evento = 'desafio') = 1, 'o desafio pontua uma vez');

  p := pg_temp.painel(f.cl1);
  PERFORM pg_temp.checa(pg_temp.pontos(p, f.cl1) = 185 AND (p->'edicao'->'classificacao'->0->>'user_id') = f.cl1::text,
    'a classificação bate com o log e a Lúcia lidera');
  PERFORM pg_temp.checa((p->'edicao'->'desafios'->0->>'cumpriram')::int = 1, 'o desafio diz quantos cumpriram');

  -- Uma campanha por vez.
  v := pg_temp.como(f.admin, format($q$SELECT public.fire_ativar(public.fire_salvar_edicao(%L, NULL, 'Outra', %L, %L, NULL))::text$q$, f.t, f.hoje, f.hoje + 5));
  PERFORM pg_temp.checa(v = 'ja_existe_edicao_ativa', 'só uma edição ativa por casa (veio ' || coalesce(v, 'nada') || ')');
  RAISE NOTICE 'OK 2 · cada ponto é de evento real e o mesmo evento não pontua duas vezes';
END $$;

-- 3. Ponto não se edita: estorna, com motivo -------------------------------------------
DO $$
DECLARE f record; e record; v text; captacao uuid; x jsonb;
BEGIN
  SELECT * INTO f FROM fx; SELECT * INTO e FROM ed;
  SELECT id INTO captacao FROM fire_pontos WHERE edicao_id = e.id AND user_id = f.cl1 AND evento = 'captacao';

  v := pg_temp.erro(format('UPDATE public.fire_pontos SET pontos = 999 WHERE id = %L', captacao));
  PERFORM pg_temp.checa(v = 'ponto_nao_se_edita', 'nem o banco edita um ponto (veio ' || v || ')');
  v := pg_temp.erro(format('DELETE FROM public.fire_pontos WHERE id = %L', captacao));
  PERFORM pg_temp.checa(v = 'ponto_nao_se_edita', 'nem apaga (veio ' || v || ')');

  v := pg_temp.como(f.cl1, format($q$SELECT public.fire_estornar(%L, 'quero tirar')::text$q$, captacao));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'corretor não estorna (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.admin, format($q$SELECT public.fire_estornar(%L, '')::text$q$, captacao));
  PERFORM pg_temp.checa(v = 'motivo_obrigatorio', 'estorno sem motivo recusado (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.admin, format($q$SELECT public.fire_estornar(%L, 'imóvel cadastrado em duplicidade')::text$q$, captacao));
  PERFORM pg_temp.checa(pg_temp.saldo(f.cl1) = 180, 'o estorno derruba o saldo: 185 - 5 = 180');

  v := pg_temp.como(f.admin, format($q$SELECT public.fire_estornar(%L, 'de novo, por engano')::text$q$, captacao));
  PERFORM pg_temp.checa(v LIKE '%fire_estorno_uma_vez%', 'o mesmo ponto não se estorna duas vezes (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.admin, format($q$SELECT public.fire_estornar(%L, 'estornar o estorno')::text$q$,
                                    (SELECT id FROM fire_pontos WHERE estorno_de = captacao)));
  PERFORM pg_temp.checa(v = 'estorno_nao_se_estorna', 'estorno não se estorna (veio ' || coalesce(v, 'nada') || ')');

  PERFORM public.fire_processar(e.id);
  PERFORM pg_temp.checa(pg_temp.saldo(f.cl1) = 180, 'reprocessar não devolve a captação estornada');

  x := pg_temp.como(f.cl1, format('SELECT public.fire_extrato(%L, %L)::text', e.id, f.cl1))::jsonb;
  PERFORM pg_temp.checa((SELECT count(*) FROM jsonb_array_elements(x) r
                          WHERE r->>'estorno_motivo' = 'imóvel cadastrado em duplicidade' AND (r->>'pontos')::int = -5) = 1,
    'o estorno aparece no extrato do corretor, com o motivo');
  PERFORM pg_temp.checa((SELECT (r->>'estornado')::boolean FROM jsonb_array_elements(x) r WHERE r->>'id' = captacao::text),
    'e o ponto original aparece marcado como estornado');
  PERFORM pg_temp.checa((SELECT r->>'lead_id' FROM jsonb_array_elements(x) r WHERE r->>'evento' = 'venda'
                           AND r->>'origem_id' = '7e1f0000-0000-4000-a000-000000000001') = f.la::text,
    'a venda aponta para o lead dela — a origem abre');
  PERFORM pg_temp.checa((SELECT r->>'descricao' FROM jsonb_array_elements(x) r WHERE r->>'evento' = 'captacao' AND r->>'estorno_de' IS NULL) = 'Imóvel FIRE-1',
    'a captação diz qual imóvel');
  PERFORM pg_temp.checa((SELECT r->>'descricao' FROM jsonb_array_elements(x) r WHERE r->>'evento' = 'desafio') = '3 visitas até sexta',
    'o desafio diz qual desafio');
  RAISE NOTICE 'OK 3 · ponto não se edita; o estorno tem motivo, aparece no log e o saldo cai';
END $$;

-- 4. Quem vê o quê -----------------------------------------------------------------------
DO $$
DECLARE f record; e record; v text; p jsonb;
BEGIN
  SELECT * INTO f FROM fx; SELECT * INTO e FROM ed;
  p := pg_temp.painel(f.cl1);
  PERFORM pg_temp.checa(p->>'pode_gerir' = 'false' AND jsonb_array_length(p->'edicao'->'classificacao') = 4,
    'o corretor vê a classificação da casa: líder + 3 corretores com atuação (veio ' || (p->'edicao'->'classificacao')::text || ')');
  PERFORM pg_temp.checa(p->'edicao'->'sem_atuacao' = '["Sérgio Sem Atuação"]'::jsonb, 'quem não tem atuação aparece separado');
  PERFORM pg_temp.checa(p::text NOT LIKE '%Dono da Plataforma%', 'a conta dona não aparece');

  v := pg_temp.como(f.cl1, format('SELECT public.fire_extrato(%L, %L)::text', e.id, f.cp1));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'corretor não vê o extrato de outro (veio ' || left(coalesce(v, 'nada'), 60) || ')');
  v := pg_temp.como(f.lider, format('SELECT public.fire_extrato(%L, %L)::text', e.id, f.cl1));
  PERFORM pg_temp.checa(v LIKE '[%', 'o líder vê o extrato da equipe dele');
  v := pg_temp.como(f.lider, format('SELECT public.fire_extrato(%L, %L)::text', e.id, f.cp1));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'e não o de outra equipe (veio ' || left(coalesce(v, 'nada'), 60) || ')');
  v := pg_temp.como(f.fora, format('SELECT public.fire_painel(%L)::text', f.t));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'outra casa não vê (veio ' || left(coalesce(v, 'nada'), 60) || ')');
  v := pg_temp.como(f.cl1, 'SELECT count(*)::text FROM public.fire_pontos');
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'o log não se lê direto, só pela função (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.admin, format('SELECT public.fire_processar(%L)::text', e.id));
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'ninguém dispara o processamento pela tela (veio ' || coalesce(v, 'nada') || ')');
  RAISE NOTICE 'OK 4 · a casa vê a campanha; o extrato é de cada um e da gestão';
END $$;

-- 4b. Só gente no Fire (20261016) -------------------------------------------------------
-- Como na Lotus: o assistente de IA (sem atuação) e a conta de teste (com
-- atuação e uma venda hoje), com a edição ativa.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('7e1b0000-0000-4000-a000-00000000000a', 'ia@teste-fire.dev', '{"name":"Lia"}'),
  ('7e1b0000-0000-4000-a000-00000000000b', 'teste@teste-fire.dev', '{"name":"Conta de Teste"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.tenant_memberships (tenant_id, user_id, role, team_id, permissions)
SELECT t, '7e1b0000-0000-4000-a000-00000000000a'::uuid, 'corretor', NULL::uuid,
       '{"atuacao":[],"lead_limit":{"motivo":"assistente-ia","receives_auto_leads":false}}'::jsonb FROM fx
UNION ALL SELECT t, '7e1b0000-0000-4000-a000-00000000000b'::uuid, 'corretor', equipe_l,
       '{"atuacao":["lancamentos"],"conta_de_teste":true}'::jsonb FROM fx;
SET LOCAL session_replication_role = replica;
INSERT INTO public.proposals (id, tenant_id, agent_user_id, lead_id, value, stage_id, signed_at, created_at)
SELECT '7e1f0000-0000-4000-a000-0000000000a3'::uuid, t, '7e1b0000-0000-4000-a000-00000000000b'::uuid, NULL, 1000,
       'proposta-assinada', now(), now() FROM fx;
SET LOCAL session_replication_role = origin;

DO $$
DECLARE f record; e record; p jsonb;
BEGIN
  SELECT * INTO f FROM fx; SELECT * INTO e FROM ed;
  PERFORM public.fire_processar(e.id);
  PERFORM pg_temp.checa(pg_temp.saldo('7e1b0000-0000-4000-a000-00000000000b') = 0,
    'a conta de teste vendeu e não pontua (veio ' || pg_temp.saldo('7e1b0000-0000-4000-a000-00000000000b') || ')');
  p := pg_temp.painel(f.cl1);
  PERFORM pg_temp.checa(jsonb_array_length(p->'edicao'->'classificacao') = 4,
    'a classificação segue com o líder e os 3 corretores (veio ' || (p->'edicao'->'classificacao')::text || ')');
  PERFORM pg_temp.checa(p->'edicao'->'sem_atuacao' = '["Sérgio Sem Atuação"]'::jsonb,
    'o assistente de IA não aparece como "sem atuação" (veio ' || (p->'edicao'->'sem_atuacao')::text || ')');
  RAISE NOTICE 'OK 4b · só gente no Fire';
END $$;

-- 5. Encerrar congela ----------------------------------------------------------------------
DO $$
DECLARE f record; e record; v text; antes jsonb; depois jsonb;
BEGIN
  SELECT * INTO f FROM fx; SELECT * INTO e FROM ed;
  v := pg_temp.como(f.admin, format('SELECT public.fire_encerrar(%L)::text', e.id));
  antes := pg_temp.painel(f.admin, e.id)->'edicao'->'classificacao';
  PERFORM pg_temp.checa(pg_temp.painel(f.admin, e.id)->'edicao'->>'status' = 'encerrada', 'encerrou');

  -- Depois do fechamento: venda nova, troca de equipe, reprocessamento.
  SET LOCAL session_replication_role = replica;
  INSERT INTO proposals (tenant_id, agent_user_id, lead_id, value, stage_id, signed_at, created_at)
  VALUES (f.t, f.cl1, f.ld, 800000, 'proposta-assinada', now(), now());
  SET LOCAL session_replication_role = origin;
  UPDATE tenant_memberships SET team_id = f.equipe_p WHERE tenant_id = f.t AND user_id = f.cl1;
  INSERT INTO tenant_memberships (tenant_id, user_id, role, team_id, permissions)
  VALUES (f.t, f.novo, 'corretor', f.equipe_l, '{"atuacao":["lancamentos"]}');
  UPDATE auth.users SET raw_user_meta_data = '{"name":"Lúcia Renomeada"}' WHERE id = f.cl1;
  PERFORM public.fire_processar(e.id);
  PERFORM public.fire_processar_ativas();
  depois := pg_temp.painel(f.admin, e.id)->'edicao'->'classificacao';
  PERFORM pg_temp.checa(depois = antes, 'a classificação encerrada não muda: nem pontos, nem equipe, nem nome, nem quem entrou depois (veio ' || depois::text || ')');
  PERFORM pg_temp.checa(pg_temp.saldo(f.cl1) = 180, 'a venda de depois do fechamento não entrou');

  v := pg_temp.erro(format($q$INSERT INTO public.fire_pontos (tenant_id, edicao_id, user_id, evento, origem_tipo, origem_id, pontos, data)
                             VALUES (%L, %L, %L, 'venda', 'venda', 'na-mao', 50, now())$q$, f.t, e.id, f.cl1));
  PERFORM pg_temp.checa(v = 'edicao_nao_ativa', 'nem o banco põe ponto em edição encerrada (veio ' || v || ')');
  v := pg_temp.como(f.admin, format($q$SELECT public.fire_estornar(%L, 'depois de fechar')::text$q$,
                                    (SELECT id FROM fire_pontos WHERE edicao_id = e.id AND evento = 'venda' LIMIT 1)));
  PERFORM pg_temp.checa(v = 'edicao_nao_ativa', 'nem estorno depois de fechar (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.erro(format($q$UPDATE public.fire_edicoes SET nome = 'outro nome' WHERE id = %L$q$, e.id));
  PERFORM pg_temp.checa(v = 'edicao_encerrada', 'edição encerrada não muda (veio ' || v || ')');
  v := pg_temp.erro(format($q$UPDATE public.fire_pontuacoes SET pontos = 99 WHERE edicao_id = %L$q$, e.id));
  PERFORM pg_temp.checa(v = 'pontuacao_congelada', 'a pontuação não muda depois de ativar (veio ' || v || ')');
  RAISE NOTICE 'OK 5 · encerrar congela a classificação';
END $$;

-- 6. O relógio fecha sozinho; recordes da casa -------------------------------------------
DO $$
DECLARE f record; v text; e2 uuid; r jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  e2 := pg_temp.como(f.admin, format($q$SELECT public.fire_salvar_edicao(%L, NULL, 'Fire curto', %L, %L, NULL)::text$q$, f.t, f.hoje - 3, f.hoje))::uuid;
  v := pg_temp.como(f.admin, format('SELECT public.fire_ativar(%L)::text', e2));
  -- O fim passou (simulado: gatilhos de usuário desligados para mexer na data).
  SET LOCAL session_replication_role = replica;
  UPDATE fire_edicoes SET fim = f.hoje - 1 WHERE id = e2;
  SET LOCAL session_replication_role = origin;
  PERFORM public.fire_processar_ativas();
  PERFORM pg_temp.checa((SELECT status = 'encerrada' AND classificacao_final IS NOT NULL FROM fire_edicoes WHERE id = e2),
    'passou do fim, o relógio fecha e grava a classificação');
  PERFORM pg_temp.checa(EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fire-processar' AND schedule = '*/10 * * * *' AND active),
    'o relógio do Fire está ligado');

  r := pg_temp.painel(f.cl1)->'recordes';
  PERFORM pg_temp.checa((SELECT x->>'nome' = 'Sérgio Sem Atuação' AND (x->>'valor')::numeric = 999999
                           FROM jsonb_array_elements(r) x WHERE x->>'tipo' = 'maior_venda'),
    'maior venda da casa, com o nome (veio ' || r::text || ')');
  PERFORM pg_temp.checa((SELECT x->>'user_id' = f.cl1::text AND (x->>'valor')::int = 3
                           FROM jsonb_array_elements(r) x WHERE x->>'tipo' = 'visitas_semana'),
    'mais visitas numa semana: Lúcia, 3 (veio ' || r::text || ')');
  PERFORM pg_temp.checa(EXISTS (SELECT 1 FROM jsonb_array_elements(r) x WHERE x->>'tipo' = 'vgc_mes' AND x->>'edicao' IS NOT NULL),
    'o recorde de VGC diz em que edição aconteceu');
  RAISE NOTICE 'OK 6 · o relógio fecha a edição vencida; os recordes contam a história da casa';
END $$;

ROLLBACK;
