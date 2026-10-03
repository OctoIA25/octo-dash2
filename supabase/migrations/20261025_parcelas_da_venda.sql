-- ============================================================
-- Parcelas da venda — a parcela É o "a receber" (projeção 90d, 03/10/2026)
--
-- Pedido: venda parcelada, cada parcela com valor e data, e o estado
-- pendente / parcelado / pago acompanhando o que já entrou.
--
-- SEM TABELA NOVA. A parcela é a linha de `lancamentos_financeiros` que a venda
-- já gerava: ela ganha a coluna `parcela`, e a chave de duplicata passa a
-- incluí-la. À vista é a parcela 1 de 1 — exatamente o que as 29 vendas da
-- Lotus já têm, então nenhuma linha precisa ser migrada.
--
-- QUEM MANDA EM QUEM:
--   À VISTA (1 parcela): a venda manda, como desde 21/09. Gravar `recebido_em`
--     na venda baixa a parcela; baixar a parcela marca a venda. Nada muda para
--     a tela antiga nem para `vendas_completar_da_proposta`.
--   PARCELADA (2+): as parcelas mandam. `recebido_em`, `valor_recebido` e
--     `recebimento_previsto_em` da venda passam a ser o resumo delas.
-- Uma função só faz a ponte nos dois sentidos: `venda_sincroniza_financeiro`.
--
-- O LAÇO venda ↔ lançamento termina pelo `IS DISTINCT FROM`, como em 21/09:
-- cada escrita só acontece quando muda algo, e sem linha afetada não há novo
-- disparo.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. A coluna e a chave
-- ------------------------------------------------------------
ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS parcela smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamentos_parcela_ck') THEN
    ALTER TABLE public.lancamentos_financeiros
      ADD CONSTRAINT lancamentos_parcela_ck CHECK (parcela >= 1);
  END IF;
END $$;

COMMENT ON COLUMN public.lancamentos_financeiros.parcela IS
  'Número da parcela do lançamento automático. À vista = 1. O imposto de uma parcela tem o mesmo número dela.';

