-- ============================================================
-- Kanban de demandas de marketing (P3.7).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/demandas_de_marketing.test.sql
--
-- O CASO 2 É O CRITÉRIO DE PRONTO DO PLANO, por escrito: "uma demanda percorre
-- todas as colunas com histórico".
--
-- O caso 3 é o que sustenta o caso 2: o histórico é gravado por GATILHO. Se
-- dependesse da tela, bastaria um script ou uma mão no banco para abrir um
-- buraco — e histórico com buraco parece completo.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '0eee1111-0000-4000-a000-000000000001';
  gestor uuid := '0eee0000-0000-4000-a000-000000000001';
  ana uuid := '0eee0000-0000-4000-a000-000000000002';
  bruno uuid := '0eee0000-0000-4000-a000-000000000003';
  d uuid;
  d2 uuid;
  h jsonb;
  r jsonb;
  n int;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (gestor, 'gestor@teste-mkt.dev', '{"name":"Gestor"}'::jsonb),
    (ana, 'ana@teste-mkt.dev', '{"name":"Ana"}'::jsonb),
    (bruno, 'bruno@teste-mkt.dev', '{"name":"Bruno"}'::jsonb)
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-mkt', 'Teste Marketing') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (t, gestor, 'admin'), (t, ana, 'corretor'), (t, bruno, 'corretor')
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. UMA DEMANDA NASCE EM "SOLICITADO", COM PRAZO.
  --
  -- Prazo é obrigatório porque o plano pede: demanda sem prazo não entra em
  -- fila de ninguém — vira a que sempre pode esperar.
  -- ----------------------------------------------------------
  INSERT INTO mkt_demandas (tenant_id, titulo, tipo, solicitante_id, objetivo, publico, prazo)
  VALUES (t, 'Post do lançamento', 'post', ana, 'Gerar visitas', 'Famílias de Jundiaí', '2026-10-10')
  RETURNING id INTO d;

  IF (SELECT status FROM mkt_demandas WHERE id = d) IS DISTINCT FROM 'solicitado' THEN
    RAISE EXCEPTION 'FALHOU: a demanda deveria nascer em solicitado';
  END IF;

  -- ----------------------------------------------------------
  -- 2. A DEMANDA PERCORRE AS SEIS COLUNAS, E O HISTÓRICO GUARDA CADA PASSO.
  --
  -- É o critério de pronto do item.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  UPDATE mkt_demandas SET status = 'briefing', responsavel_id = bruno WHERE id = d;
  UPDATE mkt_demandas SET status = 'producao' WHERE id = d;
  UPDATE mkt_demandas SET status = 'revisao' WHERE id = d;
  UPDATE mkt_demandas SET status = 'aprovado' WHERE id = d;
  UPDATE mkt_demandas SET status = 'publicado' WHERE id = d;

  h := mkt_historico_da_demanda(t, d);
  -- Seis eventos: o nascimento mais as cinco mudanças.
  IF jsonb_array_length(h) IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'FALHOU: o histórico deveria ter 6 passos, tem %  — %', jsonb_array_length(h), h;
  END IF;

  IF (h->0->>'para') IS DISTINCT FROM 'solicitado' OR (h->0->>'de') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: o primeiro passo é o nascimento em solicitado, veio %', h->0;
  END IF;
  IF (h->5->>'para') IS DISTINCT FROM 'publicado' OR (h->5->>'de') IS DISTINCT FROM 'aprovado' THEN
    RAISE EXCEPTION 'FALHOU: o último passo deveria ser aprovado → publicado, veio %', h->5;
  END IF;

  -- E o histórico diz QUEM fez cada passo.
  IF (h->1->>'por') IS DISTINCT FROM 'Gestor' THEN
    RAISE EXCEPTION 'FALHOU: o passo para briefing foi do Gestor, o histórico diz %', h->1->>'por';
  END IF;

  -- ----------------------------------------------------------
  -- 3. EDITAR O BRIEFING NÃO VIRA PASSO.
  --
  -- Só o que muda de coluna é passo do fluxo. Registrar cada edição de texto
  -- encheria o histórico de ruído e esconderia o que importa.
  -- ----------------------------------------------------------
  UPDATE mkt_demandas SET texto_base = 'Chamada nova', formato = '1080x1080' WHERE id = d;
  IF jsonb_array_length(mkt_historico_da_demanda(t, d)) IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'FALHOU: editar o texto virou passo do histórico';
  END IF;

  -- E o gatilho pega mudança feita por FORA da tela — é o motivo de ele
  -- existir. Aqui o UPDATE é direto no banco, sem tela nenhuma.
  UPDATE mkt_demandas SET status = 'revisao' WHERE id = d;
  IF jsonb_array_length(mkt_historico_da_demanda(t, d)) IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'FALHOU: mudança fora da tela não foi registrada';
  END IF;

  -- ----------------------------------------------------------
  -- 4. AS REGRAS DO CADASTRO.
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO mkt_demandas (tenant_id, titulo, solicitante_id, prazo)
      VALUES (t, '   ', ana, '2026-10-10');
    RAISE EXCEPTION 'FALHOU: aceitou demanda com título vazio';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO mkt_demandas (tenant_id, titulo, solicitante_id, prazo, tipo)
      VALUES (t, 'Peça', ana, '2026-10-10', 'outdoor_voador');
    RAISE EXCEPTION 'FALHOU: aceitou um tipo de peça que não existe';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO mkt_demandas (tenant_id, titulo, solicitante_id, prazo, status)
      VALUES (t, 'Peça', ana, '2026-10-10', 'engavetado');
    RAISE EXCEPTION 'FALHOU: aceitou uma coluna que não existe no quadro';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Prazo é NOT NULL: sem ele o insert nem chega ao CHECK.
  BEGIN
    INSERT INTO mkt_demandas (tenant_id, titulo, solicitante_id) VALUES (t, 'Sem prazo', ana);
    RAISE EXCEPTION 'FALHOU: aceitou demanda sem prazo';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;

  -- ----------------------------------------------------------
  -- 5. O QUADRO TRAZ OS NOMES RESOLVIDOS.
  --
  -- Resolvidos no banco, e não com três consultas no front: o card mostra
  -- quem pediu e quem produz, e buscá-los um a um daria uma consulta por card.
  -- ----------------------------------------------------------
  r := mkt_quadro_de_demandas(t);
  SELECT x INTO h FROM jsonb_array_elements(r->'demandas') x WHERE (x->>'id')::uuid = d;
  IF (h->>'solicitante') IS DISTINCT FROM 'Ana' OR (h->>'responsavel') IS DISTINCT FROM 'Bruno' THEN
    RAISE EXCEPTION 'FALHOU: o card deveria trazer Ana e Bruno, trouxe % e %',
      h->>'solicitante', h->>'responsavel';
  END IF;

  -- ----------------------------------------------------------
  -- 6. PUBLICADO ANTIGO SOME DO QUADRO.
  --
  -- Senão a coluna "Publicado" acumula para sempre e vira arquivo morto.
  -- ----------------------------------------------------------
  -- Uma demanda publicada há 90 dias. Ela é INSERIDA assim, e não envelhecida
  -- por UPDATE: o gatilho carimba `atualizada_em` a cada alteração, então na
  -- vida real a linha envelhece parada, sem ninguém tocá-la — que é exatamente
  -- o caso que o quadro precisa esconder.
  INSERT INTO mkt_demandas (tenant_id, titulo, solicitante_id, prazo, status, atualizada_em)
  VALUES (t, 'Peça antiga já publicada', ana, '2026-06-01', 'publicado', now() - interval '90 days')
  RETURNING id INTO d2;

  r := mkt_quadro_de_demandas(t);
  SELECT count(*) INTO n FROM jsonb_array_elements(r->'demandas') x WHERE (x->>'id')::uuid = d2;
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: publicado de 90 dias atrás ainda aparece no quadro';
  END IF;

  -- Mas continua alcançável quando se pede o período inteiro.
  r := mkt_quadro_de_demandas(t, '2020-01-01');
  SELECT count(*) INTO n FROM jsonb_array_elements(r->'demandas') x WHERE (x->>'id')::uuid = d2;
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: pedindo o período inteiro, a demanda antiga deveria voltar';
  END IF;

  -- E publicado RECENTE fica no quadro: é o que mostra o que acabou de sair.
  UPDATE mkt_demandas SET status = 'publicado' WHERE id = d;
  r := mkt_quadro_de_demandas(t);
  SELECT count(*) INTO n FROM jsonb_array_elements(r->'demandas') x WHERE (x->>'id')::uuid = d;
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: publicado hoje sumiu do quadro';
  END IF;

  -- E o gatilho NÃO deixa envelhecer a linha por UPDATE: carimbar a data de
  -- alteração é justamente o trabalho dele.
  UPDATE mkt_demandas SET atualizada_em = now() - interval '90 days' WHERE id = d;
  IF (SELECT atualizada_em FROM mkt_demandas WHERE id = d) < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'FALHOU: deu para forjar a data de alteração por UPDATE';
  END IF;

  -- ----------------------------------------------------------
  -- 7. QUEM NÃO É DO TENANT NÃO LÊ.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '0eee0000-0000-4000-a000-000000000099')::text, true);
  IF mkt_quadro_de_demandas(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: quem não é do tenant leu o quadro';
  END IF;
  IF mkt_historico_da_demanda(t, d) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: quem não é do tenant leu o histórico';
  END IF;

  RAISE NOTICE 'OK: demandas de marketing — 7 casos';
END
$$;

-- ----------------------------------------------------------
-- 8. QUEM PODE MEXER NA DEMANDA.
--
-- Qualquer membro PEDE — é o ponto do quadro: o corretor pede, o marketing
-- produz. Mas mover a demanda alheia bagunçaria a fila de quem produz.
-- ----------------------------------------------------------
CREATE FUNCTION pg_temp.como(p_uid uuid, p_email text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

SELECT pg_temp.como('0eee0000-0000-4000-a000-000000000002', 'ana@teste-mkt.dev');

INSERT INTO mkt_demandas (tenant_id, titulo, solicitante_id, prazo)
VALUES ('0eee1111-0000-4000-a000-000000000001', 'Peça da Ana',
        '0eee0000-0000-4000-a000-000000000002', '2026-10-10');

-- O Bruno não pediu nem é responsável: o UPDATE dele acerta zero linhas.
SELECT pg_temp.como('0eee0000-0000-4000-a000-000000000003', 'bruno@teste-mkt.dev');
UPDATE mkt_demandas SET status = 'publicado' WHERE titulo = 'Peça da Ana';

SELECT pg_temp.como('0eee0000-0000-4000-a000-000000000002', 'ana@teste-mkt.dev');
DO $$
BEGIN
  IF (SELECT status FROM mkt_demandas WHERE titulo = 'Peça da Ana') IS DISTINCT FROM 'solicitado' THEN
    RAISE EXCEPTION 'FALHOU: um colega moveu a demanda que não é dele';
  END IF;
END $$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK: permissões da demanda — 1 caso'; END $$;

ROLLBACK;
