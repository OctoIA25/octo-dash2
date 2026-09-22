-- ============================================================
-- Integrações honestas (P4.10).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/integracoes_honestas.test.sql
--
-- O CRITÉRIO DE PRONTO DO PLANO — "nenhum card pede senha para uma integração
-- que não existe" — se cumpre na tela; o que o banco garante está no caso 1:
-- a lista de integrações REAIS é fechada, e o que não existe vive noutra
-- tabela, sem campo de senha nenhum.
--
-- O caso 4 é o que evita a tela sumir inteira: o `sync_state` do Contact2Sale
-- é JSON guardado como TEXTO, e uma linha malformada não pode derrubar as seis.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '2fffcccc-0000-4000-a000-000000000001';
  t2 uuid := '2fffcccc-0000-4000-a000-000000000002';
  chefe uuid := '2fffcccd-0000-4000-a000-000000000001';
  ana uuid := '2fffcccd-0000-4000-a000-000000000002';
  fora uuid := '2fffcccd-0000-4000-a000-000000000009';
  r jsonb;
  x jsonb;
  n integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (chefe, 'chefe@teste-int.dev'), (ana, 'ana@teste-int.dev'), (fora, 'fora@teste-int.dev')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (t, 'teste-int', 'Teste Integrações'), (t2, 'teste-int-2', 'Vizinha') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (t, chefe, 'admin'), (t, ana, 'corretor'), (t2, fora, 'admin')
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', chefe, 'role', 'authenticated', 'email', 'chefe@teste-int.dev')::text, true);

  -- ----------------------------------------------------------
  -- 1. SÃO SEIS, E SÓ SEIS
  --
  -- A tela mostrava 37 cards. Seis integrações existem; as outras 31 eram
  -- formulário de e-mail e senha que não ia a lugar nenhum.
  -- ----------------------------------------------------------
  r := integracoes_status(t);
  IF jsonb_array_length(r) <> 6 THEN
    RAISE EXCEPTION 'FALHOU: deviam ser 6 integrações reais, são %', jsonb_array_length(r);
  END IF;

  -- E nenhuma delas, mesmo sem configuração, é apresentada como existente.
  FOR x IN SELECT * FROM jsonb_array_elements(r) LOOP
    IF (x->>'configurada')::boolean THEN
      RAISE EXCEPTION 'FALHOU: % apareceu configurada numa casa que nunca a configurou', x->>'nome';
    END IF;
    IF x->>'status' IS DISTINCT FROM 'nao_configurada' THEN
      RAISE EXCEPTION 'FALHOU: % inventou o status %', x->>'nome', x->>'status';
    END IF;
  END LOOP;

  -- O que não existe mora noutra tabela, e lá NÃO há campo de senha.
  IF jsonb_array_length(integracoes_previstas_lista()) < 25 THEN
    RAISE EXCEPTION 'FALHOU: o catálogo do que não existe está vazio';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'integracoes_previstas'
                AND (column_name ILIKE '%senha%' OR column_name ILIKE '%password%'
                     OR column_name ILIKE '%email%' OR column_name ILIKE '%token%')) THEN
    RAISE EXCEPTION 'FALHOU: o catálogo do que não existe tem campo de credencial';
  END IF;
  RAISE NOTICE 'OK 1: seis reais, e o que não existe não pede credencial';

  -- ----------------------------------------------------------
  -- 2. O ESTADO VEM DE ONDE ESTÁ GUARDADO, NÃO DE UM NÚMERO FIXO
  -- ----------------------------------------------------------
  INSERT INTO kenlo_integrations (tenant_id, kenlo_email, status, last_sync_at, sync_state)
  VALUES (t, 'casa@kenlo.dev', 'error', now() - interval '2 hours',
          '{"status":"error","error_message":"login recusado pela Kenlo"}');
  INSERT INTO tenant_zap_config (tenant_id, status, last_feed_at, last_lead_at)
  VALUES (t::text, 'active', now() - interval '30 minutes', now() - interval '3 days');

  r := integracoes_status(t);
  SELECT y INTO x FROM jsonb_array_elements(r) y WHERE y->>'codigo' = 'kenlo';
  IF (x->>'configurada')::boolean IS DISTINCT FROM true
     OR x->>'status' IS DISTINCT FROM 'error'
     OR x->>'ultimo_erro' IS DISTINCT FROM 'login recusado pela Kenlo' THEN
    RAISE EXCEPTION 'FALHOU: o estado do Kenlo não veio do banco — %', x;
  END IF;
  RAISE NOTICE 'OK 2: o status e o erro vêm de onde já estavam guardados';

  -- ----------------------------------------------------------
  -- 3. A ÚLTIMA SINCRONIZAÇÃO DA ZAP É A MAIS RECENTE DAS DUAS
  --
  -- "Sincronizar" ali são duas coisas: a ZAP buscar o feed e a ZAP mandar um
  -- lead. Mostrar só a segunda diria que o canal está morto há três dias,
  -- quando o feed foi buscado há meia hora.
  -- ----------------------------------------------------------
  SELECT y INTO x FROM jsonb_array_elements(r) y WHERE y->>'codigo' = 'zap';
  IF (x->>'ultima_sincronizacao')::timestamptz < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'FALHOU: a ZAP apareceu parada há dias, e o feed foi buscado há 30 min — %',
      x->>'ultima_sincronizacao';
  END IF;
  RAISE NOTICE 'OK 3: a ZAP mostra a sincronização mais recente das duas';

  -- ----------------------------------------------------------
  -- 4. UMA LINHA MALFORMADA NÃO DERRUBA AS SEIS
  --
  -- `sync_state` é JSON guardado como TEXTO. Converter direto estoura a
  -- função inteira, e a tela de integrações some por causa de uma linha.
  -- ----------------------------------------------------------
  INSERT INTO tenant_contact2sale_config (tenant_id, status, sync_state)
  VALUES (t::text, 'inactive', 'isto não é json {{{');

  r := integracoes_status(t);
  IF jsonb_array_length(r) <> 6 THEN
    RAISE EXCEPTION 'FALHOU: o JSON quebrado derrubou a lista — sobraram %', jsonb_array_length(r);
  END IF;
  SELECT y INTO x FROM jsonb_array_elements(r) y WHERE y->>'codigo' = 'contact2sale';
  IF x->>'ultimo_erro' IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: inventou erro a partir de JSON quebrado — %', x->>'ultimo_erro';
  END IF;
  IF erro_do_sync_state('{{{ nada') IS NOT NULL OR erro_do_sync_state('') IS NOT NULL
     OR erro_do_sync_state(NULL) IS NOT NULL OR erro_do_sync_state('{"a":1}') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: o leitor de sync_state inventou erro onde não há';
  END IF;
  RAISE NOTICE 'OK 4: JSON quebrado não derruba a lista nem inventa erro';

  -- ----------------------------------------------------------
  -- 5. O QUE NÃO SE SABE NÃO VIRA "SEM ERROS"
  --
  -- `tenant_santa_angela_config` não tem coluna de erro. Mostrar "nenhum erro"
  -- seria afirmar o que ninguém registrou.
  -- ----------------------------------------------------------
  SELECT y INTO x FROM jsonb_array_elements(r) y WHERE y->>'codigo' = 'santa_angela';
  IF (x->>'erro_nao_registrado')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: a Santa Ângela não avisa que erro não é registrado ali';
  END IF;
  RAISE NOTICE 'OK 5: onde o erro não é registrado, a tela diz isso';

  -- ----------------------------------------------------------
  -- 6. LEAD SE CONTA ONDE A INTEGRAÇÃO ESCREVE — E "NÃO TRAZ" NÃO É ZERO
  --
  -- O contador antigo era um número só, do CRM principal, e para quem não é
  -- dono da plataforma ele vinha ZERO por causa de um 403.
  -- ----------------------------------------------------------
  INSERT INTO leads (tenant_id, name, phone, status, source, created_at) VALUES
    (t, 'Veio da ZAP', '11900000001', 'Novos Leads', 'ZAP Imóveis', now()),
    (t, 'Veio do Face', '11900000002', 'Novos Leads', 'Facebook', now()),
    (t, 'Veio do Insta', '11900000003', 'Novos Leads', 'Instagram', now()),
    (t, 'Digitado à mão', '11900000004', 'Novos Leads', 'Manual', now());
  INSERT INTO kenlo_leads (tenant_id, source_crm) VALUES (t, 'kenlo');

  r := integracoes_status(t);
  SELECT y INTO x FROM jsonb_array_elements(r) y WHERE y->>'codigo' = 'zap';
  IF (x->>'leads')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: a ZAP devia contar 1 lead, contou %', x->>'leads';
  END IF;
  SELECT y INTO x FROM jsonb_array_elements(r) y WHERE y->>'codigo' = 'meta';
  IF (x->>'leads')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: o Meta devia somar Facebook e Instagram (2), contou %', x->>'leads';
  END IF;
  SELECT y INTO x FROM jsonb_array_elements(r) y WHERE y->>'codigo' = 'kenlo';
  IF (x->>'leads')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: o Kenlo devia contar 1, contou %', x->>'leads';
  END IF;
  -- O lead digitado à mão não pertence a integração nenhuma.
  SELECT sum((y->>'leads')::int) INTO n FROM jsonb_array_elements(r) y WHERE y->>'leads' IS NOT NULL;
  IF n <> 4 THEN
    RAISE EXCEPTION 'FALHOU: a soma das integrações devia ser 4 (o manual não conta), deu %', n;
  END IF;

  -- E o que não traz lead nenhum vem NULO, não zero: "trouxe zero" é outra
  -- coisa que "não é disso que se trata".
  SELECT y INTO x FROM jsonb_array_elements(r) y WHERE y->>'codigo' = 'anthropic';
  IF x->>'leads' IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: o relatório de custo apareceu com contador de leads';
  END IF;
  IF x->>'leads_de_onde' NOT LIKE '%não traz leads%' THEN
    RAISE EXCEPTION 'FALHOU: não diz que aquilo não traz leads';
  END IF;
  RAISE NOTICE 'OK 6: cada uma conta onde escreve, e "não traz" não é zero';

  -- ----------------------------------------------------------
  -- 7. TODA INTEGRAÇÃO DIZ DE ONDE TIROU O NÚMERO
  --
  -- É o que permite conferir. Um contador sem origem é um número para
  -- acreditar, e foi assim que o antigo passou meses errado.
  -- ----------------------------------------------------------
  FOR x IN SELECT * FROM jsonb_array_elements(r) LOOP
    IF COALESCE(x->>'leads_de_onde', '') = '' THEN
      RAISE EXCEPTION 'FALHOU: % não diz de onde tirou o número', x->>'nome';
    END IF;
  END LOOP;
  RAISE NOTICE 'OK 7: toda integração diz de onde tirou o número';

  -- ----------------------------------------------------------
  -- 8. QUEM NÃO ADMINISTRA NÃO VÊ, E A VIZINHA MENOS AINDA
  --
  -- O estado das integrações mostra erro de autenticação e endereço de
  -- servidor: é informação de quem cuida da conta.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', ana, 'role', 'authenticated', 'email', 'ana@teste-int.dev')::text, true);
  IF integracoes_status(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a corretora viu o estado das integrações';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', fora, 'role', 'authenticated', 'email', 'fora@teste-int.dev')::text, true);
  IF integracoes_status(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a vizinha viu o estado das integrações alheias';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 8: só quem administra a casa vê';
END $$;

-- ----------------------------------------------------------
-- 9. O ANÔNIMO NÃO ALCANÇA
-- ----------------------------------------------------------
CREATE FUNCTION pg_temp.deve_barrar(p_sql text, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FALHOU: %  (passou e deveria ter sido barrado)', p_caso;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM integracoes_previstas $$,
  'o anônimo leu o catálogo de integrações');
SELECT pg_temp.deve_barrar(
  $$ SELECT integracoes_status('00000000-0000-4000-a000-000000000001'::uuid) $$,
  'o anônimo leu o estado das integrações');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK 9: anônimo barrado'; END $$;

ROLLBACK;
