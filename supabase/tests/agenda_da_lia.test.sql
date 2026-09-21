-- ============================================================
-- Agenda da LIA (P2.5).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/agenda_da_lia.test.sql
--
-- O caso 5 é o que o plano chama de "pronto" pelo avesso: o retorno que o lead
-- pediu NÃO pode ser cancelado quando o lead volta a falar — porque o pedido É
-- o lead falando. Sem essa distinção, "me chama amanhã às 16h" cancelaria o
-- próprio retorno e o cliente nunca receberia a ligação.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t      uuid := 'ccccccc1-1111-4111-a111-111111111111';
  t2     uuid := 'ccccccc9-9999-4111-a111-111111111111';
  u      uuid := 'ccccccc2-2222-4111-a111-111111111111';
  u_fora uuid := 'ccccccc3-3333-4111-a111-111111111111';
  lead   uuid;
  fila   jsonb;
  n      int;
  v      text;
  aba    text;
  linha  text;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (u, 'agenda@teste.dev', jsonb_build_object('name', 'Gestora')),
         (u_fora, 'fora.agenda@teste.dev', '{}'::jsonb)
  ON CONFLICT DO NOTHING;

  INSERT INTO tenants (id, code, name)
  VALUES (t, 'teste-agenda', 'Teste Agenda'), (t2, 'teste-agenda-2', 'Vizinha Agenda')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES (t, u, 'admin'), (t2, u_fora, 'admin') ON CONFLICT DO NOTHING;

  INSERT INTO leads (tenant_id, name) VALUES (t, 'Cliente da Agenda') RETURNING id INTO lead;

  -- `scheduled_at` sempre relativo ao AGORA de Brasília, para o teste não
  -- quebrar sozinho às 21h — quando o UTC já virou o dia e o Brasil não.
  INSERT INTO lia_followups (id, tenant_id, lead_id, idempotency_key, status, scheduled_at, motivo, pedido_por, tag)
  VALUES
    -- pedido pelo lead, hoje, ainda por sair
    -- Parênteses obrigatórios: `AT TIME ZONE` liga mais forte que o `+`, e sem
    -- eles o Postgres tenta converter o INTERVALO de fuso.
    ('ag-lead-hoje', t, lead, 'k1', 'pending',
     (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') + interval '23 hours')
       AT TIME ZONE 'America/Sao_Paulo',
     'cliente pediu retorno às 16h', 'lead', 'retorno_pedido'),
    -- cadência automática futura
    ('ag-lia-futuro', t, lead, 'k2', 'pending', now() + interval '2 days',
     'follow-up automático 1', 'lia', 'cadencia_conversa_1'),
    -- atrasada: a hora passou e não saiu. ONTEM, e não "agora menos 3 horas":
    -- rodando o teste às 2h da manhã, "3 horas atrás" ainda é ontem, e a
    -- asserção viraria moeda.
    ('ag-atrasada', t, lead, 'k3', 'pending', now() - interval '1 day' - interval '2 hours',
     'follow-up automático 2', 'lia', 'cadencia_conversa_2'),
    -- não saiu, e não foi dito por quê (48 das 84 reais são assim)
    ('ag-expirada', t, lead, 'k4', 'expired', now() - interval '1 day',
     'follow-up automático 1', 'lia', 'cadencia_conversa_1'),
    -- já enviada
    ('ag-enviada', t, lead, 'k5', 'sent', now() - interval '2 days',
     'follow-up automático 1', 'lia', 'cadencia_conversa_1');
  UPDATE lia_followups SET sent_at = scheduled_at WHERE id = 'ag-enviada';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. A AGENDA É DE QUEM PERTENCE À IMOBILIÁRIA.
  --
  -- SECURITY DEFINER ignora a RLS, e estas linhas carregam telefone e texto de
  -- conversa com o cliente.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_fora::text)::text, true);
  IF agenda_lia_fila(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: usuário de outra imobiliária leu a agenda';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 2. AS CINCO ABAS DO PLANO.
  -- ----------------------------------------------------------
  fila := agenda_lia_fila(t, 'hoje');

  -- Contagem exata só onde ela NÃO depende da hora em que o teste roda.
  IF (fila->'contadores'->>'pedidos_pelo_lead')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: "Pedidos pelo lead" contou % — %',
      fila->'contadores'->>'pedidos_pelo_lead', fila->'contadores';
  END IF;
  IF (fila->'contadores'->>'nao_sairam')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: "Não saíram" contou % — %',
      fila->'contadores'->>'nao_sairam', fila->'contadores';
  END IF;

  -- Nas abas que andam com o relógio, o que importa é a linha certa cair na
  -- aba certa — não o total, que muda conforme a hora do dia. "Hoje" e
  -- "Atrasados" chegam a se sobrepor de propósito: um retorno de hoje de manhã
  -- que não saiu está nas duas, e é onde o gestor precisa tropeçar nele.
  FOR aba, linha IN
    SELECT * FROM (VALUES
      ('hoje',       'ag-lead-hoje'),
      ('a_cumprir',  'ag-lia-futuro'),
      ('atrasados',  'ag-atrasada'),
      ('nao_sairam', 'ag-expirada'),
      ('pedidos_pelo_lead', 'ag-lead-hoje')
    ) x(aba, linha)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(agenda_lia_fila(t, aba)->'linhas') l
       WHERE l->>'id' = linha
    ) THEN
      RAISE EXCEPTION 'FALHOU: a aba "%" não trouxe a linha "%"', aba, linha;
    END IF;
  END LOOP;

  -- E não traz o que não é dela: a enviada de dois dias atrás não é "a cumprir".
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(agenda_lia_fila(t, 'a_cumprir')->'linhas') l
     WHERE l->>'id' = 'ag-enviada'
  ) THEN
    RAISE EXCEPTION 'FALHOU: "A cumprir" trouxe uma cadência já enviada';
  END IF;

  -- ----------------------------------------------------------
  -- 3. "HOJE" É O DIA DE BRASÍLIA, NÃO O DO UTC.
  --
  -- Às 21h de Brasília o UTC já virou. Contando em UTC, a agenda de hoje
  -- apareceria vazia para quem ainda está trabalhando — e o retorno das 23h
  -- (que é hoje) cairia em "amanhã".
  -- ----------------------------------------------------------
  SELECT l->>'id' INTO v
    FROM jsonb_array_elements(fila->'linhas') l
   WHERE l->>'id' = 'ag-lead-hoje';
  IF v IS NULL THEN
    RAISE EXCEPTION 'FALHOU: o retorno das 23h de hoje (Brasília) não apareceu na aba Hoje';
  END IF;

  -- ----------------------------------------------------------
  -- 4. A JANELA PADRÃO É A DO PLANO, SEM NINGUÉM CONFIGURAR.
  -- ----------------------------------------------------------
  IF fila->>'pode_falar_das' <> '09:00:00' OR fila->>'pode_falar_ate' <> '20:00:00'
     OR (fila->>'configurado')::boolean THEN
    RAISE EXCEPTION 'FALHOU: padrão deveria ser 09:00–20:00 e não-configurado — % a % / %',
      fila->>'pode_falar_das', fila->>'pode_falar_ate', fila->>'configurado';
  END IF;

  -- ----------------------------------------------------------
  -- 5. O RETORNO PEDIDO PELO LEAD SOBREVIVE AO LEAD VOLTAR A FALAR.
  --
  -- A regra central do P2.5. Em produção, 2.361 dos 2.419 cancelamentos são
  -- `lead_returned`: a LIA cancela o follow-up quando o lead reaparece. Para a
  -- cadência está certo. Para o retorno pedido, cancelaria o próprio pedido.
  --
  -- Quem decide é `pedido_por`, e é isto que este caso prende.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n
    FROM lia_followups
   WHERE tenant_id = t AND status = 'pending' AND pedido_por <> 'lead';
  IF n <> 2 THEN
    RAISE EXCEPTION 'FALHOU: % pendentes canceláveis por retorno do lead (esperava 2)', n;
  END IF;

  SELECT count(*) INTO n
    FROM lia_followups
   WHERE tenant_id = t AND status = 'pending' AND pedido_por = 'lead';
  IF n <> 1 THEN
    RAISE EXCEPTION 'FALHOU: o retorno pedido pelo lead sumiu da fila protegida';
  END IF;

  -- ----------------------------------------------------------
  -- 6. TODA LINHA ANTIGA CONTINUA SENDO CADÊNCIA DA LIA.
  --
  -- A coluna nasceu com default 'lia' porque as 3.116 linhas de produção são
  -- cadência automática, e o app da LIA não manda esta coluna hoje. Sem o
  -- default, todo INSERT dela quebraria no dia do deploy.
  -- ----------------------------------------------------------
  INSERT INTO lia_followups (id, tenant_id, lead_id, idempotency_key, status, scheduled_at)
  VALUES ('ag-sem-pedido', t, lead, 'k6', 'pending', now() + interval '1 hour');
  SELECT pedido_por INTO v FROM lia_followups WHERE id = 'ag-sem-pedido';
  IF v <> 'lia' THEN
    RAISE EXCEPTION 'FALHOU: linha sem pedido_por deveria nascer como "lia", veio "%"', v;
  END IF;

  -- ----------------------------------------------------------
  -- 7. A CONFIGURAÇÃO NÃO ACEITA JANELA IMPOSSÍVEL.
  --
  -- Guardamos a janela em que PODE falar. "Das 20h às 9h" gravado assim seria
  -- uma janela vazia, e a LIA nunca mais falaria com ninguém — em silêncio.
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO tenant_agenda_lia_config (tenant_id, pode_falar_das, pode_falar_ate)
    VALUES (t2, '20:00', '09:00');
    RAISE EXCEPTION 'FALHOU: aceitou janela invertida, que silenciaria a LIA';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO tenant_agenda_lia_config (tenant_id, dias_permitidos) VALUES (t2, '{9}');
    RAISE EXCEPTION 'FALHOU: aceitou dia da semana que não existe';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- E a válida entra, e a fila passa a refletir.
  INSERT INTO tenant_agenda_lia_config (tenant_id, pode_falar_das, pode_falar_ate, dias_permitidos)
  VALUES (t, '10:00', '17:00', '{1,2,3,4,5}');
  fila := agenda_lia_fila(t, 'hoje');
  IF fila->>'pode_falar_das' <> '10:00:00' OR NOT (fila->>'configurado')::boolean THEN
    RAISE EXCEPTION 'FALHOU: a fila não refletiu a configuração gravada — %', fila;
  END IF;

  RAISE NOTICE 'OK: agenda da LIA — 7 casos';
END $$;

ROLLBACK;
