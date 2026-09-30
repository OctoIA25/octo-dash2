-- ============================================================
-- O código do imóvel nas vendas de terceiros — 29/09
--
--   "Qd · Un - CÓDIGO: vamos adicionar código, para as vendas de terceiros"
--
-- Decidido com o chefe em 29/09: no CRM o código vem sozinho da proposta; na
-- aba Planilha ele é DIGITADO na Dash, porque o arquivo do Drive não tem
-- coluna de código.
--
-- ONDE O CÓDIGO DIGITADO FICA, e por que não em `commercial_sales`
--
-- `commercial_sales` é a cópia da planilha e é reescrita a cada "Reler". Pior:
-- a releitura casa as linhas pela POSIÇÃO no arquivo (`source_row_number`).
-- Uma linha inserida no meio do Drive faz cada id passar a guardar outra
-- venda — um código preso ao id mudaria de venda em silêncio.
--
-- Por isso a chave é a da VENDA: cliente, data de assinatura e empreendimento
-- (os três sem acento e sem caixa). É a mesma que junta a venda a prazo às
-- suas parcelas, então o código digitado numa linha vale para todas elas.
-- Se alguém corrigir o nome do cliente na planilha, o código se solta e a
-- célula volta vazia — nunca aparece o código de outra venda.
-- ponytail: dois imóveis de terceiros vendidos ao mesmo cliente no mesmo dia
-- dividiriam o código. Se acontecer, a chave ganha o valor da unidade.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.venda_planilha_codigo (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cliente_chave text NOT NULL,
  data_assinatura date NOT NULL,
  empreendimento_chave text NOT NULL,
  codigo text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid,
  CONSTRAINT venda_planilha_codigo_pk
    PRIMARY KEY (tenant_id, cliente_chave, data_assinatura, empreendimento_chave),
  -- Código vazio não é código: apagar é tirar a linha.
  CONSTRAINT venda_planilha_codigo_ck
    CHECK (btrim(codigo) <> '' AND length(codigo) <= 40)
);

COMMENT ON TABLE public.venda_planilha_codigo IS
  'Codigo do imovel das vendas de terceiros da planilha comercial, digitado na Conferencia. A chave e a venda (cliente + assinatura + empreendimento), nao o id da linha: a releitura da planilha casa linhas pela posicao no arquivo.';