-- A chave que impede duplicata passa a ser por parcela. Os três ON CONFLICT
-- que usam esta chave (venda, imposto, repasse) mudam nesta mesma migration.
DROP INDEX IF EXISTS public.lancamentos_origem_uniq;
CREATE UNIQUE INDEX lancamentos_origem_uniq
  ON public.lancamentos_financeiros (tenant_id, origem, origem_id, parcela)
  WHERE origem <> 'manual' AND origem_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Quem edita venda: quem cuida do dinheiro, e o Gerente (03/10)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendas_pode_editar(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.financeiro_pode_ver(p_tenant_id)
      OR EXISTS (SELECT 1 FROM tenant_memberships
                  WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
                    AND role = 'team_leader');
$function$;

-- ------------------------------------------------------------
-- 3. O estado da venda, num lugar só
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venda_parcelas_resumo(p_venda_id uuid)
RETURNS TABLE (parcelas integer, pagas integer, situacao text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(*)::int,
         count(*) FILTER (WHERE status = 'baixado')::int,
         CASE WHEN count(*) > 0 AND count(*) FILTER (WHERE status = 'baixado') = count(*) THEN 'pago'
              WHEN count(*) FILTER (WHERE status = 'baixado') > 0 THEN 'parcelado'
              ELSE 'pendente' END
    FROM lancamentos_financeiros
   WHERE origem = 'venda' AND origem_id = p_venda_id AND status <> 'cancelado';
$function$;

-- ------------------------------------------------------------
-- 4. A ponte venda ↔ parcelas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venda_sincroniza_financeiro(p_venda_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v public.vendas%ROWTYPE;
  v_conta uuid;
  v_conta_imp uuid;
  v_competencia date;
  v_descricao text;
  v_centro text;
  v_n integer;
BEGIN
  SELECT * INTO v FROM vendas WHERE id = p_venda_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Sem comissão não há o que receber (regra de 21/09): os automáticos em
  -- aberto vão embora; o que já foi baixado fica, porque o dinheiro entrou.
  IF COALESCE(v.comissao_bruta, 0) <= 0 THEN
    DELETE FROM lancamentos_financeiros
     WHERE tenant_id = v.tenant_id AND origem IN ('venda', 'imposto')
       AND origem_id = v.id AND status <> 'baixado';
    RETURN;
  END IF;

  v_competencia := date_trunc('month', v.data_venda)::date;
  v_centro := COALESCE(NULLIF(v.empreendimento, ''), '');
  v_descricao := 'Comissão · ' || COALESCE(NULLIF(v.empreendimento, ''), 'venda') ||
                 CASE WHEN COALESCE(v.corretor_nome, '') <> '' THEN ' · ' || v.corretor_nome ELSE '' END;

  SELECT count(*) INTO v_n FROM lancamentos_financeiros
   WHERE tenant_id = v.tenant_id AND origem = 'venda' AND origem_id = v.id AND status <> 'cancelado';

  IF v_n = 0 THEN
    -- O nascimento: a parcela 1 é a comissão inteira, já com o que a venda
    -- trouxer de previsão e de recebimento.
    v_conta := public.financeiro_conta_do_papel(v.tenant_id, 'comissao_venda');
    INSERT INTO lancamentos_financeiros
      (tenant_id, tipo, conta_id, descricao, valor, competencia, vencimento,
       pago_em, valor_pago, origem, origem_id, parcela, centro_custo)
    VALUES
      (v.tenant_id, 'receber', v_conta, v_descricao, v.comissao_bruta, v_competencia,
       v.recebimento_previsto_em, v.recebido_em, v.valor_recebido, 'venda', v.id, 1, v_centro);
    v_n := 1;

  ELSIF v_n = 1 THEN
    -- À VISTA: a venda manda, como sempre mandou.
    UPDATE lancamentos_financeiros
       SET valor = v.comissao_bruta,
           vencimento = v.recebimento_previsto_em,
           pago_em = v.recebido_em,
           valor_pago = v.valor_recebido
     WHERE tenant_id = v.tenant_id AND origem = 'venda' AND origem_id = v.id AND status <> 'cancelado'
       AND (valor IS DISTINCT FROM v.comissao_bruta
         OR vencimento IS DISTINCT FROM v.recebimento_previsto_em
         OR pago_em IS DISTINCT FROM v.recebido_em
         OR valor_pago IS DISTINCT FROM v.valor_recebido);

  ELSE
    -- PARCELADA: as parcelas mandam, e a venda lê o resumo delas. O valor de
    -- cada parcela é de quem parcelou: se a comissão mudar depois, a diferença
    -- aparece em vez de sumir num ajuste silencioso.
    UPDATE vendas SET
      recebido_em = r.recebido_em,
      valor_recebido = r.valor_recebido,
      recebimento_previsto_em = r.previsto
      FROM (
        SELECT CASE WHEN count(*) FILTER (WHERE status = 'aberto') = 0 THEN max(pago_em) END AS recebido_em,
               sum(valor_pago) FILTER (WHERE status = 'baixado') AS valor_recebido,
               min(vencimento) FILTER (WHERE status = 'aberto') AS previsto
          FROM lancamentos_financeiros
         WHERE tenant_id = v.tenant_id AND origem = 'venda' AND origem_id = v.id AND status <> 'cancelado'
      ) r
     WHERE vendas.id = v.id
       AND (vendas.recebido_em IS DISTINCT FROM r.recebido_em
         OR vendas.valor_recebido IS DISTINCT FROM r.valor_recebido
         OR vendas.recebimento_previsto_em IS DISTINCT FROM r.previsto);
  END IF;

  -- Descrição, competência e centro de custo acompanham a venda.
  UPDATE lancamentos_financeiros l
     SET descricao = v_descricao || CASE WHEN v_n > 1 THEN ' · parcela ' || l.parcela ELSE '' END,
         competencia = v_competencia,
         centro_custo = v_centro
   WHERE l.tenant_id = v.tenant_id AND l.origem = 'venda' AND l.origem_id = v.id AND l.status <> 'cancelado'
     AND (l.descricao IS DISTINCT FROM v_descricao || CASE WHEN v_n > 1 THEN ' · parcela ' || l.parcela ELSE '' END
       OR l.competencia IS DISTINCT FROM v_competencia
       OR l.centro_custo IS DISTINCT FROM v_centro);

  -- O imposto, um por parcela. À vista é o da venda (como sempre foi);
  -- parcelada, a fração de cada parcela.
  v_conta_imp := public.financeiro_conta_do_papel(v.tenant_id, 'imposto');
  WITH alvo AS (
    SELECT p.parcela, p.descricao, p.competencia, p.vencimento, p.centro_custo,
           CASE WHEN v_n = 1 THEN round(COALESCE(v.imposto_valor, 0), 2)
                ELSE round(p.valor * COALESCE(v.imposto_pct, 0) / 100.0, 2) END AS valor
      FROM lancamentos_financeiros p
     WHERE p.tenant_id = v.tenant_id AND p.origem = 'venda' AND p.origem_id = v.id AND p.status <> 'cancelado'
  ), sobra AS (
    DELETE FROM lancamentos_financeiros i
     WHERE i.tenant_id = v.tenant_id AND i.origem = 'imposto' AND i.origem_id = v.id
       AND i.status = 'aberto'
       AND NOT EXISTS (SELECT 1 FROM alvo a WHERE a.parcela = i.parcela AND a.valor > 0)
  )
  INSERT INTO lancamentos_financeiros
    (tenant_id, tipo, conta_id, descricao, valor, competencia, vencimento,
     origem, origem_id, parcela, centro_custo)
  SELECT v.tenant_id, 'pagar', v_conta_imp, 'Imposto sobre ' || a.descricao, a.valor,
         a.competencia, a.vencimento, 'imposto', v.id, a.parcela, a.centro_custo
    FROM alvo a
   WHERE a.valor > 0
  ON CONFLICT (tenant_id, origem, origem_id, parcela) WHERE origem <> 'manual' AND origem_id IS NOT NULL
  DO UPDATE SET
    valor = EXCLUDED.valor,
    descricao = EXCLUDED.descricao,
    competencia = EXCLUDED.competencia,
    vencimento = EXCLUDED.vencimento
  WHERE lancamentos_financeiros.valor IS DISTINCT FROM EXCLUDED.valor
     OR lancamentos_financeiros.descricao IS DISTINCT FROM EXCLUDED.descricao
     OR lancamentos_financeiros.competencia IS DISTINCT FROM EXCLUDED.competencia
     OR lancamentos_financeiros.vencimento IS DISTINCT FROM EXCLUDED.vencimento;
END;
$function$;

-- O gatilho da venda passa a só chamar a ponte.
CREATE OR REPLACE FUNCTION public.venda_gera_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.venda_sincroniza_financeiro(NEW.id);
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- 5. A volta: baixar a parcela
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lancamento_baixa_a_origem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.origem = 'venda' AND NEW.origem_id IS NOT NULL THEN
    IF (SELECT count(*) FROM lancamentos_financeiros
         WHERE origem = 'venda' AND origem_id = NEW.origem_id AND status <> 'cancelado') = 1 THEN
      -- À vista: a baixa volta para a venda, como desde 21/09.
      UPDATE vendas
         SET recebido_em = NEW.pago_em,
             valor_recebido = NEW.valor_pago
       WHERE id = NEW.origem_id
         AND (recebido_em IS DISTINCT FROM NEW.pago_em
           OR valor_recebido IS DISTINCT FROM NEW.valor_pago);
    ELSE
      -- Parcelada: a venda relê o resumo das parcelas.
      PERFORM public.venda_sincroniza_financeiro(NEW.origem_id);
    END IF;

  ELSIF NEW.origem = 'repasse' AND NEW.origem_id IS NOT NULL THEN
    UPDATE venda_repasses
       SET pago_em = NEW.pago_em,
           status = CASE WHEN NEW.pago_em IS NOT NULL THEN 'pago' ELSE 'a_pagar' END
     WHERE id = NEW.origem_id
       AND pago_em IS DISTINCT FROM NEW.pago_em;
  END IF;

  RETURN NEW;
END;
$function$;

-- Desfeita a baixa (de uma parcela que seja), a venda volta ao que a nota diz.
-- Antes, desfazer a baixa pelo Financeiro deixava a venda "recebida" sem data.
CREATE OR REPLACE FUNCTION public.venda_ajusta_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.recebido_em IS NOT NULL AND NEW.valor_recebido IS NOT NULL THEN
    -- Um centavo de diferença é arredondamento de banco, não divergência.
    IF abs(COALESCE(NEW.valor_recebido, 0) - COALESCE(NEW.comissao_bruta, 0)) > 0.01 THEN
      NEW.status := 'divergente';
    ELSE
      NEW.status := 'recebido';
    END IF;
  ELSIF NEW.status IN ('recebido', 'divergente') THEN
    NEW.status := CASE WHEN NULLIF(btrim(COALESCE(NEW.nf_numero, '')), '') IS NOT NULL
                       THEN 'faturado' ELSE 'a_faturar' END;
  END IF;
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- 6. O repasse: chave nova, e a parte da casa não é "a pagar"
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repasse_gera_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conta uuid;
  v_venda public.vendas%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Recalcular a folha apaga as linhas antigas; o "a pagar" delas vai junto,
    -- senão o Financeiro ficaria devendo a quem não recebe mais.
    DELETE FROM lancamentos_financeiros
     WHERE tenant_id = OLD.tenant_id AND origem = 'repasse' AND origem_id = OLD.id;
    RETURN OLD;
  END IF;

  -- A parte da casa ('lotus') não é dinheiro que sai: é o que fica. Até 03/10
  -- ela virava um "a pagar" da casa para ela mesma — 40% da comissão como
  -- despesa falsa, latente porque nenhuma folha tinha sido calculada ainda.
  IF NEW.papel = 'lotus' THEN
    DELETE FROM lancamentos_financeiros
     WHERE tenant_id = NEW.tenant_id AND origem = 'repasse' AND origem_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT * INTO v_venda FROM vendas WHERE id = NEW.venda_id;
  v_conta := public.financeiro_conta_do_papel(NEW.tenant_id, 'repasse_corretor');

  INSERT INTO lancamentos_financeiros
    (tenant_id, tipo, conta_id, descricao, valor, competencia, vencimento,
     pago_em, valor_pago, origem, origem_id, centro_custo)
  VALUES
    (NEW.tenant_id, 'pagar', v_conta,
     'Repasse · ' || COALESCE(NULLIF(NEW.nome, ''), NEW.papel) ||
       ' · ' || COALESCE(NULLIF(v_venda.empreendimento, ''), 'venda'),
     NEW.valor,
     date_trunc('month', COALESCE(v_venda.data_venda, CURRENT_DATE))::date,
     v_venda.recebimento_previsto_em,
     NEW.pago_em,
     CASE WHEN NEW.pago_em IS NOT NULL THEN NEW.valor END,
     'repasse', NEW.id, COALESCE(NULLIF(v_venda.empreendimento, ''), ''))
  ON CONFLICT (tenant_id, origem, origem_id, parcela) WHERE origem <> 'manual' AND origem_id IS NOT NULL
  DO UPDATE SET
    valor = EXCLUDED.valor,
    descricao = EXCLUDED.descricao,
    pago_em = EXCLUDED.pago_em,
    valor_pago = EXCLUDED.valor_pago
  WHERE lancamentos_financeiros.valor IS DISTINCT FROM EXCLUDED.valor
     OR lancamentos_financeiros.pago_em IS DISTINCT FROM EXCLUDED.pago_em
     OR lancamentos_financeiros.valor_pago IS DISTINCT FROM EXCLUDED.valor_pago
     OR lancamentos_financeiros.descricao IS DISTINCT FROM EXCLUDED.descricao;

  RETURN NEW;
END;
$function$;

-- Se alguma folha já tiver gravado a parte da casa, o "a pagar" falso sai.
DELETE FROM public.lancamentos_financeiros l
 WHERE l.origem = 'repasse' AND l.status = 'aberto'
   AND EXISTS (SELECT 1 FROM public.venda_repasses r WHERE r.id = l.origem_id AND r.papel = 'lotus');

-- ------------------------------------------------------------
-- 7. Parcelar
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venda_parcelar(p_venda_id uuid, p_parcelas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v public.vendas%ROWTYPE;
  v_ja_pago numeric;
  v_baixadas integer;
  v_proxima integer;
  v_novas numeric;
  v_conta uuid;
BEGIN
  SELECT * INTO v FROM vendas WHERE id = p_venda_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.vendas_pode_editar(v.tenant_id) THEN RETURN NULL; END IF;

  IF jsonb_typeof(p_parcelas) IS DISTINCT FROM 'array' OR jsonb_array_length(p_parcelas) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos uma parcela.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_parcelas) e
              WHERE COALESCE(round((e->>'valor')::numeric, 2), 0) <= 0) THEN
    RAISE EXCEPTION 'Cada parcela precisa de um valor maior que zero.' USING ERRCODE = 'check_violation';
  END IF;

  -- O que já entrou fica como entrou: só o que está em aberto se refaz.
  SELECT COALESCE(sum(valor), 0), count(*), COALESCE(max(parcela), 0)
    INTO v_ja_pago, v_baixadas, v_proxima
    FROM lancamentos_financeiros
   WHERE tenant_id = v.tenant_id AND origem = 'venda' AND origem_id = v.id AND status = 'baixado';

  SELECT sum(round((e->>'valor')::numeric, 2)) INTO v_novas FROM jsonb_array_elements(p_parcelas) e;

  IF abs(v_ja_pago + v_novas - v.comissao_bruta) > 0.01 THEN
    RAISE EXCEPTION 'As parcelas somam % e a comissão é %.',
      round(v_ja_pago + v_novas, 2), round(v.comissao_bruta, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM lancamentos_financeiros
   WHERE tenant_id = v.tenant_id AND origem IN ('venda', 'imposto')
     AND origem_id = v.id AND status = 'aberto';

  IF v_baixadas = 0 AND jsonb_array_length(p_parcelas) = 1 THEN
    -- Uma parcela só é à vista, e na venda à vista quem manda é a venda: a data
    -- vai nela, e o gatilho recria a parcela 1 a partir dela.
    UPDATE vendas SET recebimento_previsto_em = NULLIF(p_parcelas->0->>'vencimento', '')::date
     WHERE id = v.id;
  ELSE
    v_conta := public.financeiro_conta_do_papel(v.tenant_id, 'comissao_venda');
    INSERT INTO lancamentos_financeiros
      (tenant_id, tipo, conta_id, descricao, valor, competencia, vencimento,
       origem, origem_id, parcela, centro_custo)
    SELECT v.tenant_id, 'receber', v_conta, '', round((e.x->>'valor')::numeric, 2),
           date_trunc('month', v.data_venda)::date, NULLIF(e.x->>'vencimento', '')::date,
           'venda', v.id, v_proxima + e.n::integer, COALESCE(NULLIF(v.empreendimento, ''), '')
      FROM jsonb_array_elements(p_parcelas) WITH ORDINALITY AS e(x, n);
  END IF;

  PERFORM public.venda_sincroniza_financeiro(v.id);

  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', id, 'parcela', parcela, 'valor', valor, 'vencimento', vencimento,
            'pago_em', pago_em, 'valor_pago', valor_pago, 'status', status) ORDER BY parcela), '[]'::jsonb)
            FROM lancamentos_financeiros
           WHERE tenant_id = v.tenant_id AND origem = 'venda' AND origem_id = v.id AND status <> 'cancelado');
