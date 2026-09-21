-- ============================================================
-- Mapa interligado (P2.6).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/mapa_interligado.test.sql
--
-- O caso 4 é o que o plano chama de pronto: **pino arrastado não volta para a
-- posição automática**. Quem garante isso é `geo_origem = 'manual'`, e a fila
-- de geocodificação tem que respeitá-lo sem precisar que alguém lembre.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t      uuid := 'ddddddd1-1111-4111-a111-111111111111';
  t2     uuid := 'ddddddd9-9999-4111-a111-111111111111';
  u      uuid := 'ddddddd2-2222-4111-a111-111111111111';
  u_fora uuid := 'ddddddd3-3333-4111-a111-111111111111';
  lanc_exato uuid;
  lanc_bairro uuid;
  lanc_nada uuid;
  cond uuid;
  r    record;
  m    jsonb;
  n    int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'mapa@teste.dev'), (u_fora, 'fora.mapa@teste.dev')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-mapa', 'Teste Mapa'), (t2, 'teste-mapa-2', 'Vizinha Mapa')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES (t, u, 'admin'), (t2, u_fora, 'admin') ON CONFLICT DO NOTHING;

  INSERT INTO lancamentos (tenant_id, nome, endereco_plantao, bairro, cidade)
  VALUES (t, 'Com endereço', 'Avenida Paulista, 1578', 'Bela Vista', 'São Paulo')
  RETURNING id INTO lanc_exato;

  -- Sem endereço de plantão: 18 dos 59 da Lotus são assim. Entra pelo bairro.
  INSERT INTO lancamentos (tenant_id, nome, bairro, cidade)
  VALUES (t, 'Só bairro', 'Vila Mariana', 'São Paulo')
  RETURNING id INTO lanc_bairro;

  -- Sem nem cidade: nunca vai aparecer, por mais que se geocodifique.
  INSERT INTO lancamentos (tenant_id, nome) VALUES (t, 'Sem nada') RETURNING id INTO lanc_nada;

  INSERT INTO condominios (tenant_id, nome, codigo, logradouro, numero, bairro, cidade, estado)
  VALUES (t, 'Condomínio Teste', 'C001', 'Rua Augusta', '1500', 'Consolação', 'São Paulo', 'SP')
  RETURNING id INTO cond;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. O ENDEREÇO SE MONTA NUM LUGAR SÓ.
  --
  -- Servidor e tela montando cada um o seu dariam duas chaves de cache para o
  -- mesmo lugar, e o mapa geocodificaria de novo o que já sabia.
  -- ----------------------------------------------------------
  SELECT * INTO r FROM mapa_endereco('Rua Augusta', '1500', 'Consolação', 'São Paulo', 'SP');
  IF r.endereco IS DISTINCT FROM 'Rua Augusta 1500, Consolação, São Paulo, SP, Brasil' OR r.precisao IS DISTINCT FROM 'exata' THEN
    RAISE EXCEPTION 'FALHOU: endereço completo saiu como "%" / %', r.endereco, r.precisao;
  END IF;

  SELECT * INTO r FROM mapa_endereco(NULL, NULL, 'Vila Mariana', 'São Paulo', NULL);
  IF r.endereco IS DISTINCT FROM 'Vila Mariana, São Paulo, Brasil' OR r.precisao IS DISTINCT FROM 'aproximada' THEN
    RAISE EXCEPTION 'FALHOU: endereço de bairro saiu como "%" / %', r.endereco, r.precisao;
  END IF;

  -- Sem cidade, "Rua X" acha uma Rua X em qualquer canto do Brasil.
  SELECT * INTO r FROM mapa_endereco('Rua Augusta', '1500', NULL, NULL, NULL);
  IF r.endereco IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: aceitou endereço sem cidade — "%"', r.endereco;
  END IF;

  -- ----------------------------------------------------------
  -- 2. OS PONTOS SÃO DE QUEM PERTENCE À IMOBILIÁRIA.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_fora::text)::text, true);
  IF mapa_pontos(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: usuário de outra imobiliária leu os pontos do mapa';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 3. O CONTADOR SEPARA "NUNCA VAI APARECER" DE "AINDA NÃO GEOCODIFIQUEI".
  --
  -- Sem essa separação, "1 de 3" faz o gestor esperar dois pinos — e um deles
  -- não tem endereço nenhum para achar.
  -- ----------------------------------------------------------
  m := mapa_pontos(t);
  IF (m->'totais'->'lancamentos'->>'total')::int IS DISTINCT FROM 3
     OR (m->'totais'->'lancamentos'->>'sem_endereco')::int IS DISTINCT FROM 1
     OR (m->'totais'->'lancamentos'->>'no_mapa')::int IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: contadores de lançamento errados — %', m->'totais'->'lancamentos';
  END IF;

  -- Sem coordenada, o ponto não entra na lista de desenho — só no contador.
  IF jsonb_array_length(m->'pontos') IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: desenhou % pontos sem coordenada', jsonb_array_length(m->'pontos');
  END IF;

  -- A fila traz os que têm endereço, e só eles.
  SELECT count(*) INTO n FROM mapa_fila_de_geocodificacao(t, 50);
  IF n IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'FALHOU: a fila trouxe % (esperava 3: 2 lançamentos com endereço + 1 condomínio)', n;
  END IF;

  -- ----------------------------------------------------------
  -- 4. O PINO ARRASTADO SAI DA FILA E NÃO VOLTA.
  --
  -- É o critério textual do plano.
  -- ----------------------------------------------------------
  UPDATE lancamentos
     SET latitude = -23.6, longitude = -46.56, geo_origem = 'manual', geo_precisao = 'exata'
   WHERE id = lanc_bairro;

  SELECT count(*) INTO n FROM mapa_fila_de_geocodificacao(t, 50) WHERE id = lanc_bairro;
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: o pino arrastado voltou para a fila de geocodificação';
  END IF;

  m := mapa_pontos(t);
  IF jsonb_array_length(m->'pontos') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: o ponto com coordenada não foi desenhado';
  END IF;
  IF m->'pontos'->0->>'geo_origem' IS DISTINCT FROM 'manual' THEN
    RAISE EXCEPTION 'FALHOU: o ponto perdeu a marca de manual — %', m->'pontos'->0;
  END IF;

  -- ----------------------------------------------------------
  -- 5. QUEM JÁ FALHOU NÃO É TENTADO DE NOVO SEM SE PEDIR.
  --
  -- Endereço que o Nominatim não achou hoje não vai achar daqui a uma hora, e
  -- insistir gasta a cota de 1 consulta por segundo com o que não tem jeito.
  -- ----------------------------------------------------------
  UPDATE lancamentos SET geo_erro = 'nao_encontrado' WHERE id = lanc_exato;

  SELECT count(*) INTO n FROM mapa_fila_de_geocodificacao(t, 50) WHERE id = lanc_exato;
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: insistiu num endereço que já tinha falhado';
  END IF;

  SELECT count(*) INTO n FROM mapa_fila_de_geocodificacao(t, 50, true) WHERE id = lanc_exato;
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: pedindo explicitamente, o que falhou deveria voltar à fila';
  END IF;

  -- ----------------------------------------------------------
  -- 6. O MAPA NÃO ATRAVESSA A PAREDE DA IMOBILIÁRIA.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM mapa_fila_de_geocodificacao(t2, 50, true);
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU: a fila da vizinha trouxe % endereços alheios', n;
  END IF;

  -- Recusa, não mapa vazio: fora do tenant a função devolve NULL.
  m := mapa_pontos(t2);
  IF m IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a vizinha recebeu o mapa do tenant alheio em vez de recusa — %', m;
  END IF;

  RAISE NOTICE 'OK: mapa interligado — 6 casos';
END $$;

ROLLBACK;
