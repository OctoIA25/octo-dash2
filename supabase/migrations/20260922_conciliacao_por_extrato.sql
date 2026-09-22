-- ============================================================
-- P4.6 (parte) — Conciliação por extrato
--
-- O item tem três pedaços. Dois dependem de conta externa que não existe no
-- sistema — emissor de nota fiscal e banco/gateway de boleto —, e o próprio
-- plano começa o item mandando "confirmar com o Erick banco, emissor de nota e
-- prefeitura". Esta migration entrega o terceiro, que não depende de ninguém:
-- importar o extrato, casar com os lançamentos e baixar em lote.
--
-- A REGRA QUE ATRAVESSA O ARQUIVO: CONCILIAR ERRADO É DINHEIRO NO LUGAR ERRADO.
-- Por isso nada aqui concilia sozinho. O banco SUGERE, e a pessoa confirma —
-- e quando há mais de um lançamento possível para o mesmo movimento, a
-- sugestão vem marcada como ambígua em vez de escolher uma por conta própria.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. As importações
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.extrato_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conta_bancaria_id uuid REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  arquivo_nome text NOT NULL DEFAULT '',
  periodo_de date,
  periodo_ate date,
  movimentos integer NOT NULL DEFAULT 0,
  repetidos integer NOT NULL DEFAULT 0,
  importado_em timestamptz NOT NULL DEFAULT now(),
  importado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS extrato_importacoes_idx
  ON public.extrato_importacoes (tenant_id, importado_em DESC);

-- ------------------------------------------------------------
-- 2. Os movimentos do extrato
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.extrato_transacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  importacao_id uuid NOT NULL REFERENCES public.extrato_importacoes(id) ON DELETE CASCADE,
  conta_bancaria_id uuid REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  -- O identificador que o BANCO deu ao movimento.
  fitid text NOT NULL,
  data date NOT NULL,
  valor numeric NOT NULL CHECK (valor > 0),
  tipo text NOT NULL CHECK (tipo IN ('credito', 'debito')),
  descricao text NOT NULL DEFAULT '',
  -- Preenchido quando a pessoa confirma o casamento.
  lancamento_id uuid REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL,
  conciliada_em timestamptz,
  conciliada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- "Não é da Dash": tarifa, transferência entre contas próprias, etc.
  ignorada boolean NOT NULL DEFAULT false,
  motivo_ignorada text NOT NULL DEFAULT '',
  criada_em timestamptz NOT NULL DEFAULT now()
);

-- A CHAVE CONTRA IMPORTAR DUAS VEZES. O `fitid` é único por conta no padrão
-- OFX; sem isto, reimportar o mesmo mês duplicaria o extrato inteiro e a
-- conciliação passaria a casar dinheiro que não existe — o defeito clássico
-- desta tela, e o mais difícil de perceber depois.
CREATE UNIQUE INDEX IF NOT EXISTS extrato_transacoes_fitid_uniq
  ON public.extrato_transacoes (tenant_id, conta_bancaria_id, fitid);

CREATE INDEX IF NOT EXISTS extrato_transacoes_abertas_idx
  ON public.extrato_transacoes (tenant_id, data)
  WHERE lancamento_id IS NULL AND NOT ignorada;

-- Um lançamento não se concilia com dois movimentos: seria receber o mesmo
-- dinheiro duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS extrato_transacoes_lancamento_uniq
  ON public.extrato_transacoes (lancamento_id) WHERE lancamento_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Fechado para o front
-- ------------------------------------------------------------
REVOKE ALL ON public.extrato_importacoes FROM anon, authenticated;
REVOKE ALL ON public.extrato_transacoes FROM anon, authenticated;
GRANT ALL ON public.extrato_importacoes, public.extrato_transacoes TO service_role;

