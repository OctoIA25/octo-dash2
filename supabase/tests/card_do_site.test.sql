-- ============================================================
-- O card do site vindo das tipologias (P2.1).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/card_do_site.test.sql
--
-- ============================================================
-- ESTE ARQUIVO É O GÊMEO DE `utils/__tests__/tipologias.test.ts`
-- ============================================================
--
-- A mesma regra existe em TypeScript (a prévia enquanto se digita, com dado
-- ainda não salvo) e em SQL (o card publicado, lido pelo site externo, que não
-- roda o nosso TypeScript). Nenhuma das duas dá para eliminar.
--
-- O que dá é não deixar as duas divergirem em silêncio: **cada caso abaixo
-- repete, com os mesmos números, uma expectativa do teste TypeScript.** Mudou
-- a regra num lado e não no outro, um dos dois cai.
--
-- Quem mexer aqui, abra o outro arquivo na tela ao lado.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa uuid := '2fff1111-0000-4000-a000-000000000001';
  lanc uuid := '2fff2222-0000-4000-a000-000000000001';
  r record;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-card', 'Casa') ON CONFLICT DO NOTHING;
  -- O texto de hoje, que é a reserva: os mesmos valores do teste TypeScript.
  INSERT INTO lancamentos (id, tenant_id, nome, dormitorios, preco_num, preco_texto, publicar_site)
  VALUES (lanc, casa, 'Residencial Teste', '2 e 3 dorms', 389000, NULL, true)
  ON CONFLICT (id) DO UPDATE SET dormitorios = '2 e 3 dorms', preco_num = 389000, preco_texto = NULL;

  -- ----------------------------------------------------------
  -- 1. SEM TIPOLOGIA, MOSTRA O TEXTO QUE O SITE JÁ MOSTRA
  --    (TS: 'sem tipologia, mostra o texto que o site já mostra')
  -- ----------------------------------------------------------
  SELECT * INTO r FROM card_do_lancamento(lanc);
  IF r.origem IS DISTINCT FROM 'texto' THEN RAISE EXCEPTION 'FALHOU 1: origem % (esperava texto)', r.origem; END IF;
  IF r.dormitorios IS DISTINCT FROM '2 e 3 dorms' THEN RAISE EXCEPTION 'FALHOU 1: dorms %', r.dormitorios; END IF;
  IF r.preco IS DISTINCT FROM 'a partir de R$ 389 mil' THEN RAISE EXCEPTION 'FALHOU 1: preco %', r.preco; END IF;
  RAISE NOTICE 'OK 1: sem tipologia, o texto de hoje continua valendo';

  -- ----------------------------------------------------------
  -- 2. COM TIPOLOGIA, PASSA A VIR DELA
  --    (TS: 'com tipologia, passa a vir dela')
  -- ----------------------------------------------------------
  INSERT INTO tipologias (tenant_id, lancamento_id, nome, dormitorios, area_privativa_m2, preco_a_partir, disponivel)
  VALUES (casa, lanc, '2 dorms', 2, 64, 410000, true);
  SELECT * INTO r FROM card_do_lancamento(lanc);
  IF r.origem IS DISTINCT FROM 'tipologias' THEN RAISE EXCEPTION 'FALHOU 2: origem %', r.origem; END IF;
  IF r.dormitorios IS DISTINCT FROM '2 dorms' THEN RAISE EXCEPTION 'FALHOU 2: dorms %', r.dormitorios; END IF;
  IF r.preco IS DISTINCT FROM 'a partir de R$ 410 mil' THEN RAISE EXCEPTION 'FALHOU 2: preco %', r.preco; END IF;
  IF r.area IS DISTINCT FROM '64 m²' THEN RAISE EXCEPTION 'FALHOU 2: area %', r.area; END IF;
  RAISE NOTICE 'OK 2: com tipologia, o card vem dela';

  -- ----------------------------------------------------------
  -- 3. "2 e 3 dorms" SAI DOS NÚMEROS
  --    (TS: resumoDeDormitorios)
  -- ----------------------------------------------------------
  INSERT INTO tipologias (tenant_id, lancamento_id, nome, dormitorios, area_privativa_m2, preco_a_partir, disponivel)
  VALUES (casa, lanc, '3 dorms', 3, 92, 560000, true);
  SELECT * INTO r FROM card_do_lancamento(lanc);
  IF r.dormitorios IS DISTINCT FROM '2 e 3 dorms' THEN RAISE EXCEPTION 'FALHOU 3: dorms %', r.dormitorios; END IF;
  IF r.area IS DISTINCT FROM '64 a 92 m²' THEN RAISE EXCEPTION 'FALHOU 3: area %', r.area; END IF;
  -- O preço é o MENOR entre as disponíveis.
  IF r.preco IS DISTINCT FROM 'a partir de R$ 410 mil' THEN RAISE EXCEPTION 'FALHOU 3: preco %', r.preco; END IF;
  RAISE NOTICE 'OK 3: a faixa sai dos números, e o preço é o menor';

  -- A indisponível não entra no card.
  INSERT INTO tipologias (tenant_id, lancamento_id, nome, dormitorios, preco_a_partir, disponivel)
  VALUES (casa, lanc, 'esgotada', 1, 100000, false);
  SELECT * INTO r FROM card_do_lancamento(lanc);
  IF r.dormitorios IS DISTINCT FROM '2 e 3 dorms' THEN RAISE EXCEPTION 'FALHOU 3b: a esgotada entrou (%)', r.dormitorios; END IF;
  IF r.preco IS DISTINCT FROM 'a partir de R$ 410 mil' THEN RAISE EXCEPTION 'FALHOU 3b: preço da esgotada (%)', r.preco; END IF;
  RAISE NOTICE 'OK 3b: a esgotada não entra no card';

  -- ----------------------------------------------------------
  -- 4. TIPOLOGIA SEM NÚMERO CAI NA RESERVA, NÃO EM CARD VAZIO
  --    (TS: 'tipologia SEM número aproveitável cai na reserva')
  -- ----------------------------------------------------------
  DELETE FROM tipologias WHERE lancamento_id = lanc;
  INSERT INTO tipologias (tenant_id, lancamento_id, nome, disponivel)
  VALUES (casa, lanc, 'A definir', true);
  SELECT * INTO r FROM card_do_lancamento(lanc);
  IF r.origem IS DISTINCT FROM 'texto' THEN RAISE EXCEPTION 'FALHOU 4: origem % (esperava texto)', r.origem; END IF;
  IF r.dormitorios IS DISTINCT FROM '2 e 3 dorms' THEN RAISE EXCEPTION 'FALHOU 4: dorms %', r.dormitorios; END IF;
  RAISE NOTICE 'OK 4: cadastrar o nome e esquecer os números não apaga o card';

  -- ----------------------------------------------------------
  -- 5. PREÇO EM TEXTO LIVRE VENCE O NÚMERO
  --    (TS: 'preço em texto livre vence o número, porque foi alguém que escreveu')
  -- ----------------------------------------------------------
  DELETE FROM tipologias WHERE lancamento_id = lanc;
  UPDATE lancamentos SET preco_texto = 'sob consulta' WHERE id = lanc;
  SELECT * INTO r FROM card_do_lancamento(lanc);
  IF r.preco IS DISTINCT FROM 'sob consulta' THEN RAISE EXCEPTION 'FALHOU 5: preco %', r.preco; END IF;
  RAISE NOTICE 'OK 5: o que alguém escreveu vence o número';

  -- ----------------------------------------------------------
  -- 6. SEM NADA, DIZ QUE NÃO TEM — E NÃO INVENTA
  --    (TS: 'sem tipologia e sem texto, diz que não tem')
  -- ----------------------------------------------------------
  UPDATE lancamentos SET dormitorios = NULL, preco_texto = NULL, preco_num = NULL WHERE id = lanc;
  SELECT * INTO r FROM card_do_lancamento(lanc);
  IF r.origem IS DISTINCT FROM 'nada' THEN RAISE EXCEPTION 'FALHOU 6: origem %', r.origem; END IF;
  IF r.dormitorios IS NOT NULL OR r.preco IS NOT NULL OR r.area IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 6: inventou algo';
  END IF;
  RAISE NOTICE 'OK 6: sem dado, card vazio e honesto';

  -- ----------------------------------------------------------
  -- 7. MILHÃO VIRA "mi", E NÃO UM NÚMERO DE SETE DÍGITOS
  --    (TS: os três casos de `it.each`)
  -- ----------------------------------------------------------
  IF card_reais(389000)  IS DISTINCT FROM 'R$ 389 mil' THEN RAISE EXCEPTION 'FALHOU 7: 389000 -> %', card_reais(389000); END IF;
  IF card_reais(1000000) IS DISTINCT FROM 'R$ 1 mi'    THEN RAISE EXCEPTION 'FALHOU 7: 1000000 -> %', card_reais(1000000); END IF;
  IF card_reais(1250000) IS DISTINCT FROM 'R$ 1,3 mi'  THEN RAISE EXCEPTION 'FALHOU 7: 1250000 -> %', card_reais(1250000); END IF;
  RAISE NOTICE 'OK 7: R$ 389 mil · R$ 1 mi · R$ 1,3 mi';

  -- ----------------------------------------------------------
  -- 8. VÍRGULA DECIMAL NA ÁREA, COMO SE ESCREVE EM PORTUGUÊS
  --    (TS: 'vírgula decimal, como se escreve em português')
  -- ----------------------------------------------------------
  UPDATE lancamentos SET dormitorios = '2 e 3 dorms' WHERE id = lanc;
  INSERT INTO tipologias (tenant_id, lancamento_id, nome, dormitorios, area_privativa_m2, preco_a_partir, disponivel)
  VALUES (casa, lanc, 'meia', 2, 64.5, 410000, true);
  SELECT * INTO r FROM card_do_lancamento(lanc);
  IF r.area IS DISTINCT FROM '64,5 m²' THEN RAISE EXCEPTION 'FALHOU 8: area %', r.area; END IF;
  RAISE NOTICE 'OK 8: 64,5 m² com vírgula';

  -- ----------------------------------------------------------
  -- 9. A VIEW PÚBLICA ENTREGA AS COLUNAS NOVAS, E MANTÉM AS ANTIGAS
  --
  -- As antigas continuam porque o site externo as lê HOJE: trocar o
  -- significado delas por baixo mudaria a tela dele sem aviso.
  -- ----------------------------------------------------------
  SELECT * INTO r FROM portal_lancamentos WHERE id = lanc;
  IF r.card_origem IS DISTINCT FROM 'tipologias' THEN RAISE EXCEPTION 'FALHOU 9: card_origem %', r.card_origem; END IF;
  IF r.card_dormitorios IS DISTINCT FROM '2 dorms' THEN RAISE EXCEPTION 'FALHOU 9: card_dormitorios %', r.card_dormitorios; END IF;
  IF r.dormitorios IS DISTINCT FROM '2 e 3 dorms' THEN RAISE EXCEPTION 'FALHOU 9: a coluna ANTIGA mudou (%)', r.dormitorios; END IF;
  RAISE NOTICE 'OK 9: colunas novas ao lado, antigas intactas';

  -- ----------------------------------------------------------
  -- 10. O NÃO PUBLICADO NÃO APARECE NO PORTAL
  -- ----------------------------------------------------------
  UPDATE lancamentos SET publicar_site = false WHERE id = lanc;
  IF EXISTS (SELECT 1 FROM portal_lancamentos WHERE id = lanc) THEN
    RAISE EXCEPTION 'FALHOU 10: lançamento oculto apareceu no portal';
  END IF;
  RAISE NOTICE 'OK 10: publicar_site = false continua ocultando';

  -- ----------------------------------------------------------
  -- 11. A VIEW É SÓ DE LEITURA, INCLUSIVE NO PAPEL
  --
  -- O `LATERAL` já faz o Postgres recusar escrita hoje. Isto aqui cobre o
  -- dia em que alguém simplificar a view: se a permissão continuar
  -- pendurada, ela vira gravável em silêncio. Foi o buraco do
  -- `user_profiles`.
  -- ----------------------------------------------------------
  PERFORM 1 FROM information_schema.role_table_grants
   WHERE table_name = 'portal_lancamentos'
     AND grantee IN ('anon', 'authenticated', 'PUBLIC')
     AND privilege_type <> 'SELECT';
  IF FOUND THEN
    RAISE EXCEPTION 'FALHOU 11: a view tem permissão de escrita pendurada para anon/authenticated';
  END IF;
  RAISE NOTICE 'OK 11: só SELECT para anon e authenticated';
