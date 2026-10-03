-- ============================================================
-- A Conferência edita vendas (projeção 90d, 03/10/2026)
--
-- "deve ser possível também diretor, admin, gerente conseguir criar coisas na
--  [conferência] de vendas e também mudar o estado das existentes"
--
-- Quem: `vendas_pode_editar` (20261025) — quem cuida do dinheiro, e o Gerente.
-- O Gerente baixa parcela de VENDA e mais nada do Financeiro: conta da casa,
-- imposto e repasse seguem com `financeiro_pode_ver`.
--
-- A NOTA GANHA FUNÇÃO PRÓPRIA. `venda_atualizar` grava nota E recebimento
-- juntos; com parcelas, a tela que salvasse a nota mandaria junto um
-- recebimento lido antes da última baixa — e desfaria a baixa. Ela fica como
-- está, porque é o que a tela publicada chama até o deploy.
-- ============================================================

BEGIN;

ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS cliente text NOT NULL DEFAULT '';
COMMENT ON COLUMN public.vendas.cliente IS
  'Nome do cliente da venda criada à mão ou vinda da planilha. A venda que nasce da proposta tem o lead.';

-- ------------------------------------------------------------
-- 1. Criar venda à mão
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venda_criar(
  p_tenant_id     uuid,
  p_data_venda    date,
  p_empreendimento text,
  p_lancamento_id uuid,
  p_corretor_id   uuid,
  p_corretor_nome text,
  p_cliente       text,
  p_vgv           numeric,
  p_comissao      numeric,
  p_parcelas      jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lanc public.lancamentos%ROWTYPE;
  v_imposto_pct numeric;
  v_bruta numeric := round(COALESCE(p_comissao, 0), 2);
  v_id uuid;
BEGIN
  IF NOT public.vendas_pode_editar(p_tenant_id) THEN RETURN NULL; END IF;

  IF p_data_venda IS NULL THEN
    RAISE EXCEPTION 'Informe a data da venda.' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(btrim(p_empreendimento), '') = '' AND p_lancamento_id IS NULL THEN
    RAISE EXCEPTION 'Informe o empreendimento.' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(p_vgv, 0) < 0 THEN
    RAISE EXCEPTION 'O VGV não pode ser negativo.' USING ERRCODE = 'check_violation';
  END IF;
  -- Venda sem comissão não tem o que receber (regra de 21/09): criar uma
  -- assim encheria a Conferência de linha que não é dinheiro.
  IF v_bruta <= 0 THEN
    RAISE EXCEPTION 'Informe a comissão negociada da venda.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_corretor_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships WHERE tenant_id = p_tenant_id AND user_id = p_corretor_id) THEN
    RAISE EXCEPTION 'O corretor não é desta imobiliária.' USING ERRCODE = 'check_violation';
  END IF;

  IF p_lancamento_id IS NOT NULL THEN
    SELECT * INTO v_lanc FROM lancamentos WHERE id = p_lancamento_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Empreendimento não encontrado nesta imobiliária.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT f.imposto_pct INTO v_imposto_pct FROM tenant_fiscal_config f WHERE f.tenant_id = p_tenant_id;
  v_imposto_pct := COALESCE(v_imposto_pct, 0);

  -- A comissão NEGOCIADA manda, e o % sai dela — a mesma regra da venda que
  -- nasce da proposta (20261014).
  INSERT INTO vendas (
    tenant_id, data_venda, empreendimento, lancamento_id, construtora_id, tipo,
    corretor_id, corretor_nome, nivel_corretor, cliente,
    vgv, comissao_pct, comissao_bruta, imposto_pct, imposto_valor, status
  ) VALUES (
    p_tenant_id, p_data_venda,
    COALESCE(NULLIF(btrim(p_empreendimento), ''), v_lanc.nome),
    v_lanc.id, v_lanc.construtora_id,
    CASE WHEN v_lanc.id IS NOT NULL THEN 'lancamento' ELSE 'terceiros' END,
    p_corretor_id, COALESCE(btrim(p_corretor_nome), ''),
    public.nivel_do_membro(p_tenant_id, p_corretor_id),
    COALESCE(btrim(p_cliente), ''),
    COALESCE(p_vgv, 0),
    COALESCE(public.pct_da_comissao(v_bruta, p_vgv), 0), v_bruta,
    v_imposto_pct, round(v_bruta * v_imposto_pct / 100.0, 2), 'a_faturar'
  )
  RETURNING id INTO v_id;

  IF p_parcelas IS NOT NULL AND jsonb_typeof(p_parcelas) = 'array' AND jsonb_array_length(p_parcelas) > 0 THEN
    PERFORM public.venda_parcelar(v_id, p_parcelas);
  END IF;

  RETURN (SELECT to_jsonb(v) FROM vendas v WHERE v.id = v_id);
END;
$function$;

-- ------------------------------------------------------------
-- 2. A nota fiscal, sozinha
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venda_gravar_nf(
  p_venda_id   uuid,
  p_nf_numero  text,
  p_nf_data    date,
  p_nf_arquivo text,
  p_observacao text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_antes public.vendas%ROWTYPE;
  v_depois public.vendas%ROWTYPE;
  v_nf text := NULLIF(btrim(COALESCE(p_nf_numero, '')), '');
BEGIN
  SELECT * INTO v_antes FROM vendas WHERE id = p_venda_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.vendas_pode_editar(v_antes.tenant_id) THEN RETURN NULL; END IF;

  UPDATE vendas SET
    nf_numero = v_nf,
    nf_data = p_nf_data,
    nf_arquivo = NULLIF(btrim(COALESCE(p_nf_arquivo, '')), ''),
    observacao = COALESCE(p_observacao, ''),
    -- A nota decide entre faturado e a faturar. Recebida ou divergente quem
    -- diz é o dinheiro: o gatilho `venda_ajusta_status` (BEFORE) põe por cima.
    status = CASE WHEN v_nf IS NOT NULL THEN 'faturado' ELSE 'a_faturar' END
  WHERE id = p_venda_id
  RETURNING * INTO v_depois;

  INSERT INTO venda_historico (venda_id, tenant_id, campo, de, para, por)
  SELECT p_venda_id, v_antes.tenant_id, c.campo, c.de, c.para, auth.uid()
    FROM (VALUES
      ('nf_numero', v_antes.nf_numero, v_depois.nf_numero),
      ('nf_data', v_antes.nf_data::text, v_depois.nf_data::text),
      ('nf_arquivo', v_antes.nf_arquivo, v_depois.nf_arquivo),
      ('status', v_antes.status, v_depois.status)
    ) AS c(campo, de, para)
   WHERE c.de IS DISTINCT FROM c.para;

  RETURN to_jsonb(v_depois);
END;
$function$;

-- ------------------------------------------------------------
-- 3. A baixa: o Gerente, só em parcela de venda
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financeiro_baixar(
  p_lancamento_id uuid,
  p_pago_em       date,
  p_valor_pago    numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_l public.lancamentos_financeiros%ROWTYPE;
BEGIN
  SELECT * INTO v_l FROM lancamentos_financeiros WHERE id = p_lancamento_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- O Gerente marca parcela de VENDA recebida (decidido em 03/10) e mais nada
  -- do Financeiro: conta da casa, imposto e repasse seguem com quem cuida do dinheiro.
  IF NOT (public.financeiro_pode_ver(v_l.tenant_id)
          OR (v_l.origem = 'venda' AND public.vendas_pode_editar(v_l.tenant_id))) THEN
    RETURN NULL;
  END IF;

  IF p_pago_em IS NOT NULL AND COALESCE(p_valor_pago, v_l.valor) <= 0 THEN
    RAISE EXCEPTION 'Para baixar, informe um valor maior que zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE lancamentos_financeiros
     SET pago_em = p_pago_em,
         valor_pago = CASE WHEN p_pago_em IS NULL THEN NULL
                           ELSE COALESCE(p_valor_pago, valor) END
   WHERE id = p_lancamento_id
  RETURNING * INTO v_l;

  RETURN to_jsonb(v_l);
END;
$function$;

-- ------------------------------------------------------------
-- 4. A leitura da Conferência: situação e parcelas
-- ------------------------------------------------------------
-- A assinatura ganha `p_situacao`: DROP e CREATE, porque CREATE OR REPLACE
-- com outra lista de parâmetros criaria uma segunda função, e o PostgREST
-- escolheria entre as duas pela quantidade de argumentos.
DROP FUNCTION IF EXISTS public.vendas_conferencia(uuid, date, date, text, uuid, uuid, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.vendas_conferencia(
  p_tenant_id uuid,
  p_de date DEFAULT NULL::date,
  p_ate date DEFAULT NULL::date,
  p_status text DEFAULT NULL::text,
  p_construtora_id uuid DEFAULT NULL::uuid,
  p_corretor_id uuid DEFAULT NULL::uuid,
  p_equipe_id uuid DEFAULT NULL::uuid,
  p_tipo text DEFAULT NULL::text,
  p_lancamento_id uuid DEFAULT NULL::uuid,
  p_situacao text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, v_hoje);
  v_linhas jsonb;
  v_totais jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;
  IF NOT public.vendas_pode_editar(p_tenant_id) THEN RETURN NULL; END IF;

  WITH filtradas AS (
    SELECT v.*, c.nome AS construtora_nome,
           COALESCE(NULLIF(btrim(ld.source), ''), NULLIF(btrim(pr.origin), '')) AS origem,
           CASE WHEN v.tipo = 'lancamento' THEN NULLIF(btrim(pr.forecast_unidade), '')
                WHEN public.normalizar_texto(pr.property_reference) IN ('', 'imovel da carteira', 'sem imovel') THEN NULL
                ELSE btrim(pr.property_reference)
           END AS codigo,
           (SELECT count(*) FROM venda_repasses r WHERE r.venda_id = v.id) AS repasses,
           (SELECT count(*) FROM venda_repasses r WHERE r.venda_id = v.id AND r.status = 'pago') AS repasses_pagos,
           rs.parcelas, rs.pagas AS parcelas_pagas, rs.situacao
      FROM vendas v
      LEFT JOIN construtoras c ON c.id = v.construtora_id
      LEFT JOIN leads ld ON ld.id = v.lead_id AND ld.tenant_id = v.tenant_id
      LEFT JOIN proposals pr ON pr.id = v.proposta_id
      LEFT JOIN LATERAL public.venda_parcelas_resumo(v.id) rs ON true
     WHERE v.tenant_id = p_tenant_id
       AND v.data_venda >= v_de AND v.data_venda <= v_ate
       AND (p_status IS NULL OR p_status = '' OR v.status = p_status)
       AND (NULLIF(p_situacao, '') IS NULL OR rs.situacao = p_situacao)
       AND (p_construtora_id IS NULL OR v.construtora_id = p_construtora_id)
       AND (p_corretor_id IS NULL OR v.corretor_id = p_corretor_id)
       AND (p_equipe_id IS NULL OR EXISTS (
            SELECT 1 FROM tenant_memberships tm
             WHERE tm.tenant_id = v.tenant_id AND tm.user_id = v.corretor_id
               AND tm.team_id = p_equipe_id))
       AND (NULLIF(p_tipo, '') IS NULL OR v.tipo = p_tipo)
       AND (p_lancamento_id IS NULL OR v.lancamento_id = p_lancamento_id)
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'data_venda', data_venda, 'empreendimento', empreendimento,
      'construtora', construtora_nome, 'tipo', tipo,
      'corretor', corretor_nome, 'corretor_id', corretor_id, 'nivel_corretor', nivel_corretor,
      'cliente', cliente,
      'lead_id', lead_id, 'origem', origem, 'codigo', codigo,
      'vgv', vgv, 'comissao_pct', comissao_pct, 'comissao_bruta', comissao_bruta,
      'imposto_pct', imposto_pct, 'imposto_valor', imposto_valor,
      'comissao_liquida', comissao_liquida, 'comissao_da_proposta', comissao_da_proposta,
      'nf_numero', nf_numero, 'nf_data', nf_data,
      'recebimento_previsto_em', recebimento_previsto_em,
      'recebido_em', recebido_em, 'valor_recebido', valor_recebido, 'diferenca', diferenca,
      'status', status, 'repasses', repasses, 'repasses_pagos', repasses_pagos,
      'parcelas', parcelas, 'parcelas_pagas', parcelas_pagas, 'situacao', situacao
    ) ORDER BY data_venda DESC) FROM filtradas), '[]'::jsonb),
    (SELECT jsonb_build_object(
      'vendas', count(*),
      'vgv', round(COALESCE(sum(vgv), 0), 2),
      'comissao_bruta', round(COALESCE(sum(comissao_bruta), 0), 2),
      'imposto', round(COALESCE(sum(imposto_valor), 0), 2),
      'comissao_liquida', round(COALESCE(sum(comissao_liquida), 0), 2),
      'recebido', round(COALESCE(sum(valor_recebido), 0), 2),
      -- A RECEBER é a BRUTA menos o que já entrou: com parcela, uma venda
      -- pela metade deve só a outra metade.
      'a_receber', round(COALESCE(sum(comissao_bruta - COALESCE(valor_recebido, 0))
                                  FILTER (WHERE recebido_em IS NULL), 0), 2),
      'divergentes', count(*) FILTER (WHERE status = 'divergente'),
      'sem_percentual', count(*) FILTER (WHERE comissao_pct = 0),
      'sem_repasse', count(*) FILTER (WHERE repasses = 0)
    ) FROM filtradas)
  INTO v_linhas, v_totais;

  RETURN jsonb_build_object('de', v_de, 'ate', v_ate, 'linhas', v_linhas, 'totais', v_totais);
END;
$function$;

-- ------------------------------------------------------------
-- 5. O detalhe traz as parcelas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venda_detalhe(p_venda_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venda public.vendas%ROWTYPE;
BEGIN
  SELECT * INTO v_venda FROM vendas WHERE id = p_venda_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.vendas_pode_editar(v_venda.tenant_id) THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'venda', to_jsonb(v_venda),
    'construtora', (SELECT nome FROM construtoras WHERE id = v_venda.construtora_id),
    'parcelas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'parcela', parcela, 'valor', valor, 'vencimento', vencimento,
        'pago_em', pago_em, 'valor_pago', valor_pago, 'status', status
      ) ORDER BY parcela)
      FROM lancamentos_financeiros
      WHERE tenant_id = v_venda.tenant_id AND origem = 'venda' AND origem_id = p_venda_id
        AND status <> 'cancelado'
    ), '[]'::jsonb),
    'repasses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'papel', papel, 'parte', nome, 'nivel', nivel,
        'percentual', pct, 'valor', valor, 'status', status, 'pago_em', pago_em
      ) ORDER BY valor DESC) FROM venda_repasses WHERE venda_id = p_venda_id
    ), '[]'::jsonb),
    'historico', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'campo', h.campo, 'de', h.de, 'para', h.para,
        'justificativa', h.justificativa, 'em', h.em,
        'autor', COALESCE(u.email, 'sistema')
      ) ORDER BY h.em DESC)
      FROM venda_historico h
      LEFT JOIN auth.users u ON u.id = h.por
      WHERE h.venda_id = p_venda_id
    ), '[]'::jsonb)
  );
END;
$function$;

-- ------------------------------------------------------------
-- 6. Grants
-- ------------------------------------------------------------
DO $do$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.venda_criar(uuid, date, text, uuid, uuid, text, text, numeric, numeric, jsonb)',
    'public.venda_gravar_nf(uuid, text, date, text, text)',
    'public.vendas_conferencia(uuid, date, date, text, uuid, uuid, uuid, text, uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$do$;

NOTIFY pgrst, 'reload schema';

COMMIT;
