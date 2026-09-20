-- ============================================================
-- O estado do handoff que `leads_ultima_movimentacao` devolve (P1.5).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/estado_do_handoff_no_lead.test.sql
--
-- O sub-status responde "de quem é a bola". Errar isso é pior do que não
-- mostrar: o gestor cobra a pessoa errada, e o corretor é cobrado por um lead
-- que nunca chegou nele.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t uuid := '11111111-1111-4111-a111-111111111111';
  u uuid := '33333333-3333-4333-a333-333333333333';
  l1 text := 'bbbbbbbb-1111-4111-a111-111111111111';  -- a LIA passou
  l2 text := 'bbbbbbbb-2222-4111-a111-111111111111';  -- a LIA atende, não passou
  l3 text := 'bbbbbbbb-3333-4111-a111-111111111111';  -- movimento sem LIA nenhuma
  r record;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'handoff@teste.dev') ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-handoff', 'Teste Handoff') ON CONFLICT DO NOTHING;

  -- ----------------------------------------------------------
  -- 1. A LIA passou o lead: passou = true, atendeu = true.
  -- ----------------------------------------------------------
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, ator_tipo, descricao, created_at)
  VALUES (t, l1, 'leads', 'lia.handoff_corretor', 'lia', 'passou', now() - interval '1 day');

  SELECT * INTO r FROM leads_ultima_movimentacao(t, ARRAY[l1]);
  IF NOT r.lia_passou OR NOT r.lia_atendeu THEN
    RAISE EXCEPTION 'FALHOU: handoff da LIA nao marcou passou/atendeu (% / %)', r.lia_passou, r.lia_atendeu;
  END IF;

  -- ----------------------------------------------------------
  -- 2. A LIA encostou mas NÃO passou: atendeu = true, passou = false.
  --
  -- É a diferença entre "Com LIA" e "Aguardando corretor" na tela. Colapsar
  -- os dois faria o gestor cobrar um corretor que ainda não recebeu o lead.
  -- ----------------------------------------------------------
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, ator_tipo, descricao, created_at)
  VALUES (t, l2, 'leads', 'lia.contato_realizado', 'lia', 'falou', now() - interval '2 days');

  SELECT * INTO r FROM leads_ultima_movimentacao(t, ARRAY[l2]);
  IF r.lia_passou THEN
    RAISE EXCEPTION 'FALHOU: contato da LIA foi lido como entrega ao corretor';
  END IF;
  IF NOT r.lia_atendeu THEN
    RAISE EXCEPTION 'FALHOU: contato da LIA nao marcou que ela atendeu';
  END IF;

  -- ----------------------------------------------------------
  -- 3. Movimento sem LIA nenhuma: os dois falsos, e não nulos.
  --
  -- Nulo vindo do banco viraria "não sei" na tela, e a tela decidiria sozinha
  -- o que fazer com isso — cada tela de um jeito.
  -- ----------------------------------------------------------
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, ator_tipo, descricao, created_at)
  VALUES (t, l3, 'leads', 'lead.stage_changed', 'usuario', 'mudou', now() - interval '3 days');

  SELECT * INTO r FROM leads_ultima_movimentacao(t, ARRAY[l3]);
  IF r.lia_passou IS DISTINCT FROM false OR r.lia_atendeu IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU: lead sem LIA devolveu nulo em vez de falso (% / %)', r.lia_passou, r.lia_atendeu;
  END IF;

  -- ----------------------------------------------------------
  -- 4. O estado do handoff NÃO depende do evento ser "movimento".
  --
  -- A distribuição da LIA entrega o lead, e é isso que a tela precisa saber —
  -- mesmo que outro evento mais novo seja o que dá a data do selo de parado.
  -- ----------------------------------------------------------
  INSERT INTO lead_events (tenant_id, lead_id, lead_source, event_type, ator_tipo, descricao, created_at)
  VALUES (t, l3, 'leads', 'lia.lead_distribuido', 'lia', 'distribuiu', now() - interval '10 days');

  SELECT * INTO r FROM leads_ultima_movimentacao(t, ARRAY[l3]);
  IF NOT r.lia_passou THEN
    RAISE EXCEPTION 'FALHOU: distribuicao antiga da LIA sumiu do estado do handoff';
  END IF;
  IF r.fonte <> 'evento' OR r.ultima < now() - interval '4 days' THEN
    RAISE EXCEPTION 'FALHOU: a distribuicao antiga virou a data do selo de parado (%)', r.ultima;
  END IF;

  -- ----------------------------------------------------------
  -- 5. O escopo de imobiliária vale para o estado do handoff também.
  -- ----------------------------------------------------------
  IF EXISTS (SELECT 1 FROM leads_ultima_movimentacao('22222222-2222-4222-a222-222222222222'::uuid, ARRAY[l1])) THEN
    RAISE EXCEPTION 'FALHOU: estado do handoff vazou para outra imobiliaria';
  END IF;

  RAISE NOTICE 'estado_do_handoff_no_lead: 5 casos OK';
END $$;

ROLLBACK;