END $$;

-- ============================================================
-- 12. QUEM PERGUNTA NÃO MUDA A RESPOSTA
--
-- Esta é a falha que ninguém notaria. A view é `security_invoker`: ela roda
-- com as permissões de quem lê. As colunas `card_*` saem de `tipologias`, que
-- tem RLS e uma policy de `anon` escrita com OUTRA regra da policy de
-- `lancamentos` — uma filtra por `publicar_site`, a outra por `tenant_id`.
--
-- Se as duas discordarem, o site anônimo vê o lançamento mas NÃO vê as
-- tipologias dele: o card cai calado na reserva e mostra o texto antigo,
-- enquanto no CRM a mesma tela mostra o dado novo. Ninguém recebe erro.
--
-- O teste compara, linha a linha, o que o `anon` lê com o que o dono lê.
-- Fora do DO porque `SET ROLE` precisa ser comando de sessão.
--
-- PARA SABOTAR ESTE CASO (e conferir que ele ainda morde), use uma destas:
--   REVOKE SELECT ON public.tipologias FROM anon;          -- morde
--   ALTER VIEW public.portal_lancamentos SET (security_invoker = false);  -- morde
--
-- NÃO sabote com `DROP POLICY ... ON tipologias` dentro da transação: DDL de
-- policy mais `SET ROLE` na MESMA transação deixa um plano velho em cache, a
-- função responde com a visibilidade do papel anterior, e a sabotagem "passa"
-- dando a impressão de que o teste é cego. Medido em 23/09/2026 — não é bug
-- do nosso código, é armadilha do arranjo do teste.
-- ============================================================
UPDATE public.lancamentos SET publicar_site = true
 WHERE id = '2fff2222-0000-4000-a000-000000000001';

