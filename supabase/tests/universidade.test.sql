-- ============================================================
-- A.7 · Universidade (20261012_universidade.sql).
--
--   docker exec -i supabase_db_octo-plano-local psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f - < supabase/tests/universidade.test.sql
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

-- Executa como uma pessoa logada (ou anônima, com p_user nulo); devolve o resultado ou o erro.
CREATE FUNCTION pg_temp.como(p_user uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  IF p_user IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    SET LOCAL ROLE anon;
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
  END IF;
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.erro(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'passou';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

CREATE TEMP TABLE fx ON COMMIT DROP AS SELECT
  '7a1a0000-0000-4000-a000-000000000001'::uuid AS t,
  '7a1a0000-0000-4000-a000-000000000002'::uuid AS t2,
  '7a1b0000-0000-4000-a000-000000000001'::uuid AS admin,
  '7a1b0000-0000-4000-a000-000000000002'::uuid AS lider,
  '7a1b0000-0000-4000-a000-000000000003'::uuid AS ana,      -- equipe do líder, cargo Corretor
  '7a1b0000-0000-4000-a000-000000000004'::uuid AS bruno,    -- equipe do líder, cargo Corretor
  '7a1b0000-0000-4000-a000-000000000005'::uuid AS caio,     -- outra equipe, cargo Captador
  '7a1b0000-0000-4000-a000-000000000006'::uuid AS fora,     -- admin de outra casa
  '7a1c0000-0000-4000-a000-000000000001'::uuid AS equipe_l,
  '7a1c0000-0000-4000-a000-000000000002'::uuid AS equipe_p,
  '7a1d0000-0000-4000-a000-000000000001'::uuid AS cargo_corretor,
  '7a1d0000-0000-4000-a000-000000000002'::uuid AS cargo_captador,
  '7a1e0000-0000-4000-a000-000000000001'::uuid AS material;

INSERT INTO tenants (id, code, name) SELECT t, 'teste-univ', 'Teste Universidade' FROM fx
UNION ALL SELECT t2, 'teste-univ-viz', 'Vizinha Univ' FROM fx ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT v.id, v.email, v.meta FROM fx, LATERAL (VALUES
  (fx.admin, 'admin@teste-univ.dev', '{"name":"Diana Diretora"}'::jsonb),
  (fx.lider, 'lider@teste-univ.dev', '{"name":"Leo Líder"}'::jsonb),
  (fx.ana,   'ana@teste-univ.dev',   '{"name":"Ana Aluna"}'::jsonb),
  (fx.bruno, 'bruno@teste-univ.dev', '{"name":"Bruno Aluno"}'::jsonb),
  (fx.caio,  'caio@teste-univ.dev',  '{"name":"Caio Captador"}'::jsonb),
  (fx.fora,  'fora@teste-univ.dev',  '{"name":"Fred de Fora"}'::jsonb)
) AS v(id, email, meta) ON CONFLICT (id) DO NOTHING;

INSERT INTO cargos (id, tenant_id, nome) SELECT cargo_corretor, t, 'Corretor' FROM fx
UNION ALL SELECT cargo_captador, t, 'Captador' FROM fx;
INSERT INTO teams (id, tenant_id, name, leader_user_id, leader_user_ids)
SELECT equipe_l, t, 'Lançamentos', lider, ARRAY[lider] FROM fx
UNION ALL SELECT equipe_p, t, 'Prontos', NULL, '{}'::uuid[] FROM fx;
INSERT INTO tenant_memberships (tenant_id, user_id, role, team_id, cargo_id)
SELECT t, admin, 'admin', NULL::uuid, NULL::uuid FROM fx
UNION ALL SELECT t, lider, 'team_leader', equipe_l, NULL FROM fx
UNION ALL SELECT t, ana,   'corretor', equipe_l, cargo_corretor FROM fx
UNION ALL SELECT t, bruno, 'corretor', equipe_l, cargo_corretor FROM fx
UNION ALL SELECT t, caio,  'corretor', equipe_p, cargo_captador FROM fx
UNION ALL SELECT t2, fora, 'admin', NULL, NULL FROM fx;

INSERT INTO materiais (id, tenant_id, titulo, obrigatorio) SELECT material, t, 'Plano de carreira', true FROM fx;

CREATE TEMP TABLE c (id uuid, aula1 uuid, aula2 uuid, rascunho uuid) ON COMMIT DROP;
INSERT INTO c VALUES (NULL, NULL, NULL, NULL);

-- Volta o relógio do último registro (simula o tempo assistindo).
CREATE FUNCTION pg_temp.passou(p_user uuid, p_aula uuid, p_segundos int) RETURNS void LANGUAGE sql AS $$
  UPDATE curso_progresso SET ultimo_registro = now() - make_interval(secs => p_segundos) WHERE user_id = p_user AND aula_id = p_aula;
$$;
CREATE FUNCTION pg_temp.assistir(p_user uuid, p_aula uuid, p_segundos int) RETURNS jsonb LANGUAGE sql AS $$
  SELECT pg_temp.como(p_user, format('SELECT public.registrar_progresso_aula(%L, %s)::text', p_aula, p_segundos))::jsonb;
$$;

-- 1. A diretoria monta o curso; ninguém mais ---------------------------------------------
DO $$
DECLARE f record; v text; v_curso uuid; curso jsonb;
BEGIN
  SELECT * INTO f FROM fx;
  curso := jsonb_build_object('titulo', 'Onboarding do corretor', 'descricao', 'Primeira semana na casa', 'categoria', 'treinamentos',
    'obrigatorio_para', jsonb_build_array(f.cargo_corretor), 'nota_corte', 70, 'publicado', true,
    'aulas', jsonb_build_array(
      jsonb_build_object('titulo', 'Boas-vindas', 'youtube_id', 'dQw4w9WgXcQ', 'duracao_seg', 100),
      jsonb_build_object('titulo', 'Como cadastrar imóvel', 'youtube_id', 'aBcDeFgHiJk', 'duracao_seg', 60)),
    'questoes', jsonb_build_array(
      jsonb_build_object('enunciado', 'Em quanto tempo o lead vai para o bolsão?', 'alternativas', '["30 min","1 hora","1 dia"]'::jsonb, 'correta', 1),
      jsonb_build_object('enunciado', 'Quem atende primeiro?', 'alternativas', '["A LIA","O corretor"]'::jsonb, 'correta', 0)));

  v := pg_temp.como(f.ana, format('SELECT public.curso_salvar(%L, %L)::text', f.t, curso));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'corretor não cria curso (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.lider, format('SELECT public.curso_salvar(%L, %L)::text', f.t, curso));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'líder não cria curso (veio ' || coalesce(v, 'nada') || ')');
  v := pg_temp.como(f.admin, format('SELECT public.curso_salvar(%L, %L)::text', f.t,
         jsonb_set(curso, '{aulas,0,youtube_id}', '"curto"')));
  PERFORM pg_temp.checa(v LIKE '%curso_aulas_youtube_id_check%', 'id de vídeo inválido recusado (veio ' || coalesce(v, 'nada') || ')');

  v := pg_temp.como(f.admin, format('SELECT public.curso_salvar(%L, %L)::text', f.t, curso));
  v_curso := v::uuid;
  UPDATE c SET id = v_curso,
         aula1 = (SELECT a.id FROM curso_aulas a WHERE a.curso_id = v_curso AND a.ordem = 1),
         aula2 = (SELECT a.id FROM curso_aulas a WHERE a.curso_id = v_curso AND a.ordem = 2);

  v := pg_temp.como(f.admin, format('SELECT public.curso_salvar(%L, %L)::text', f.t,
         jsonb_build_object('titulo', 'Rascunho', 'publicado', false, 'aulas', '[]'::jsonb, 'questoes', '[]'::jsonb)));
  UPDATE c SET rascunho = v::uuid;
  v := pg_temp.como(f.admin, format('SELECT public.curso_salvar(%L, %L)::text', f.t,
         jsonb_build_object('titulo', 'Vazio', 'publicado', true, 'aulas', '[]'::jsonb, 'questoes', '[]'::jsonb)));
  PERFORM pg_temp.checa(v = 'curso_sem_aula', 'curso sem aula não se publica (veio ' || coalesce(v, 'nada') || ')');

  v := pg_temp.como(f.ana, format('SELECT public.universidade_cursos(%L)::text', f.t));
  PERFORM pg_temp.checa((SELECT array_agg(x->>'titulo') FROM jsonb_array_elements(v::jsonb->'cursos') x) = ARRAY['Onboarding do corretor'],
    'o corretor só vê o publicado (veio ' || v || ')');
  PERFORM pg_temp.checa((v::jsonb->'cursos'->0->>'obrigatorio')::boolean, 'e sabe que é obrigatório para o cargo dele');
  v := pg_temp.como(f.ana, format('SELECT public.curso_ver(%L)::text', (SELECT rascunho FROM c)));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'rascunho não abre para o corretor');
  v := pg_temp.como(f.ana, format('SELECT public.curso_ver(%L)::text', v_curso));
  PERFORM pg_temp.checa(jsonb_array_length(v::jsonb->'questoes') = 2 AND v NOT LIKE '%correta%', 'a prova chega sem gabarito');
  v := pg_temp.como(f.ana, format('SELECT public.curso_para_editar(%L)::text', v_curso));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'o gabarito não sai para o corretor');
  v := pg_temp.como(f.ana, 'SELECT count(*)::text FROM public.prova_questoes');
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'nem lendo a tabela (veio ' || coalesce(v, 'nada') || ')');
  RAISE NOTICE 'OK 1 · a diretoria monta o curso; a prova chega sem gabarito';
