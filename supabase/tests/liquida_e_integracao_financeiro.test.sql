-- ============================================================
-- A Líquida nova, e a integração com o Financeiro que o chefe mandou conferir.
--
--   docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/liquida_e_integracao_financeiro.test.sql
--
-- Ele escreveu duas coisas em 23/09:
--
--   "a Líquida seria o valor da comissão total - o valor do corretor - o
--    valor do gerente (não colocar impostos ali, ainda)"
--
--   "isso precisa estar bem integradinho com o financeiro, confere depois qdo
--    subir por favor pq acho que não está. a ideia é, colocou ai que foi
--    assinado, abre um campo pra ir pro financeiro, onde colocamos data
--    prevista pra recebimento, e ai aparece na tela de a receber"
--
-- Os casos 4 a 6 são a conferência que ele pediu, feita como teste em vez de
-- olhada: assinar → venda → a receber, e a data prevista chegando ao
-- vencimento. Olhar uma vez prova aquele dia; o teste prova todo dia.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  casa    uuid := '5e0f0000-0000-4000-a000-000000000001';
  u_admin uuid := '5e0f1111-0000-4000-a000-000000000001';
  u_ana   uuid := '5e0f1111-0000-4000-a000-000000000002';
  v_id    uuid;
  v_liq   numeric;
  v_lanc  record;
