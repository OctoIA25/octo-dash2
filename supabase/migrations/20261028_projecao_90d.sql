-- ============================================================
-- Projeção 90 dias — a "Planilha Rolling 90d" do chefe (03/10/2026)
--
-- Nenhuma tabela nova. Tudo o que a planilha pede já mora em
-- `lancamentos_financeiros`: as parcelas das vendas (20261025), as contas
-- recorrentes da casa e os repasses. A projeção só agrupa por semana e mês.
--
-- O que falta e entra como COLUNA:
--   contas_bancarias.saldo_em ............ o "saldo de hoje" tem data
--   tenant_fiscal_config.alerta_saldo_minimo  o "alerta se abaixo de"
-- E dois papéis de conta, para a projeção achar a linha sem depender do código
-- que a casa pode editar: 'pessoal' (2.3) e 'comissao_parceria' (1.2).
--
-- ESTIMADO, e a tela diz que é (decidido em 03/10):
--   repasse sem folha calculada = 60% da parcela (corretor + líder, regra da casa)
--   provisões 13º + férias      = 19,44% da folha (1/12 + 1/12 × 4/3)
--
-- ATRASADO / SEM DATA fica numa coluna à parte e NÃO entra no saldo: somar ao
-- mês corrente o que já devia ter entrado daria uma folga que talvez não exista.
-- ============================================================

BEGIN;

ALTER TABLE public.contas_bancarias ADD COLUMN IF NOT EXISTS saldo_em date;
COMMENT ON COLUMN public.contas_bancarias.saldo_em IS
  'Dia em que saldo_inicial era o saldo do extrato (no fim do dia). NULL = saldo antes de qualquer lançamento (regra de 21/09).';

ALTER TABLE public.tenant_fiscal_config
  ADD COLUMN IF NOT EXISTS alerta_saldo_minimo numeric
  CHECK (alerta_saldo_minimo IS NULL OR alerta_saldo_minimo >= 0);

-- ------------------------------------------------------------
-- 1. Os papéis novos
-- ------------------------------------------------------------
ALTER TABLE public.plano_contas DROP CONSTRAINT IF EXISTS plano_contas_papel_check;
ALTER TABLE public.plano_contas ADD CONSTRAINT plano_contas_papel_check CHECK (papel IS NULL OR papel IN
  ('comissao_venda', 'repasse_corretor', 'imposto', 'midia', 'pessoal', 'comissao_parceria'));

-- A conta do plano padrão ganha o papel só onde ainda é a do padrão (código E
-- nome) e o papel está livre: conta que a casa renomeou fica como está.
UPDATE public.plano_contas c SET papel = 'pessoal'
 WHERE c.codigo = '2.3' AND c.nome = 'Pessoal' AND c.papel IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.plano_contas x WHERE x.tenant_id = c.tenant_id AND x.papel = 'pessoal');
UPDATE public.plano_contas c SET papel = 'comissao_parceria'
 WHERE c.codigo = '1.2' AND c.nome = 'Comissões de parceria' AND c.papel IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.plano_contas x WHERE x.tenant_id = c.tenant_id AND x.papel = 'comissao_parceria');

