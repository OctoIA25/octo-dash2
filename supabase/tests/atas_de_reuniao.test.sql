-- ============================================================
-- Atas de reunião (P4.8).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/atas_de_reuniao.test.sql
--
-- O CRITÉRIO DE PRONTO DO PLANO está no caso 6: subir uma transcrição gera a
-- ata e as tarefas aparecem na agenda dos responsáveis.
--
-- O caso 5 é o que protege a armadilha do item: a transcrição diz "a Ana fica
-- de mandar a proposta", e "Ana" é uma palavra, não uma pessoa. Criar a tarefa
-- adivinhando quem é Ana faz a tarefa nascer no colo de ninguém — e a reunião
-- termina com trabalho combinado que some.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '2fff9999-0000-4000-a000-000000000001';
  t2 uuid := '2fff9999-0000-4000-a000-000000000002';
  chefe uuid := '2fff999a-0000-4000-a000-000000000001';
  lider uuid := '2fff999a-0000-4000-a000-000000000002';
  ana uuid := '2fff999a-0000-4000-a000-000000000003';
  fora uuid := '2fff999a-0000-4000-a000-000000000009';
  ata uuid;
  r jsonb;
  a public.atas%ROWTYPE;
  tar public.ata_tarefas%ROWTYPE;
  ev public.agenda_eventos%ROWTYPE;
  n integer;
  texto text := repeat('Reunião de segunda. Falamos do funil, dos lançamentos e do bolsão. ', 3);
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (chefe, 'chefe@teste-ata.dev', '{"name":"Chefe"}'),
    (lider, 'lider@teste-ata.dev', '{"name":"Líder"}'),
    (ana,   'ana@teste-ata.dev',   '{"name":"Ana Corretora"}'),
    (fora,  'fora@teste-ata.dev',  '{"name":"Vizinha"}')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (t, 'teste-ata', 'Teste Atas'), (t2, 'teste-ata-2', 'Vizinha') ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (t, chefe, 'admin'), (t, lider, 'team_leader'), (t, ana, 'corretor'), (t2, fora, 'admin')
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', chefe, 'role', 'authenticated', 'email', 'chefe@teste-ata.dev')::text, true);

  -- ----------------------------------------------------------
  -- 1. A ATA NASCE DA TRANSCRIÇÃO, E VAZIO NÃO VIRA ATA
  -- ----------------------------------------------------------
  BEGIN
    PERFORM ata_criar(t, 'Reunião', CURRENT_DATE, 'oi');
    RAISE EXCEPTION 'FALHOU: aceitou transcrição de duas palavras';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  r := ata_criar(t, 'Reunião de segunda', DATE '2026-09-21', texto, 'Equipe A');
  ata := (r->>'ata_id')::uuid;
  SELECT * INTO a FROM atas WHERE id = ata;
  IF a.status IS DISTINCT FROM 'enviada' OR a.lido_por IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a ata recém-criada devia estar "enviada" e sem leitor';
  END IF;
  RAISE NOTICE 'OK 1: a ata nasce da transcrição, e vazio não vira ata';

  -- ----------------------------------------------------------
  -- 2. A LEITURA ESTRUTURA, MAS NÃO CRIA TAREFA NENHUMA
  --
  -- Mesma regra do P4.7: a IA escreve a linha da ata; quem transforma em
  -- trabalho de alguém é uma pessoa.
  -- ----------------------------------------------------------
  r := ata_conteudo_recebido(ata, jsonb_build_object(
    'titulo', 'Reunião de segunda — funil e lançamentos',
    'data', '2026-09-21',
    'participantes', jsonb_build_array('Chefe', 'Líder', 'Ana'),
    'resumo', 'Revisão do funil e divisão dos lançamentos.',
    'decisoes', jsonb_build_array('O bolsão passa a ser revisado toda sexta.'),
    'riscos', jsonb_build_array('A tabela da Santa Ângela ainda não chegou.'),
    'mapa', jsonb_build_array(
      jsonb_build_object('nivel', 1, 'texto', 'Funil'),
      jsonb_build_object('nivel', 2, 'texto', 'Bolsão')),
    'tarefas', jsonb_build_array(
      jsonb_build_object('descricao','Mandar a proposta do 301','responsavel','a Ana','prazo','2026-09-25'),
      jsonb_build_object('descricao','Cobrar a tabela da construtora','responsavel','o Líder','prazo','amanhã'),
      jsonb_build_object('descricao','','responsavel','ninguém'))
  ));

  SELECT * INTO a FROM atas WHERE id = ata;
  IF a.status IS DISTINCT FROM 'lida' OR a.lido_por IS DISTINCT FROM 'ia' THEN
    RAISE EXCEPTION 'FALHOU: depois da leitura a ata devia ficar "lida" por "ia", ficou % por %',
      a.status, a.lido_por;
  END IF;
  IF a.tarefas_criadas_em IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a leitura automática criou as tarefas';
  END IF;
  SELECT count(*) INTO n FROM agenda_eventos WHERE tenant_id = t;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FALHOU: a leitura pôs % tarefa(s) na agenda de alguém', n;
  END IF;
  RAISE NOTICE 'OK 2: a leitura estrutura e não cria tarefa nenhuma';

  -- ----------------------------------------------------------
  -- 3. O QUE VEIO TORTO NÃO DERRUBA A ATA
  --
  -- Tarefa sem descrição é descartada; "amanhã" não é data e fica em branco
  -- para a pessoa pôr. Recusar a ata inteira por causa de uma linha faria
  -- perder o resumo e as decisões, que estavam certos.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM ata_tarefas WHERE ata_id = ata;
  IF n IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: a tarefa sem descrição devia ser descartada — ficaram %', n;
  END IF;
  SELECT * INTO tar FROM ata_tarefas WHERE ata_id = ata AND responsavel_texto = 'o Líder';
  IF tar.prazo IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: "amanhã" virou data (%) em vez de ficar em branco', tar.prazo;
  END IF;
  SELECT * INTO a FROM atas WHERE id = ata;
  IF array_length(a.decisoes,1) IS DISTINCT FROM 1
     OR array_length(a.participantes,1) IS DISTINCT FROM 3
     OR jsonb_array_length(a.mapa) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: o resto do conteúdo se perdeu por causa da linha torta';
  END IF;
  RAISE NOTICE 'OK 3: linha torta é descartada sem derrubar o resto';

  -- ----------------------------------------------------------
  -- 4. RESPONSÁVEL QUE NÃO É DA CASA É RECUSADO
  --
  -- Um e-mail digitado à mão que não é de ninguém criaria uma tarefa que
  -- nunca aparece para pessoa alguma.
  -- ----------------------------------------------------------
  SELECT * INTO tar FROM ata_tarefas WHERE ata_id = ata AND responsavel_texto = 'a Ana';
  BEGIN
    PERFORM ata_tarefa_revisar(tar.id, NULL, 'quemsera@nenhures.dev');
    RAISE EXCEPTION 'FALHOU: aceitou responsável que não é da imobiliária';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM ata_tarefa_revisar(tar.id, NULL, 'fora@teste-ata.dev');
    RAISE EXCEPTION 'FALHOU: aceitou responsável da imobiliária VIZINHA';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 4: responsável de fora da casa é recusado';

  -- ----------------------------------------------------------
  -- 5. SEM RESPONSÁVEL, O LOTE INTEIRO É RECUSADO — E DIZ QUAIS
  --
  -- Criar as que dá e calar sobre as outras faria a reunião terminar com
  -- tarefas perdidas que ninguém procura. É o oposto do que a ata serve.
  -- ----------------------------------------------------------
  r := ata_criar_tarefas(ata);
  IF (r->>'criadas')::int IS DISTINCT FROM 0 OR r->'sem_responsavel' IS NULL THEN
    RAISE EXCEPTION 'FALHOU: criou tarefa sem responsável — %', r;
  END IF;
  IF jsonb_array_length(r->'sem_responsavel') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: devia listar as 2 sem dono, listou %',
      jsonb_array_length(r->'sem_responsavel');
  END IF;
  -- E o que a transcrição disse vem junto, para a pessoa saber quem procurar.
  IF NOT (r->'sem_responsavel')::text LIKE '%a Ana%' THEN
    RAISE EXCEPTION 'FALHOU: a recusa não diz o que a transcrição chamou de responsável';
  END IF;
  SELECT count(*) INTO n FROM agenda_eventos WHERE tenant_id = t;
  IF n <> 0 THEN RAISE EXCEPTION 'FALHOU: criou % tarefa(s) apesar da recusa', n; END IF;
  RAISE NOTICE 'OK 5: lote recusado, com a lista de quem falta apontar';

  -- ----------------------------------------------------------
  -- 6. CRITÉRIO DE PRONTO: A TAREFA APARECE NA AGENDA DO RESPONSÁVEL
  -- ----------------------------------------------------------
  PERFORM ata_tarefa_revisar(tar.id, NULL, 'ana@teste-ata.dev');
  SELECT * INTO tar FROM ata_tarefas WHERE ata_id = ata AND responsavel_texto = 'o Líder';
  PERFORM ata_tarefa_revisar(tar.id, NULL, 'lider@teste-ata.dev', DATE '2026-09-26');

  r := ata_criar_tarefas(ata);
  IF (r->>'criadas')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: deviam nascer 2 tarefas, nasceram % — %', r->>'criadas', r;
  END IF;

  SELECT * INTO ev FROM agenda_eventos
   WHERE tenant_id = t AND corretor_email = 'ana@teste-ata.dev';
  IF ev.id IS NULL THEN
    RAISE EXCEPTION 'FALHOU: a tarefa não apareceu na agenda da Ana';
  END IF;
  IF ev.tipo IS DISTINCT FROM 'tarefa' OR ev.status IS DISTINCT FROM 'pendente' THEN
    RAISE EXCEPTION 'FALHOU: a tarefa nasceu como tipo=% status=%', ev.tipo, ev.status;
  END IF;
  IF ev.data IS DISTINCT FROM DATE '2026-09-25' THEN
    RAISE EXCEPTION 'FALHOU: a tarefa devia cair no prazo combinado, caiu em %', ev.data;
  END IF;
  -- A descrição diz de onde veio, e repete o que a transcrição chamou de
  -- responsável: é como quem recebe entende por que a tarefa é dele.
  IF ev.descricao NOT LIKE '%Reunião de segunda%' OR ev.descricao NOT LIKE '%a Ana%' THEN
    RAISE EXCEPTION 'FALHOU: a tarefa não diz de que reunião veio — %', ev.descricao;
  END IF;

  SELECT * INTO a FROM atas WHERE id = ata;
  IF a.status IS DISTINCT FROM 'revisada' OR a.tarefas_criadas_por IS DISTINCT FROM chefe THEN
    RAISE EXCEPTION 'FALHOU: a ata devia ficar revisada e assinada por quem criou';
  END IF;
  RAISE NOTICE 'OK 6: as tarefas apareceram na agenda dos responsáveis (critério de pronto)';

  -- ----------------------------------------------------------
  -- 7. CRIAR DUAS VEZES NÃO DUPLICA
  --
  -- Dois cliques no botão dariam à Ana duas vezes a mesma tarefa.
  -- ----------------------------------------------------------
  r := ata_criar_tarefas(ata);
  IF (r->>'ja_criadas')::boolean IS DISTINCT FROM true OR (r->>'criadas')::int <> 0 THEN
    RAISE EXCEPTION 'FALHOU: criou de novo — %', r;
  END IF;
  SELECT count(*) INTO n FROM agenda_eventos WHERE tenant_id = t;
  IF n IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: a agenda ficou com % tarefas em vez de 2', n;
  END IF;
  RAISE NOTICE 'OK 7: criar duas vezes não duplica';

  -- ----------------------------------------------------------
  -- 8. DEPOIS DE CRIADA, NEM A LEITURA NEM A REVISÃO DESFAZEM
  --
  -- Reler a ata apagaria o apontamento que uma pessoa fez, e as tarefas já
  -- estariam na agenda de alguém — apontando para linhas que sumiram.
  -- ----------------------------------------------------------
  BEGIN
    PERFORM ata_conteudo_recebido(ata, jsonb_build_object('resumo','outro'));
    RAISE EXCEPTION 'FALHOU: releu uma ata cujas tarefas já foram criadas';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM ata_tarefa_revisar(tar.id, 'outra descrição');
    RAISE EXCEPTION 'FALHOU: alterou uma tarefa que já está na agenda';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'OK 8: ata com tarefas criadas não é reescrita';

  -- ----------------------------------------------------------
  -- 9. DESCARTADA NÃO VIRA TAREFA, E SEM PRAZO NASCE PARA HOJE
  --
  -- Tarefa sem data some da agenda — e a reunião decidiu que ela existe.
  -- ----------------------------------------------------------
  r := ata_criar(t, 'Reunião curta', DATE '2026-09-22', texto);
  ata := (r->>'ata_id')::uuid;
  PERFORM ata_conteudo_recebido(ata, jsonb_build_object('tarefas', jsonb_build_array(
    jsonb_build_object('descricao','Isto foi descartado na revisão','responsavel','Ana'),
    jsonb_build_object('descricao','Isto fica, sem prazo combinado','responsavel','Ana'))));

  SELECT * INTO tar FROM ata_tarefas WHERE ata_id = ata AND descricao LIKE 'Isto foi descartado%';
  PERFORM ata_tarefa_revisar(tar.id, NULL, NULL, NULL, true);
  SELECT * INTO tar FROM ata_tarefas WHERE ata_id = ata AND descricao LIKE 'Isto fica%';
  PERFORM ata_tarefa_revisar(tar.id, NULL, 'ana@teste-ata.dev');

  r := ata_criar_tarefas(ata);
  IF (r->>'criadas')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: a descartada virou tarefa — criadas=%', r->>'criadas';
  END IF;
  SELECT * INTO ev FROM agenda_eventos WHERE tenant_id = t AND titulo LIKE 'Isto fica%';
  IF ev.data IS DISTINCT FROM (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'FALHOU: tarefa sem prazo devia nascer para hoje, nasceu em %', ev.data;
  END IF;
  RAISE NOTICE 'OK 9: descartada não vira tarefa; sem prazo, nasce para hoje';

  -- ----------------------------------------------------------
  -- 10. A ATA É DE QUEM GERE; O CORRETOR RECEBE A TAREFA, NÃO A CONVERSA
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', lider, 'role', 'authenticated', 'email', 'lider@teste-ata.dev')::text, true);
  IF atas_lista(t) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: o líder de equipe não vê as atas';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', ana, 'role', 'authenticated', 'email', 'ana@teste-ata.dev')::text, true);
  IF atas_lista(t) IS NOT NULL OR ata_abrir(ata) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a corretora leu a ata da reunião de gestão';
  END IF;
  -- Mas a tarefa dela está lá, na agenda dela.
  SELECT count(*) INTO n FROM agenda_eventos
   WHERE tenant_id = t AND corretor_email = 'ana@teste-ata.dev';
  IF n < 1 THEN RAISE EXCEPTION 'FALHOU: a corretora ficou sem a tarefa dela'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', fora, 'role', 'authenticated', 'email', 'fora@teste-ata.dev')::text, true);
  IF atas_lista(t) IS NOT NULL OR ata_abrir(ata) IS NOT NULL
     OR ata_criar_tarefas(ata) IS NOT NULL OR ata_responsaveis(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a imobiliária vizinha alcançou as atas';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 10: a ata é de quem gere; a tarefa é de quem faz';

  -- ----------------------------------------------------------
  -- 11. O SERVIDOR NÃO CRIA TAREFA EM NOME DE NINGUÉM
  -- ----------------------------------------------------------
  r := ata_criar(t, 'Outra', CURRENT_DATE, texto);
  PERFORM ata_conteudo_recebido((r->>'ata_id')::uuid, jsonb_build_object('tarefas',
    jsonb_build_array(jsonb_build_object('descricao','x','responsavel','Ana'))));
  BEGIN
    PERFORM ata_criar_tarefas((r->>'ata_id')::uuid);
    RAISE EXCEPTION 'FALHOU: criou tarefas sem pessoa logada';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'OK 11: sem pessoa, ninguém cria tarefa';
END $$;

-- ----------------------------------------------------------
-- 12. O NAVEGADOR NÃO ESCREVE O CONTEÚDO ESTRUTURADO
--
-- Se pudesse, bastaria mandar o conteúdo e criar as tarefas em seguida: a
-- revisão humana viraria um passo que dá para pular.
-- ----------------------------------------------------------
CREATE FUNCTION pg_temp.deve_barrar(p_sql text, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FALHOU: %  (passou e deveria ter sido barrado)', p_caso;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.deve_barrar(
  $$ SELECT ata_conteudo_recebido('00000000-0000-4000-a000-000000000001'::uuid, '{}'::jsonb) $$,
  'o navegador escreveu o conteúdo estruturado da ata');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM atas $$,
  'o autenticado leu a tabela de atas direto');
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM atas $$, 'o anônimo leu as atas');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM ata_tarefas $$, 'o anônimo leu as tarefas das atas');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK 12: navegador e anônimo barrados'; END $$;

ROLLBACK;
