-- ============================================================
-- Contratos do corretor com aceite (P4.3).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/contratos_do_corretor.test.sql
--
-- OS TRÊS CRITÉRIOS DE PRONTO DO PLANO, nos casos 4, 6 e 7:
--   4. O corretor com contrato pendente é barrado (a função que o bloqueio lê).
--   6. O PDF carimbado fica no perfil.
--   7. Versão nova pede novo aceite.
--
-- O caso 8 é o que dá valor probatório ao registro: o NAVEGADOR NÃO PODE
-- gravar o próprio aceite. Um aceite cujo IP o aceitante informa não prova nada.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  t uuid := '5eee1111-0000-4000-a000-000000000001';
  t2 uuid := '5eee1111-0000-4000-a000-000000000002';
  gestor uuid := '5eee0000-0000-4000-a000-000000000001';
  ana uuid := '5eee0000-0000-4000-a000-000000000002';   -- completa
  bruno uuid := '5eee0000-0000-4000-a000-000000000003'; -- sem CPF
  fora uuid := '5eee0000-0000-4000-a000-000000000009';
  m_id uuid;
  a_ana uuid;
  r jsonb;
  v_hash text;
  v_aceito timestamptz;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (gestor, 'gestor@teste-ctr.dev', jsonb_build_object('name', 'Gestora')),
    (ana,    'ana@teste-ctr.dev',    jsonb_build_object('name', 'Ana Souza')),
    (bruno,  'bruno@teste-ctr.dev',  jsonb_build_object('name', 'Bruno Lima')),
    (fora,   'fora@teste-ctr.dev',   '{}'::jsonb)
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES
    (t, 'teste-ctr', 'Lotus Teste'), (t2, 'teste-ctr-2', 'Vizinha')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role, creci, nivel) VALUES
    (t, gestor, 'admin', '12345-F', 'coordenador'),
    (t, ana,    'corretor', '54321-F', 'pleno'),
    (t, bruno,  'corretor', '99999-F', 'junior'),
    (t2, fora,  'admin', NULL, NULL)
  ON CONFLICT DO NOTHING;

  -- A Ana tem CPF; o Bruno e a gestora, não.
  INSERT INTO tenant_member_dados (tenant_id, user_id, cpf)
  VALUES (t, ana, '123.456.789-00') ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. O MODELO, COM VARIÁVEIS.
  -- ----------------------------------------------------------
  r := contrato_modelo_salvar(t, 'Contrato de associação',
    E'Pelo presente, {{nome}}, CPF {{cpf}}, CRECI {{creci}}, nível {{nivel}},\n'
    'associa-se à {{imobiliaria}} em {{data}}.',
    'Contrato padrão do corretor');
  m_id := (r->>'id')::uuid;
  IF (r->>'versao')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: o modelo deveria nascer na versão 1';
  END IF;

  -- Modelo sem texto é recusado: um contrato vazio não é contrato.
  BEGIN
    PERFORM contrato_modelo_salvar(t, 'Vazio', '');
    RAISE EXCEPTION 'FALHOU: aceitou modelo sem texto';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ----------------------------------------------------------
  -- 2. A ATRIBUIÇÃO CONFERE ANTES DE CRIAR.
  --
  -- Medido em produção: CPF preenchido em 0 de 126 membros. Um contrato com
  -- "CPF: ___" não serve como documento, e é pior descobrir isso depois do
  -- aceite. Decidido com o chefe em 21/09.
  -- ----------------------------------------------------------
  r := contrato_atribuir(t, m_id, 'todos', NULL, false);  -- simulação
  IF (r->>'simulacao')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: deveria ter sido simulação';
  END IF;
  IF (r->>'criadas')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: só a Ana está completa, deveria dar 1, deu %', r->>'criadas';
  END IF;
  IF jsonb_array_length(r->'faltando') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: 2 pessoas deveriam aparecer como incompletas, apareceram %',
      jsonb_array_length(r->'faltando');
  END IF;
  -- E diz QUAL campo falta, não só que falta algo.
  IF NOT (r->'faltando'->0->'campos' ? 'cpf') THEN
    RAISE EXCEPTION 'FALHOU: a lista não diz que falta o CPF — %', r->'faltando';
  END IF;

  -- A simulação não criou nada.
  IF (SELECT count(*) FROM contrato_atribuicoes WHERE modelo_id = m_id) <> 0 THEN
    RAISE EXCEPTION 'FALHOU: a simulação criou atribuição';
  END IF;

  -- ----------------------------------------------------------
  -- 3. O TEXTO É CONGELADO, COM AS VARIÁVEIS JÁ TROCADAS.
  -- ----------------------------------------------------------
  r := contrato_atribuir(t, m_id, 'todos', NULL, true);
  IF (r->>'criadas')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: deveria ter criado 1 atribuição, criou %', r->>'criadas';
  END IF;

  SELECT id, hash_documento INTO a_ana, v_hash
    FROM contrato_atribuicoes WHERE modelo_id = m_id AND user_id = ana;

  IF (SELECT corpo FROM contrato_atribuicoes WHERE id = a_ana) NOT LIKE '%Ana Souza%' THEN
    RAISE EXCEPTION 'FALHOU: o nome não foi trocado no texto';
  END IF;
  IF (SELECT corpo FROM contrato_atribuicoes WHERE id = a_ana) NOT LIKE '%123.456.789-00%' THEN
    RAISE EXCEPTION 'FALHOU: o CPF não foi trocado no texto';
  END IF;
  IF (SELECT corpo FROM contrato_atribuicoes WHERE id = a_ana) LIKE '%{{%' THEN
    RAISE EXCEPTION 'FALHOU: sobrou variável sem trocar no texto congelado';
  END IF;
  IF length(v_hash) IS DISTINCT FROM 64 THEN
    RAISE EXCEPTION 'FALHOU: o hash do documento deveria ter 64 caracteres, tem %', length(v_hash);
  END IF;

  -- Atribuir de novo não duplica.
  r := contrato_atribuir(t, m_id, 'todos', NULL, true);
  IF (r->>'criadas')::int IS DISTINCT FROM 0 OR (r->>'ja_tinham')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: atribuir de novo duplicou — %', r;
  END IF;

  -- ----------------------------------------------------------
  -- 4. O PENDENTE É O QUE O BLOQUEIO LÊ.
  --
  -- Primeiro critério de pronto. Devolve o texto inteiro, porque a pessoa
  -- precisa ler o que vai aceitar.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  r := contratos_pendentes();
  IF jsonb_array_length(r) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: a Ana deveria ter 1 contrato pendente, tem %', jsonb_array_length(r);
  END IF;
  IF (r->0->>'corpo') NOT LIKE '%Ana Souza%' THEN
    RAISE EXCEPTION 'FALHOU: o pendente não traz o texto para ler';
  END IF;

  -- E o Bruno, que ficou de fora, não é bloqueado por nada.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bruno::text)::text, true);
  IF jsonb_array_length(contratos_pendentes()) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: o Bruno não recebeu contrato e aparece com pendência';
  END IF;

  -- ----------------------------------------------------------
  -- 5. O ACEITE GRAVA DATA, IP E APARELHO — E O PRIMEIRO É O QUE VALE.
  -- ----------------------------------------------------------
  r := contrato_aceitar(a_ana, ana, '203.0.113.7', 'Mozilla/5.0 (Teste)');
  IF (r->>'aceito')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: o aceite não foi registrado — %', r;
  END IF;

  SELECT aceito_em INTO v_aceito FROM contrato_atribuicoes WHERE id = a_ana;
  IF (SELECT ip FROM contrato_atribuicoes WHERE id = a_ana) IS DISTINCT FROM '203.0.113.7' THEN
    RAISE EXCEPTION 'FALHOU: o IP não foi gravado';
  END IF;
  IF (SELECT status FROM contrato_atribuicoes WHERE id = a_ana) IS DISTINCT FROM 'aceito' THEN
    RAISE EXCEPTION 'FALHOU: o status não virou aceito';
  END IF;

  -- Aceitar de novo não reescreve a data.
  PERFORM pg_sleep(0.05);
  r := contrato_aceitar(a_ana, ana, '198.51.100.9', 'Outro');
  IF (r->>'ja_aceito')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: aceitar duas vezes deveria devolver "já aceito"';
  END IF;
  IF (SELECT aceito_em FROM contrato_atribuicoes WHERE id = a_ana) IS DISTINCT FROM v_aceito THEN
    RAISE EXCEPTION 'FALHOU: o segundo aceite reescreveu a data do primeiro';
  END IF;

  -- Sem IP, não aceita: o registro perderia o que o torna prova.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  PERFORM contrato_modelo_salvar(t, 'Outro contrato', 'Texto de {{nome}}.');
  DECLARE m2 uuid; a2 uuid;
  BEGIN
    SELECT id INTO m2 FROM contrato_modelos WHERE tenant_id = t AND titulo = 'Outro contrato';
    PERFORM contrato_atribuir(t, m2, 'pessoa', ana, true);
    SELECT id INTO a2 FROM contrato_atribuicoes WHERE modelo_id = m2 AND user_id = ana;
    BEGIN
      PERFORM contrato_aceitar(a2, ana, '', 'x');
      RAISE EXCEPTION 'FALHOU: aceitou sem endereço de origem';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    -- E ninguém aceita pelo outro.
    BEGIN
      PERFORM contrato_aceitar(a2, bruno, '203.0.113.7', 'x');
      RAISE EXCEPTION 'FALHOU: o Bruno aceitou um contrato da Ana';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END;

  -- ----------------------------------------------------------
  -- 6. O PDF CARIMBADO FICA NO PERFIL.
  --
  -- Segundo critério de pronto. O caminho aponta para o mesmo bucket onde já
  -- mora o Termo de Associação.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  PERFORM contrato_registrar_pdf(a_ana, t::text || '/' || ana::text || '/contrato.pdf');
  IF (SELECT pdf_arquivo FROM contrato_atribuicoes WHERE id = a_ana) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: o PDF não ficou registrado na atribuição';
  END IF;

  -- ----------------------------------------------------------
  -- 7. VERSÃO NOVA PEDE NOVO ACEITE.
  --
  -- Terceiro critério de pronto.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  r := contrato_modelo_salvar(t, 'Contrato de associação',
        'Nova redação para {{nome}}, CPF {{cpf}}, em {{data}}.', '', false,
        m_id, true, 'Ajuste da cláusula 3');
  IF (r->>'versao')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: a nova versão deveria ser a 2, é %', r->>'versao';
  END IF;

  r := contrato_atribuir(t, m_id, 'todos', NULL, true);
  IF (r->>'criadas')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: a versão 2 deveria gerar 1 atribuição nova, gerou %', r->>'criadas';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  IF jsonb_array_length(contratos_pendentes()) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: a Ana deveria ter 2 pendentes (o novo e o "Outro contrato")';
  END IF;
  -- E o aceite da versão 1 continua de pé, com o texto que ela aceitou.
  IF (SELECT status FROM contrato_atribuicoes WHERE id = a_ana) IS DISTINCT FROM 'aceito' THEN
    RAISE EXCEPTION 'FALHOU: a versão nova apagou o aceite da anterior';
  END IF;

  -- ----------------------------------------------------------
  -- 8. QUEM EXIGE ASSINATURA ELETRÔNICA NÃO SE ACEITA POR AQUI.
  --
  -- A integração não existe no sistema. Deixar aceitar seria dar por assinado
  -- um documento que precisava de firma.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gestor::text)::text, true);
  DECLARE m3 uuid; a3 uuid;
  BEGIN
    r := contrato_modelo_salvar(t, 'Com firma', 'Texto de {{nome}}.', '', true);
    m3 := (r->>'id')::uuid;
    PERFORM contrato_atribuir(t, m3, 'pessoa', ana, true);
    SELECT id INTO a3 FROM contrato_atribuicoes WHERE modelo_id = m3 AND user_id = ana;
    BEGIN
      PERFORM contrato_aceitar(a3, ana, '203.0.113.7', 'x');
      RAISE EXCEPTION 'FALHOU: aceitou por clique um documento que exige assinatura eletrônica';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END;

  -- ----------------------------------------------------------
  -- 9. O ACEITO NÃO SE CANCELA — O ACEITE É REGISTRO.
  -- ----------------------------------------------------------
  BEGIN
    PERFORM contrato_cancelar(a_ana);
    RAISE EXCEPTION 'FALHOU: cancelou um contrato já aceito, apagando a prova';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ----------------------------------------------------------
  -- 10. O RELATÓRIO MOSTRA QUEM ACEITOU VERSÃO ANTIGA.
  -- ----------------------------------------------------------
  r := contrato_relatorio(m_id);
  IF (r->>'pendentes')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: deveria ter 1 pendente, tem %', r->>'pendentes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'linhas') x
                  WHERE (x->>'versao_antiga')::boolean) THEN
    RAISE EXCEPTION 'FALHOU: o relatório não marca quem aceitou uma versão antiga';
  END IF;

  -- ----------------------------------------------------------
  -- 11. CONTRATO NÃO ATRAVESSA IMOBILIÁRIA, E CORRETOR NÃO GERE.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ana::text)::text, true);
  IF contrato_modelos_listar(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: uma corretora listou os modelos de contrato';
  END IF;
  IF contrato_atribuir(t, m_id, 'todos', NULL, true) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: uma corretora atribuiu contrato';
  END IF;
  IF contrato_relatorio(m_id) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: uma corretora abriu o relatório de contratos';
  END IF;
  -- Mas lê as próprias variáveis.
  IF contrato_variaveis(t, ana) IS NULL THEN
    RAISE EXCEPTION 'FALHOU: a corretora não lê os próprios dados';
  END IF;
  -- E não as de outra pessoa.
  IF contrato_variaveis(t, bruno) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a corretora leu o CPF de outra pessoa';
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', fora::text)::text, true);
  IF contrato_modelos_listar(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a admin da vizinha listou contratos alheios';
  END IF;

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK: contratos do corretor — 11 casos';
END
$$;

-- ----------------------------------------------------------
-- 12. O NAVEGADOR NÃO GRAVA O PRÓPRIO ACEITE.
--
-- É a trava que dá valor probatório ao registro: o IP tem de vir de quem
-- enxerga a conexão. `contrato_aceitar` NÃO tem grant para `authenticated`;
-- só a chave de serviço a executa, pela rota do Express.
-- ----------------------------------------------------------
CREATE FUNCTION pg_temp.deve_barrar(p_sql text, p_caso text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FALHOU: %  (passou e deveria ter sido barrado)', p_caso;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN;
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.deve_barrar(
  $$ SELECT contrato_aceitar('00000000-0000-0000-0000-000000000000'::uuid,
                             '00000000-0000-0000-0000-000000000000'::uuid, '1.2.3.4', 'x') $$,
  'o navegador gravou o próprio aceite, informando o próprio IP');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM contrato_atribuicoes $$,
  'o anônimo leu os contratos, que carregam CPF');
SELECT pg_temp.deve_barrar($$ SELECT count(*) FROM contrato_modelos $$,
  'o anônimo leu os modelos de contrato');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'OK: aceite fechado ao navegador, anônimo barrado'; END $$;

ROLLBACK;
