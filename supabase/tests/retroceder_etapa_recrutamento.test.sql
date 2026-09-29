-- ============================================================
-- Retroceder etapa no recrutamento (29/09/2026).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/retroceder_etapa_recrutamento.test.sql
--
-- O CASO 1 É O QUE O DONO PEDIU: voltar um card do Kanban — o estágio muda
-- para trás e as etapas DEPOIS da alvo perdem a data; as de antes ficam.
--
-- O CASO 2 É REABRIR: sair de Perdido zera ts_encerrado e o motivo.
--
-- O CASO 3 É A TRAVA: sem `para` válido o evento não entra.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '0fff1111-0000-4000-a000-000000000002';
  u uuid := '0fff0000-0000-4000-a000-000000000002';
  c1 uuid;
  c recrut_candidato%ROWTYPE;
  falhou boolean := false;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'gestor@teste-retro.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-retro', 'Teste Retroceder') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES (t, u, 'admin') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. VOLTAR: de onboard para qualificado.
  -- ----------------------------------------------------------
  INSERT INTO recrut_candidato (tenant_id, nome, telefone, estagio, canal, coordenador_id)
  VALUES (t, 'Ana Volta', '11900000101', 'lead', 'indicacao', u)
  RETURNING id INTO c1;

  INSERT INTO recrut_evento (candidato_id, tipo, autor) VALUES (c1, 'resposta_candidato', 'erick');
  INSERT INTO recrut_evento (candidato_id, tipo, autor) VALUES (c1, 'condicoes_respondidas', 'erick');
  INSERT INTO recrut_evento (candidato_id, tipo, autor) VALUES (c1, 'reuniao_realizada', 'erick');
  INSERT INTO recrut_evento (candidato_id, tipo, autor) VALUES (c1, 'matricula_confirmada', 'erick');
  INSERT INTO recrut_evento (candidato_id, tipo, autor, payload)
  VALUES (c1, 'marco_ativacao', 'erick', '{"marco":"primeiro_plantao"}');

  SELECT * INTO c FROM recrut_candidato WHERE id = c1;
  IF c.estagio::text IS DISTINCT FROM 'onboard' THEN
    RAISE EXCEPTION 'FALHOU: o fixture não chegou a onboard (está em %)', c.estagio;
  END IF;

  INSERT INTO recrut_evento (candidato_id, tipo, autor, payload)
  VALUES (c1, 'estagio_retrocedido', 'erick', '{"de":"onboard","para":"qualificado","responsavel":"teste"}');

  SELECT * INTO c FROM recrut_candidato WHERE id = c1;
  IF c.estagio::text IS DISTINCT FROM 'qualificado' THEN
    RAISE EXCEPTION 'FALHOU: voltou para % em vez de qualificado', c.estagio;
  END IF;
  IF c.ts_onboard IS NOT NULL OR c.ts_matricula IS NOT NULL OR c.ts_reuniao_realizada IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: as etapas depois de qualificado deveriam perder a data';
  END IF;
  IF c.ts_qualificado IS NULL OR c.ts_primeira_resposta IS NULL THEN
    RAISE EXCEPTION 'FALHOU: as etapas até qualificado deveriam manter a data de alcance';
  END IF;

  -- Avançar de novo recalcula pelo máximo — e o máximo agora é o que sobrou.
  INSERT INTO recrut_evento (candidato_id, tipo, autor) VALUES (c1, 'reuniao_realizada', 'erick');
  SELECT * INTO c FROM recrut_candidato WHERE id = c1;
  IF c.estagio::text IS DISTINCT FROM 'reuniao_realizada' THEN
    RAISE EXCEPTION 'FALHOU: depois de voltar, avançar deveria dar reuniao_realizada, deu %', c.estagio;
  END IF;

  -- ----------------------------------------------------------
  -- 2. REABRIR: de perdido para lead.
  -- ----------------------------------------------------------
  UPDATE recrut_candidato SET motivo_perda = 'sumiu' WHERE id = c1;
  INSERT INTO recrut_evento (candidato_id, tipo, autor) VALUES (c1, 'encerrado', 'erick');
  SELECT * INTO c FROM recrut_candidato WHERE id = c1;
  IF c.estagio::text IS DISTINCT FROM 'perdido' THEN
    RAISE EXCEPTION 'FALHOU: o fixture não encerrou (está em %)', c.estagio;
  END IF;

  INSERT INTO recrut_evento (candidato_id, tipo, autor, payload)
  VALUES (c1, 'estagio_retrocedido', 'erick', '{"de":"perdido","para":"lead"}');

  SELECT * INTO c FROM recrut_candidato WHERE id = c1;
  IF c.estagio::text IS DISTINCT FROM 'lead' OR c.ts_encerrado IS NOT NULL OR c.motivo_perda IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: reabrir deveria deixar em lead sem ts_encerrado nem motivo (estagio=%, motivo=%)', c.estagio, c.motivo_perda;
  END IF;
  IF c.ts_candidatura IS NULL THEN
    RAISE EXCEPTION 'FALHOU: a data de candidatura nunca se apaga';
  END IF;

  -- ----------------------------------------------------------
  -- 3. A TRAVA: `para` ausente ou fora do funil não entra.
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO recrut_evento (candidato_id, tipo, autor, payload)
    VALUES (c1, 'estagio_retrocedido', 'erick', '{"para":"perdido"}');
  EXCEPTION WHEN invalid_parameter_value THEN
    falhou := true;
  END;
  IF NOT falhou THEN
    RAISE EXCEPTION 'FALHOU: para=perdido deveria ser recusado';
  END IF;

  falhou := false;
  BEGIN
    INSERT INTO recrut_evento (candidato_id, tipo, autor, payload) VALUES (c1, 'estagio_retrocedido', 'erick', '{}');
  EXCEPTION WHEN invalid_parameter_value THEN
    falhou := true;
  END;
  IF NOT falhou THEN
    RAISE EXCEPTION 'FALHOU: sem para deveria ser recusado';
  END IF;

  RAISE NOTICE 'OK — retroceder etapa: voltar, reabrir e a trava';
END $$;

ROLLBACK;
