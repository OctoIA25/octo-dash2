-- ============================================================
-- Relatório de recrutamento (P3.8).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/relatorio_de_recrutamento.test.sql
--
-- O CASO 1 É A DISTINÇÃO QUE O PLANO PEDE POR ESCRITO: contar por DATA DE
-- ALCANCE, e não por onde o candidato está hoje. Quem passou por Qualificado e
-- avançou sumiria da segunda contagem.
--
-- O CASO 4 É O CRITÉRIO DE PRONTO: a soma por origem bate com o total.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '0fff1111-0000-4000-a000-000000000001';
  u uuid := '0fff0000-0000-4000-a000-000000000001';
  c1 uuid; c2 uuid; c3 uuid;
  r jsonb;
  x jsonb;
  n int;
  soma int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'gestor@teste-recrut.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-recrut', 'Teste Recrutamento') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES (t, u, 'admin') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. CONTA POR DATA DE ALCANCE, E NÃO POR ONDE ESTÁ HOJE.
  --
  -- O candidato entra, é qualificado, e avança até onboard. Ele NÃO está mais
  -- em "Qualificado" — mas passou por lá, e a leitura por alcance tem de
  -- contá-lo.
  -- ----------------------------------------------------------
  INSERT INTO recrut_candidato (tenant_id, nome, telefone, estagio, canal, ts_candidatura)
  VALUES (t, 'Ana Candidata', '11900000001', 'lead', 'indicacao', '2026-09-22 09:00-03')
  RETURNING id INTO c1;

  UPDATE recrut_candidato SET estagio = 'interacao'  WHERE id = c1;
  UPDATE recrut_candidato SET estagio = 'qualificado' WHERE id = c1;
  -- O banco cobra coordenador para entrar em onboard (regra que já existia:
  -- `onboard_exige_coordenador`). O fixture respeita, porque a tela também vai.
  UPDATE recrut_candidato SET estagio = 'onboard', coordenador_id = u WHERE id = c1;

  -- Hoje ela está em onboard.
  IF (SELECT estagio::text FROM recrut_candidato WHERE id = c1) <> 'onboard' THEN
    RAISE EXCEPTION 'FALHOU: o fixture não levou a candidata até onboard';
  END IF;

  r := recrut_relatorio(t, '2026-09-01', '2026-12-31');

  SELECT e INTO x FROM jsonb_array_elements(r->'etapas') e WHERE e->>'etapa' = 'qualificado';
  IF (x->>'alcancaram')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: ela PASSOU por qualificado e a leitura por alcance conta % — está contando quem está lá hoje',
      x->>'alcancaram';
  END IF;

  -- E as etapas seguintes também contam, porque ela chegou a todas.
  SELECT e INTO x FROM jsonb_array_elements(r->'etapas') e WHERE e->>'etapa' = 'onboard';
  IF (x->>'alcancaram')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: onboard deveria contar 1, contou %', x->>'alcancaram';
  END IF;

  -- ----------------------------------------------------------
  -- 2. O GATILHO CARIMBA A DATA AO MUDAR DE ETAPA.
  --
  -- Antes disto, `ts_primeiro_contato` e `ts_qualificado` eram 0 de 5 em
  -- produção: ninguém os preenchia.
  -- ----------------------------------------------------------
  IF (SELECT ts_primeiro_contato FROM recrut_candidato WHERE id = c1) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: passar por interação não carimbou ts_primeiro_contato';
  END IF;
  IF (SELECT ts_qualificado FROM recrut_candidato WHERE id = c1) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: passar por qualificado não carimbou ts_qualificado';
  END IF;

  -- ----------------------------------------------------------
  -- 3. VOLTAR E AVANÇAR DE NOVO NÃO REESCREVE A DATA ORIGINAL.
  --
  -- "Data de alcance" é a PRIMEIRA vez. Reescrever apagaria quanto tempo o
  -- candidato levou de verdade para chegar lá.
  -- ----------------------------------------------------------
  UPDATE recrut_candidato SET ts_qualificado = '2026-09-23 10:00-03' WHERE id = c1;
  UPDATE recrut_candidato SET estagio = 'interacao'   WHERE id = c1;
  UPDATE recrut_candidato SET estagio = 'qualificado' WHERE id = c1;

  IF (SELECT ts_qualificado FROM recrut_candidato WHERE id = c1) <> '2026-09-23 10:00-03'::timestamptz THEN
    RAISE EXCEPTION 'FALHOU: voltar e avançar reescreveu a data do primeiro alcance';
  END IF;

  -- ----------------------------------------------------------
  -- 4. A SOMA POR ORIGEM BATE COM O TOTAL.
  --
  -- É o critério de pronto do plano, por escrito.
  -- ----------------------------------------------------------
  INSERT INTO recrut_candidato (tenant_id, nome, telefone, estagio, canal, ts_candidatura)
  VALUES (t, 'Bruno Candidato', '11900000002', 'lead', 'anuncio_meta', '2026-09-24 09:00-03')
  RETURNING id INTO c2;

  -- Um SEM canal: é o que costuma quebrar a soma, porque some do agrupamento.
  INSERT INTO recrut_candidato (tenant_id, nome, telefone, estagio, ts_candidatura)
  VALUES (t, 'Carla Candidata', '11900000003', 'lead', '2026-09-25 09:00-03')
  RETURNING id INTO c3;

  r := recrut_relatorio(t, '2026-09-01', '2026-12-31');

  SELECT sum((e->>'candidatos')::int) INTO soma FROM jsonb_array_elements(r->'por_origem') e;
  IF soma <> (r->>'total')::int THEN
    RAISE EXCEPTION 'FALHOU: a soma por origem deu % e o total é % — alguém sumiu do agrupamento',
      soma, r->>'total';
  END IF;
  IF (r->>'total')::int <> 3 THEN
    RAISE EXCEPTION 'FALHOU: são 3 candidatos no período, o total diz %', r->>'total';
  END IF;

  -- QUEM NÃO ESCOLHE CAI NO PADRÃO, E A TELA PRECISA SABER DISSO.
  --
  -- `canal` é NOT NULL DEFAULT 'outro': o candidato inserido sem canal vira
  -- 'outro' sozinho. Em produção os 5 estão assim — o que significa "ninguém
  -- preencheu", e não "todos vieram de outro lugar". Sem esta marca, o gestor
  -- lê a segunda coisa.
  SELECT e INTO x FROM jsonb_array_elements(r->'por_origem') e WHERE e->>'origem' = 'outro';
  IF x IS NULL OR (x->>'candidatos')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: quem entrou sem canal deveria cair em "outro" — %', r->'por_origem';
  END IF;
  IF (x->>'e_o_padrao')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: a linha "outro" precisa vir marcada como padrão do cadastro';
  END IF;
  IF (r->>'origem_no_padrao')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: 1 candidato está no padrão e o relatório diz %', r->>'origem_no_padrao';
  END IF;

  -- E a marca NÃO é posta em quem escolheu de verdade.
  SELECT e INTO x FROM jsonb_array_elements(r->'por_origem') e WHERE e->>'origem' = 'indicacao';
  IF (x->>'e_o_padrao')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHOU: "indicacao" foi escolhida e não pode ser marcada como padrão';
  END IF;

  -- ----------------------------------------------------------
  -- 5. ETAPA QUE NINGUÉM ANOTA É DIFERENTE DE ETAPA SEM GENTE.
  --
  -- Bruno e Carla pararam em "lead". "Reunião feita" tem zero — mas o zero de
  -- `registrado_sempre` é o que diz se é porque ninguém chegou lá ou porque
  -- ninguém anota. Sem essa distinção, 0% vira "o processo trava aqui".
  -- ----------------------------------------------------------
  SELECT e INTO x FROM jsonb_array_elements(r->'etapas') e WHERE e->>'etapa' = 'reuniao_realizada';
  IF (x->>'alcancaram')::int <> 0 OR (x->>'registrado_sempre')::int <> 0 THEN
    RAISE EXCEPTION 'FALHOU: reunião feita deveria ter 0 e 0, teve % e %',
      x->>'alcancaram', x->>'registrado_sempre';
  END IF;

  -- Já "qualificado" tem registro: a Ana passou por lá.
  SELECT e INTO x FROM jsonb_array_elements(r->'etapas') e WHERE e->>'etapa' = 'qualificado';
  IF (x->>'registrado_sempre')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: qualificado tem 1 registro e a função diz %', x->>'registrado_sempre';
  END IF;

  -- E a tela sabe desde quando o carimbo é automático.
  IF (r->>'registro_desde') IS NULL THEN
    RAISE EXCEPTION 'FALHOU: sem a data de início do registro, zero vira "o processo trava aqui"';
  END IF;

  -- ----------------------------------------------------------
  -- 6. A ÁREA, COM AS TRÊS DO PLANO.
  -- ----------------------------------------------------------
  UPDATE recrut_candidato SET area = 'vendas_lancamentos' WHERE id = c1;
  UPDATE recrut_candidato SET area = 'administrativo'     WHERE id = c2;

  BEGIN
    UPDATE recrut_candidato SET area = 'departamento_de_sonhos' WHERE id = c3;
    RAISE EXCEPTION 'FALHOU: aceitou uma área que não existe';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  r := recrut_relatorio(t, '2026-09-01', '2026-12-31');
  SELECT sum((e->>'candidatos')::int) INTO soma FROM jsonb_array_elements(r->'por_area') e;
  IF soma <> (r->>'total')::int THEN
    RAISE EXCEPTION 'FALHOU: a soma por área deu % e o total é %', soma, r->>'total';
  END IF;

  -- Quem ainda não tem área aparece, em vez de sumir da conta.
  SELECT e INTO x FROM jsonb_array_elements(r->'por_area') e WHERE e->>'area' = '(sem área)';
  IF x IS NULL OR (x->>'candidatos')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: o candidato sem área deveria aparecer — %', r->'por_area';
  END IF;

  -- ----------------------------------------------------------
  -- 7. O PERÍODO RECORTA DE VERDADE.
  -- ----------------------------------------------------------
  r := recrut_relatorio(t, '2026-09-24', '2026-09-24');
  IF (r->>'total')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: só o Bruno se candidatou em 24/09, o total diz %', r->>'total';
  END IF;

  -- ----------------------------------------------------------
  -- 8. QUEM NÃO É DO TENANT NÃO LÊ.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '0fff0000-0000-4000-a000-000000000099')::text, true);
  IF recrut_relatorio(t, '2026-09-01', '2026-12-31') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: quem não é do tenant leu o relatório de recrutamento';
  END IF;

  RAISE NOTICE 'OK: relatório de recrutamento — 8 casos';
END
$$;

ROLLBACK;