ALTER TABLE public.extrato_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extrato_transacoes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. IMPORTAR
-- ============================================================
-- Recebe os movimentos já lidos pelo navegador. O arquivo OFX não sobe: só os
-- quatro campos que interessam. Mandar o arquivo inteiro guardaria o extrato
-- completo da imobiliária sem necessidade.
CREATE OR REPLACE FUNCTION public.extrato_importar(
  p_tenant_id uuid,
  p_conta_bancaria_id uuid,
  p_arquivo text,
  p_periodo_de date,
  p_periodo_ate date,
  -- [{"fitid","data","valor","tipo","descricao"}, ...]
  p_movimentos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_imp uuid;
  v_novas integer := 0;
  v_repetidas integer := 0;
  x jsonb;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_movimentos) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_movimentos) = 0 THEN
    RAISE EXCEPTION 'O arquivo não trouxe nenhum movimento para importar.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_conta_bancaria_id IS NULL THEN
    RAISE EXCEPTION 'Escolha a conta bancária deste extrato.' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO extrato_importacoes
    (tenant_id, conta_bancaria_id, arquivo_nome, periodo_de, periodo_ate, importado_por)
  VALUES (p_tenant_id, p_conta_bancaria_id, COALESCE(p_arquivo, ''),
          p_periodo_de, p_periodo_ate, auth.uid())
  RETURNING id INTO v_imp;

  FOR x IN SELECT * FROM jsonb_array_elements(p_movimentos) LOOP
    BEGIN
      INSERT INTO extrato_transacoes
        (tenant_id, importacao_id, conta_bancaria_id, fitid, data, valor, tipo, descricao)
      VALUES (p_tenant_id, v_imp, p_conta_bancaria_id,
              x->>'fitid', (x->>'data')::date, (x->>'valor')::numeric,
              x->>'tipo', COALESCE(x->>'descricao', ''));
      v_novas := v_novas + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Já veio noutro arquivo. Reimportar o mesmo mês é comum e não pode
      -- duplicar nada — só contar.
      v_repetidas := v_repetidas + 1;
    END;
  END LOOP;

  UPDATE extrato_importacoes
     SET movimentos = v_novas, repetidos = v_repetidas
   WHERE id = v_imp;

  -- Importação que só trouxe repetidos não vira linha na lista: ela não
  -- acrescentou nada, e ficaria como um registro que confunde.
  IF v_novas = 0 THEN
    DELETE FROM extrato_importacoes WHERE id = v_imp;
    v_imp := NULL;
  END IF;

  RETURN jsonb_build_object(
    'importacao_id', v_imp, 'novas', v_novas, 'repetidas', v_repetidas
  );
END;
$function$;

-- ============================================================
-- 5. AS SUGESTÕES
-- ============================================================
-- Casa por VALOR EXATO, MESMO SENTIDO e data próxima. Nada de aproximar valor:
-- dois lançamentos parecidos no mesmo dia viram dinheiro no lugar errado, e o
-- erro fica escondido até alguém conferir o extrato à mão.
--
-- Quando há mais de um candidato, a sugestão sai marcada como AMBÍGUA — a
-- pessoa escolhe. Escolher sozinho aqui seria adivinhar com o dinheiro dos
-- outros.
-- O período é o MESMO filtro do topo da tela. Sem ele, a fila mostrava o
-- extrato inteiro enquanto o placar contava só o mês escolhido — dois números
-- certos cada um do seu jeito, e quem lê conclui que um dos dois está errado.
DROP FUNCTION IF EXISTS public.extrato_sugestoes(uuid, integer, uuid);
CREATE OR REPLACE FUNCTION public.extrato_sugestoes(
  p_tenant_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL,
  p_dias_de_folga integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_folga integer := GREATEST(COALESCE(p_dias_de_folga, 5), 0);
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'transacao_id', t.id,
      'data', t.data,
      'valor', t.valor,
      'tipo', t.tipo,
      'descricao', t.descricao,
      'candidatos', c.lista,
      'quantos', c.quantos,
      -- Um candidato só: dá para confirmar em lote com segurança.
      -- Mais de um: a pessoa escolhe.
      'ambigua', c.quantos > 1,
      'sem_candidato', c.quantos = 0
    ) ORDER BY t.data, t.valor DESC)
      FROM extrato_transacoes t
      CROSS JOIN LATERAL (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'lancamento_id', l.id,
                 'descricao', l.descricao,
                 'vencimento', l.vencimento,
                 'valor', l.valor,
                 'origem', l.origem,
                 'distancia_dias', abs(t.data - COALESCE(l.vencimento, l.competencia))
               ) ORDER BY abs(t.data - COALESCE(l.vencimento, l.competencia)), l.descricao), '[]'::jsonb) AS lista,
               count(*) AS quantos
          FROM lancamentos_financeiros l
         WHERE l.tenant_id = t.tenant_id
           AND l.status = 'aberto'
           -- Crédito no banco casa com "a receber"; débito, com "a pagar".
           AND l.tipo = CASE WHEN t.tipo = 'credito' THEN 'receber' ELSE 'pagar' END
           AND abs(l.valor - t.valor) <= 0.01
           AND abs(t.data - COALESCE(l.vencimento, l.competencia)) <= v_folga
           AND NOT EXISTS (SELECT 1 FROM extrato_transacoes o
                            WHERE o.lancamento_id = l.id)
      ) c
     WHERE t.tenant_id = p_tenant_id
       AND t.lancamento_id IS NULL
       AND NOT t.ignorada
       AND t.data BETWEEN v_de AND v_ate
  ), '[]'::jsonb);