END $$;

-- 2. Curso obrigatório chega no sino, uma vez -------------------------------------------
DO $$
DECLARE f record; k record;
BEGIN
  SELECT * INTO f FROM fx; SELECT * INTO k FROM c;
  PERFORM pg_temp.checa((SELECT count(*) FROM notifications WHERE link_type = 'curso' AND link_id = k.id::text AND user_id IN (f.ana, f.bruno)) = 2,
    'Ana e Bruno (cargo Corretor) foram avisados');
  PERFORM pg_temp.checa(NOT EXISTS (SELECT 1 FROM notifications WHERE link_type = 'curso' AND user_id IN (f.caio, f.lider, f.admin)),
    'quem não tem o cargo não');
  UPDATE cursos SET publicado = true, obrigatorio_para = obrigatorio_para WHERE id = k.id;
  PERFORM pg_temp.checa((SELECT count(*) FROM notifications WHERE link_type = 'curso' AND link_id = k.id::text) = 2, 'salvar de novo não avisa de novo');
  UPDATE cursos SET obrigatorio_para = ARRAY[f.cargo_corretor, f.cargo_captador] WHERE id = k.id;
  PERFORM pg_temp.checa((SELECT count(*) FROM notifications WHERE link_type = 'curso' AND link_id = k.id::text AND user_id = f.caio) = 1,
    'pôs o cargo Captador: o Caio é avisado');
  RAISE NOTICE 'OK 2 · o obrigatório chega no sino, uma vez por pessoa';
