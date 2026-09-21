-- ============================================================
-- Telemetria de custo de IA (P2.8).
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/custo_de_ia.test.sql
--
-- O caso 3 é o que separa este item de um número bonito e errado: chamada sem
-- uso reportado NÃO vira custo zero. Medido em 21/09/2026, das 19 chamadas de
-- IA gravadas em produção, NENHUMA tinha token — se ausência virasse zero, a
-- tela anunciaria uma IA de graça.
-- ============================================================

BEGIN;

DO $$
DECLARE
  t      uuid := 'fffffff1-1111-4111-a111-111111111111';
  t2     uuid := 'fffffff9-9999-4111-a111-111111111111';
  u      uuid := 'fffffff2-2222-4111-a111-111111111111';
  u_fora uuid := 'fffffff3-3333-4111-a111-111111111111';
  p      jsonb;
  r      record;
  n      int;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'custo@teste.dev'), (u_fora, 'fora.custo@teste.dev')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenants (id, code, name) VALUES (t, 'teste-custo', 'Teste Custo'), (t2, 'teste-custo-2', 'Vizinha Custo')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role)
  VALUES (t, u, 'admin'), (t2, u_fora, 'admin') ON CONFLICT DO NOTHING;

  INSERT INTO agent_telemetry_events
    (tenant_id, agent_slug, source, event_type, status, model, provider,
     input_tokens, cached_tokens, output_tokens, total_tokens, etapa, occurred_at)
  VALUES
    -- 1000 entrada (200 em cache) + 500 saída, no gpt-4o
    (t, 'caio', 'crm_web', 'execution', 'ok', 'gpt-4o', 'openai', 1000, 200, 500, 1500, 'conversa', now() - interval '1 day'),
    -- modelo sem preço cadastrado: tem token, e mesmo assim não vira custo
    (t, 'lia', 'n8n', 'execution', 'ok', 'modelo-fantasma', '?', 900, 0, 100, 1000, 'handoff', now() - interval '2 days'),
    -- chamada sem uso nenhum: é o caso dos 19 eventos reais
    (t, 'elaine', 'crm_web', 'execution', 'ok', NULL, NULL, 0, 0, 0, 0, NULL, now() - interval '3 days');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 1. O CUSTO É DE QUEM PERTENCE À IMOBILIÁRIA.
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_fora::text)::text, true);
  IF ia_custos_painel(t) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: usuário de outra imobiliária leu o custo de IA';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);

  -- ----------------------------------------------------------
  -- 2. A CONTA DO CACHE.
  --
  -- `cached_tokens` é SUBCONJUNTO da entrada: o trecho cacheado sai do preço
  -- cheio e entra pelo de cache. Contá-lo duas vezes inflaria o custo de toda
  -- conversa longa, que é justamente onde o cache existe.
  --
  -- gpt-4o: (1000-200)×2,50 + 200×1,25 + 500×10,00 = 2000 + 250 + 5000 = 7250
  -- por milhão → US$ 0,00725.
  -- ----------------------------------------------------------
  p := ia_custos_painel(t);
  IF round((p->'total'->>'custo_usd')::numeric, 6) <> 0.007250 THEN
    RAISE EXCEPTION 'FALHOU: custo saiu % (esperava 0,00725)', p->'total'->>'custo_usd';
  END IF;

  -- ----------------------------------------------------------
  -- 3. AUSÊNCIA NÃO VIRA ZERO.
  --
  -- Três chamadas, uma calculável. As outras duas — uma sem preço, uma sem uso
  -- — precisam aparecer NOMEADAS, senão o gestor lê "US$ 0,007" e conclui que a
  -- IA é barata, quando dois terços das chamadas não contaram.
  -- ----------------------------------------------------------
  IF (p->'total'->>'chamadas')::int <> 3
     OR (p->'total'->>'com_uso')::int <> 2
     OR (p->'total'->>'sem_uso')::int <> 1
     OR (p->'total'->>'sem_preco')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU: contadores de cobertura errados — %', p->'total';
  END IF;

  -- O modelo sem preço aparece na lista, marcado.
  SELECT count(*) INTO n
    FROM jsonb_array_elements(p->'por_modelo') m
   WHERE m->>'modelo' = 'modelo-fantasma'
     AND (m->>'tem_preco')::boolean IS FALSE
     AND m->>'custo_usd' IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FALHOU: o modelo sem preço não foi marcado — %', p->'por_modelo';
  END IF;

  -- ----------------------------------------------------------
  -- 4. PREÇO DO FUTURO NÃO REESCREVE O PASSADO.
  --
  -- Cadastrar o preço novo com antecedência é normal. Se ele valesse desde já,
  -- o custo de ontem mudaria sozinho — e um relatório fechado deixaria de bater
  -- com ele mesmo.
  -- ----------------------------------------------------------
  INSERT INTO ia_precos (modelo, provedor, preco_entrada_por_milhao, preco_cache_por_milhao,
                         preco_saida_por_milhao, vigente_de)
  VALUES ('gpt-4o', 'openai', 99.0000, 99.0000, 99.0000, current_date + 30);

  p := ia_custos_painel(t);
  IF round((p->'total'->>'custo_usd')::numeric, 6) <> 0.007250 THEN
    RAISE EXCEPTION 'FALHOU: preço com vigência futura reescreveu o custo já apurado — %', p->'total'->>'custo_usd';
  END IF;

  -- ----------------------------------------------------------
  -- 5. PREÇO PRÓPRIO DA IMOBILIÁRIA VENCE O GLOBAL.
  -- ----------------------------------------------------------
  INSERT INTO ia_precos (tenant_id, modelo, provedor, preco_entrada_por_milhao, preco_cache_por_milhao,
                         preco_saida_por_milhao, vigente_de)
  VALUES (t, 'gpt-4o', 'openai', 1.0000, 1.0000, 1.0000, '2026-01-01');

  SELECT * INTO r FROM ia_preco_vigente(t, 'gpt-4o', current_date);
  IF r.preco_entrada <> 1.0000 THEN
    RAISE EXCEPTION 'FALHOU: o preço próprio não venceu o global (veio %)', r.preco_entrada;
  END IF;

  -- E o global continua valendo para a vizinha.
  SELECT * INTO r FROM ia_preco_vigente(t2, 'gpt-4o', current_date);
  IF r.preco_entrada <> 2.5000 THEN
    RAISE EXCEPTION 'FALHOU: o preço próprio vazou para outra imobiliária (veio %)', r.preco_entrada;
  END IF;

  -- ----------------------------------------------------------
  -- 6. O PREÇO CADASTRADO NASCE NÃO CONFERIDO, E ISSO APARECE.
  --
  -- Preço de IA muda com frequência. Um número de tabela pública que ninguém
  -- confirmou produz custo plausível e errado — o pior tipo.
  -- ----------------------------------------------------------
  SELECT count(*) INTO n FROM ia_precos WHERE tenant_id IS NULL AND conferido_em IS NULL;
  IF n = 0 THEN
    RAISE EXCEPTION 'FALHOU: os preços iniciais nasceram marcados como conferidos';
  END IF;

  SELECT * INTO r FROM ia_preco_vigente(NULL, 'gpt-4o', current_date);
  IF r.conferido THEN
    RAISE EXCEPTION 'FALHOU: preço inicial não deveria contar como conferido';
  END IF;

  -- ----------------------------------------------------------
  -- 7. O INTERRUPTOR POR AGENTE É DO OWNER.
  -- ----------------------------------------------------------
  INSERT INTO tenant_agente_config (tenant_id, agente, ativo, motivo)
  VALUES (t, 'lia', false, 'custo acima do previsto');
  SELECT ativo INTO r FROM tenant_agente_config WHERE tenant_id = t AND agente = 'lia';
  IF r.ativo THEN
    RAISE EXCEPTION 'FALHOU: o agente não ficou desligado';
  END IF;

  RAISE NOTICE 'OK: custo de IA — 7 casos';
END $$;

ROLLBACK;