END;
$function$;

-- ============================================================
-- 6. CONCILIAR
-- ============================================================
-- Recebe os pares que a PESSOA confirmou. Cada par baixa o lançamento pelo
-- valor e pela data do extrato — que é o que de fato aconteceu no banco.
CREATE OR REPLACE FUNCTION public.extrato_conciliar(
  p_tenant_id uuid,
  -- [{"transacao_id","lancamento_id"}, ...]
  p_pares jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_t public.extrato_transacoes%ROWTYPE;
  v_l public.lancamentos_financeiros%ROWTYPE;
  v_ok integer := 0;
  v_recusados jsonb := '[]'::jsonb;
  x jsonb;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;

  FOR x IN SELECT * FROM jsonb_array_elements(COALESCE(p_pares, '[]'::jsonb)) LOOP
    SELECT * INTO v_t FROM extrato_transacoes
     WHERE id = (x->>'transacao_id')::uuid AND tenant_id = p_tenant_id;
    SELECT * INTO v_l FROM lancamentos_financeiros
     WHERE id = (x->>'lancamento_id')::uuid AND tenant_id = p_tenant_id;

    IF v_t.id IS NULL OR v_l.id IS NULL THEN
      v_recusados := v_recusados || jsonb_build_array(jsonb_build_object(
        'par', x, 'motivo', 'movimento ou lançamento não encontrado'));
      CONTINUE;
    END IF;

    -- As três conferências que o banco refaz, mesmo a tela já tendo filtrado:
    -- quem chama a função não é obrigado a ser a tela.
    IF v_t.lancamento_id IS NOT NULL THEN
      v_recusados := v_recusados || jsonb_build_array(jsonb_build_object(
        'par', x, 'motivo', 'este movimento já foi conciliado'));
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM extrato_transacoes o WHERE o.lancamento_id = v_l.id) THEN
      v_recusados := v_recusados || jsonb_build_array(jsonb_build_object(
        'par', x, 'motivo', 'este lançamento já foi conciliado com outro movimento'));
      CONTINUE;
    END IF;
    -- Os parênteses em volta do CASE não são estilo: o plpgsql corta a condição
    -- do IF no primeiro THEN que encontra, e sem eles seria o THEN do CASE.
    IF abs(v_l.valor - v_t.valor) > 0.01
       OR v_l.tipo <> (CASE WHEN v_t.tipo = 'credito' THEN 'receber' ELSE 'pagar' END) THEN
      v_recusados := v_recusados || jsonb_build_array(jsonb_build_object(
        'par', x, 'motivo', 'valor ou sentido não batem'));
      CONTINUE;
    END IF;
    -- Lançamento já baixado teria a data de pagamento sobrescrita pela do
    -- extrato; cancelado voltaria a valer. Nenhum dos dois é conciliação.
    IF v_l.status IS DISTINCT FROM 'aberto' THEN
      v_recusados := v_recusados || jsonb_build_array(jsonb_build_object(
        'par', x, 'motivo', format('lançamento está %s, não aberto', v_l.status)));
      CONTINUE;
    END IF;

    UPDATE extrato_transacoes
       SET lancamento_id = v_l.id, conciliada_em = now(), conciliada_por = auth.uid()
     WHERE id = v_t.id;

    -- A baixa usa a data e o valor DO EXTRATO: é o que aconteceu no banco.
    UPDATE lancamentos_financeiros
       SET pago_em = v_t.data, valor_pago = v_t.valor
     WHERE id = v_l.id;

    v_ok := v_ok + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'conciliados', v_ok,
    'recusados', v_recusados,
    'quantos_recusados', jsonb_array_length(v_recusados)
  );
END;
$function$;