END $$;

-- 3. Assistir de verdade: arrastar até o fim não conclui -------------------------------
DO $$
DECLARE f record; k record; r jsonb; v text; longo uuid; aula_longa uuid;
BEGIN
  SELECT * INTO f FROM fx; SELECT * INTO k FROM c;
  r := pg_temp.assistir(f.ana, k.aula1, 100);
  PERFORM pg_temp.checa((r->>'segundos_vistos')::int <= 5 AND NOT (r->>'concluida')::boolean,
    'mandar "vi tudo" no primeiro segundo não conclui (veio ' || r::text || ')');
  PERFORM pg_temp.passou(f.ana, k.aula1, 30);
  r := pg_temp.assistir(f.ana, k.aula1, 100);
  PERFORM pg_temp.checa((r->>'segundos_vistos')::int BETWEEN 60 AND 70 AND NOT (r->>'concluida')::boolean,
    'em 30 s de relógio, no máximo 2× (+5): ~65 (veio ' || r::text || ')');
  PERFORM pg_temp.passou(f.ana, k.aula1, 30);
  r := pg_temp.assistir(f.ana, k.aula1, 100);
  PERFORM pg_temp.checa((r->>'segundos_vistos')::int = 100 AND (r->>'concluida')::boolean, 'assistiu de verdade: concluída (veio ' || r::text || ')');
  r := pg_temp.assistir(f.ana, k.aula1, 10);
  PERFORM pg_temp.checa((r->>'segundos_vistos')::int = 100 AND (r->>'concluida')::boolean, 'o progresso não volta');

  -- Bruno começa a aula 1 e para no meio do curso (é o "no meio" do painel).
  PERFORM pg_temp.assistir(f.bruno, k.aula1, 0);
  PERFORM pg_temp.passou(f.bruno, k.aula1, 60);
  PERFORM pg_temp.assistir(f.bruno, k.aula1, 100);

  -- Teto por registro: uma hora com a aba aberta não vira uma hora vista de uma vez.
  longo := pg_temp.como(f.admin, format('SELECT public.curso_salvar(%L, %L)::text', f.t, jsonb_build_object(
             'titulo', 'Longo', 'publicado', true, 'questoes', '[]'::jsonb,
             'aulas', jsonb_build_array(jsonb_build_object('titulo', 'Aula longa', 'youtube_id', 'ZZZZZZZZZZZ', 'duracao_seg', 1000)))))::uuid;
  SELECT id INTO aula_longa FROM curso_aulas WHERE curso_id = longo;
  PERFORM pg_temp.assistir(f.bruno, aula_longa, 0);
  PERFORM pg_temp.passou(f.bruno, aula_longa, 3600);
  r := pg_temp.assistir(f.bruno, aula_longa, 1000);
  PERFORM pg_temp.checa((r->>'segundos_vistos')::int = 240 AND NOT (r->>'concluida')::boolean,
    'no máximo 4 minutos por registro: 240 de 1000, não concluída (veio ' || r::text || ')');

  v := pg_temp.como(f.fora, format('SELECT public.registrar_progresso_aula(%L, 10)::text', k.aula1));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'quem é de fora não registra');
  v := pg_temp.como(f.ana, 'SELECT count(*)::text FROM public.curso_progresso');
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'o progresso não se escreve direto');
  RAISE NOTICE 'OK 3 · assistir é medido pelo relógio, não pela barra';
