-- "Com a Lia" quando a dona do lead é a própria Lia.
--
-- POR QUE ESTE TESTE EXISTE, e por que em SQL
-- Em 28/09 eu escrevi a regra e cobri em TypeScript: cinco casos, sabotagem
-- nas duas pontas, tudo verde. E subi para produção uma função QUEBRADA.
--
-- `leads.assigned_agent_id` é TEXT, não uuid. Comparar text com uuid só
-- estoura em tempo de EXECUÇÃO — a migration é aceita, e a função falha na
-- primeira chamada com "operator does not exist: text = uuid". Nenhum teste
-- de TypeScript alcança isso: a regra que eles cobrem é a do card, não a do
-- banco.
--
-- Este teste CHAMA as duas funções. É a única forma de o erro aparecer antes
-- do usuário.
BEGIN;

DO $$
DECLARE
  t uuid := gen_random_uuid();
  u_lia uuid := gen_random_uuid();
  u_corretor uuid := gen_random_uuid();
  lead_da_lia uuid := gen_random_uuid();
  lead_do_corretor uuid := gen_random_uuid();
  r record;
  v_dona boolean;
BEGIN
  INSERT INTO tenants (id, name, code) VALUES (t, 'Casa de Teste', 'teste-'||left(t::text,8));

  INSERT INTO auth.users (id, email, aud, role, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  SELECT x.id, x.id||'@teste.local', 'authenticated', 'authenticated', now(), now(), '', '', '', ''
    FROM (VALUES (u_lia),(u_corretor)) AS x(id);

  -- A Lia se reconhece pela MARCA, não pelo id nem pelo nome.
  INSERT INTO tenant_memberships (tenant_id, user_id, role, permissions) VALUES
    (t, u_lia, 'corretor', '{"lead_limit":{"motivo":"assistente-ia"}}'::jsonb),
    (t, u_corretor, 'corretor', '{}'::jsonb);

  -- ---------- 1. a função acha a Lia ----------
  IF public.usuario_assistente_ia(t) IS DISTINCT FROM u_lia THEN
    RAISE EXCEPTION 'FALHOU: usuario_assistente_ia devolveu % e a Lia e %',
      public.usuario_assistente_ia(t), u_lia;
  END IF;
  RAISE NOTICE 'OK 1: a Lia e achada pela marca assistente-ia';

  -- ---------- 2. casa sem assistente devolve nulo ----------
  IF public.usuario_assistente_ia(gen_random_uuid()) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU: casa sem assistente devia devolver nulo';
  END IF;
  RAISE NOTICE 'OK 2: casa sem assistente devolve nulo, e ninguem vira com_lia';

  -- `assigned_agent_id` é TEXT: é assim que a base guarda, e é onde o tipo
  -- errado passa despercebido.
  INSERT INTO leads (id, tenant_id, name, status, assigned_agent_id, created_at) VALUES
    (lead_da_lia,      t, 'Lead da Lia',      'Novos Leads', u_lia::text,      now()),
    (lead_do_corretor, t, 'Lead do corretor', 'Novos Leads', u_corretor::text, now());

  -- O caso dos 76: a Lia "distribuiu" o lead para ela mesma.
  --
  -- O lead do corretor também ganha um evento DE PROPÓSITO: sem movimento
  -- nenhum a RPC não devolve linha para ele, e o teste passaria a medir
  -- "não veio linha" em vez de "veio marcado como do corretor". Foi assim
  -- que este caso falhou na primeira execução -- defeito do teste, não da regra.
  INSERT INTO lead_events (tenant_id, lead_id, event_type, lead_source, created_at) VALUES
    (t, lead_da_lia::text,      'lia.lead_distribuido', 'leads', now()),
    (t, lead_do_corretor::text, 'lead.stage_changed',   'leads', now());

  -- ---------- 3. A RPC RODA e marca a dona ----------
  -- O ponto exato do defeito de 28/09: aqui é que text = uuid estoura.
  SELECT dona_lia INTO v_dona
    FROM public.leads_ultima_movimentacao(t, ARRAY[lead_da_lia::text])
   LIMIT 1;
  IF v_dona IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FALHOU: a RPC nao marcou dona_lia no lead da Lia (veio %)', v_dona;
  END IF;
  RAISE NOTICE 'OK 3: a RPC roda e marca dona_lia -- o erro de tipo apareceria aqui';

  SELECT dona_lia INTO v_dona
    FROM public.leads_ultima_movimentacao(t, ARRAY[lead_do_corretor::text])
   LIMIT 1;
  IF v_dona IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FALHOU: lead de corretor de verdade veio marcado como da Lia';
  END IF;
  RAISE NOTICE 'OK 4: lead de corretor de verdade nao vira da Lia';

  -- ---------- 5. o gráfico também roda, e separa os dois ----------
  SELECT * INTO r FROM public.leads_graficos(t) g;
  IF r IS NULL THEN
    RAISE EXCEPTION 'FALHOU: leads_graficos nao devolveu nada';
  END IF;
  RAISE NOTICE 'OK 5: leads_graficos roda com a pergunta zero -- sem erro de tipo';
END $$;

ROLLBACK;
