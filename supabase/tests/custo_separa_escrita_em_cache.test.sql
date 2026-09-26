-- ============================================================
-- O custo de IA por provedor — 26/09
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/custo_separa_escrita_em_cache.test.sql
--
-- A fórmula usava a convenção da OpenAI (`cached_tokens` ⊆ `input_tokens`)
-- para todo mundo. Na Anthropic as parcelas são independentes, e com o prompt
-- inteiro em cache a conta dava quase zero: 38× abaixo do real.
--
-- O caso 1 usa os NÚMEROS QUE A EQUIPE DA LIA MEDIU em produção. Um teste com
-- números redondos inventados não provaria nada aqui — o defeito só aparece
-- quando `input_tokens` é menor que `cached_tokens`, que é a forma que o
-- tráfego real tem e a que um exemplo bonito não tem.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa    uuid := 'c05d0000-0000-4000-a000-000000000001';
  u_admin uuid := 'c05d1111-0000-4000-a000-000000000001';
  r jsonb;
  custo numeric;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa, 'teste-custo', 'Casa do Custo')
  ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email) VALUES (u_admin, 'admin@custo.local')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES (casa, u_admin, 'admin');

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);

  -- ----------------------------------------------------------
  -- 1. UMA CHAMADA REAL DA LIA — O CASO QUE SUSTENTA O ARQUIVO
  --
  -- Medido por eles em 25/09: 43 k lidos do cache, 19,5 k escritos, 235 de
  -- saída, e `input_tokens` praticamente zero porque o prompt está todo em
  -- cache.
  --
  -- Preço do claude-opus-5-5 (página oficial, 26/09):
  --   entrada 4,00 · leitura 0,20 · escrita 1 h 8,00 · saída 20,00
  --
  -- Conta esperada, em dólar:
  --   43.000 × 0,20 / 1e6  = 0,0086
  --   19.500 × 8,00 / 1e6  = 0,1560
  --      235 × 20,0 / 1e6  = 0,0047
  --                          ------
  --                          0,1693
  -- ----------------------------------------------------------
  INSERT INTO agent_telemetry_events
    (id, tenant_id, agent_slug, source, event_type, model, provider,
     input_tokens, cached_tokens, cache_escrita_tokens, output_tokens, total_tokens,
     etapa, occurred_at)
  VALUES
    (gen_random_uuid(), casa, 'lia-atendente', 'lia_vps', 'llm_call',
     'claude-opus-5-5', 'anthropic', 0, 43000, 19500, 235, 62735,
     'atendente', now() - interval '1 hour');

  r := public.ia_custos_painel(casa, now() - interval '2 hours', now());
  custo := (r ->> 'custo_usd')::numeric;

  IF round(custo, 4) IS DISTINCT FROM 0.1693 THEN
    RAISE EXCEPTION 'FALHOU 1: a chamada da Lia custou % , esperado 0.1693', round(custo, 6);
  END IF;
  RAISE NOTICE 'OK 1: a chamada real da Lia sai por US$ % (era 0,0047 antes)', round(custo, 4);

  -- ----------------------------------------------------------
  -- 2. A ESCRITA É O QUE PESA
  --
  -- 92% da conta é escrita em cache. Se alguém voltar a ignorá-la — ou
  -- cadastrar o preço dela como nulo e cair no COALESCE da entrada — o número
  -- despenca e continua parecendo um número.
  -- ----------------------------------------------------------
  IF round((19500 * 8.00 / 1000000.0) / custo, 2) < 0.90 THEN
    RAISE EXCEPTION 'FALHOU 2: a escrita deixou de dominar a conta — %',
      round((19500 * 8.00 / 1000000.0) / custo, 4);
  END IF;
  RAISE NOTICE 'OK 2: a escrita em cache responde por 92%% do custo';

  -- ----------------------------------------------------------
  -- 3. A CONVENÇÃO DA OPENAI NÃO MUDOU
  --
  -- Os 19 eventos do Caio e da Elaine já gravados não podem mudar de valor
  -- por causa desta correção. Lá `cached_tokens` É subconjunto de
  -- `input_tokens`, e a conta subtrai.
  --
  -- gpt-4o: entrada 2,50 · cache 1,25 · saída 10,00
  --   (10.000 − 4.000) × 2,50 / 1e6 = 0,0150
  --             4.000  × 1,25 / 1e6 = 0,0050
  --             1.000  × 10,0 / 1e6 = 0,0100
  --                                   ------
  --                                   0,0300
  -- ----------------------------------------------------------
  DELETE FROM agent_telemetry_events WHERE tenant_id = casa;
  INSERT INTO agent_telemetry_events
    (id, tenant_id, agent_slug, source, event_type, model, provider,
     input_tokens, cached_tokens, output_tokens, total_tokens, occurred_at)
  VALUES
    (gen_random_uuid(), casa, 'caio', 'crm_web', 'llm_call', 'gpt-4o', 'openai',
     10000, 4000, 1000, 11000, now() - interval '1 hour');

  custo := (public.ia_custos_painel(casa, now() - interval '2 hours', now()) ->> 'custo_usd')::numeric;
  IF round(custo, 4) IS DISTINCT FROM 0.0300 THEN
    RAISE EXCEPTION 'FALHOU 3: a conta da OpenAI mudou — deu %, esperado 0.0300', round(custo, 6);
  END IF;
  RAISE NOTICE 'OK 3: a conta da OpenAI ficou igual';

  -- ----------------------------------------------------------
  -- 4. SEM PREÇO, O CUSTO É NULO — NUNCA ZERO
  --
  -- Zero é uma afirmação: "não gastou". Nulo é "não sei". Foi por confundir
  -- os dois que a Telemetria mostrou "custo —" por meses sem ninguém
  -- investigar. `sem_preco` conta quantos ficaram de fora.
  -- ----------------------------------------------------------
  DELETE FROM agent_telemetry_events WHERE tenant_id = casa;
  INSERT INTO agent_telemetry_events
    (id, tenant_id, agent_slug, source, event_type, model, provider,
     input_tokens, output_tokens, total_tokens, occurred_at)
  VALUES
    (gen_random_uuid(), casa, 'x', 'lia_vps', 'llm_call', 'modelo-que-ninguem-cadastrou',
     'anthropic', 1000, 100, 1100, now() - interval '1 hour');

  r := public.ia_custos_painel(casa, now() - interval '2 hours', now());
  IF (r ->> 'sem_preco')::int IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHOU 4: o evento sem preco nao foi contado — %', r ->> 'sem_preco';
  END IF;
  IF (r ->> 'custo_usd')::numeric IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FALHOU 4b: o total deveria somar nada, e nao inventar valor';
  END IF;
  RAISE NOTICE 'OK 4: sem preco o evento entra em sem_preco e nao no custo';

  -- ----------------------------------------------------------
  -- 5. PARCELAS SEM `total_tokens` CONTAM
  --
  -- Quem manda as parcelas separadas pode deixar o total em branco. A guarda
  -- antiga (`total_tokens = 0` → nulo) zeraria a conta inteira da Lia por um
  -- campo que ela nem precisa mandar.
  -- ----------------------------------------------------------
  DELETE FROM agent_telemetry_events WHERE tenant_id = casa;
  INSERT INTO agent_telemetry_events
    (id, tenant_id, agent_slug, source, event_type, model, provider,
     input_tokens, cached_tokens, cache_escrita_tokens, output_tokens, total_tokens, occurred_at)
  VALUES
    (gen_random_uuid(), casa, 'lia-atendente', 'lia_vps', 'llm_call',
     'claude-opus-5-5', 'anthropic', 0, 43000, 19500, 235, NULL,
     now() - interval '1 hour');

  custo := (public.ia_custos_painel(casa, now() - interval '2 hours', now()) ->> 'custo_usd')::numeric;
  IF round(custo, 4) IS DISTINCT FROM 0.1693 THEN
    RAISE EXCEPTION 'FALHOU 5: sem total_tokens a conta virou % em vez de 0.1693', round(custo, 6);
  END IF;
  RAISE NOTICE 'OK 5: as parcelas bastam, o total e opcional';

  -- ----------------------------------------------------------
  -- 6. O CORRETOR NÃO VÊ O CUSTO DA CASA
  -- ----------------------------------------------------------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a000-0000000000ff', 'role', 'authenticated')::text, true);
  IF public.ia_custos_painel(casa, now() - interval '2 hours', now()) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 6: quem nao e da casa leu o custo';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 6: o porteiro continua no lugar';
END $$;

ROLLBACK;