END $$;

-- 4. A prova: reprova, tenta de novo, as duas ficam --------------------------------------
DO $$
DECLARE f record; k record; r jsonb; v text;
BEGIN
  SELECT * INTO f FROM fx; SELECT * INTO k FROM c;
  v := pg_temp.como(f.ana, format($q$SELECT public.responder_prova(%L, '[1,0]')::text$q$, k.id));
  PERFORM pg_temp.checa(v = 'aulas_pendentes', 'prova só depois de todas as aulas (veio ' || coalesce(v, 'nada') || ')');

  PERFORM pg_temp.assistir(f.ana, k.aula2, 0);
  PERFORM pg_temp.passou(f.ana, k.aula2, 60);
  PERFORM pg_temp.assistir(f.ana, k.aula2, 60);

  v := pg_temp.como(f.ana, format($q$SELECT public.responder_prova(%L, '[1]')::text$q$, k.id));
  PERFORM pg_temp.checa(v = 'responda_todas', 'responde todas (veio ' || coalesce(v, 'nada') || ')');
  r := pg_temp.como(f.ana, format($q$SELECT public.responder_prova(%L, '[0,0]')::text$q$, k.id))::jsonb;
  PERFORM pg_temp.checa((r->>'nota')::int = 50 AND NOT (r->>'aprovado')::boolean AND r->'certificado' = 'null'::jsonb,
    'acertou 1 de 2: 50, reprovado, sem certificado (veio ' || r::text || ')');
  r := pg_temp.como(f.ana, format($q$SELECT public.responder_prova(%L, '[1,0]')::text$q$, k.id))::jsonb;
  PERFORM pg_temp.checa((r->>'nota')::int = 100 AND (r->>'aprovado')::boolean AND (r->'certificado'->>'hash') ~ '^[0-9a-f]{64}$',
    'nova tentativa: 100, aprovado, certificado (veio ' || r::text || ')');
  PERFORM pg_temp.checa((SELECT count(*) FROM prova_tentativas WHERE curso_id = k.id AND user_id = f.ana) = 2, 'as duas tentativas ficaram');
  v := pg_temp.erro(format('UPDATE public.prova_tentativas SET nota = 100 WHERE user_id = %L', f.ana));
  PERFORM pg_temp.checa(v = 'tentativa_nao_se_edita', 'tentativa não se edita (veio ' || v || ')');

  r := pg_temp.como(f.ana, format($q$SELECT public.responder_prova(%L, '[1,0]')::text$q$, k.id))::jsonb;
  PERFORM pg_temp.checa((SELECT count(*) FROM certificados WHERE curso_id = k.id AND user_id = f.ana) = 1
                        AND NOT (r->'certificado'->>'novo')::boolean, 'aprovar de novo não emite outro certificado');
  RAISE NOTICE 'OK 4 · reprovar permite nova tentativa, e as duas ficam registradas';