CREATE OR REPLACE FUNCTION public.financeiro_cria_plano_padrao(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_receitas uuid;
  v_despesas uuid;
  v_criadas integer := 0;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN 0; END IF;

  INSERT INTO plano_contas (tenant_id, codigo, nome, tipo)
  VALUES (p_tenant_id, '1', 'Receitas', 'receita')
  ON CONFLICT (tenant_id, codigo) DO NOTHING;
  SELECT id INTO v_receitas FROM plano_contas WHERE tenant_id = p_tenant_id AND codigo = '1';

  INSERT INTO plano_contas (tenant_id, codigo, nome, tipo)
  VALUES (p_tenant_id, '2', 'Despesas', 'despesa')
  ON CONFLICT (tenant_id, codigo) DO NOTHING;
  SELECT id INTO v_despesas FROM plano_contas WHERE tenant_id = p_tenant_id AND codigo = '2';

  INSERT INTO plano_contas (tenant_id, codigo, nome, tipo, pai_id, papel)
  VALUES
    (p_tenant_id, '1.1', 'Comissões de venda',     'receita', v_receitas, 'comissao_venda'),
    (p_tenant_id, '1.2', 'Comissões de parceria',  'receita', v_receitas, 'comissao_parceria'),
    (p_tenant_id, '1.9', 'Outras receitas',        'receita', v_receitas, NULL),
    (p_tenant_id, '2.1', 'Repasses a corretores',  'despesa', v_despesas, 'repasse_corretor'),
    (p_tenant_id, '2.2', 'Marketing e mídia',      'despesa', v_despesas, 'midia'),
    (p_tenant_id, '2.3', 'Pessoal',                'despesa', v_despesas, 'pessoal'),
    (p_tenant_id, '2.4', 'Estrutura',              'despesa', v_despesas, NULL),
    (p_tenant_id, '2.5', 'Impostos',               'despesa', v_despesas, 'imposto'),
    (p_tenant_id, '2.6', 'Sistemas',               'despesa', v_despesas, NULL),
    (p_tenant_id, '2.9', 'Outras despesas',        'despesa', v_despesas, NULL)
  ON CONFLICT (tenant_id, codigo) DO NOTHING;

  GET DIAGNOSTICS v_criadas = ROW_COUNT;
  RETURN v_criadas;
END;
$function$;

-- ------------------------------------------------------------
-- 2. O saldo num dia — uma conta só, para o fluxo e a projeção concordarem
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financeiro_saldo_no_dia(p_tenant_id uuid, p_dia date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- O saldo no FIM de p_dia. O saldo informado vale no fim de `saldo_em`: o que
  -- foi baixado até lá já está dentro dele; o que veio depois soma. Sem
  -- `saldo_em`, o saldo é o de antes de qualquer lançamento (regra de 21/09).
  -- ponytail: uma data de referência para todas as contas (a maior). Com duas
  -- contas informadas em dias diferentes, a mais antiga perde o que entrou
  -- entre as duas datas; separar por conta quando a baixa disser de qual conta saiu.
  WITH ref AS (
    SELECT COALESCE(sum(saldo_inicial), 0) AS saldo, max(saldo_em) AS em
      FROM contas_bancarias WHERE tenant_id = p_tenant_id AND ativa
  ), mov AS (
    SELECT pago_em,
           CASE WHEN tipo = 'receber' THEN COALESCE(valor_pago, valor)
                ELSE -COALESCE(valor_pago, valor) END AS v
      FROM lancamentos_financeiros
     WHERE tenant_id = p_tenant_id AND status = 'baixado'
  )
  SELECT round(ref.saldo
         - COALESCE((SELECT sum(v) FROM mov WHERE ref.em IS NOT NULL AND pago_em <= ref.em), 0)
         + COALESCE((SELECT sum(v) FROM mov WHERE pago_em <= p_dia), 0), 2)
    FROM ref;
$function$;

-- O fluxo de caixa passa a começar desse saldo. Sem `saldo_em`, a conta é
-- idêntica à de 21/09 (saldo inicial + tudo o que foi baixado antes do recorte).
CREATE OR REPLACE FUNCTION public.financeiro_fluxo_de_caixa(
  p_tenant_id uuid,
  p_de        date DEFAULT NULL,
  p_ate       date DEFAULT NULL,
  p_gran      text DEFAULT 'dia'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);
  v_gran text := CASE WHEN p_gran IN ('dia', 'semana', 'mes') THEN p_gran ELSE 'dia' END;
  v_unidade text := CASE v_gran WHEN 'semana' THEN 'week' WHEN 'mes' THEN 'month' ELSE 'day' END;
  v_saldo_inicial numeric;
  v_linhas jsonb;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;

  v_saldo_inicial := public.financeiro_saldo_no_dia(p_tenant_id, v_de - 1);

  WITH balde AS (
    SELECT date_trunc(v_unidade, d)::date AS quando
      FROM generate_series(v_de, v_ate, CASE v_gran
             WHEN 'mes' THEN interval '1 month'
             WHEN 'semana' THEN interval '1 week'
             ELSE interval '1 day' END) d
    GROUP BY 1
  ),
  mov AS (
    SELECT date_trunc(v_unidade, COALESCE(vencimento, competencia))::date AS quando_prev,
           date_trunc(v_unidade, pago_em)::date AS quando_real,
           tipo, valor, COALESCE(valor_pago, valor) AS pago, status
      FROM lancamentos_financeiros
     WHERE tenant_id = p_tenant_id AND status <> 'cancelado'
  ),
  serie AS (
    SELECT b.quando,
      round(COALESCE((SELECT sum(valor) FROM mov m
        WHERE m.quando_prev = b.quando AND m.tipo = 'receber'), 0), 2) AS previsto_entrada,
      round(COALESCE((SELECT sum(valor) FROM mov m
        WHERE m.quando_prev = b.quando AND m.tipo = 'pagar'), 0), 2) AS previsto_saida,
      round(COALESCE((SELECT sum(pago) FROM mov m
        WHERE m.quando_real = b.quando AND m.tipo = 'receber' AND m.status = 'baixado'), 0), 2) AS entrada,
      round(COALESCE((SELECT sum(pago) FROM mov m
        WHERE m.quando_real = b.quando AND m.tipo = 'pagar' AND m.status = 'baixado'), 0), 2) AS saida
    FROM balde b
  ),
  com_saldo AS (
    SELECT *, v_saldo_inicial + sum(entrada - saida) OVER (ORDER BY quando) AS saldo
      FROM serie
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'quando', quando,
           'previsto_entrada', previsto_entrada,
           'previsto_saida', previsto_saida,
           'entrada', entrada,
           'saida', saida,
           'previsto_liquido', previsto_entrada - previsto_saida,
           'realizado_liquido', entrada - saida,
           'saldo', round(saldo, 2)
         ) ORDER BY quando), '[]'::jsonb)
    INTO v_linhas
    FROM com_saldo;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'granularidade', v_gran,
    'saldo_inicial', round(v_saldo_inicial, 2),
    'linhas', v_linhas
  );