END;
$function$;

-- ------------------------------------------------------------
-- 8. O líquido da parcela é proporcional
-- ------------------------------------------------------------
-- `comissao_liquida` é da VENDA. Com cinco parcelas, mostrá-la inteira em cada
-- linha faria o total do líquido somar a mesma venda cinco vezes.
CREATE OR REPLACE FUNCTION public.financeiro_lancamentos(p_tenant_id uuid, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date, p_tipo text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_conta_id uuid DEFAULT NULL::uuid, p_centro_custo text DEFAULT NULL::text, p_por text DEFAULT 'vencimento'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);
  v_por text := CASE WHEN p_por = 'competencia' THEN 'competencia' ELSE 'vencimento' END;
  v_linhas jsonb;
  v_totais jsonb;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN RETURN NULL; END IF;

  WITH filtrados AS (
    SELECT l.*, c.codigo AS conta_codigo, c.nome AS conta_nome, c.tipo AS conta_tipo,
           -- A venda por trás do lançamento, seja qual for o caminho.
           CASE l.origem
             WHEN 'venda'   THEN l.origem_id
             WHEN 'imposto' THEN l.origem_id
             WHEN 'repasse' THEN (SELECT r.venda_id FROM venda_repasses r WHERE r.id = l.origem_id)
           END AS venda_id
      FROM lancamentos_financeiros l
      LEFT JOIN plano_contas c ON c.id = l.conta_id
     WHERE l.tenant_id = p_tenant_id
       AND l.status <> 'cancelado'
       AND CASE
             WHEN v_por = 'competencia' THEN l.competencia BETWEEN v_de AND v_ate
             ELSE COALESCE(l.vencimento, l.competencia) BETWEEN v_de AND v_ate
           END
       AND (p_tipo IS NULL OR p_tipo = '' OR l.tipo = p_tipo)
       AND (p_status IS NULL OR p_status = '' OR l.status = p_status)
       AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
       AND (p_centro_custo IS NULL OR p_centro_custo = '' OR l.centro_custo = p_centro_custo)
  ), comVenda AS (
    -- O LEFT JOIN é obrigatório e não é zelo: lançamento manual, de mídia, e
    -- qualquer um cuja venda tenha sido apagada não têm venda. Um INNER JOIN
    -- faria essas linhas SUMIREM da lista de contas a receber.
    SELECT f.*,
           v.tipo AS venda_tipo,
           -- A fração da líquida que cabe a ESTA parcela (03/10).
           CASE WHEN f.origem = 'venda' AND COALESCE(v.comissao_bruta, 0) > 0
                THEN round(v.comissao_liquida * f.valor / v.comissao_bruta, 2) END AS liquido_da_linha,
           NULLIF(btrim(le.source), '') AS portal
      FROM filtrados f
      LEFT JOIN vendas v ON v.id = f.venda_id AND v.tenant_id = p_tenant_id
      LEFT JOIN leads  le ON le.id = v.lead_id AND le.tenant_id = p_tenant_id
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'tipo', tipo, 'descricao', descricao, 'valor', valor,
      'competencia', competencia, 'vencimento', vencimento,
      'pago_em', pago_em, 'valor_pago', valor_pago, 'status', status,
      'origem', origem, 'origem_id', origem_id, 'centro_custo', centro_custo,
      'anexo', anexo, 'observacao', observacao,
      'conta_id', conta_id, 'conta_codigo', conta_codigo, 'conta_nome', conta_nome,
      'vencido', (status = 'aberto' AND vencimento IS NOT NULL AND vencimento < v_hoje),
      'dias_de_atraso', CASE WHEN status = 'aberto' AND vencimento IS NOT NULL AND vencimento < v_hoje
                             THEN (v_hoje - vencimento) END,
      'venda_tipo', venda_tipo,
      'portal', portal,
      -- Só na linha da COMISSÃO, e só a parte desta parcela. NULO quando a
      -- folha de repasse ainda não foi calculada.
      'valor_liquido', liquido_da_linha
    ) ORDER BY COALESCE(vencimento, competencia), valor DESC) FROM comVenda), '[]'::jsonb),
    (SELECT jsonb_build_object(
      'lancamentos', count(*),
      'a_receber', round(COALESCE(sum(valor) FILTER (WHERE tipo = 'receber' AND status = 'aberto'), 0), 2),
      'a_pagar', round(COALESCE(sum(valor) FILTER (WHERE tipo = 'pagar' AND status = 'aberto'), 0), 2),
      'recebido', round(COALESCE(sum(COALESCE(valor_pago, valor)) FILTER (WHERE tipo = 'receber' AND status = 'baixado'), 0), 2),
      'pago', round(COALESCE(sum(COALESCE(valor_pago, valor)) FILTER (WHERE tipo = 'pagar' AND status = 'baixado'), 0), 2),
      'vencidos', count(*) FILTER (WHERE status = 'aberto' AND vencimento IS NOT NULL AND vencimento < v_hoje),
      'valor_vencido', round(COALESCE(sum(valor) FILTER (WHERE status = 'aberto' AND vencimento IS NOT NULL AND vencimento < v_hoje), 0), 2),
      'sem_conta', count(*) FILTER (WHERE conta_id IS NULL),
      -- O líquido do que se tem a receber: soma das frações, uma por parcela.
      -- Venda sem folha calculada tem a fração NULA e fica de fora.
      'liquido', round(COALESCE(sum(liquido_da_linha)
        FILTER (WHERE origem = 'venda' AND tipo = 'receber'), 0), 2),
      'de_lancamento', round(COALESCE(sum(valor)
        FILTER (WHERE tipo = 'receber' AND venda_tipo = 'lancamento'), 0), 2),
      'de_terceiros', round(COALESCE(sum(valor)
        FILTER (WHERE tipo = 'receber' AND venda_tipo = 'terceiros'), 0), 2),
      'sem_venda', round(COALESCE(sum(valor)
        FILTER (WHERE tipo = 'receber' AND venda_tipo IS NULL), 0), 2)
    ) FROM comVenda)
  INTO v_linhas, v_totais;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'por', v_por,
    'linhas', v_linhas, 'totais', v_totais
  );
END;
$function$;

-- ------------------------------------------------------------
-- 9. Grants
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.venda_parcelas_resumo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.venda_sincroniza_financeiro(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venda_parcelas_resumo(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.venda_sincroniza_financeiro(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.vendas_pode_editar(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.venda_parcelar(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_pode_editar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.venda_parcelar(uuid, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