END $$;

-- 5. O certificado confere pelo hash -------------------------------------------------------
DO $$
DECLARE f record; k record; h text; r jsonb; v text;
BEGIN
  SELECT * INTO f FROM fx; SELECT * INTO k FROM c;
  SELECT hash INTO h FROM certificados WHERE curso_id = k.id AND user_id = f.ana;
  r := pg_temp.como(NULL, format('SELECT public.verificar_certificado(%L)::text', h))::jsonb;
  PERFORM pg_temp.checa((r->>'valido')::boolean AND r->>'nome' = 'Ana Aluna' AND r->>'curso' = 'Onboarding do corretor'
                        AND r->>'imobiliaria' = 'Teste Universidade', 'qualquer um com o hash confere, sem login (veio ' || r::text || ')');
  r := pg_temp.como(NULL, format('SELECT public.verificar_certificado(%L)::text', repeat('a', 64)))::jsonb;
  PERFORM pg_temp.checa(r = '{"valido": false}'::jsonb, 'hash que não existe: inválido, sem dado nenhum');
  v := pg_temp.erro(format($q$UPDATE public.certificados SET nome = 'Outra Pessoa' WHERE hash = %L$q$, h));
  PERFORM pg_temp.checa(v = 'certificado_nao_se_edita', 'certificado não se edita (veio ' || v || ')');
  -- Adulterado por fora do gatilho: o hash deixa de bater.
  SET LOCAL session_replication_role = replica;
  UPDATE certificados SET nome = 'Outra Pessoa' WHERE hash = h;
  SET LOCAL session_replication_role = origin;
  r := pg_temp.como(NULL, format('SELECT public.verificar_certificado(%L)::text', h))::jsonb;
  PERFORM pg_temp.checa(NOT (r->>'valido')::boolean, 'nome trocado no banco: o hash não confere mais (veio ' || r::text || ')');
  v := pg_temp.como(NULL, 'SELECT count(*)::text FROM public.certificados');
  PERFORM pg_temp.checa(v LIKE 'permission denied%', 'a tabela não se lê de fora');
  RAISE NOTICE 'OK 5 · o certificado confere pelo hash, e o adulterado não';
END $$;

