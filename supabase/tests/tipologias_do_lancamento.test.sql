-- ============================================================
-- `tipologias` — as plantas do empreendimento (P2.1).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/tipologias_do_lancamento.test.sql
--
-- O caso 1 é o que protege o site público: a chave que vai no bundle do
-- navegador lê tipologia de lançamento PUBLICADO, e só. Sem o vínculo com
-- `publicar_site`, um empreendimento em sigilo vazaria preço para qualquer
-- visitante — e é exatamente o furo que a política dos lançamentos já teve.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t   uuid := 'ccccccc1-1111-4111-a111-111111111111';
  pub uuid;
  sig uuid;
  n   int;
  v   numeric;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-tipo', 'Teste Tipologias') ON CONFLICT DO NOTHING;

  INSERT INTO lancamentos (tenant_id, nome, publicar_site) VALUES (t, 'Publicado', true)  RETURNING id INTO pub;
  INSERT INTO lancamentos (tenant_id, nome, publicar_site) VALUES (t, 'Em sigilo', false) RETURNING id INTO sig;

  INSERT INTO tipologias (tenant_id, lancamento_id, nome, dormitorios, area_privativa_m2, preco_a_partir) VALUES
    (t, pub, '2 dorms', 2, 64,  389000),
    (t, pub, '3 dorms', 3, 92,  520000),
    (t, sig, 'Segredo', 4, 200, 2000000);

  -- ----------------------------------------------------------
  -- 1. O SITE PÚBLICO SÓ VÊ O QUE ESTÁ PUBLICADO.
  -- ----------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.tipologias'::regclass
      AND p.polname = 'tipologias_anon_publicadas'
      AND pg_get_expr(p.polqual, p.polrelid) LIKE '%publicar_site%'
  ) THEN
    RAISE EXCEPTION 'FALHOU: a politica do anon nao amarra em publicar_site';
  END IF;

  -- E anon não escreve, em hipótese nenhuma.
  SELECT count(*) INTO n FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name = 'tipologias' AND grantee = 'anon'
    AND privilege_type <> 'SELECT';
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: anon tem % privilegio(s) de escrita em tipologias', n;
  END IF;

  -- ----------------------------------------------------------
  -- 2. O "A PARTIR DE" É O MENOR PREÇO DISPONÍVEL.
  -- ----------------------------------------------------------
  SELECT lancamento_preco_a_partir(pub) INTO v;
  IF v IS DISTINCT FROM 389000 THEN
    RAISE EXCEPTION 'FALHOU: a partir de deu % (esperava 389000)', v;
  END IF;

  -- Esgotar a mais barata muda o "a partir de". Anunciar o preço de uma
  -- tipologia que acabou é prometer o que não se entrega.
  UPDATE tipologias SET disponivel = false WHERE lancamento_id = pub AND nome = '2 dorms';
  SELECT lancamento_preco_a_partir(pub) INTO v;
  IF v IS DISTINCT FROM 520000 THEN
    RAISE EXCEPTION 'FALHOU: tipologia esgotada continuou valendo (deu %)', v;
  END IF;
  UPDATE tipologias SET disponivel = true WHERE lancamento_id = pub AND nome = '2 dorms';

  -- Sem preço em nenhuma, devolve NULO — e não zero, que viraria
  -- "a partir de R$ 0" na tela.
  UPDATE tipologias SET preco_a_partir = NULL WHERE lancamento_id = pub;
  IF lancamento_preco_a_partir(pub) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: sem preco nenhum nao devolveu nulo';
  END IF;
  UPDATE tipologias SET preco_a_partir = 389000 WHERE lancamento_id = pub AND nome = '2 dorms';

  -- ----------------------------------------------------------
  -- 3. NOME REPETIDO NO MESMO EMPREENDIMENTO É ERRO DE CADASTRO.
  --
  -- Com duas "2 dorms", a equipe fica sem saber qual editar e a LIA cita uma
  -- das duas. A trava ignora acento e caixa, como o resto do sistema.
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO tipologias (tenant_id, lancamento_id, nome) VALUES (t, pub, '2 DORMS');
    RAISE EXCEPTION 'FALHOU: aceitou tipologia com nome repetido';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Mas o mesmo nome em OUTRO empreendimento é normal.
  INSERT INTO tipologias (tenant_id, lancamento_id, nome) VALUES (t, sig, '2 dorms');

  -- ----------------------------------------------------------
  -- 4. NÚMERO IMPOSSÍVEL NÃO ENTRA.
  --
  -- Um negativo na tela é pior que a ausência: parece dado.
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO tipologias (tenant_id, lancamento_id, nome, dormitorios) VALUES (t, pub, 'X', -1);
    RAISE EXCEPTION 'FALHOU: aceitou dormitorios negativo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO tipologias (tenant_id, lancamento_id, nome, preco_a_partir) VALUES (t, pub, 'Y', 0);
    RAISE EXCEPTION 'FALHOU: aceitou preco zero';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Suíte É dormitório: mais suítes que dormitórios é erro de digitação, e a
  -- LIA repetiria o erro para o cliente.
  BEGIN
    INSERT INTO tipologias (tenant_id, lancamento_id, nome, dormitorios, suites)
    VALUES (t, pub, 'Z', 2, 3);
    RAISE EXCEPTION 'FALHOU: aceitou mais suites que dormitorios';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Nome em branco não é nome.
  BEGIN
    INSERT INTO tipologias (tenant_id, lancamento_id, nome) VALUES (t, pub, '   ');
    RAISE EXCEPTION 'FALHOU: aceitou nome em branco';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ----------------------------------------------------------
  -- 5. APAGAR O LANÇAMENTO LEVA AS TIPOLOGIAS JUNTO.
  --
  -- Tipologia órfã continuaria aparecendo em consulta por tenant, sem
  -- empreendimento a que pertencer.
  -- ----------------------------------------------------------
  DELETE FROM lancamentos WHERE id = sig;
  SELECT count(*) INTO n FROM tipologias WHERE lancamento_id = sig;
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: % tipologia(s) sobraram apos apagar o lancamento', n;
  END IF;

  RAISE NOTICE 'tipologias_do_lancamento: 5 casos OK';
END $$;

ROLLBACK;