-- Só as funções abaixo leem e escrevem. `pg_default_acl` daria tudo ao anon.
REVOKE ALL ON public.venda_planilha_codigo FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.venda_planilha_codigo TO service_role;
ALTER TABLE public.venda_planilha_codigo ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Gravar (ou apagar) o código de uma venda
--
-- Recebe o id da LINHA, porque é o que a tela tem, e acha a venda por ela.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.venda_planilha_gravar_codigo(
  p_venda_planilha_id uuid,
  p_codigo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linha public.commercial_sales%ROWTYPE;
  v_codigo text := NULLIF(btrim(p_codigo), '');
  v_cliente text;
  v_emp text;
BEGIN
  SELECT * INTO v_linha FROM public.commercial_sales cs WHERE cs.id = p_venda_planilha_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'venda nao encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.financeiro_pode_ver(v_linha.tenant_id) THEN
    RAISE EXCEPTION 'sem permissao para editar o codigo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_cliente := public.normalizar_texto(v_linha.cliente_nome);
  v_emp := public.normalizar_texto(v_linha.empreendimento);
  IF v_cliente = '' OR v_linha.data_assinatura IS NULL THEN
    RAISE EXCEPTION 'a venda precisa de cliente e data de assinatura na planilha para guardar o codigo'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_codigo IS NULL THEN
    DELETE FROM public.venda_planilha_codigo
     WHERE tenant_id = v_linha.tenant_id AND cliente_chave = v_cliente
       AND data_assinatura = v_linha.data_assinatura AND empreendimento_chave = v_emp;
    RETURN jsonb_build_object('ok', true, 'codigo', NULL);
  END IF;

  INSERT INTO public.venda_planilha_codigo
    (tenant_id, cliente_chave, data_assinatura, empreendimento_chave, codigo, atualizado_por)
  VALUES (v_linha.tenant_id, v_cliente, v_linha.data_assinatura, v_emp, v_codigo, auth.uid())
  ON CONFLICT (tenant_id, cliente_chave, data_assinatura, empreendimento_chave) DO UPDATE
    SET codigo = EXCLUDED.codigo, atualizado_em = now(), atualizado_por = auth.uid();

  RETURN jsonb_build_object('ok', true, 'codigo', v_codigo);
END;
$function$;

REVOKE ALL ON FUNCTION public.venda_planilha_gravar_codigo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venda_planilha_gravar_codigo(uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- As duas leituras da tela passam a devolver o código.
--
-- Mesma assinatura da migration anterior (20260929_conferencia_filtros_em_cima):
-- CREATE OR REPLACE mantém os grants, e a tela no ar só ganha chaves novas.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendas_planilha_conferencia(
  p_tenant_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL,
  p_corretor text DEFAULT NULL,
  p_equipe_id uuid DEFAULT NULL,
  p_tipo text DEFAULT NULL,           -- 'lancamento' | 'terceiros' (os prontos)
  p_construtora_id uuid DEFAULT NULL,
  p_lancamento_id uuid DEFAULT NULL,
  p_situacao text DEFAULT NULL        -- 'pago' | 'parcelado' | 'pendente'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  IF NOT public.financeiro_pode_ver(p_tenant_id) THEN
    RAISE EXCEPTION 'sem permissao para a conferencia de vendas'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH base AS (
    SELECT
      cs.*,
      COALESCE(cs.repasse_20,0) + COALESCE(cs.repasse_40,0)
        + COALESCE(cs.repasse_45,0) + COALESCE(cs.repasse_50,0) AS repasse_corretor,
      -- LANÇAMENTO OU PRONTO, e qual lançamento: do cadastro, porque a
      -- planilha não diz. O de-para de nomes manda; sem ele, o nome igual ao
      -- do cadastro de lançamentos.
      COALESCE(al.tipo, CASE WHEN lanc.id IS NOT NULL THEN 'lancamento' END) AS tipo_negocio,
      lanc.id AS lancamento_id,
      lanc.construtora_id
    FROM public.commercial_sales cs
    -- LATERAL com LIMIT 1: a chave do de-para é o nome BRUTO, então
    -- "Castanheira" e "CASTANHEIRA" podem coexistir e casar os dois com a
    -- mesma linha. Um JOIN solto duplicaria a venda — e o rodapé.
    LEFT JOIN LATERAL (
      SELECT a.tipo, a.lancamento_id
        FROM public.vendas_empreendimento_alias a
       WHERE a.tenant_id = cs.tenant_id
         AND public.normalizar_texto(a.nome_bruto) = public.normalizar_texto(cs.empreendimento)
       ORDER BY a.lancamento_id IS NULL, a.nome_bruto
       LIMIT 1
    ) al ON true
    LEFT JOIN LATERAL (
      SELECT l.id, l.construtora_id
        FROM public.lancamentos l
       WHERE l.tenant_id = cs.tenant_id
         AND (l.id = al.lancamento_id
              OR (al.lancamento_id IS NULL
                  AND public.normalizar_texto(l.nome) = public.normalizar_texto(cs.empreendimento)))
       LIMIT 1
    ) lanc ON true
   WHERE cs.tenant_id = p_tenant_id
     AND cs.is_active
     AND (p_de  IS NULL OR cs.data_assinatura >= p_de)
     AND (p_ate IS NULL OR cs.data_assinatura <= p_ate)
  ),
  classificadas AS (
    SELECT
      b.*,
      -- "Comissão Imobiliária" COMO A PLANILHA ESCREVEU, e a conta só quando
      -- a célula não é legível.
      --
      -- A conta (comissão − corretor − team leader) acerta a venda comum, e
      -- era a única saída enquanto a importação zera `valor_conta_japi`. Mas
      -- ela erra justamente as linhas que o chefe explicou em 29/09: a parcela
      -- tem comissão total ZERADA e repasse preenchido, e a conta dava
      -- −R$ 1.250,00 onde a planilha diz +R$ 1.250,00. Erra também a venda
      -- com parceiro (a parte da Japi não está em coluna nenhuma que a conta
      -- enxergue): R$ 44.375,00 onde a planilha diz R$ 21.875,00. Medido em
      -- produção: 8 das 37 linhas.
      --
      -- A célula é a posição 20 de `raw_row` — conferida nas 37 linhas, que
      -- batem com a conta no centavo em todas as vendas comuns.
      -- ponytail: posição fixa. Se a planilha ganhar ou perder uma coluna
      -- antes desta, a leitura desliza; por isso só vale célula que começa
      -- com "R$" — data, nome e vazio caem na conta. O certo é a importação
      -- gravar a coluna pelo cabeçalho, e aí esta leitura sai.
      COALESCE(
        CASE WHEN b.raw_row -> 'values' ->> 20 ~ '^\s*R\$\s*-?[0-9.]+(,[0-9]{1,2})?\s*$'
             THEN replace(regexp_replace(b.raw_row -> 'values' ->> 20, '[^0-9,-]', '', 'g'), ',', '.')::numeric
        END,
        COALESCE(b.comissao_total_venda,0) - b.repasse_corretor - COALESCE(b.team_leader_valor,0)
      ) AS comissao_imobiliaria,
      -- ============================================================
      -- PAGO / PARCELADO / PENDENTE, lido do que a planilha já diz.
      --
      -- Não é campo novo para alguém preencher: a planilha tem a data de
      -- recebimento e o "Status recebimento", e os três estados saem deles.
      -- Uma segunda fonte para a mesma resposta divergiria na primeira
      -- releitura do Drive.
      --
      --   PARCELADO  o texto diz ("PARCELADO", "1 de 5"), OU a linha é uma
      --              parcela — Total Unidade, Total (-3%) e Comissão Total
      --              zerados, mas repasse preenchido —, OU a venda tem parcelas
      --              abaixo dela (mesmo cliente, mesma data de assinatura).
      --              O repasse é o que separa parcela de linha em branco.
      --   PAGO       tem data de recebimento.
      --   PENDENTE   o resto: "A RECEBER", "Pendente", "ver na Caixa".
      -- ============================================================
      CASE
        WHEN b.observacoes ~* '(parcelad|\m[0-9]+ de [0-9]+\M)' THEN 'parcelado'
        WHEN COALESCE(b.total_unidade,0) = 0 AND COALESCE(b.valor_vgv,0) = 0
             AND COALESCE(b.comissao_total_venda,0) = 0 AND b.repasse_corretor > 0 THEN 'parcelado'
        WHEN public.normalizar_texto(b.cliente_nome) <> '' AND EXISTS (
          SELECT 1 FROM public.commercial_sales p
           WHERE p.tenant_id = b.tenant_id
             AND p.is_active
             AND p.id <> b.id
             AND p.data_assinatura IS NOT DISTINCT FROM b.data_assinatura
             AND public.normalizar_texto(p.cliente_nome) = public.normalizar_texto(b.cliente_nome)
             AND COALESCE(p.total_unidade,0) = 0 AND COALESCE(p.valor_vgv,0) = 0
             AND COALESCE(p.comissao_total_venda,0) = 0
             AND COALESCE(p.repasse_20,0) + COALESCE(p.repasse_40,0)
                 + COALESCE(p.repasse_45,0) + COALESCE(p.repasse_50,0) > 0) THEN 'parcelado'
        WHEN b.data_recebimento IS NOT NULL THEN 'pago'
        ELSE 'pendente'
      END AS situacao
    FROM base b
  ),
  linhas AS (
    SELECT
      c.id,
      -- AS COLUNAS DA PLANILHA DO DRIVE, na ordem dela, menos as três que o
      -- chefe tirou em 29/09 (Área M², R$ M², Total (-3%)).
      c.empreendimento,
      NULLIF(btrim(COALESCE(c.quadra, '') || CASE WHEN COALESCE(c.unidade,'') <> ''
                                                  THEN ' · ' || c.unidade ELSE '' END), '') AS unidade_codigo,
      -- "De onde veio o lead" — Santa, Dejoy, Permuta. Já é o que a coluna
      -- da planilha guarda; vai como foi escrito.
      c.origem,
      c.total_unidade,           -- "Total Unidade"
      c.comissao_total_venda,    -- "Comissão Total"
      c.cliente_nome,
      c.corretor_nome,
      c.tipo AS nivel_corretor,  -- "Tipo": o nível do corretor (PL, Tropa, TL…)
      c.repasse_corretor,        -- os quatro percentuais: cada venda usa um só
      c.team_leader_valor,       -- "Team Leader": é VALOR, não nome
      c.comissao_imobiliaria,
      c.data_assinatura,
      c.data_recebimento,
      c.observacoes AS status_recebimento,  -- o texto livre, que continua na tela
      c.situacao,
      -- 29/09: é o tipo que diz à tela onde vai o código. Lançamento mostra
      -- Qd · Un; o resto (terceiros e o que ninguém classificou, como a
      -- PARCERIA) mostra o código do imóvel, digitado na Dash.
      c.tipo_negocio,
      cod.codigo AS codigo_imovel
    FROM classificadas c
    -- O código é da VENDA, não da linha: as parcelas herdam o da cabeça.
    -- A chave é a mesma que identifica a venda a prazo lá em cima.
    LEFT JOIN public.venda_planilha_codigo cod
           ON cod.tenant_id = c.tenant_id
          AND cod.cliente_chave = public.normalizar_texto(c.cliente_nome)
          AND cod.data_assinatura = c.data_assinatura
          AND cod.empreendimento_chave = public.normalizar_texto(c.empreendimento)
   WHERE (NULLIF(p_corretor, '') IS NULL
          OR public.normalizar_texto(c.corretor_nome) = public.normalizar_texto(p_corretor))
     -- EQUIPE: a de hoje de quem recebe a venda. O corretor da planilha é
     -- texto, e é o de-para (`corretores_da_venda`) que diz quem ele é; a
     -- venda a quatro mãos entra na equipe de qualquer um dos dois.
     -- Ex-membro não tem equipe, e some deste recorte — só dele.
     AND (p_equipe_id IS NULL OR EXISTS (
          SELECT 1
            FROM public.corretores_da_venda(p_tenant_id, c.corretor_nome) d
            JOIN public.tenant_memberships tm
              ON tm.tenant_id = p_tenant_id AND tm.user_id = d.user_id
           WHERE tm.team_id = p_equipe_id))
     AND (NULLIF(p_tipo, '') IS NULL OR c.tipo_negocio = p_tipo)
     AND (p_construtora_id IS NULL OR c.construtora_id = p_construtora_id)
     AND (p_lancamento_id IS NULL OR c.lancamento_id = p_lancamento_id)
     AND (NULLIF(p_situacao, '') IS NULL OR c.situacao = p_situacao)
  )
  SELECT jsonb_build_object(
    'linhas', COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.data_assinatura DESC NULLS LAST), '[]'::jsonb),
    'total_linhas', count(*),
    'total_unidade', COALESCE(sum(l.total_unidade), 0),
    'total_comissao', COALESCE(sum(l.comissao_total_venda), 0),
    'total_imobiliaria', COALESCE(sum(l.comissao_imobiliaria), 0),
    'total_recebido', COALESCE(sum(l.comissao_total_venda) FILTER (WHERE l.data_recebimento IS NOT NULL), 0)
  ) INTO v_resultado
  FROM linhas l;

  RETURN v_resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vendas_conferencia(
  p_tenant_id uuid,
  p_de        date DEFAULT NULL,
  p_ate       date DEFAULT NULL,
  p_status    text DEFAULT NULL,
  p_construtora_id uuid DEFAULT NULL,
  p_corretor_id uuid DEFAULT NULL,
  p_equipe_id uuid DEFAULT NULL,
  p_tipo      text DEFAULT NULL,       -- 'lancamento' | 'terceiros'
  p_lancamento_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_de date := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate date := COALESCE(p_ate, v_hoje);
  v_linhas jsonb;
  v_totais jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT public.is_tenant_admin_or_owner(p_tenant_id)
  THEN
    RETURN NULL;
  END IF;

  WITH filtradas AS (
    SELECT v.*, c.nome AS construtora_nome,
           COALESCE(NULLIF(btrim(ld.source), ''), NULLIF(btrim(pr.origin), '')) AS origem,
           -- QD · UN / CÓDIGO, da proposta. Lançamento: a unidade que o
           -- forecast gravou ("B-27"). Terceiros: o código do imóvel, que a
           -- proposta copia do lead ao nascer. "Imóvel da carteira" e "Sem
           -- imóvel" são o texto que a tela da proposta põe quando não há
           -- código — não são código, e viram vazio.
           CASE WHEN v.tipo = 'lancamento' THEN NULLIF(btrim(pr.forecast_unidade), '')
                WHEN public.normalizar_texto(pr.property_reference) IN ('', 'imovel da carteira', 'sem imovel') THEN NULL
                ELSE btrim(pr.property_reference)
           END AS codigo,
           (SELECT count(*) FROM venda_repasses r WHERE r.venda_id = v.id) AS repasses,
           (SELECT count(*) FROM venda_repasses r WHERE r.venda_id = v.id AND r.status = 'pago') AS repasses_pagos
      FROM vendas v
      LEFT JOIN construtoras c ON c.id = v.construtora_id
      LEFT JOIN leads ld ON ld.id = v.lead_id AND ld.tenant_id = v.tenant_id
      LEFT JOIN proposals pr ON pr.id = v.proposta_id
     WHERE v.tenant_id = p_tenant_id
       AND v.data_venda >= v_de AND v.data_venda <= v_ate
       AND (p_status IS NULL OR p_status = '' OR v.status = p_status)
       AND (p_construtora_id IS NULL OR v.construtora_id = p_construtora_id)
       AND (p_corretor_id IS NULL OR v.corretor_id = p_corretor_id)
       -- A equipe de HOJE do corretor, a mesma regra da aba Planilha.
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
      'lead_id', lead_id, 'origem', origem, 'codigo', codigo,
      'vgv', vgv, 'comissao_pct', comissao_pct, 'comissao_bruta', comissao_bruta,
      'imposto_pct', imposto_pct, 'imposto_valor', imposto_valor,
      'comissao_liquida', comissao_liquida, 'comissao_da_proposta', comissao_da_proposta,
      'nf_numero', nf_numero, 'nf_data', nf_data,
      'recebimento_previsto_em', recebimento_previsto_em,
      'recebido_em', recebido_em, 'valor_recebido', valor_recebido, 'diferenca', diferenca,
      'status', status, 'repasses', repasses, 'repasses_pagos', repasses_pagos
    ) ORDER BY data_venda DESC) FROM filtradas), '[]'::jsonb),
    (SELECT jsonb_build_object(
      'vendas', count(*),
      'vgv', round(COALESCE(sum(vgv), 0), 2),
      'comissao_bruta', round(COALESCE(sum(comissao_bruta), 0), 2),
      'imposto', round(COALESCE(sum(imposto_valor), 0), 2),
      'comissao_liquida', round(COALESCE(sum(comissao_liquida), 0), 2),
      'recebido', round(COALESCE(sum(valor_recebido), 0), 2),
      -- A RECEBER é a BRUTA: é o que a construtora ainda vai depositar.
      'a_receber', round(COALESCE(sum(comissao_bruta) FILTER (WHERE recebido_em IS NULL), 0), 2),
      'divergentes', count(*) FILTER (WHERE status = 'divergente'),
      -- Quantas ainda não têm percentual: nasceram sem construtora casada, e
      -- a comissão delas é zero até alguém resolver.
      'sem_percentual', count(*) FILTER (WHERE comissao_pct = 0),
      'sem_repasse', count(*) FILTER (WHERE repasses = 0)
    ) FROM filtradas)
  INTO v_linhas, v_totais;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'linhas', v_linhas,
    'totais', v_totais
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