-- 6. O painel do gestor: quem não abriu, nominalmente ---------------------------------------
DO $$
DECLARE f record; k record; p jsonb; v text;
BEGIN
  SELECT * INTO f FROM fx; SELECT * INTO k FROM c;
  p := pg_temp.como(f.admin, format('SELECT public.curso_painel(%L)::text', k.id))::jsonb;
  PERFORM pg_temp.checa((SELECT jsonb_object_agg(x->>'nome', x->>'situacao') FROM jsonb_array_elements(p) x)
      = '{"Ana Aluna":"concluiu","Bruno Aluno":"no_meio","Caio Captador":"nao_abriu","Leo Líder":"nao_abriu"}'::jsonb,
    'concluiu · no meio · não abriu, nome por nome (veio ' || p::text || ')');
  PERFORM pg_temp.checa(p->0->>'situacao' = 'nao_abriu' AND p->-1->>'situacao' = 'concluiu' AND (p->0->>'obrigatorio') IN ('true', 'false'),
    'concluiu · no meio · não abriu, nome por nome (veio ' || p::text || ')');
  p := pg_temp.como(f.lider, format('SELECT public.curso_painel(%L)::text', k.id))::jsonb;
  PERFORM pg_temp.checa((SELECT array_agg(x->>'nome' ORDER BY x->>'nome') FROM jsonb_array_elements(p) x) = ARRAY['Ana Aluna', 'Bruno Aluno', 'Leo Líder'],
    'o líder vê a equipe dele, ele incluído (veio ' || p::text || ')');
  v := pg_temp.como(f.ana, format('SELECT public.curso_painel(%L)::text', k.id));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'corretor não vê o painel');
  RAISE NOTICE 'OK 6 · o painel do gestor mostra quem não abriu, nominalmente';
END $$;

-- 7. A trilha do PDI -------------------------------------------------------------------------
DO $$
DECLARE f record; k record; v text; t jsonb; tarefa uuid;
BEGIN
  SELECT * INTO f FROM fx; SELECT * INTO k FROM c;
  v := pg_temp.como(f.lider, format($q$SELECT public.trilha_adicionar(%L, %L, 'tarefa', NULL, 'Acompanhar 3 visitas do Leo')::text$q$, f.t, f.bruno));
  tarefa := v::uuid;
  PERFORM pg_temp.como(f.lider, format($q$SELECT public.trilha_adicionar(%L, %L, 'material', %L, NULL)::text$q$, f.t, f.bruno, f.material));
  PERFORM pg_temp.como(f.lider, format($q$SELECT public.trilha_prazo(%L, %L, '2026-12-31')::text$q$, f.t, f.bruno));
  v := pg_temp.como(f.lider, format($q$SELECT public.trilha_adicionar(%L, %L, 'tarefa', NULL, 'outra equipe')::text$q$, f.t, f.caio));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'o líder não mexe na trilha de outra equipe');
  v := pg_temp.como(f.bruno, format($q$SELECT public.trilha_adicionar(%L, %L, 'tarefa', NULL, 'eu mesmo')::text$q$, f.t, f.bruno));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'o corretor não monta a própria trilha');

  t := pg_temp.como(f.bruno, format('SELECT public.trilha_ver(%L, %L)::text', f.t, f.bruno))::jsonb;
  PERFORM pg_temp.checa(t->>'prazo' = '2026-12-31' AND t->>'gestor' = 'Leo Líder' AND NOT (t->>'pode_editar')::boolean, 'prazo e gestor (veio ' || t::text || ')');
  PERFORM pg_temp.checa((SELECT jsonb_object_agg(x->>'titulo', jsonb_build_array(x->>'origem', x->>'concluido')) FROM jsonb_array_elements(t->'itens') x)
      = '{"Acompanhar 3 visitas do Leo":["gestor","false"],"Plano de carreira":["gestor","false"],"Onboarding do corretor":["cargo","false"]}'::jsonb,
    'a tarefa, o material e o curso obrigatório do cargo, que entrou sozinho (veio ' || (t->'itens')::text || ')');

  -- Bruno aceita o material e marca a tarefa: a trilha anda sem ninguém gravar status.
  -- Material obrigatório só lido, sem o aceite: não conta.
  INSERT INTO materiais_leitura (material_id, versao, user_id, tenant_id, aceito_em) VALUES (f.material, 1, f.bruno, f.t, NULL);
  t := pg_temp.como(f.bruno, format('SELECT public.trilha_ver(%L, %L)::text', f.t, f.bruno))::jsonb;
  PERFORM pg_temp.checa((SELECT (x->>'concluido')::boolean FROM jsonb_array_elements(t->'itens') x WHERE x->>'tipo' = 'material') = false,
    'material obrigatório lido sem aceite não está concluído');
  UPDATE materiais_leitura SET aceito_em = now() WHERE material_id = f.material AND user_id = f.bruno;
  PERFORM pg_temp.como(f.bruno, format('SELECT public.trilha_marcar_tarefa(%L, true)::text', tarefa));
  t := pg_temp.como(f.bruno, format('SELECT public.trilha_ver(%L, %L)::text', f.t, f.bruno))::jsonb;
  PERFORM pg_temp.checa((SELECT count(*) FROM jsonb_array_elements(t->'itens') x WHERE (x->>'concluido')::boolean) = 2,
    'material aceito e tarefa feita contam como concluídos (veio ' || (t->'itens')::text || ')');
  v := pg_temp.como(f.ana, format('SELECT public.trilha_ver(%L, %L)::text', f.t, f.bruno));
  PERFORM pg_temp.checa(v = 'sem_permissao', 'um corretor não vê a trilha do outro');
  t := pg_temp.como(f.ana, format('SELECT public.trilha_ver(%L, %L)::text', f.t, f.ana))::jsonb;
  PERFORM pg_temp.checa((SELECT bool_and((x->>'concluido')::boolean) FROM jsonb_array_elements(t->'itens') x WHERE x->>'tipo' = 'curso'),
    'para a Ana, que tem certificado, o curso obrigatório já aparece concluído');
  RAISE NOTICE 'OK 7 · a trilha é fila com progresso, e o obrigatório entra sozinho';