-- A policy de produção está presa ao tenant da Lotus; aponta para o de teste
-- só aqui dentro (a transação inteira volta atrás no ROLLBACK).
DROP POLICY IF EXISTS portal_anon_select_lancamentos ON public.lancamentos;
CREATE POLICY portal_anon_select_lancamentos ON public.lancamentos FOR SELECT TO anon
  USING (tenant_id = '2fff1111-0000-4000-a000-000000000001'::uuid);

-- O dono ignora RLS e enxergaria o banco inteiro; recorta no mesmo tenant para
-- que a comparação seja entre as mesmas linhas, e não entre dois universos.
CREATE TEMP TABLE visao_do_dono ON COMMIT DROP AS
SELECT id, card_dormitorios, card_preco, card_area, card_origem
  FROM public.portal_lancamentos
 WHERE tenant_id = '2fff1111-0000-4000-a000-000000000001'::uuid;

SET LOCAL ROLE anon;
CREATE TEMP TABLE visao_do_site ON COMMIT DROP AS
SELECT id, card_dormitorios, card_preco, card_area, card_origem
  FROM public.portal_lancamentos;
RESET ROLE;

DO $$
DECLARE n_dono int; n_site int; divergentes int;
BEGIN
  SELECT count(*) INTO n_dono FROM visao_do_dono;
  SELECT count(*) INTO n_site FROM visao_do_site;
  IF n_dono = 0 THEN
    RAISE EXCEPTION 'FALHOU 12: o teste não leu nada — a comparação seria vazia e passaria cega';
  END IF;
  IF n_dono IS DISTINCT FROM n_site THEN
    RAISE EXCEPTION 'FALHOU 12: o site vê % lançamentos e o dono vê %', n_site, n_dono;
  END IF;

  SELECT count(*) INTO divergentes FROM (
    SELECT * FROM visao_do_dono EXCEPT SELECT * FROM visao_do_site
    UNION ALL
    SELECT * FROM visao_do_site EXCEPT SELECT * FROM visao_do_dono
  ) d;
  IF divergentes > 0 THEN
    RAISE EXCEPTION 'FALHOU 12: % card(s) mudam conforme quem pergunta', divergentes;
  END IF;

  -- E o card comparado tem que ser o das tipologias. Se o `anon` não
  -- enxergasse `tipologias`, os dois lados cairiam na reserva JUNTOS, o EXCEPT
  -- não acusaria nada, e o teste passaria cego dizendo que está tudo bem.
  IF (SELECT card_origem FROM visao_do_site LIMIT 1) IS DISTINCT FROM 'tipologias' THEN
    RAISE EXCEPTION 'FALHOU 12: o site caiu na reserva — não está lendo tipologias (origem %)',
      (SELECT card_origem FROM visao_do_site LIMIT 1);
  END IF;
  RAISE NOTICE 'OK 12: o card é o mesmo para o site anônimo e para o CRM (% lançamentos)', n_dono;
END $$;

ROLLBACK;
