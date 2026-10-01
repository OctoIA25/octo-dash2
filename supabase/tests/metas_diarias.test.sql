-- ============================================================
-- A.4 · Metas diárias (20261009_metas_diarias.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/metas_diarias.test.sql
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

CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7c2a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7c2a0000-0000-4000-a000-000000000002'::uuid AS t2,
  '7c2b0000-0000-4000-a000-000000000001'::uuid AS admin,
  '7c2b0000-0000-4000-a000-000000000002'::uuid AS lider,
  '7c2b0000-0000-4000-a000-000000000003'::uuid AS cl,
  '7c2b0000-0000-4000-a000-000000000004'::uuid AS cp,
  '7c2b0000-0000-4000-a000-000000000005'::uuid AS cp2,
  '7c2b0000-0000-4000-a000-000000000006'::uuid AS fora,
  '7c2c0000-0000-4000-a000-000000000001'::uuid AS equipe_l,
  '7c2c0000-0000-4000-a000-000000000002'::uuid AS equipe_p,
  '7c2d0000-0000-4000-a000-000000000001'::uuid AS l1,
  '7c2d0000-0000-4000-a000-000000000002'::uuid AS l2,
  '7c2d0000-0000-4000-a000-000000000003'::uuid AS l3,
  '7c2d0000-0000-4000-a000-000000000004'::uuid AS l4,
  (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje;

INSERT INTO tenants (id, code, name) SELECT t, 'teste-metas-diarias', 'Teste Metas Diárias' FROM fx
UNION ALL SELECT t2, 'teste-metas-diarias-viz', 'Vizinha MD' FROM fx ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT v.id, v.email, v.meta FROM fx, LATERAL (VALUES
  (fx.admin, 'admin@teste-md.dev', '{"name":"Ana Diretora"}'::jsonb),
  (fx.lider, 'lider@teste-md.dev', '{"name":"Lia Líder"}'::jsonb),
  (fx.cl,    'cl@teste-md.dev',    '{"name":"Willian Lançamento"}'::jsonb),
  (fx.cp,    'cp@teste-md.dev',    '{"name":"Paula Pronto"}'::jsonb),
  (fx.cp2,   'cp2@teste-md.dev',   '{"name":"Pedro Pronto"}'::jsonb),
  (fx.fora,  'fora@teste-md.dev',  '{"name":"Fred de Fora"}'::jsonb)
) AS v(id, email, meta) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teams (id, tenant_id, name, leader_user_id, leader_user_ids)
SELECT equipe_l, t, 'Lançamentos', lider, ARRAY[lider] FROM fx
UNION ALL SELECT equipe_p, t, 'Prontos', NULL, '{}'::uuid[] FROM fx;

INSERT INTO public.tenant_memberships (tenant_id, user_id, role, team_id, permissions)
SELECT t, admin, 'admin', NULL::uuid, '{}'::jsonb FROM fx
UNION ALL SELECT t, lider, 'team_leader', equipe_l, '{"atuacao":["lancamentos"]}' FROM fx
UNION ALL SELECT t, cl,    'corretor',    equipe_l, '{"atuacao":["lancamentos"]}' FROM fx
UNION ALL SELECT t, cp,    'corretor',    equipe_p, '{"atuacao":["prontos"]}' FROM fx
UNION ALL SELECT t, cp2,   'corretor',    equipe_p, '{"atuacao":["prontos"]}' FROM fx
UNION ALL SELECT t2, fora, 'corretor',    NULL, '{"atuacao":["prontos"]}' FROM fx;

-- Corte à meia-noite: qualquer lançamento sai atrasado — o resultado não depende da hora em que o teste roda.
INSERT INTO public.tenant_metas_diarias_config (tenant_id, corte) SELECT t, '00:00' FROM fx;

-- O mundo do dia, com os gatilhos de usuário desligados (leads, propostas e
-- imóveis têm dezenas): o cenário precisa ser exato.
SET LOCAL session_replication_role = replica;
INSERT INTO public.leads (id, tenant_id, name, status, assigned_agent_id)
SELECT l1, t, 'Lead L1', 'Visita Realizada', cl::text FROM fx
UNION ALL SELECT l2, t, 'Lead L2 parado', 'Interação', cl::text FROM fx
UNION ALL SELECT l3, t, 'Lead L3 da Paula', 'Interação', cp::text FROM fx
UNION ALL SELECT l4, t, 'Lead L4 arquivado', 'Arquivado', cl::text FROM fx;

INSERT INTO public.lead_events (tenant_id, lead_id, lead_source, event_type, para, ator_tipo, ator_user_id, metadata, created_at)
SELECT t, l1::text, 'leads', 'lead.stage_changed', 'Visita Realizada', 'usuario', cl, '{}'::jsonb, now() FROM fx
UNION ALL SELECT t, l2::text, 'leads', 'lead.stage_changed', 'Interação', 'usuario', cl, '{}'::jsonb, now() - interval '10 days' FROM fx
UNION ALL SELECT t, l3::text, 'leads', 'lead.stage_changed', 'Interação', 'usuario', cp, '{}'::jsonb, now() - interval '10 days' FROM fx;

-- A agenda: A1 pelo id, A2 só pelo e-mail (como 25 das 32 da Lotus), A3 é da
-- Paula, A4 venceu ontem, A5 foi concluída ontem, A6 é a visita de hoje no L1.
INSERT INTO public.agenda_eventos (tenant_id, corretor_id, corretor_email, titulo, data, horario, tipo, status, lead_uuid, lead_nome, imovel_titulo)
SELECT t, cl::text, 'cl@teste-md.dev', 'Visita no plantão', hoje, '14:00', 'visita_agendada', 'pendente', l1, 'Willian', 'RESERVA CASTANHEIRA' FROM fx
UNION ALL SELECT t, NULL, 'CL@teste-md.dev', 'Ligar de volta', hoje, '09:00', 'retornar_cliente', 'pendente', l2, 'Lead L2', NULL FROM fx
UNION ALL SELECT t, cp::text, 'cp@teste-md.dev', 'Visita da Paula', hoje, '10:00', 'visita_agendada', 'pendente', l3, 'Lead L3', NULL FROM fx
UNION ALL SELECT t, cl::text, 'cl@teste-md.dev', 'Ficou para trás', hoje - 1, '16:00', 'retornar_cliente', 'pendente', l2, 'Lead L2', NULL FROM fx
UNION ALL SELECT t, cl::text, 'cl@teste-md.dev', 'Feita ontem', hoje - 1, '15:00', 'visita_agendada', 'concluido', l2, 'Lead L2', NULL FROM fx
UNION ALL SELECT t, cl::text, 'cl@teste-md.dev', 'Visita feita hoje', hoje, '11:00', 'visita_realizada', 'concluido', l1, 'Lead L1', NULL FROM fx;

-- Os toques são no L1: um toque no L2 contaria como movimento, e ele deixaria de estar parado.
INSERT INTO public.lead_toques (tenant_id, lead_id, lead_source, canal, resultado, executado_por, executado_em)
SELECT t, l1::text, 'leads', 'whatsapp', 'nao_respondeu', cl, now() FROM fx
UNION ALL SELECT t, l1::text, 'leads', 'ligacao', 'nao_respondeu', cl, now() - interval '1 day' FROM fx;

INSERT INTO public.proposals (tenant_id, agent_user_id, value, created_at) SELECT t, cl, 400000, now() FROM fx;
INSERT INTO public.imoveis_locais (tenant_id, codigo_imovel, captador_id, created_at) SELECT t, 'TST-MD-1', cp, now() FROM fx;

INSERT INTO public.lia_perguntas_corretor (id, tenant_id, pergunta, status, corretor_id, lead_id, criado_em)
SELECT 'md-q1', t, 'O cliente pode usar FGTS?', 'pendente', cl::text, l1, now() FROM fx
UNION ALL SELECT 'md-q2', t, 'Já respondida', 'respondida', cl::text, l1, now() FROM fx
UNION ALL SELECT 'md-q3', t, 'Da Paula', 'pendente', cp::text, l3, now() FROM fx;
SET LOCAL session_replication_role = origin;

CREATE FUNCTION pg_temp.dia(p_user uuid, p_email text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.como(p_user, p_email, format('SELECT public.meu_dia(%L)::text', (SELECT t FROM fx)))::jsonb;
$$;

-- 1. Os campos dependem da atuação -----------------------------------------
DO $$
DECLARE f record; dl jsonb; dp jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  dl := pg_temp.dia(f.cl, 'cl@teste-md.dev'); dp := pg_temp.dia(f.cp, 'cp@teste-md.dev');
  PERFORM pg_temp.checa(dl->'campos' = '["visitas","propostas","retornos"]'::jsonb,
    'Lançamentos não vê captação (veio ' || (dl->'campos')::text || ')');
  PERFORM pg_temp.checa(dp->'campos' = '["captacoes","visitas","propostas","retornos"]'::jsonb,
    'Prontos vê captação (veio ' || (dp->'campos')::text || ')');
  PERFORM pg_temp.checa(public.campos_da_meta_diaria('"lancamentos"') = ARRAY['visitas','propostas','retornos'],
    'a string legada "lancamentos" também é só lançamentos');
  PERFORM pg_temp.checa(public.campos_da_meta_diaria('"prontos"') = ARRAY['captacoes','visitas','propostas','retornos'],
    'a string legada "prontos" vê captação');
  PERFORM pg_temp.checa(dl->'compromisso' = 'null'::jsonb, 'antes de lançar, não há compromisso');
  RAISE NOTICE 'OK 1 · o compromisso muda pela atuação';
END $$;

-- 2. Lançar: validação, completar com zero, corte e relançamento -----------
DO $$
DECLARE f record; v text; r jsonb; r2 jsonb; esperado_atrasado boolean;
BEGIN
  SELECT * INTO f FROM fx;
  v := pg_temp.como(f.cl, 'cl@teste-md.dev', format($q$SELECT public.lancar_meta_diaria(%L, '{"captacoes":2}')::text$q$, f.t));
  PERFORM pg_temp.checa(v = 'campo_invalido', 'Lançamentos não promete captação (veio ' || coalesce(v, 'nada') || ')');
  FOREACH v IN ARRAY ARRAY['{"visitas":-1}', '{"visitas":2.5}', '{"visitas":100}', '{"visitas":"3"}'] LOOP
    v := pg_temp.como(f.cl, 'cl@teste-md.dev', format('SELECT public.lancar_meta_diaria(%L, %L)::text', f.t, v));
    PERFORM pg_temp.checa(v = 'compromisso_invalido', 'número fora de 0..99 inteiro é recusado (veio ' || coalesce(v, 'nada') || ')');
  END LOOP;

  r := pg_temp.como(f.cl, 'cl@teste-md.dev', format($q$SELECT public.lancar_meta_diaria(%L, '{"visitas":3.0,"propostas":1}')::text$q$, f.t))::jsonb;
  PERFORM pg_temp.checa(r->'prometido' = '{"visitas":3,"propostas":1,"retornos":0}'::jsonb,
    'campo omitido vira 0 e 3.0 vira 3 (veio ' || (r->'prometido')::text || ')');
  esperado_atrasado := (now() AT TIME ZONE 'America/Sao_Paulo')::time > '00:00'::time;
  PERFORM pg_temp.checa((r->>'atrasado')::boolean = esperado_atrasado AND esperado_atrasado, 'lançar depois do corte da casa marca atrasado — e não bloqueia');

  r2 := pg_temp.como(f.cl, 'cl@teste-md.dev', format($q$SELECT public.lancar_meta_diaria(%L, '{"visitas":4,"propostas":1}')::text$q$, f.t))::jsonb;
  PERFORM pg_temp.checa((r2->'prometido'->>'visitas')::int = 4 AND r2->>'lancado_em' = r->>'lancado_em',
    'relançar corrige o número e guarda a hora do PRIMEIRO lançamento');
  RAISE NOTICE 'OK 2 · lançar o compromisso';
END $$;

-- 3. O dia do corretor: só o que é dele ------------------------------------
DO $$
DECLARE f record; d jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  d := pg_temp.dia(f.cl, 'cl@teste-md.dev');
  PERFORM pg_temp.checa((SELECT array_agg(x->>'titulo' ORDER BY ord) FROM jsonb_array_elements(d->'agenda') WITH ORDINALITY a(x, ord))
      = ARRAY['Ligar de volta', 'Visita feita hoje', 'Visita no plantão'],
    'agenda de hoje dele, por horário, casando pelo id E pelo e-mail — sem a da Paula e sem ontem (veio ' || (d->'agenda')::text || ')');
  PERFORM pg_temp.checa((SELECT array_agg(x->>'titulo') FROM jsonb_array_elements(d->'vencidas') x) = ARRAY['Ficou para trás'],
    'vencida: só a pendente de ontem — a concluída não (veio ' || (d->'vencidas')::text || ')');
  PERFORM pg_temp.checa((SELECT array_agg(x->>'nome') FROM jsonb_array_elements(d->'parados') x) = ARRAY['Lead L2 parado']
      AND (d->'parados'->0->>'dias')::int = 10,
    'parado há 10 dias: só o L2 dele (veio ' || (d->'parados')::text || ')');
  PERFORM pg_temp.checa((SELECT array_agg(x->>'pergunta') FROM jsonb_array_elements(d->'lia') x) = ARRAY['O cliente pode usar FGTS?'],
    'a LIA precisa dele: só a dúvida pendente dele (veio ' || (d->'lia')::text || ')');
  PERFORM pg_temp.checa((SELECT array_agg(x->>'id' ORDER BY x->>'nome') FROM jsonb_array_elements(d->'meus_leads') x) = ARRAY[f.l1::text, f.l2::text],
    'leads dele para o resgate: L1 e L2 — sem o da Paula e sem o arquivado');
  RAISE NOTICE 'OK 3 · agenda e filas nunca mostram o que é de outro corretor';
END $$;

-- 4. O realizado vem de evento ----------------------------------------------
DO $$
DECLARE f record; dl jsonb; dp jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  dl := pg_temp.dia(f.cl, 'cl@teste-md.dev'); dp := pg_temp.dia(f.cp, 'cp@teste-md.dev');
  PERFORM pg_temp.checa(dl->'realizado' = '{"visitas":1,"propostas":1,"retornos":1,"captacoes":0}'::jsonb,
    'visita do L1 conta uma vez (evento + agenda), proposta e toque de hoje, toque de ontem não (veio ' || (dl->'realizado')::text || ')');
  PERFORM pg_temp.checa((dp->'realizado'->>'captacoes')::int = 1, 'a captação da Paula conta para ela');
  RAISE NOTICE 'OK 4 · o realizado vem de evento, não de digitação';
END $$;

-- 5. O placar do gestor -------------------------------------------------------
DO $$
DECLARE f record; v text; p jsonb; pl jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  v := pg_temp.como(f.cp, 'cp@teste-md.dev', format($q$SELECT public.lancar_meta_diaria(%L, '{"captacoes":1}')::text$q$, f.t));
  p := pg_temp.como(f.admin, 'admin@teste-md.dev', format('SELECT public.placar_metas_diarias(%L)::text', f.t))::jsonb;
  PERFORM pg_temp.checa(p->'equipes' = '[{"equipe":"Lançamentos","corretores":2,"lancaram":1,"bateram":0,"aproveitamento":40},
                                         {"equipe":"Prontos","corretores":2,"lancaram":1,"bateram":1,"aproveitamento":100}]'::jsonb,
    'placar por equipe (Willian prometeu 4+1+0 e cumpriu 1+1 — o retorno a mais não cobre a visita que faltou: 40%; Paula prometeu 1 captação e fez) (veio ' || (p->'equipes')::text || ')');
  PERFORM pg_temp.checa(
    (SELECT sum((e->>'lancaram')::int) FROM jsonb_array_elements(p->'equipes') e)
      = (SELECT count(*) FROM jsonb_array_elements(p->'pessoas') x WHERE (x->>'lancou')::boolean)
    AND (SELECT sum((e->>'bateram')::int) FROM jsonb_array_elements(p->'equipes') e)
      = (SELECT count(*) FROM jsonb_array_elements(p->'pessoas') x WHERE (x->>'bateu')::boolean),
    'o placar por equipe soma igual à contagem individual');

  pl := pg_temp.como(f.lider, 'lider@teste-md.dev', format('SELECT public.placar_metas_diarias(%L)::text', f.t))::jsonb;
  PERFORM pg_temp.checa((SELECT array_agg(x->>'equipe') FROM jsonb_array_elements(pl->'equipes') x) = ARRAY['Lançamentos'],
    'o líder vê só a equipe dele (veio ' || (pl->'equipes')::text || ')');

  v := pg_temp.como(f.cl, 'cl@teste-md.dev', format('SELECT public.placar_metas_diarias(%L)::text', f.t));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'corretor não vê o placar (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.fora, 'fora@teste-md.dev', format('SELECT public.placar_metas_diarias(%L)::text', f.t));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'quem é de outra casa não vê o placar (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.fora, 'fora@teste-md.dev', format('SELECT public.meu_dia(%L)::text', f.t));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'nem o dia de ninguém daqui (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.cl, 'cl@teste-md.dev', 'SELECT count(*)::text FROM public.metas_diarias');
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'a tabela não se lê pela tela, só pelas funções (veio ' || coalesce(v, 'nada') || ')');
  RAISE NOTICE 'OK 5 · placar da gestão, por equipe';
END $$;

ROLLBACK;