/** Desfaz uma conciliação — e reabre o lançamento. */
CREATE OR REPLACE FUNCTION public.extrato_desconciliar(p_transacao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_t public.extrato_transacoes%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM extrato_transacoes WHERE id = p_transacao_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.financeiro_pode_ver(v_t.tenant_id) THEN RETURN NULL; END IF;
  IF v_t.lancamento_id IS NULL THEN
    RETURN jsonb_build_object('desfeito', false, 'motivo', 'não estava conciliado');
  END IF;

  UPDATE lancamentos_financeiros SET pago_em = NULL, valor_pago = NULL
   WHERE id = v_t.lancamento_id;
  UPDATE extrato_transacoes
     SET lancamento_id = NULL, conciliada_em = NULL, conciliada_por = NULL
   WHERE id = p_transacao_id;

  RETURN jsonb_build_object('desfeito', true);
END;
$function$;

-- ------------------------------------------------------------
-- REABRIR O LANÇAMENTO SOLTA O MOVIMENTO
--
-- Achado ao sabotar o teste 6. O `financeiro_baixar(id, NULL)` e o
-- `financeiro_cancelar` da fase 1 desfazem a baixa sem saber que existe
-- conciliação — e deixavam o extrato dizendo "conciliado" enquanto o
-- lançamento voltava a aberto. O placar então diria que o mês fechou com um
-- dinheiro que não entrou.
--
-- O conserto é aqui, e não dentro de cada função: as duas mexem em `pago_em`,
-- e qualquer função nova também vai mexer. Um gatilho no lugar por onde todas
-- passam é um diff menor do que uma guarda em cada chamador — e não deixa o
-- próximo chamador de fora.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lancamento_reaberto_solta_o_extrato()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE extrato_transacoes
     SET lancamento_id = NULL, conciliada_em = NULL, conciliada_por = NULL
   WHERE lancamento_id = NEW.id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_lancamento_reaberto_solta_extrato ON public.lancamentos_financeiros;
CREATE TRIGGER tr_lancamento_reaberto_solta_extrato
  AFTER UPDATE OF pago_em ON public.lancamentos_financeiros
  FOR EACH ROW
  WHEN (NEW.pago_em IS NULL AND OLD.pago_em IS NOT NULL)
  EXECUTE FUNCTION public.lancamento_reaberto_solta_o_extrato();

/** "Não é da Dash": tarifa, transferência entre contas próprias, etc. */
CREATE OR REPLACE FUNCTION public.extrato_ignorar(
  p_transacao_id uuid,
  p_ignorar boolean DEFAULT true,
  p_motivo text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_t public.extrato_transacoes%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM extrato_transacoes WHERE id = p_transacao_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.financeiro_pode_ver(v_t.tenant_id) THEN RETURN NULL; END IF;
  IF v_t.lancamento_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este movimento está conciliado. Desfaça a conciliação antes de ignorá-lo.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE extrato_transacoes
     SET ignorada = COALESCE(p_ignorar, true), motivo_ignorada = COALESCE(p_motivo, '')
   WHERE id = p_transacao_id;
  RETURN jsonb_build_object('ignorada', COALESCE(p_ignorar, true));
END;
$function$;

-- ============================================================
-- 7. O PLACAR DA CONCILIAÇÃO
-- ============================================================
-- Quanto do extrato ainda não foi explicado. É o número que diz se o mês pode
-- ser fechado — e por isso conta o que FALTA, não o que já foi feito.
CREATE OR REPLACE FUNCTION public.extrato_situacao(
  p_tenant_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;

  RETURN (
    SELECT jsonb_build_object(
      'de', v_de, 'ate', v_ate,
      'movimentos', count(*),
      'conciliados', count(*) FILTER (WHERE lancamento_id IS NOT NULL),
      'ignorados', count(*) FILTER (WHERE ignorada),
      'em_aberto', count(*) FILTER (WHERE lancamento_id IS NULL AND NOT ignorada),
      'valor_em_aberto', round(COALESCE(sum(valor) FILTER (
        WHERE lancamento_id IS NULL AND NOT ignorada), 0), 2)
    )
      FROM extrato_transacoes
     WHERE tenant_id = p_tenant_id AND data BETWEEN v_de AND v_ate
  );
END;
$function$;

/** A lista, para a tela mostrar o que já foi conciliado e o que sobrou. */
CREATE OR REPLACE FUNCTION public.extrato_movimentos(
  p_tenant_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'data', t.data, 'valor', t.valor, 'tipo', t.tipo,
      'descricao', t.descricao, 'ignorada', t.ignorada,
      'motivo_ignorada', t.motivo_ignorada,
      'lancamento_id', t.lancamento_id,
      'lancamento', l.descricao,
      'conciliada_em', t.conciliada_em
    ) ORDER BY t.data, t.valor DESC)
      FROM extrato_transacoes t
      LEFT JOIN lancamentos_financeiros l ON l.id = t.lancamento_id
     WHERE t.tenant_id = p_tenant_id AND t.data BETWEEN v_de AND v_ate
  ), '[]'::jsonb);
END;
$function$;

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.extrato_importar(uuid, uuid, text, date, date, jsonb)',
    'public.extrato_sugestoes(uuid, date, date, integer)',
    'public.extrato_conciliar(uuid, jsonb)',
    'public.extrato_desconciliar(uuid)',
    'public.extrato_ignorar(uuid, boolean, text)',
    'public.extrato_situacao(uuid, date, date)',
    'public.extrato_movimentos(uuid, date, date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';

COMMIT;
