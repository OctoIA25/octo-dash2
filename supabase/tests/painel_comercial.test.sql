-- ============================================================
-- Painel comercial (P3.1).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/painel_comercial.test.sql
--
-- O caso 2 é o que separa este painel de um número bonito e errado: as vendas
-- SEM VGV ficam de fora do ticket médio. Medido em produção, incluí-las derruba
-- o ticket de R$ 498.524 para R$ 390.735 — 28% a menos, parecendo exato.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t      uuid := 'aaaaabb1-1111-4111-a111-111111111111';
  t2     uuid := 'aaaaabb9-9999-4111-a111-111111111111';
  u      uuid := 'aaaaabb2-2222-4111-a111-111111111111';
  u_fora uuid := 'aaaaabb3-3333-4111-a111-111111111111';
  mes    date := date_trunc('month', now())::date;
  p      jsonb;
  n      int;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (u, 'painel@teste.dev', jsonb_build_object('name', 'Vendedora Conhecida')),
         (u_fora, 'fora.painel@teste.dev', '{}'::jsonb)
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-painel', 'Teste Painel'), (t2, 'teste-painel-2', 'Vizinha')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES (t, u, 'admin'), (t2, u_fora, 'admin') ON CONFLICT DO NOTHING;

  INSERT INTO commercial_sales (tenant_id, empreendimento, corretor_nome, valor_vgv, valor_vgc, data_assinatura, is_active, nome_arquivo, row_number) VALUES
    -- duas com VGV: ticket = (600k + 400k) / 2 = 500k
    (t, 'MEU LANCAMENTO', 'Vendedora Conhecida', 600000, 30000, mes + 1, true, 'teste', 1),
    (t, 'meu lancamento',  'Apelido da Casa',     400000, 20000, mes + 2, true, 'teste', 2),
    -- uma SEM VGV, com comissão: entra em vendas e em VGC, fora do ticket
    (t, 'TERCEIROS', 'Vendedora Conhecida', 0, 5000, mes + 3, true, 'teste', 3),
    -- uma de empreendimento que ninguém classificou
    (t, 'PARCERIA', 'Vendedora Conhecida', 100000, 4000, mes + 4, true, 'teste', 4);

  INSERT INTO vendas_empreendimento_alias (tenant_id, nome_bruto, nome_canonico, tipo) VALUES
    (t, 'MEU LANCAMENTO', 'MEU LANCAMENTO', 'lancamento'),
    (t, 'TERCEIROS', 'TERCEIROS', 'terceiros'),
    (t, 'PARCERIA', 'PARCERIA', NULL)
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. O PAINEL É DE QUEM PERTENCE À IMOBILIÁRIA.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_fora::text)::text, true);
  IF painel_comercial(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: usuário de outra imobiliária leu o painel comercial';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 2. VENDA SEM VGV NÃO ENTRA NO TICKET — MAS ENTRA NO VGC.
  -- ----------------------------------------------------------
  p := painel_comercial(t, mes, mes + 27, 'todos');

  IF (p->'atual'->>'vendas')::int IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'FALHOU: contou % vendas (esperava 4)', p->'atual'->>'vendas';
  END IF;
  -- 600k + 400k + 100k (a de TERCEIROS soma zero)
  IF (p->'atual'->>'vgv')::numeric IS DISTINCT FROM 1100000 THEN
    RAISE EXCEPTION 'FALHOU: VGV saiu % (esperava 1.100.000)', p->'atual'->>'vgv';
  END IF;
  -- todas somam comissão, inclusive a sem VGV
  IF (p->'atual'->>'vgc')::numeric IS DISTINCT FROM 59000 THEN
    RAISE EXCEPTION 'FALHOU: VGC saiu % (esperava 59.000)', p->'atual'->>'vgc';
  END IF;
  -- ticket = 1.100.000 / 3 vendas COM VGV = 366.667. Com as 4, daria 275.000.
  IF (p->'atual'->>'ticket_medio')::numeric IS DISTINCT FROM 366667 THEN
    RAISE EXCEPTION 'FALHOU: ticket saiu % (esperava 366.667, dividindo pelas 3 com VGV)', p->'atual'->>'ticket_medio';
  END IF;
  IF (p->'atual'->>'vendas_sem_vgv')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: não contou a venda sem VGV';
  END IF;

  -- ----------------------------------------------------------
  -- 3. O NOME DO EMPREENDIMENTO É NORMALIZADO.
  --
  -- "MEU LANCAMENTO" e "meu lancamento" são o mesmo — sem isso, o filtro por
  -- lançamento perderia metade das vendas por causa da caixa da letra.
  -- ----------------------------------------------------------
  IF (painel_comercial(t, mes, mes + 27, 'lancamento')->'atual'->>'vendas')::int IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHOU: o filtro de lançamento não juntou as duas grafias';
  END IF;
  IF (painel_comercial(t, mes, mes + 27, 'terceiros')->'atual'->>'vendas')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: o filtro de terceiros errou';
  END IF;

  -- ----------------------------------------------------------
  -- 4. O QUE NINGUÉM CLASSIFICOU SOME AO FILTRAR — E A TELA SABE.
  --
  -- 2 + 1 = 3 de 4: a venda de PARCERIA não aparece em nenhum dos dois filtros.
  -- Sem o contador, ela sumiria sem explicação.
  -- ----------------------------------------------------------
  IF (p->'atual'->>'sem_classificacao')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: não contou a venda sem classificação — %', p->'atual';
  END IF;

  -- ----------------------------------------------------------
  -- 5. NOMES QUE VENDERAM NÃO SÃO PESSOAS.
  --
  -- Dois nomes distintos, mas só um bate com membro cadastrado. É o que impede
  -- a tela de dividir e chamar de produtividade.
  -- ----------------------------------------------------------
  IF (p->'atual'->>'nomes_que_venderam')::int IS DISTINCT FROM 2
     OR (p->'atual'->>'nomes_reconhecidos')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU: reconhecimento de vendedor errado — %', p->'atual';
  END IF;

  -- ----------------------------------------------------------
  -- 6. SEM META CADASTRADA, NADA DE ZERO.
  -- ----------------------------------------------------------
  IF (p->'metas'->>'cadastradas')::int IS DISTINCT FROM 0 OR p->'metas'->>'vendas' IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: meta inexistente não deveria virar número — %', p->'metas';
  END IF;

  -- ----------------------------------------------------------
  -- 7. DIAS ÚTEIS IGNORAM O FIM DE SEMANA.
  --
  -- 01 a 07/06/2026: 01 é segunda, então 5 dias úteis na semana.
  -- ----------------------------------------------------------
  IF dias_uteis('2026-06-01', '2026-06-07') IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'FALHOU: dias úteis contou % numa semana cheia (esperava 5)', dias_uteis('2026-06-01','2026-06-07');
  END IF;

  -- ----------------------------------------------------------
  -- 8. A VIZINHA NÃO VÊ VENDA ALHEIA.
  -- ----------------------------------------------------------
  -- Recusa, não painel zerado: fora do tenant a função devolve NULL.
  IF painel_comercial(t2, mes, mes + 27, 'todos') IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: a vizinha recebeu o painel do tenant alheio em vez de recusa';
  END IF;

  RAISE NOTICE 'OK: painel comercial — 8 casos';
END $$;

ROLLBACK;