END;
$function$;

-- ------------------------------------------------------------
-- 3. A conta bancária ganha a data do saldo
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.financeiro_conta_bancaria(uuid, text, text, numeric, uuid);

CREATE OR REPLACE FUNCTION public.financeiro_conta_bancaria(
  p_tenant_id     uuid,
  p_nome          text,
  p_banco         text DEFAULT '',
  p_saldo_inicial numeric DEFAULT 0,
  p_id            uuid DEFAULT NULL,
  p_saldo_em      date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_c public.contas_bancarias%ROWTYPE;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;
  IF COALESCE(btrim(p_nome), '') = '' THEN
    RAISE EXCEPTION 'A conta precisa de um nome.' USING ERRCODE = 'check_violation';
  END IF;
  -- Um saldo "de amanhã" contaria em dobro o que for baixado até lá.
  IF p_saldo_em IS NOT NULL AND p_saldo_em > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'O saldo informado não pode ser de um dia que ainda não chegou.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO contas_bancarias (tenant_id, nome, banco, saldo_inicial, saldo_em)
    VALUES (p_tenant_id, btrim(p_nome), COALESCE(p_banco, ''), COALESCE(p_saldo_inicial, 0), p_saldo_em)
    RETURNING * INTO v_c;
  ELSE
    UPDATE contas_bancarias
       SET nome = btrim(p_nome), banco = COALESCE(p_banco, ''),
           saldo_inicial = COALESCE(p_saldo_inicial, 0), saldo_em = p_saldo_em
     WHERE id = p_id AND tenant_id = p_tenant_id
    RETURNING * INTO v_c;
  END IF;

  RETURN to_jsonb(v_c);
END;
$function$;

CREATE OR REPLACE FUNCTION public.financeiro_contas_bancarias(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'nome', nome, 'banco', banco, 'saldo_inicial', saldo_inicial,
      'saldo_em', saldo_em, 'ativa', ativa
    ) ORDER BY nome) FROM contas_bancarias WHERE tenant_id = p_tenant_id AND ativa
  ), '[]'::jsonb);