END $$;

-- 8. Só gente na Universidade (20261016) ---------------------------------------------
-- Como na Lotus: o assistente de IA e a conta de teste são `corretor` com cargo.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('7a1b0000-0000-4000-a000-000000000007', 'ia@teste-univ.dev', '{"name":"Lia"}'),
  ('7a1b0000-0000-4000-a000-000000000008', 'teste@teste-univ.dev', '{"name":"Conta de Teste"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO tenant_memberships (tenant_id, user_id, role, team_id, cargo_id, permissions)
SELECT t, '7a1b0000-0000-4000-a000-000000000007'::uuid, 'corretor', NULL::uuid, cargo_corretor,
       '{"atuacao":[],"lead_limit":{"motivo":"assistente-ia","receives_auto_leads":false}}'::jsonb FROM fx
UNION ALL SELECT t, '7a1b0000-0000-4000-a000-000000000008'::uuid, 'corretor', equipe_l, cargo_corretor,
       '{"atuacao":["prontos"],"conta_de_teste":true}'::jsonb FROM fx;

DO $$
DECLARE f record; k record; p jsonb;
BEGIN
  SELECT * INTO f FROM fx; SELECT * INTO k FROM c;
  p := pg_temp.como(f.admin, format('SELECT public.curso_painel(%L)::text', k.id))::jsonb;
  PERFORM pg_temp.checa((SELECT array_agg(x->>'nome' ORDER BY x->>'nome') FROM jsonb_array_elements(p) x)
      = ARRAY['Ana Aluna', 'Bruno Aluno', 'Caio Captador', 'Leo Líder'],
    'o painel do curso não lista o assistente nem a conta de teste (veio ' || p::text || ')');
  p := pg_temp.como(f.admin, format('SELECT public.trilha_pessoas(%L)::text', f.t))::jsonb;
  PERFORM pg_temp.checa((SELECT array_agg(x->>'nome' ORDER BY x->>'nome') FROM jsonb_array_elements(p) x)
      = ARRAY['Ana Aluna', 'Bruno Aluno', 'Caio Captador', 'Leo Líder'],
    'nem a lista de quem recebe trilha (veio ' || p::text || ')');
  RAISE NOTICE 'OK 8 · só gente na Universidade';
END $$;

ROLLBACK;
