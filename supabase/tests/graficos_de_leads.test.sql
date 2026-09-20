-- ============================================================
-- `leads_graficos` — os quatro gráficos de leads (P1.10).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/graficos_de_leads.test.sql
--
-- O plano define o item como pronto quando "os totais do gráfico batem com os
-- contadores". É o caso 1. Um gráfico que soma 40 sob um contador que diz 43
-- não é um erro de três: é um gráfico em que ninguém confia mais.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t  uuid := 'bbbbbbb1-1111-4111-a111-111111111111';
  u  uuid := 'bbbbbbb2-2222-4111-a111-111111111111';
  eq uuid;
  l1 uuid := 'eeeeeeee-1111-4111-a111-111111111111';
  l2 uuid := 'eeeeeeee-2222-4111-a111-111111111111';
  r jsonb;
  soma int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'graf@teste.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-graf', 'Teste Graficos') ON CONFLICT DO NOTHING;
  INSERT INTO teams (tenant_id, name) VALUES (t, 'Equipe A') RETURNING id INTO eq;
  INSERT INTO tenant_memberships (tenant_id, user_id, role, team_id)
  VALUES (t, u, 'corretor', eq) ON CONFLICT (tenant_id, user_id) DO UPDATE SET team_id = EXCLUDED.team_id;

  INSERT INTO leads (id, tenant_id, name, status, assigned_agent_id, assigned_agent_name, source, created_at) VALUES
    (l1, t, 'Com corretor', 'Interação', u::text, 'Ana', 'Meta', now() - interval '10 days'),
    (l2, t, 'Sem ninguem',  'Novos Leads', NULL, 'Não atribuído', 'Zap', now() - interval '3 days');

  -- ----------------------------------------------------------
  -- 1. OS TOTAIS BATEM COM O CONTADOR.
  -- ----------------------------------------------------------
  r := leads_graficos(t);

  IF (r->>'total')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: total deu %', r->>'total';
  END IF;

  SELECT sum((x->>'total')::int) INTO soma
  FROM jsonb_array_elements(r->'por_dia') x;
  IF soma <> (r->>'total')::int THEN
    RAISE EXCEPTION 'FALHOU: o grafico por dia soma % e o contador diz %', soma, r->>'total';
  END IF;

  SELECT sum((x->>'total')::int) INTO soma
  FROM jsonb_array_elements(r->'por_equipe') x;
  IF soma <> (r->>'total')::int THEN
    RAISE EXCEPTION 'FALHOU: o grafico por equipe soma % e o contador diz %', soma, r->>'total';
  END IF;

  -- E o empilhado de cada barra soma o total da própria barra: se não somar,
  -- a barra desenha uma altura que não corresponde ao número dela.
  SELECT sum((x->>'com_corretor')::int + (x->>'aguardando_corretor')::int
           + (x->>'com_lia')::int + (x->>'sem_ninguem')::int) INTO soma
  FROM jsonb_array_elements(r->'por_equipe') x;
  IF soma <> (r->>'total')::int THEN
    RAISE EXCEPTION 'FALHOU: as pilhas somam % e o total e %', soma, r->>'total';
  END IF;

  -- ----------------------------------------------------------
  -- 2. A EQUIPE VEM DO CORRETOR, e quem não tem cai em "Sem equipe".
  -- ----------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'por_equipe') x
    WHERE x->>'equipe' = 'Equipe A' AND (x->>'com_corretor')::int = 1
  ) THEN
    RAISE EXCEPTION 'FALHOU: o lead com corretor nao caiu na Equipe A';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'por_equipe') x
    WHERE x->>'equipe' = 'Sem equipe' AND (x->>'sem_ninguem')::int = 1
  ) THEN
    RAISE EXCEPTION 'FALHOU: o lead sem corretor nao caiu em "Sem equipe"';
  END IF;

  -- ----------------------------------------------------------
  -- 3. O FILTRO DE PERÍODO VALE PARA TUDO.
  --
  -- Um filtro que chegasse só num gráfico faria os quatro contarem coisas
  -- diferentes na mesma tela.
  -- ----------------------------------------------------------
  r := leads_graficos(t, now() - interval '5 days');
  IF (r->>'total')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: filtro de periodo deu total %', r->>'total';
  END IF;
  SELECT sum((x->>'total')::int) INTO soma FROM jsonb_array_elements(r->'por_equipe') x;
  IF soma <> 1 THEN
    RAISE EXCEPTION 'FALHOU: o periodo nao chegou no grafico por equipe (soma %)', soma;
  END IF;

  -- ----------------------------------------------------------
  -- 4. MEDIANA, NÃO MÉDIA.
  --
  -- Com um valor extremo, os dois números se separam — e a tela mostra o que
  -- não é dominado pelo extremo. Decisão do chefe em 20/09/2026.
  -- ----------------------------------------------------------
  INSERT INTO proposals (tenant_id, lead_id, signed_at, value, payment_method, property_reference, status)
  VALUES
    (t, l1, now() - interval '9 days', 1, 'Financiamento', 'AP1', 'Proposta Assinada'),
    (t, l2, now(), 1, 'Financiamento', 'AP2', 'Proposta Assinada');

  r := leads_graficos(t);
  IF (r->'conversao'->>'amostras')::int <> 2 THEN
    RAISE EXCEPTION 'FALHOU: amostras de conversao deu %', r->'conversao'->>'amostras';
  END IF;
  IF r->'conversao'->>'mediana_dias' IS NULL THEN
    RAISE EXCEPTION 'FALHOU: nao calculou a mediana';
  END IF;
  -- A média também volta, para a tela poder mostrar a diferença.
  IF r->'conversao'->>'media_dias' IS NULL THEN
    RAISE EXCEPTION 'FALHOU: nao devolveu a media para comparacao';
  END IF;

  -- ----------------------------------------------------------
  -- 5. TEMPO POR ETAPA SÓ CONTA QUEM JÁ SAIU.
  --
  -- Quem ainda está na etapa não tem duração. Contá-lo como "até agora"
  -- misturaria uma coisa com outra — e é justamente quem demora.
  -- ----------------------------------------------------------
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, ator_tipo, descricao, para, created_at) VALUES
    (t, l1::text, 'leads', 'lead.stage_changed', 'usuario', 'x', 'Interação',      now() - interval '8 days'),
    (t, l1::text, 'leads', 'lead.stage_changed', 'usuario', 'x', 'Visita Agendada', now() - interval '6 days'),
    (t, l1::text, 'leads', 'lead.stage_changed', 'usuario', 'x', 'Negociação',      now() - interval '1 day');

  r := leads_graficos(t);
  -- Interação durou 2 dias; Visita Agendada durou 5; Negociação NÃO aparece,
  -- porque o lead ainda está nela.
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'por_etapa') x
    WHERE x->>'etapa' = 'Interação' AND (x->>'mediana_dias')::int = 2
  ) THEN
    RAISE EXCEPTION 'FALHOU: duracao de Interacao errada';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(r->'por_etapa') x WHERE x->>'etapa' = 'Negociação'
  ) THEN
    RAISE EXCEPTION 'FALHOU: etapa em que o lead AINDA ESTA entrou na conta';
  END IF;
  -- E a tela precisa saber desde quando há registro, para avisar.
  IF r->>'etapa_desde' IS NULL THEN
    RAISE EXCEPTION 'FALHOU: nao devolveu desde quando ha registro de etapa';
  END IF;

  -- ----------------------------------------------------------
  -- 6. ESCOPO DE IMOBILIÁRIA.
  -- ----------------------------------------------------------
  r := leads_graficos('cccccccc-cccc-4ccc-accc-cccccccccccc'::uuid);
  IF (r->>'total')::int <> 0 THEN
    RAISE EXCEPTION 'FALHOU: graficos vazaram para outra imobiliaria (total %)', r->>'total';
  END IF;

  RAISE NOTICE 'graficos_de_leads: 6 casos OK';
END $$;

ROLLBACK;