END;
$function$;

-- ------------------------------------------------------------
-- 4. O alerta
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financeiro_definir_alerta(p_tenant_id uuid, p_valor numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;
  IF p_valor IS NOT NULL AND p_valor < 0 THEN
    RAISE EXCEPTION 'O alerta não pode ser negativo.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO tenant_fiscal_config (tenant_id, alerta_saldo_minimo)
  VALUES (p_tenant_id, p_valor)
  ON CONFLICT (tenant_id) DO UPDATE
    SET alerta_saldo_minimo = EXCLUDED.alerta_saldo_minimo, atualizado_em = now();
  RETURN jsonb_build_object('alerta_saldo_minimo', p_valor);
END;
$function$;

-- ------------------------------------------------------------
-- 5. A projeção
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financeiro_projecao(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- As duas regras do estimado (decididas em 03/10).
  c_repasse  CONSTANT numeric := 0.60;
  c_provisao CONSTANT numeric := 0.1944;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_mes date := date_trunc('month', v_hoje)::date;
  v_fim date := (date_trunc('month', v_hoje) + interval '3 months - 1 day')::date;
  v_colunas jsonb;
  v_atrasado jsonb;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;

  WITH colunas AS (
    -- As semanas que ainda restam do mês (1–7, 8–14, 15–21, 22–fim), depois os
    -- dois meses seguintes. O mês corrente em semanas: é onde o caixa aperta.
    SELECT 's' || (k + 1) AS id, 'semana' AS tipo, k AS ordem,
           GREATEST(v_mes + 7 * k, v_hoje) AS de,
           CASE WHEN k = 3 THEN (v_mes + interval '1 month - 1 day')::date ELSE v_mes + 7 * k + 6 END AS ate
      FROM generate_series(0, 3) k
     WHERE (CASE WHEN k = 3 THEN (v_mes + interval '1 month - 1 day')::date ELSE v_mes + 7 * k + 6 END) >= v_hoje
    UNION ALL
    SELECT 'm' || m, 'mes', 3 + m,
           (v_mes + (m || ' months')::interval)::date,
           (v_mes + ((m + 1) || ' months')::interval - interval '1 day')::date
      FROM generate_series(1, 2) m
  ),
  abertos AS (
    SELECT l.tipo, l.valor, l.vencimento,
           CASE WHEN l.vencimento IS NULL OR l.vencimento < v_hoje THEN 'atrasado' ELSE co.id END AS coluna,
           CASE
             WHEN l.tipo = 'receber' AND l.origem = 'venda'              THEN 'comissoes'
             WHEN l.tipo = 'receber' AND c.papel = 'comissao_parceria'   THEN 'parceiros'
             WHEN l.tipo = 'receber'                                     THEN 'outras_entradas'
             WHEN l.origem = 'imposto' OR c.papel = 'imposto'            THEN 'impostos'
             WHEN l.origem = 'repasse' OR c.papel = 'repasse_corretor'   THEN 'repasses'
             WHEN l.origem = 'midia' OR c.papel = 'midia'                THEN 'marketing'
             ELSE 'custos_fixos'
           END AS linha,
           -- O repasse estimado: só da parcela de venda sem folha registrada
           -- (a parte da casa não conta como folha).
           CASE WHEN l.tipo = 'receber' AND l.origem = 'venda'
                 AND NOT EXISTS (SELECT 1 FROM venda_repasses r
                                  WHERE r.venda_id = l.origem_id AND r.papel <> 'lotus')
                THEN round(l.valor * c_repasse, 2) ELSE 0 END AS repasse_estimado,
           CASE WHEN l.tipo = 'pagar' AND c.papel = 'pessoal'
                THEN round(l.valor * c_provisao, 2) ELSE 0 END AS provisao
      FROM lancamentos_financeiros l
      LEFT JOIN plano_contas c ON c.id = l.conta_id
      LEFT JOIN colunas co ON l.vencimento BETWEEN co.de AND co.ate
     WHERE l.tenant_id = p_tenant_id AND l.status = 'aberto'
       AND (l.vencimento IS NULL OR l.vencimento <= v_fim)
  ),
  somas AS (
    SELECT coluna,
      round(COALESCE(sum(valor) FILTER (WHERE linha = 'comissoes'), 0), 2)       AS comissoes,
      round(COALESCE(sum(valor) FILTER (WHERE linha = 'parceiros'), 0), 2)       AS parceiros,
      round(COALESCE(sum(valor) FILTER (WHERE linha = 'outras_entradas'), 0), 2) AS outras_entradas,
      round(COALESCE(sum(valor) FILTER (WHERE linha = 'custos_fixos'), 0), 2)    AS custos_fixos,
      round(COALESCE(sum(valor) FILTER (WHERE linha = 'repasses'), 0), 2)        AS repasses,
      round(COALESCE(sum(repasse_estimado), 0), 2)                                 AS repasses_estimados,
      round(COALESCE(sum(valor) FILTER (WHERE linha = 'marketing'), 0), 2)       AS marketing,
      round(COALESCE(sum(provisao), 0), 2)                                         AS provisoes,
      round(COALESCE(sum(valor) FILTER (WHERE linha = 'impostos'), 0), 2)        AS impostos,
      count(*)                                                                     AS lancamentos,
      count(*) FILTER (WHERE vencimento IS NULL)                                   AS sem_data
      FROM abertos
     GROUP BY coluna
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', co.id, 'tipo', co.tipo, 'de', co.de, 'ate', co.ate)
                                 || COALESCE(to_jsonb(s) - 'coluna', '{}'::jsonb) ORDER BY co.ordem)
                FROM colunas co LEFT JOIN somas s ON s.coluna = co.id), '[]'::jsonb),
    (SELECT to_jsonb(s) - 'coluna' FROM somas s WHERE s.coluna = 'atrasado')
  INTO v_colunas, v_atrasado;

  RETURN jsonb_build_object(
    'hoje', v_hoje,
    'saldo_inicial', public.financeiro_saldo_no_dia(p_tenant_id, v_hoje),
    'saldo_em', (SELECT max(saldo_em) FROM contas_bancarias WHERE tenant_id = p_tenant_id AND ativa),
    'tem_conta', EXISTS (SELECT 1 FROM contas_bancarias WHERE tenant_id = p_tenant_id AND ativa),
    'alerta', (SELECT alerta_saldo_minimo FROM tenant_fiscal_config WHERE tenant_id = p_tenant_id),
    'colunas', v_colunas,
    'atrasado', COALESCE(v_atrasado, jsonb_build_object('lancamentos', 0)),
    'regras', jsonb_build_object('repasse_estimado_pct', c_repasse * 100, 'provisao_pct', c_provisao * 100)
  );
END;
$function$;

-- ------------------------------------------------------------
-- 6. Grants
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.financeiro_saldo_no_dia(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_saldo_no_dia(uuid, date) TO service_role;

DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.financeiro_conta_bancaria(uuid, text, text, numeric, uuid, date)',
    'public.financeiro_definir_alerta(uuid, numeric)',
    'public.financeiro_projecao(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';

COMMIT;