BEGIN
  INSERT INTO tenants (id, code, name) VALUES (casa,'teste-liquida','Casa')
  ON CONFLICT DO NOTHING;
  INSERT INTO auth.users (id, email) VALUES
    (u_admin,'admin@liq.local'), (u_ana,'ana@liq.local')
  ON CONFLICT DO NOTHING;
  INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    (casa,u_admin,'admin'), (casa,u_ana,'corretor');

  -- Uma venda de R$ 500.000 com 6% de comissão: R$ 30.000 de bruta.
  INSERT INTO vendas (tenant_id, data_venda, empreendimento, vgv,
                      comissao_pct, comissao_bruta, imposto_pct, imposto_valor,
                      corretor_nome, status)
  VALUES (casa, '2026-09-10', 'Reserva Castanheira', 500000,
          6, 30000, 6, 1800, 'Ana', 'a_faturar')
  RETURNING id INTO v_id;

  -- ----------------------------------------------------------
  -- 1. SEM FOLHA, A LÍQUIDA É DESCONHECIDA — E NÃO A BRUTA
  --
  -- É o caso que sustenta a mudança. A fórmula nova depende dos repasses, e
  -- eles são calculados depois, num botão. Deixar a líquida em R$ 30.000 até
  -- lá afirmaria que a casa fica com 100% da comissão: um número redondo,
  -- plausível, e errado — que é o defeito que este plano vem desfazendo.
  -- ----------------------------------------------------------
  SELECT comissao_liquida INTO v_liq FROM vendas WHERE id = v_id;
  IF v_liq IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 1: sem folha a liquida deveria ser nula, e veio %', v_liq;
  END IF;
  RAISE NOTICE 'OK 1: sem folha calculada, a liquida e nula';

  -- ----------------------------------------------------------
  -- 2. A LÍQUIDA É A BRUTA MENOS CORRETOR E GERENTE
  --
  -- A regra da casa: corretor + líder ficam com 60% da BRUTA, a casa com 40%.
  -- Numa comissão de R$ 30.000: R$ 12.000 ao corretor, R$ 6.000 ao líder,
  -- R$ 12.000 para a casa.
  -- ----------------------------------------------------------
  INSERT INTO venda_repasses (venda_id, tenant_id, papel, nome, pct, valor) VALUES
    (v_id, casa, 'corretor', 'Ana',    40, 12000),
    (v_id, casa, 'lider',    'Gisele', 20,  6000);

  SELECT comissao_liquida INTO v_liq FROM vendas WHERE id = v_id;
  IF v_liq IS DISTINCT FROM 12000 THEN
    RAISE EXCEPTION 'FALHOU 2: esperava 12000 de liquida (30000 - 12000 - 6000) e veio %', v_liq;
  END IF;
  RAISE NOTICE 'OK 2: liquida = bruta - corretor - gerente';

  -- ----------------------------------------------------------
  -- 3. O IMPOSTO NÃO ENTRA — "ainda", como ele escreveu
  --
  -- A venda tem R$ 1.800 de imposto. Se ele entrasse, a líquida daria
  -- R$ 10.200. O caso existe para o dia em que alguém "corrigir" isto sem
  -- saber que foi decidido assim.
  -- ----------------------------------------------------------
  IF v_liq IS DISTINCT FROM 12000 OR (SELECT imposto_valor FROM vendas WHERE id = v_id) IS DISTINCT FROM 1800 THEN
    RAISE EXCEPTION 'FALHOU 3: o imposto voltou para a conta da liquida';
  END IF;
  RAISE NOTICE 'OK 3: o imposto continua fora da liquida';

  -- ----------------------------------------------------------
  -- 4. A VENDA VIRA "A RECEBER" NO FINANCEIRO, SOZINHA
  --
  -- Primeira metade do que ele mandou conferir. O lançamento é a BRUTA: é ela
  -- que a construtora deposita. O repasse sai depois, da casa para o corretor,
  -- e é outro lançamento.
  -- ----------------------------------------------------------
  SELECT * INTO v_lanc FROM lancamentos_financeiros
   WHERE tenant_id = casa AND origem = 'venda' AND origem_id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHOU 4: assinar a venda nao criou o "a receber" no Financeiro';
  END IF;
  IF v_lanc.tipo IS DISTINCT FROM 'receber' OR v_lanc.valor IS DISTINCT FROM 30000 THEN
    RAISE EXCEPTION 'FALHOU 4b: o a receber saiu como % de %', v_lanc.tipo, v_lanc.valor;
  END IF;
  RAISE NOTICE 'OK 4: a venda vira "a receber" de % sozinha', v_lanc.valor;

  -- ----------------------------------------------------------
  -- 5. A DATA PREVISTA VIRA O VENCIMENTO
  --
  -- Segunda metade: "colocamos data prevista pra recebimento, e ai aparece na
  -- tela de a receber". O campo já existe na venda; o que se confere aqui é
  -- que ele CHEGA do outro lado, em vez de ficar guardado só na conferência.
  -- ----------------------------------------------------------
  UPDATE vendas SET recebimento_previsto_em = '2026-10-15' WHERE id = v_id;

  SELECT * INTO v_lanc FROM lancamentos_financeiros
   WHERE tenant_id = casa AND origem = 'venda' AND origem_id = v_id;
  IF v_lanc.vencimento IS DISTINCT FROM DATE '2026-10-15' THEN
    RAISE EXCEPTION 'FALHOU 5: a data prevista nao chegou ao vencimento do a receber (veio %)',
      v_lanc.vencimento;
  END IF;
  RAISE NOTICE 'OK 5: a data prevista vira o vencimento no Financeiro';

  -- ----------------------------------------------------------
  -- 6. SEM DATA PREVISTA, O LANÇAMENTO NÃO SOME DA TELA
  --
  -- É a explicação mais provável para o "acho que não está" dele. Uma venda
  -- assinada sem data prevista gera um a receber SEM vencimento — e uma tela
  -- que filtrasse só por vencimento o esconderia, parecendo que a integração
  -- não aconteceu. A consulta cai na competência quando não há vencimento.
  -- ----------------------------------------------------------
  UPDATE vendas SET recebimento_previsto_em = NULL WHERE id = v_id;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role','authenticated')::text, true);
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.financeiro_lancamentos(casa, '2026-09-01', '2026-09-30', 'receber') -> 'linhas') x
     WHERE (x ->> 'origem_id') = v_id::text
  ) THEN
    RAISE EXCEPTION 'FALHOU 6: sem data prevista, o a receber sumiu da tela';
  END IF;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'OK 6: sem data prevista o lancamento aparece pela competencia';

  -- ----------------------------------------------------------
  -- 7. MUDAR A FOLHA REFAZ A LÍQUIDA
  --
  -- Sem isto, corrigir um repasse deixaria a líquida antiga na tela — e o
  -- número continuaria plausível, que é como esses erros duram meses.
  -- ----------------------------------------------------------
  UPDATE venda_repasses SET valor = 15000 WHERE venda_id = v_id AND papel = 'corretor';
  SELECT comissao_liquida INTO v_liq FROM vendas WHERE id = v_id;
  IF v_liq IS DISTINCT FROM 9000 THEN
    RAISE EXCEPTION 'FALHOU 7: mudar o repasse nao refez a liquida (veio %)', v_liq;
  END IF;

  DELETE FROM venda_repasses WHERE venda_id = v_id;
  SELECT comissao_liquida INTO v_liq FROM vendas WHERE id = v_id;
  IF v_liq IS NOT NULL THEN
    RAISE EXCEPTION 'FALHOU 7b: apagar a folha deixou a liquida em %', v_liq;
  END IF;
  RAISE NOTICE 'OK 7: mexer na folha refaz a liquida, e apagar volta a nulo';
END $$;

ROLLBACK;
