-- ============================================================
-- A fila do plantão não pode estourar com o que a Lia grava — 26/09
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/plantao_nao_estoura_com_nome.test.sql
--
-- A Lia grava o NOME do corretor em `corretor_id`. Havia uma guarda por regex
-- na condição do JOIN, e ela não protegia: o Postgres não garante avaliar as
-- condições de um JOIN em ordem, então o cast rodava antes. Quatro das cinco
-- abas da tela morriam para a Lotus com
-- `invalid input syntax for type uuid`.
--
-- O caso 1 é o que sustenta este arquivo, e ele tem de rodar com um valor que
-- NÃO é uuid — testar só com uuid válido deixaria passar a volta do cast.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa    uuid := 'b1a0e000-0000-4000-a000-000000000001';
  u_admin uuid := 'b1a01111-0000-4000-a000-000000000001';
  u_corr  uuid := 'b1a01111-0000-4000-a000-000000000002';
  r jsonb;
  aba text;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-plantao', 'Casa do Plantao')
  ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (u_admin, 'admin@plantao.local', '{"name":"Diretoria"}'::jsonb),
    (u_corr,  'fernanda@plantao.local', '{"name":"Fernanda Souza"}'::jsonb)
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (casa, u_admin, 'admin'), (casa, u_corr, 'corretor');

  -- Três linhas, de propósito com as três formas que a tabela tem hoje:
  -- o nome solto (o que a Lia grava), o uuid de verdade, e o vazio.
  INSERT INTO lia_perguntas_corretor
    (id, tenant_id, pergunta, corretor_id, status, resposta_corretor, criado_em, respondida_em)
  VALUES
    (gen_random_uuid(), casa, 'Aceita pet?',        'Fernanda Emilia', 'respondida', 'Aceita sim', now() - interval '2 days', now() - interval '1 day'),
    (gen_random_uuid(), casa, 'Tem varanda?',       u_corr::text,      'respondida', 'Tem',        now() - interval '3 days', now() - interval '2 days'),
    (gen_random_uuid(), casa, 'Qual o acabamento?', NULL,              'pendente',   NULL,         now() - interval '1 day',  NULL);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);

  -- ----------------------------------------------------------
  -- 1. NENHUMA ABA ESTOURA COM NOME NO LUGAR DO UUID
  --
  -- ESTE É O CASO QUE SUSTENTA O ARQUIVO. Antes da correção, quatro destas
  -- cinco chamadas levantavam 22P02 e a tela não abria.
  -- ----------------------------------------------------------
  FOREACH aba IN ARRAY ARRAY['aguardando','respondidas','expiradas','por_aprender','na_janela'] LOOP
    BEGIN
      r := public.plantao_fila(casa, aba, 200, 90);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'FALHOU 1: a aba % estourou — % (%)', aba, SQLERRM, SQLSTATE;
    END;
    IF r IS NULL THEN
      RAISE EXCEPTION 'FALHOU 1b: a aba % devolveu nulo para quem e da casa', aba;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK 1: as cinco abas respondem com nome no lugar do uuid';

  -- ----------------------------------------------------------
  -- 2. O NOME APARECE, EM VEZ DE BRANCO
  --
  -- Se a Lia escreveu "Fernanda Emilia", é isso que o gestor precisa ler. E
  -- `corretor_cadastrado` diz se aquilo é uma pessoa do sistema ou só o texto
  -- que chegou — sem isso, um nome solto passaria por membro cadastrado.
  -- ----------------------------------------------------------
  r := public.plantao_fila(casa, 'respondidas', 200, 90);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r -> 'linhas') x
     WHERE x ->> 'corretor_nome' = 'Fernanda Emilia'
       AND (x ->> 'corretor_cadastrado')::boolean IS FALSE
  ) THEN
    RAISE EXCEPTION 'FALHOU 2: o nome solto nao apareceu marcado como nao cadastrado — %', r -> 'linhas';
  END IF;

  -- E o uuid de verdade continua casando com o cadastro.
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(r -> 'linhas') x
     WHERE x ->> 'corretor_nome' = 'Fernanda Souza'
       AND (x ->> 'corretor_cadastrado')::boolean IS TRUE
  ) THEN
    RAISE EXCEPTION 'FALHOU 2b: o corretor cadastrado deixou de casar — %', r -> 'linhas';
  END IF;
  RAISE NOTICE 'OK 2: nome solto aparece e e marcado; uuid continua casando';

  -- ----------------------------------------------------------
  -- 3. O RESTO DA FUNÇÃO NÃO MUDOU
  --
  -- A correção foi cirúrgica de propósito. Reescrever a função de memória
  -- teria trocado os padrões e perdido os contadores — sem erro nenhum na
  -- tela, que é como esse tipo de estrago costuma passar.
  -- ----------------------------------------------------------
  IF (r -> 'contadores' ->> 'respondidas')::int IS DISTINCT FROM 2
     OR (r -> 'contadores' ->> 'aguardando')::int IS DISTINCT FROM 1
     OR (r -> 'contadores' ->> 'na_janela')::int IS DISTINCT FROM 3
     OR (r -> 'contadores' ->> 'por_aprender')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU 3: os contadores mudaram — %', r -> 'contadores';
  END IF;
  IF (r ->> 'espera_maxima_minutos')::int IS DISTINCT FROM 30
     OR (r ->> 'destino') IS DISTINCT FROM 'corretor_do_lead'
     OR (r ->> 'configurado')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU 3b: o padrao sem tenant_plantao_config mudou — %', r;
  END IF;
  IF (r ->> 'dias')::int IS DISTINCT FROM 90 OR (r ->> 'limite')::int IS DISTINCT FROM 200 THEN
    RAISE EXCEPTION 'FALHOU 3c: os padroes de dias/limite mudaram — % / %', r ->> 'dias', r ->> 'limite';
  END IF;
  RAISE NOTICE 'OK 3: contadores, padroes e configuracao intactos';

  -- ----------------------------------------------------------
  -- 4. QUEM NÃO É DA CASA NÃO LÊ O PLANTÃO
  --
  -- A fila traz pergunta de cliente. SECURITY DEFINER passa por cima da RLS,
  -- então a pertinência é conferida à mão — e isso não pode ter se perdido.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a000-0000000000ff', 'role', 'authenticated')::text, true);
  IF public.plantao_fila(casa, 'respondidas', 200, 90) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 4: quem nao e da casa leu o plantao';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 4: o porteiro continua no lugar';

  -- ----------------------------------------------------------
  -- 5. O CAST NÃO PODE VOLTAR — E ESTE CASO OLHA O CÓDIGO, NÃO O RESULTADO
  --
  -- Descoberto sabotando, em 26/09: devolvi o `corretor_id::uuid` original e
  -- os casos 1 a 4 CONTINUARAM PASSANDO. Com três linhas o planejador avalia
  -- o regex primeiro e o cast nunca chega a rodar; em produção, com 1.551
  -- linhas e outro plano, roda.
  --
  -- Ou seja: nenhum caso de comportamento consegue travar isto, porque o
  -- defeito depende do PLANO, e o plano muda com o volume. Um teste que
  -- "passa" aqui e quebra lá é pior que não ter teste.
  --
  -- Então este caso afirma sobre o TEXTO da função: o cast é proibido. É
  -- grosseiro de propósito — é a única forma de asserção que não depende de
  -- qual plano o Postgres escolheu no dia.
  -- ----------------------------------------------------------
  IF (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'plantao_fila') ~ 'corretor_id::uuid' THEN
    RAISE EXCEPTION 'FALHOU 5: o cast corretor_id::uuid voltou. Ele derruba a tela quando o planejador o avalia antes do regex — e isso depende do volume, nao do SQL.';
  END IF;
  RAISE NOTICE 'OK 5: nenhum cast de corretor_id para uuid na funcao';
END $$;

ROLLBACK;
