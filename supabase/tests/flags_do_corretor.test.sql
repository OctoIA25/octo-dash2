-- ============================================================
-- A.3 · Flags do corretor (20261010_flags_do_corretor.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/flags_do_corretor.test.sql
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

CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7f3a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7f3a0000-0000-4000-a000-000000000002'::uuid AS t2,
  '7f3b0000-0000-4000-a000-000000000001'::uuid AS admin,
  '7f3b0000-0000-4000-a000-000000000002'::uuid AS lider,   -- lidera Lançamentos
  '7f3b0000-0000-4000-a000-000000000003'::uuid AS l1,      -- 1 venda + 3 visitas
  '7f3b0000-0000-4000-a000-000000000004'::uuid AS l2,      -- nada
  '7f3b0000-0000-4000-a000-000000000005'::uuid AS l3,      -- 2 vendas
  '7f3b0000-0000-4000-a000-000000000006'::uuid AS p1,      -- Prontos, os MESMOS números do l1
  '7f3b0000-0000-4000-a000-000000000007'::uuid AS sem,     -- sem atuação gravada
  '7f3b0000-0000-4000-a000-000000000008'::uuid AS misto,   -- lançamentos E prontos
  '7f3b0000-0000-4000-a000-000000000009'::uuid AS fora,    -- admin de outra casa
  '7f3b0000-0000-4000-a000-00000000000a'::uuid AS dono,    -- dono da plataforma, membro como corretor
  '7f3c0000-0000-4000-a000-000000000001'::uuid AS equipe_l,
  '7f3c0000-0000-4000-a000-000000000002'::uuid AS equipe_p,
  date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date AS mes,
  (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')) - interval '1 month')::date AS mes_passado;

INSERT INTO tenants (id, code, name) SELECT t, 'teste-flags', 'Teste Flags' FROM fx
UNION ALL SELECT t2, 'teste-flags-viz', 'Vizinha Flags' FROM fx ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT v.id, v.email, v.meta FROM fx, LATERAL (VALUES
  (fx.admin, 'admin@teste-fl.dev', '{"name":"Ana Diretora"}'::jsonb),
  (fx.lider, 'lider@teste-fl.dev', '{"name":"Leo Líder"}'::jsonb),
  (fx.l1,    'l1@teste-fl.dev',    '{"name":"Lúcia Lançamento"}'::jsonb),
  (fx.l2,    'l2@teste-fl.dev',    '{"name":"Luan Lançamento"}'::jsonb),
  (fx.l3,    'l3@teste-fl.dev',    '{"name":"Laura Lançamento"}'::jsonb),
  (fx.p1,    'p1@teste-fl.dev',    '{"name":"Paulo Pronto"}'::jsonb),
  (fx.sem,   'sem@teste-fl.dev',   '{"name":"Sérgio Sem Atuação"}'::jsonb),
  (fx.misto, 'misto@teste-fl.dev', '{"name":"Mara Mista"}'::jsonb),
  (fx.fora,  'fora@teste-fl.dev',  '{"name":"Fred de Fora"}'::jsonb),
  (fx.dono,  'dono@teste-fl.dev',  '{"name":"Dono da Plataforma"}'::jsonb)
) AS v(id, email, meta) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teams (id, tenant_id, name, leader_user_id, leader_user_ids)
SELECT equipe_l, t, 'Lançamentos', lider, ARRAY[lider] FROM fx
UNION ALL SELECT equipe_p, t, 'Prontos', NULL, '{}'::uuid[] FROM fx;

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, team_id, permissions)
SELECT t, admin, 'admin', NULL::uuid, '{}'::jsonb FROM fx
UNION ALL SELECT t, lider, 'team_leader', equipe_l, '{"atuacao":["lancamentos"]}' FROM fx
UNION ALL SELECT t, l1,    'corretor', equipe_l, '{"atuacao":["lancamentos"]}' FROM fx
UNION ALL SELECT t, l2,    'corretor', equipe_l, '{"atuacao":"lancamentos"}' FROM fx       -- o formato legado
UNION ALL SELECT t, l3,    'corretor', equipe_l, '{"atuacao":["lancamentos"]}' FROM fx
UNION ALL SELECT t, p1,    'corretor', equipe_p, '{"atuacao":["prontos","alugados"]}' FROM fx
UNION ALL SELECT t, sem,   'corretor', equipe_p, '{}'::jsonb FROM fx
UNION ALL SELECT t, misto, 'corretor', equipe_p, '{"atuacao":["lancamentos","prontos"]}' FROM fx
UNION ALL SELECT t2, fora, 'admin',    NULL, '{}'::jsonb FROM fx
UNION ALL SELECT t, dono,  'corretor', equipe_l, '{"atuacao":["lancamentos"]}' FROM fx;
-- A conta dona da plataforma é membro comum em toda casa: não é corretor dela.
INSERT INTO public.platform_owners (email, user_id) SELECT 'dono@teste-fl.dev', dono FROM fx;

-- A régua. Verde de Lançamentos com o caminho LONGO primeiro: o "falta para
-- subir" tem que achar o curto, não o primeiro da lista.
INSERT INTO public.flag_reguas (tenant_id, atuacao, nivel, caminhos)
SELECT t, 'lancamentos', 'verde',   '[{"vendas":1,"visitas":8},{"vendas":2}]'::jsonb FROM fx
UNION ALL SELECT t, 'lancamentos', 'amarelo', '[{"visitas":4},{"vendas":1}]' FROM fx
UNION ALL SELECT t, 'prontos',     'verde',   '[{"captacoes":3,"visitas":4}]' FROM fx
UNION ALL SELECT t, 'prontos',     'amarelo', '[{"captacoes":1}]' FROM fx;

-- O mês de cada um, com os gatilhos de usuário desligados.
SET LOCAL session_replication_role = replica;
INSERT INTO public.proposals (tenant_id, agent_user_id, value, stage_id, signed_at, created_at)
SELECT t, l1, 400000, 'proposta-assinada', now(), now() FROM fx
UNION ALL SELECT t, l3, 300000, 'proposta-assinada', now(), now() FROM fx
UNION ALL SELECT t, l3, 300000, 'proposta-assinada', now(), now() FROM fx
UNION ALL SELECT t, p1, 500000, 'proposta-assinada', now(), now() FROM fx
UNION ALL SELECT t, l2, 900000, 'proposta-enviada', now(), now() FROM fx;           -- voltou de assinada: não conta

INSERT INTO public.lead_events (tenant_id, lead_id, lead_source, event_type, para, ator_tipo, ator_user_id, metadata, created_at)
SELECT t, 'fl-a', 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', l1, '{}'::jsonb, now() FROM fx
UNION ALL SELECT t, 'fl-b', 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', l1, '{}'::jsonb, now() FROM fx
UNION ALL SELECT t, 'fl-c', 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', l1, '{}'::jsonb, now() FROM fx
UNION ALL SELECT t, 'fl-d', 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', p1, '{}'::jsonb, now() FROM fx
UNION ALL SELECT t, 'fl-e', 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', p1, '{}'::jsonb, now() FROM fx
UNION ALL SELECT t, 'fl-f', 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', p1, '{}'::jsonb, now() FROM fx;

-- Visitas em agosto de 2026, para a conta por período: o lead X visitado no
-- dia 10 (evento + agenda = UMA visita) e de novo no dia 11 (outra visita).
INSERT INTO public.lead_events (tenant_id, lead_id, lead_source, event_type, para, ator_tipo, ator_user_id, metadata, created_at)
SELECT t, '7f3d0000-0000-4000-a000-0000000000aa', 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', l2, '{}'::jsonb, '2026-08-10 15:00-03'::timestamptz FROM fx
UNION ALL SELECT t, '7f3d0000-0000-4000-a000-0000000000aa', 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', l2, '{}'::jsonb, '2026-08-11 15:00-03' FROM fx;
INSERT INTO public.agenda_eventos (tenant_id, corretor_id, corretor_email, titulo, data, horario, tipo, status, lead_id)
SELECT t, l2::text, 'l2@teste-fl.dev', 'Visita do X', '2026-08-10', '14:00', 'visita_agendada', 'concluido', '7f3d0000-0000-4000-a000-0000000000aa'::uuid FROM fx;
SET LOCAL session_replication_role = origin;

CREATE FUNCTION pg_temp.flags(p_user uuid, p_mes date DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.como(p_user, format('SELECT public.flags_do_mes(%L, %L)::text', (SELECT t FROM fx), p_mes))::jsonb;
$$;
CREATE FUNCTION pg_temp.de(p jsonb, p_user uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT x FROM jsonb_array_elements(p->'pessoas') x WHERE x->>'user_id' = p_user::text;
$$;

-- 1. A régua: o banco recusa régua torta, e só a diretoria grava -------------
DO $$
DECLARE f record; v text; ruim text;
BEGIN
  SELECT * INTO f FROM fx;
  FOREACH ruim IN ARRAY ARRAY['[]', '[{}]', '{"vendas":1}', '[{"ligacoes":3}]', '[{"vendas":0}]',
                              '[{"vendas":2.5}]', '[{"vendas":1000}]', '[{"vendas":"2"}]', '[1]'] LOOP
    PERFORM pg_temp.checa(NOT public.caminhos_de_flag_validos(ruim::jsonb), 'régua torta recusada: ' || ruim);
  END LOOP;
  PERFORM pg_temp.checa(public.caminhos_de_flag_validos('[{"vendas":2},{"vendas":1,"visitas":8,"captacoes":1}]'),
    'régua com dois caminhos aceita');

  v := pg_temp.como(f.l1, format($q$UPDATE public.flag_reguas SET caminhos = '[{"vendas":1}]' WHERE tenant_id = %L RETURNING 'mudou'$q$, f.t));
  PERFORM pg_temp.checa(v IS NULL, 'corretor não muda a régua (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.lider, format($q$UPDATE public.flag_reguas SET caminhos = '[{"vendas":1}]' WHERE tenant_id = %L RETURNING 'mudou'$q$, f.t));
  PERFORM pg_temp.checa(v IS NULL, 'líder não muda a régua da casa (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.fora, format('SELECT count(*)::text FROM public.flag_reguas WHERE tenant_id = %L', f.t));
  PERFORM pg_temp.checa(v = '0', 'admin de outra casa não lê esta régua (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.l1, format('SELECT count(*)::text FROM public.flag_reguas WHERE tenant_id = %L', f.t));
  PERFORM pg_temp.checa(v = '4', 'a casa lê a própria régua (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.admin, format($q$INSERT INTO public.flag_reguas (tenant_id, atuacao, nivel, caminhos) VALUES (%L, 'prontos', 'verde', '[{"vendas":0}]') ON CONFLICT (tenant_id, atuacao, nivel) DO UPDATE SET caminhos = EXCLUDED.caminhos RETURNING 'gravou'$q$, f.t));
  PERFORM pg_temp.checa(v LIKE '%flag_reguas_caminhos_check%', 'nem a diretoria grava régua torta (veio ' || coalesce(v, 'nada') || ')');
  RAISE NOTICE 'OK 1 · a régua é da diretoria e o banco não aceita régua torta';
END $$;

-- 2. As métricas do mês e a conta por período -----------------------------------
DO $$
DECLARE f record; p jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  p := pg_temp.flags(f.admin);
  PERFORM pg_temp.checa(pg_temp.de(p, f.l1)->'metricas' = '{"vendas":1,"visitas":3,"captacoes":0}'::jsonb,
    'l1: 1 venda assinada e 3 visitas no mês (veio ' || (pg_temp.de(p, f.l1)->'metricas')::text || ')');
  PERFORM pg_temp.checa((pg_temp.de(p, f.l2)->'metricas'->>'vendas')::int = 0, 'proposta só enviada não é venda');
  PERFORM pg_temp.checa((public.metricas_do_periodo(f.t, f.l2, '2026-08-01', '2026-08-31')->>'visitas')::int = 2,
    'o mesmo lead em dois dias são duas visitas; evento + agenda no mesmo dia, uma');
  PERFORM pg_temp.checa((public.metricas_do_periodo(f.t, f.l2, '2026-08-10', '2026-08-10')->>'visitas')::int = 1,
    'no dia 10, evento + agenda do mesmo lead = uma visita');
  RAISE NOTICE 'OK 2 · as métricas do mês vêm de evento';
END $$;

-- 3. A flag e o "falta para subir" ---------------------------------------------
DO $$
DECLARE f record; p jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  p := pg_temp.flags(f.admin);
  PERFORM pg_temp.checa(pg_temp.de(p, f.l1)->>'flag' = 'amarelo' AND pg_temp.de(p, f.l1)->>'proximo' = 'verde'
      AND pg_temp.de(p, f.l1)->'falta' = '{"vendas":1}'::jsonb,
    'l1 é amarelo e falta 1 venda (o caminho curto), não 5 visitas (o primeiro da lista) (veio ' || pg_temp.de(p, f.l1)::text || ')');
  PERFORM pg_temp.checa(pg_temp.de(p, f.p1)->>'flag' = 'vermelho' AND pg_temp.de(p, f.p1)->'falta' = '{"captacoes":1}'::jsonb,
    'p1 tem os números do l1 e é vermelho: a régua de Prontos pede captação (veio ' || pg_temp.de(p, f.p1)::text || ')');
  PERFORM pg_temp.checa(pg_temp.de(p, f.l2)->>'flag' = 'vermelho' AND pg_temp.de(p, f.l2)->>'proximo' = 'amarelo'
      AND pg_temp.de(p, f.l2)->'falta' = '{"vendas":1}'::jsonb,
    'l2 (atuação no formato legado) é vermelho e o curto até o amarelo é 1 venda, não 4 visitas (veio ' || pg_temp.de(p, f.l2)::text || ')');
  PERFORM pg_temp.checa(pg_temp.de(p, f.l3)->>'flag' = 'verde' AND pg_temp.de(p, f.l3)->'falta' = 'null'::jsonb,
    'l3 é verde: não falta nada (veio ' || pg_temp.de(p, f.l3)::text || ')');
  PERFORM pg_temp.checa(pg_temp.de(p, f.sem)->'atuacao' = 'null'::jsonb AND pg_temp.de(p, f.sem)->'flag' = 'null'::jsonb,
    'sem atuação gravada: não classificado');
  PERFORM pg_temp.checa(pg_temp.de(p, f.misto)->'atuacao' = 'null'::jsonb AND pg_temp.de(p, f.misto)->'flag' = 'null'::jsonb,
    'quem atende os dois lados não cabe numa régua só: não classificado');
  PERFORM pg_temp.checa(pg_temp.de(p, f.p1)->>'atuacao' = 'prontos', 'prontos + alugados é Prontos');
  RAISE NOTICE 'OK 3 · a flag, por atuação, com o caminho mais curto';
END $$;

-- 4. Mudar a régua reclassifica na hora; sem régua, ninguém é classificado ---
DO $$
DECLARE f record; p jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  PERFORM pg_temp.como(f.admin, format($q$UPDATE public.flag_reguas SET caminhos = '[{"visitas":3}]' WHERE tenant_id = %L AND atuacao = 'lancamentos' AND nivel = 'verde' RETURNING 'ok'$q$, f.t));
  p := pg_temp.flags(f.admin);
  PERFORM pg_temp.checa(pg_temp.de(p, f.l1)->>'flag' = 'verde', 'a diretoria baixou o verde para 3 visitas e o l1 virou verde na hora');
  PERFORM pg_temp.checa(pg_temp.de(p, f.l3)->>'flag' = 'amarelo', 'e o l3, sem visita, caiu para amarelo');

  PERFORM pg_temp.como(f.admin, format($q$DELETE FROM public.flag_reguas WHERE tenant_id = %L AND atuacao = 'prontos' RETURNING 'ok'$q$, f.t));
  p := pg_temp.flags(f.admin);
  PERFORM pg_temp.checa(pg_temp.de(p, f.p1)->'flag' = 'null'::jsonb AND pg_temp.de(p, f.p1)->>'atuacao' = 'prontos',
    'sem régua de Prontos, o p1 tem atuação e fica sem flag — não vira vermelho');

  -- Só a régua de verde: quem não chega lá é vermelho, e o próximo é o verde.
  PERFORM pg_temp.como(f.admin, format($q$INSERT INTO public.flag_reguas (tenant_id, atuacao, nivel, caminhos) VALUES (%L, 'prontos', 'verde', '[{"captacoes":2}]') RETURNING 'ok'$q$, f.t));
  p := pg_temp.flags(f.admin);
  PERFORM pg_temp.checa(pg_temp.de(p, f.p1)->>'flag' = 'vermelho' AND pg_temp.de(p, f.p1)->>'proximo' = 'verde'
      AND pg_temp.de(p, f.p1)->'falta' = '{"captacoes":2}'::jsonb,
    'só com verde cadastrado, vermelho mira o verde (veio ' || pg_temp.de(p, f.p1)::text || ')');
  RAISE NOTICE 'OK 4 · mudar a régua reclassifica sem deploy';
END $$;

-- 5. Quem vê o quê ------------------------------------------------------------------
DO $$
DECLARE f record; p jsonb; v text;
BEGIN
  SELECT * INTO f FROM fx;
  p := pg_temp.flags(f.admin);
  PERFORM pg_temp.checa(jsonb_array_length(p->'pessoas') = 7, 'a diretoria vê os 7 que vendem (veio ' || jsonb_array_length(p->'pessoas') || ')');
  p := pg_temp.flags(f.lider);
  PERFORM pg_temp.checa((SELECT array_agg(DISTINCT x->>'equipe') FROM jsonb_array_elements(p->'pessoas') x) = ARRAY['Lançamentos'],
    'o líder vê só a equipe dele');
  v := pg_temp.como(f.l1, format('SELECT public.flags_do_mes(%L)::text', f.t));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'corretor não vê as flags da casa (veio ' || left(coalesce(v, 'nada'), 80) || ')');
  v := pg_temp.como(f.fora, format('SELECT public.flags_do_mes(%L)::text', f.t));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'admin de outra casa não vê (veio ' || left(coalesce(v, 'nada'), 80) || ')');
  v := pg_temp.como(f.l1, 'SELECT count(*)::text FROM public.flag_snapshots');
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'o mês fechado não se lê pela tela (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.admin, 'SELECT public.fechar_flags_do_mes()::text');
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'ninguém fecha o mês pela tela (veio ' || coalesce(v, 'nada') || ')');
  RAISE NOTICE 'OK 5 · a diretoria vê a casa, o líder a equipe, o corretor nada';
END $$;

-- 6. Fechar o mês ----------------------------------------------------------------
DO $$
DECLARE f record; n int; p jsonb; v text;
BEGIN
  SELECT * INTO f FROM fx;
  n := public.fechar_flags_do_mes(f.mes_passado);
  PERFORM pg_temp.checa(n >= 7, 'o mês passado fecha para os 7 desta casa (gravou ' || n || ')');
  PERFORM pg_temp.checa((SELECT flag FROM flag_snapshots WHERE tenant_id = f.t AND user_id = f.l1 AND mes = f.mes_passado) = 'vermelho',
    'no mês passado o l1 não fez nada: fechou vermelho');
  PERFORM pg_temp.checa((SELECT flag FROM flag_snapshots WHERE tenant_id = f.t AND user_id = f.sem AND mes = f.mes_passado) IS NULL,
    'quem não tem atuação fecha sem flag');

  -- A régua muda depois: o mês fechado não muda junto.
  UPDATE flag_reguas SET caminhos = '[{"vendas":99}]' WHERE tenant_id = f.t AND atuacao = 'lancamentos' AND nivel = 'amarelo';
  n := public.fechar_flags_do_mes(f.mes_passado);
  PERFORM pg_temp.checa(n = 0, 'fechar de novo não grava nada (gravou ' || n || ')');

  p := pg_temp.flags(f.admin);
  PERFORM pg_temp.checa(pg_temp.de(p, f.l1)->>'antes' = 'vermelho' AND pg_temp.de(p, f.l1)->>'flag' = 'verde',
    'o mês atual diz de onde ele veio: era vermelho, está verde (veio ' || pg_temp.de(p, f.l1)::text || ')');

  BEGIN
    PERFORM public.fechar_flags_do_mes(f.mes);
    v := 'fechou';
  EXCEPTION WHEN OTHERS THEN v := SQLERRM;
  END;
  PERFORM pg_temp.checa(v = 'mes_aberto', 'o mês em andamento não fecha (veio ' || v || ')');
  PERFORM pg_temp.checa(EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'flags-fechar-mes' AND schedule = '0 6 * * *' AND active),
    'o relógio que fecha o mês está ligado');
  RAISE NOTICE 'OK 6 · o mês fecha uma vez e fica como fechou';
END $$;

ROLLBACK;
