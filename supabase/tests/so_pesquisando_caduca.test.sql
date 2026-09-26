-- ============================================================
-- "Só pesquisando" caduca quando o lead se contradiz — 26/09
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/so_pesquisando_caduca.test.sql
--
-- O caso 2 é o que sustenta o arquivo, e é a forma exata que a equipe da LIA
-- descreveu: "só pesquisando" no dia 1, visita no dia 3. Antes disto o lead
-- carregava o -10 para sempre e ficava Morno com 65.
--
-- O caso 3 é o que impede a correção de virar exagero: quem se contradiz na
-- ORDEM INVERSA — pediu visita e depois disse que só pesquisa — continua com
-- o -10, porque aí a última palavra é dele.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa  uuid := 'deda0000-0000-4000-a000-00000000000c';
  l1    uuid := gen_random_uuid();   -- só pesquisando, e nada mais
  l2    uuid := gen_random_uuid();   -- pesquisando -> visita      (caduca)
  l3    uuid := gen_random_uuid();   -- visita -> pesquisando      (vale)
  l4    uuid := gen_random_uuid();   -- pesquisando -> simulação   (caduca)
  r     record;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-score', 'Casa do Score')
  ON CONFLICT DO NOTHING;

  INSERT INTO leads (id, tenant_id, name, phone, source, status, lead_type) VALUES
    (l1, casa, 'Lead Um',    '11900000101', 'Site', 'Novos Leads', 1),
    (l2, casa, 'Lead Dois',  '11900000102', 'Site', 'Novos Leads', 1),
    (l3, casa, 'Lead Tres',  '11900000103', 'Site', 'Novos Leads', 1),
    (l4, casa, 'Lead Quatro','11900000104', 'Site', 'Novos Leads', 1);

  -- O tempo importa: a regra é "veio DEPOIS", não "existe".
  INSERT INTO lead_events (tenant_id, lead_id, event_type, lead_source, created_at) VALUES
    (casa, l1::text, 'lia.sinal_so_pesquisando', 'leads', now() - interval '3 days'),

    (casa, l2::text, 'lia.sinal_so_pesquisando', 'leads', now() - interval '3 days'),
    (casa, l2::text, 'lia.visita_agendada',      'leads', now() - interval '1 day'),

    (casa, l3::text, 'lia.visita_agendada',      'leads', now() - interval '3 days'),
    (casa, l3::text, 'lia.sinal_so_pesquisando', 'leads', now() - interval '1 day'),

    (casa, l4::text, 'lia.sinal_so_pesquisando', 'leads', now() - interval '3 days'),
    (casa, l4::text, 'lia.sinal_pediu_simulacao','leads', now() - interval '1 day');

  -- 1. Sem contradição, o sinal vale. Sem isto a "correção" seria só apagar
  --    o sinal, e ninguém perceberia.
  SELECT * INTO r FROM leads_sinais_de_score(casa, ARRAY[l1::text]);
  IF r.so_pesquisando IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU 1: sem contradicao o sinal devia valer, veio %', r.so_pesquisando;
  END IF;
  RAISE NOTICE 'OK 1: sem contradicao, so_pesquisando vale';

  -- 2. O CASO QUE SUSTENTA O ARQUIVO: pesquisando e DEPOIS visita.
  SELECT * INTO r FROM leads_sinais_de_score(casa, ARRAY[l2::text]);
  IF r.so_pesquisando IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU 2: visita depois nao derrubou o so_pesquisando';
  END IF;
  IF r.pediu_visita IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU 2b: a visita sumiu junto -- a correcao comeu o sinal certo';
  END IF;
  RAISE NOTICE 'OK 2: visita depois faz o so_pesquisando caducar, e a visita fica';

  -- 3. Ordem inversa: a última palavra é do lead.
  SELECT * INTO r FROM leads_sinais_de_score(casa, ARRAY[l3::text]);
  IF r.so_pesquisando IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU 3: pesquisando DEPOIS da visita devia valer';
  END IF;
  RAISE NOTICE 'OK 3: quem se contradiz ao contrario continua com o -10';

  -- 4. Simulação também contradiz, não só visita.
  SELECT * INTO r FROM leads_sinais_de_score(casa, ARRAY[l4::text]);
  IF r.so_pesquisando IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU 4: simulacao depois nao derrubou o so_pesquisando';
  END IF;
  RAISE NOTICE 'OK 4: pedir simulacao tambem faz caducar';

  -- 5. Os outros sinais não foram afetados pela mudança do CTE.
  SELECT * INTO r FROM leads_sinais_de_score(casa, ARRAY[l4::text]);
  IF r.pediu_simulacao IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU 5: pediu_simulacao parou de sair';
  END IF;
  RAISE NOTICE 'OK 5: os outros sinais seguem intactos';
END $$;

ROLLBACK;
