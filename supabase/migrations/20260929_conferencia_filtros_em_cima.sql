-- ============================================================
-- Conferência de vendas: os filtros em cima, e a planilha como ela é — 29/09
--
--   "conferência de vendas deixar os filtros em cima, como Corretor, Equipe,
--    Prontos / Lançamentos. Caso Lançamentos, abrir campo de construtoras e
--    empreendimento"
--   "retire Área m², R$/m², Total (-3%) ... em status adicione pago,
--    parcelado e pendente. Alguns estão zerados porque são parcelas dos que
--    estão acima ... o campo origem deve constar de onde veio o lead"
--
-- As duas funções da tela ganham os MESMOS filtros, porque a barra agora é
-- uma só para as duas abas (Planilha e CRM).
--
-- COMPATÍVEL COM A TELA QUE ESTÁ NO AR. Os parâmetros novos vêm no fim e com
-- DEFAULT NULL: o PostgREST aceita a chamada antiga, com menos argumentos
-- nomeados. Assim a migration pode subir ANTES do front — o contrário do que
-- deixou a tela do F.1 cinco dias chamando função que não existia.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. A PLANILHA
--
-- O que MUDA na resposta:
--   - saem `area_m2`, `valor_m2` e `valor_vgv` (o "Total (-3%)"), a pedido.
--     `total_vgv` sai junto; entra `total_unidade`, que é a coluna de valor
--     que ficou na tela. As parcelas têm Total Unidade zerado de propósito
--     ("não colocamos VGV para não constar duplicado"), então a soma não conta
--     a mesma venda duas vezes.
--   - entra `situacao`: pago / parcelado / pendente.
--   - `comissao_imobiliaria` passa a ser a da PLANILHA quando ela está legível.
--
-- Os filtros de equipe, tipo, construtora e empreendimento NÃO voltam como
-- colunas: o chefe pediu em 25/09 "só as informações da planilha", e filtro
-- não é informação na tela — é recorte.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.vendas_planilha_conferencia(uuid, date, date, text);

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
      c.situacao
    FROM classificadas c
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

COMMENT ON FUNCTION public.vendas_planilha_conferencia(uuid, date, date, text, uuid, text, uuid, uuid, text) IS
  'A planilha comercial na Conferencia de vendas: as colunas do arquivo do Drive (menos Area, R$/m2 e Total -3%, tiradas em 29/09), a situacao pago/parcelado/pendente lida da propria planilha, e os filtros de corretor, equipe, pronto/lancamento, construtora e empreendimento.';

-- `pg_default_acl` concede tudo a `anon` em relação nova, e função recriada
-- nasce com EXECUTE para PUBLIC.
REVOKE ALL ON FUNCTION public.vendas_planilha_conferencia(uuid, date, date, text, uuid, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_planilha_conferencia(uuid, date, date, text, uuid, text, uuid, uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2. O CRM
--
-- O corpo é o de 21/09, com três filtros a mais e a ORIGEM na linha.
--
-- ORIGEM é a fonte do lead ("Santa Angela", "ZAP Imóveis"): a do lead quando
-- a venda tem um, e senão a que a proposta copiou dele ao nascer. Proposta
-- criada à mão diz "Manual" — e é o que aparece, porque é o que se sabe.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.vendas_conferencia(uuid, date, date, text, uuid, uuid);

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
      'lead_id', lead_id, 'origem', origem,
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

REVOKE ALL ON FUNCTION public.vendas_conferencia(uuid, date, date, text, uuid, uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_conferencia(uuid, date, date, text, uuid, uuid, uuid, text, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. "RESERVA MARAJOARA II" é a fase II da "Reserva Marajoara"
--
-- Confirmado pelo chefe em 29/09, e já aplicado à venda do CRM
-- (20260929_castanheira_e_marajoara_voltam_para_a_santa_angela). O de-para de
-- nomes da planilha ficou para trás: sabia que é lançamento, não QUAL. Sem
-- isto, a venda some quando se filtra Lançamentos › Santa Ângela.
--
-- Só onde o vínculo está vazio: rodar de novo não mexe em nada.
-- ------------------------------------------------------------
UPDATE public.vendas_empreendimento_alias a
   SET lancamento_id = l.id,
       updated_at = now()
  FROM public.lancamentos l
 WHERE a.nome_bruto = 'RESERVA MARAJOARA II'
   AND a.lancamento_id IS NULL
   AND l.tenant_id = a.tenant_id
   AND public.normalizar_texto(l.nome) = 'reserva marajoara';

COMMIT;

-- O PostgREST guarda a assinatura das funções em cache. Sem isto, a chamada
-- nova bate na assinatura antiga e volta "function not found" — em silêncio,
-- como uma tela vazia.
NOTIFY pgrst, 'reload schema';
