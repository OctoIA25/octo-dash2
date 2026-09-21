-- ============================================================
-- P3.5 · Aba Campanhas + ROI
-- ============================================================
-- MEDIDO NA CONTA REAL DA LOTUS ANTES DE ESCREVER, em 21/09/2026, pelo
-- próprio Gerenciador de Anúncios:
--
--   [RESERVA CASTANHEIRA]    R$ 1.959,79   124 leads   R$ 15,80/lead
--   [LEAD] Entrada e Médio   R$   847,40    60 leads   R$ 14,12/lead
--   [LEAD] Alto Padrão       R$   405,87    19 leads   R$ 21,36/lead
--   [RECRUTAMENTO] Corretores R$  120,58     0 leads   (18 conversas)
--   ------------------------------------------------------------
--   TOTAL setembro           R$ 3.333,64   203 leads
--
-- DUAS COISAS QUE ISSO MUDA NO QUE O PLANO PEDE:
--
-- 1. DUAS DAS QUATRO CAMPANHAS NÃO TÊM FORMULÁRIO. "[LEAD] Alto Padrão" e
--    "[LEAD] Entrada e Médio" otimizam para `onsite_conversion.messaging_
--    conversation_started_7d` — são clique-para-WhatsApp. O lead chega pela
--    conversa, sem `leadgen_id` e sem formulário, então o encanamento do P2.7
--    (que casa por `meta_form_id`) não as alcança. São R$ 1.253,27 por mês,
--    38% do gasto. Elas aparecem na tela assim mesmo, marcadas: esconder 38%
--    do gasto faria o total não bater com o Gerenciador — que é justamente o
--    critério de pronto do item.
--
-- 2. NÃO HÁ COMO CALCULAR ROI. `commercial_sales` tem 45 colunas e NENHUMA
--    liga a venda ao lead (isso é o P4.4). CAC = gasto ÷ vendas e ROAS =
--    comissão ÷ gasto não são calculáveis hoje. A tela mostra o que existe —
--    gasto, leads, custo por lead, custo por qualificado — e diz, no lugar do
--    ROI, o que falta para ele existir.

-- ------------------------------------------------------------
-- 1. De qual conta de anúncios é este tenant
-- ------------------------------------------------------------
-- A config do P2.7 guarda a página do Facebook, que é o que o webhook de Lead
-- Ads usa. Insights são da CONTA DE ANÚNCIOS, que é outro identificador — uma
-- página pode ser anunciada por várias contas e vice-versa.
ALTER TABLE public.tenant_meta_leadgen_config
  ADD COLUMN IF NOT EXISTS ad_account_id text;

COMMENT ON COLUMN public.tenant_meta_leadgen_config.ad_account_id IS
  'Conta de anúncios da Meta, só dígitos (o prefixo act_ é acrescentado na chamada). Ex.: 1213977450907753.';

-- ------------------------------------------------------------
-- 2. O gasto, dia a dia, por anúncio
-- ------------------------------------------------------------
-- Guardado, e não buscado a cada abertura de tela: decidido com o chefe em
-- 21/09 que quem busca é o servidor da Dash (e não o n8n). Mas buscar ao vivo
-- sem guardar faria a tela sumir toda vez que a Meta oscilasse, e ficar lenta
-- sempre. Guardando, a tela responde na hora e diz de quando é o número.
--
-- Granularidade de ANÚNCIO e não de campanha: é o menor grão que a Meta
-- entrega com `level=ad`, e dele se soma para conjunto e campanha. O contrário
-- não existe — de campanha não se desce para anúncio.
CREATE TABLE IF NOT EXISTS public.meta_insights_diarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  data date NOT NULL,
  campaign_id text NOT NULL,
  campaign_nome text NOT NULL DEFAULT '',
  adset_id text,
  adset_nome text NOT NULL DEFAULT '',
  ad_id text NOT NULL,
  ad_nome text NOT NULL DEFAULT '',
  objetivo text NOT NULL DEFAULT '',
  -- O QUE A META CONTA COMO RESULTADO desta campanha. É o campo que separa a
  -- campanha de formulário ('actions:lead') da de clique-para-WhatsApp
  -- ('actions:onsite_conversion.messaging_conversation_started_7d'), e por
  -- isso decide se dá para atribuir lead a lead.
  resultado_indicador text NOT NULL DEFAULT '',
  resultados numeric NOT NULL DEFAULT 0,
  gasto numeric NOT NULL DEFAULT 0,
  impressoes bigint NOT NULL DEFAULT 0,
  cliques bigint NOT NULL DEFAULT 0,
  -- CTR, CPC e CPM vêm da Meta para o dia. NÃO são somáveis: o CPC de um mês é
  -- o gasto do mês dividido pelos cliques do mês, não a média dos CPCs
  -- diários. Guardados para conferência dia a dia; o agregado é recalculado.
  ctr numeric,
  cpc numeric,
  cpm numeric,
  leads_meta integer NOT NULL DEFAULT 0,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_insights_gasto_nao_negativo CHECK (gasto >= 0)
);

-- A Meta REGRAVA números dos últimos dias (atribuição chega atrasada), então a
-- sincronização é sempre um upsert sobre esta chave. Sem ela, rodar duas vezes
-- dobraria o gasto do mês.
CREATE UNIQUE INDEX IF NOT EXISTS meta_insights_diarios_chave
  ON public.meta_insights_diarios (tenant_id, data, ad_id);

CREATE INDEX IF NOT EXISTS meta_insights_diarios_periodo_idx
  ON public.meta_insights_diarios (tenant_id, data, campaign_id);

REVOKE ALL ON public.meta_insights_diarios FROM anon, authenticated;
GRANT SELECT ON public.meta_insights_diarios TO authenticated;
GRANT ALL ON public.meta_insights_diarios TO service_role;

ALTER TABLE public.meta_insights_diarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meta_insights_diarios_select ON public.meta_insights_diarios;
CREATE POLICY meta_insights_diarios_select ON public.meta_insights_diarios
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- Escrita só pelo servidor: quem grava é a sincronização, e um número de gasto
-- editável pela tela deixaria de bater com o Gerenciador no primeiro dedo.

-- ------------------------------------------------------------
-- 3. As etapas que contam como "chegou em Visita agendada"
-- ------------------------------------------------------------
-- O lead que avançou para Proposta JÁ PASSOU por Visita agendada, e o status
-- guarda só onde ele está agora. Contar apenas quem está parado em "Visita
-- Agendada" chamaria de não qualificado justamente quem foi mais longe.
CREATE OR REPLACE FUNCTION public.etapas_da_visita_em_diante()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT ARRAY[
    'Visita Agendada', 'Visita Realizada', 'Negociação',
    'Proposta Criada', 'Proposta Enviada', 'Proposta Assinada'
  ];
$function$;

-- ------------------------------------------------------------
-- 4. O resultado por campanha
-- ------------------------------------------------------------
-- Cruza o gasto da Meta com os leads da Dash pelo `meta_campaign_id`.
--
-- NÃO calcula o score aqui. O score do P1.7 é calculado no front, a partir dos
-- sinais e dos pesos do tenant; refazer a conta em SQL daria DUAS fontes para
-- o mesmo número, e elas divergiriam na primeira correção de peso. Esta função
-- devolve os ids dos leads de cada campanha, e quem soma "score ≥ limiar" é a
-- mesma função que a lista de leads já usa.
CREATE OR REPLACE FUNCTION public.campanhas_resultado(
  p_tenant_id uuid,
  p_de        date DEFAULT NULL,
  p_ate       date DEFAULT NULL
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
  v_campanhas jsonb;
  v_totais jsonb;
  v_vendas jsonb;
  v_atualizado timestamptz;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN NULL; END IF;

  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN NULL;
  END IF;

  SELECT max(sincronizado_em) INTO v_atualizado
    FROM meta_insights_diarios
   WHERE tenant_id = p_tenant_id AND data >= v_de AND data <= v_ate;

  WITH gasto AS (
    SELECT campaign_id,
           max(campaign_nome) AS campaign_nome,
           max(objetivo) AS objetivo,
           max(resultado_indicador) AS resultado_indicador,
           sum(gasto) AS gasto,
           sum(impressoes) AS impressoes,
           sum(cliques) AS cliques,
           sum(leads_meta) AS leads_meta,
           sum(resultados) AS resultados,
           count(DISTINCT ad_id) AS anuncios
      FROM meta_insights_diarios
     WHERE tenant_id = p_tenant_id AND data >= v_de AND data <= v_ate
     GROUP BY campaign_id
  ),
  -- Os leads que a Dash conseguiu amarrar à campanha. A data é a de criação do
  -- lead, no mesmo fuso do resto do sistema.
  leads_da_campanha AS (
    SELECT l.meta_campaign_id AS campaign_id,
           count(*) AS leads_dash,
           count(*) FILTER (
             WHERE l.status = ANY (public.etapas_da_visita_em_diante())
           ) AS chegou_visita,
           -- Os ids vão para o front calcular o score com a MESMA conta da
           -- lista de leads. Limitados: um payload sem teto viraria uma
           -- resposta de megabytes num mês de campanha grande.
           (array_agg(l.id::text ORDER BY l.created_at DESC))[1:500] AS lead_ids,
           -- Quais deles JÁ passaram da visita. O front soma estes com os que
           -- o score qualificar, sem contar ninguém duas vezes — e sem
           -- precisar de uma segunda consulta por lead.
           (array_agg(l.id::text) FILTER (
             WHERE l.status = ANY (public.etapas_da_visita_em_diante())
           ))[1:500] AS lead_ids_visita
      FROM leads l
     WHERE l.tenant_id = p_tenant_id
       AND l.meta_campaign_id IS NOT NULL
       AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= v_de
       AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= v_ate
     GROUP BY l.meta_campaign_id
  ),
  -- P4.4 — AS VENDAS QUE FECHARAM NO PERÍODO, pela campanha do lead de origem.
  --
  -- Por data da VENDA, e não pela data do lead: é a leitura que todo gerenciador
  -- de anúncio usa, e a única que o chefe consegue comparar com o que vê na
  -- Meta. Ela mistura janelas de propósito — medido em produção em 21/09, a
  -- mediana entre o lead chegar e a proposta ser assinada é de 52 dias (de 9 a
  -- 107). A tela diz isso em letras, para ninguém ler o mês como se o anúncio
  -- do mês tivesse pago a venda do mês.
  vendas_da_campanha AS (
    SELECT l.meta_campaign_id AS campaign_id,
           count(*) AS vendas,
           sum(v.vgv) AS vgv,
           sum(v.comissao_liquida) AS comissao_liquida
      FROM vendas v
      JOIN leads l ON l.id = v.lead_id AND l.tenant_id = v.tenant_id
     WHERE v.tenant_id = p_tenant_id
       AND v.data_venda >= v_de AND v.data_venda <= v_ate
       AND l.meta_campaign_id IS NOT NULL
     GROUP BY l.meta_campaign_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'campaign_id', g.campaign_id,
           'campaign_nome', g.campaign_nome,
           'objetivo', g.objetivo,
           'resultado_indicador', g.resultado_indicador,
           -- Campanha de formulário entrega `actions:lead`; a de
           -- clique-para-WhatsApp entrega conversa iniciada, e o lead chega
           -- sem nada que o ligue ao anúncio.
           'atribuivel', g.resultado_indicador = 'actions:lead',
           'anuncios', g.anuncios,
           'gasto', round(g.gasto, 2),
           'impressoes', g.impressoes,
           'cliques', g.cliques,
           -- RECALCULADOS a partir dos totais. Somar CPCs diários daria a
           -- média das médias, que não é o custo por clique do período.
           'ctr', CASE WHEN g.impressoes > 0 THEN round(100.0 * g.cliques / g.impressoes, 2) END,
           'cpc', CASE WHEN g.cliques > 0 THEN round(g.gasto / g.cliques, 2) END,
           'cpm', CASE WHEN g.impressoes > 0 THEN round(1000.0 * g.gasto / g.impressoes, 2) END,
           'leads_meta', g.leads_meta,
           'resultados', g.resultados,
           'custo_por_lead_meta', CASE WHEN g.leads_meta > 0 THEN round(g.gasto / g.leads_meta, 2) END,
           'leads_dash', COALESCE(l.leads_dash, 0),
           'chegou_visita', COALESCE(l.chegou_visita, 0),
           'custo_por_lead_dash', CASE WHEN COALESCE(l.leads_dash, 0) > 0
                                       THEN round(g.gasto / l.leads_dash, 2) END,
           'lead_ids', COALESCE(to_jsonb(l.lead_ids), '[]'::jsonb),
           'lead_ids_visita', COALESCE(to_jsonb(l.lead_ids_visita), '[]'::jsonb),
           'vendas', COALESCE(vd.vendas, 0),
           'vgv', round(COALESCE(vd.vgv, 0), 2),
           'comissao_liquida', round(COALESCE(vd.comissao_liquida, 0), 2),
           -- CAC e ROAS por campanha, das mesmas somas — e NULOS quando não há
           -- venda. Zero diria "custo zero por cliente", que é o contrário.
           'cac', CASE WHEN COALESCE(vd.vendas, 0) > 0 THEN round(g.gasto / vd.vendas, 2) END,
           'roas', CASE WHEN g.gasto > 0 AND COALESCE(vd.vendas, 0) > 0
                        THEN round(vd.comissao_liquida / g.gasto, 2) END
         ) ORDER BY g.gasto DESC), '[]'::jsonb)
    INTO v_campanhas
    FROM gasto g
    LEFT JOIN leads_da_campanha l ON l.campaign_id = g.campaign_id
    LEFT JOIN vendas_da_campanha vd ON vd.campaign_id = g.campaign_id;

  SELECT jsonb_build_object(
    'gasto', round(COALESCE(sum(gasto), 0), 2),
    'impressoes', COALESCE(sum(impressoes), 0),
    'cliques', COALESCE(sum(cliques), 0),
    'leads_meta', COALESCE(sum(leads_meta), 0),
    'campanhas', count(*),
    -- Quanto do gasto está em campanha que não dá para atribuir lead a lead.
    -- É o número que explica por que os leads da Dash não fecham com a Meta.
    'gasto_sem_atribuicao', round(COALESCE(sum(gasto) FILTER (
      WHERE resultado_indicador <> 'actions:lead'), 0), 2)
  ) INTO v_totais
  FROM (
    SELECT campaign_id, sum(gasto) AS gasto, sum(impressoes) AS impressoes,
           sum(cliques) AS cliques, sum(leads_meta) AS leads_meta,
           max(resultado_indicador) AS resultado_indicador
      FROM meta_insights_diarios
     WHERE tenant_id = p_tenant_id AND data >= v_de AND data <= v_ate
     GROUP BY campaign_id
  ) t;

  -- O ROI do período e, ao lado dele, O TAMANHO DO QUE NÃO ENTROU NA CONTA.
  -- Uma venda só é atribuível quando tem lead E o lead tem campanha; medido em
  -- produção em 21/09, 30 das 61 propostas assinadas com valor não têm lead
  -- nenhum. Sem este número ao lado, um ROAS baixo seria lido como campanha
  -- ruim quando é metade das vendas faltando na conta.
  SELECT jsonb_build_object(
    'vendas', count(*),
    'atribuidas', count(*) FILTER (WHERE l.meta_campaign_id IS NOT NULL),
    'sem_lead', count(*) FILTER (WHERE v.lead_id IS NULL),
    'sem_campanha', count(*) FILTER (WHERE v.lead_id IS NOT NULL AND l.meta_campaign_id IS NULL),
    'comissao_liquida', round(COALESCE(sum(v.comissao_liquida) FILTER (
      WHERE l.meta_campaign_id IS NOT NULL), 0), 2),
    'vgv', round(COALESCE(sum(v.vgv) FILTER (WHERE l.meta_campaign_id IS NOT NULL), 0), 2)
  ) INTO v_vendas
  FROM vendas v
  LEFT JOIN leads l ON l.id = v.lead_id AND l.tenant_id = v.tenant_id
  WHERE v.tenant_id = p_tenant_id
    AND v.data_venda >= v_de AND v.data_venda <= v_ate;

  RETURN jsonb_build_object(
    'de', v_de,
    'ate', v_ate,
    'atualizado_em', v_atualizado,
    'campanhas', v_campanhas,
    'totais', v_totais,
    'vendas', v_vendas,
    -- Desde o P4.4 a venda nasce da proposta assinada e guarda o lead, então o
    -- ROI tem numerador. Continua condicionado: sem venda atribuída no período,
    -- a tela mostra o que falta em vez de um número que não significa nada.
    'roi_disponivel', (v_vendas->>'atribuidas')::int > 0,
    'roi_falta', CASE
      WHEN (v_vendas->>'vendas')::int = 0
        THEN 'Nenhuma venda foi registrada no período. A venda nasce quando a proposta entra em "Proposta Assinada".'
      ELSE 'Nenhuma das vendas do período pôde ser ligada a uma campanha — a venda precisa vir de um lead, e o lead precisa ter vindo de um anúncio de formulário.'
    END,
    -- Medido em produção em 21/09 sobre as 31 assinadas que têm lead.
    'ciclo_mediana_dias', 52
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.campanhas_resultado(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campanhas_resultado(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.etapas_da_visita_em_diante() TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5. Abrir a campanha em conjunto e anúncio
-- ------------------------------------------------------------
-- Função à parte, chamada só quando a pessoa abre a linha. Trazer o detalhe de
-- todas as campanhas junto com a lista deixaria a tela pesada para responder
-- uma pergunta que quase sempre não é feita.
--
-- O grão já está guardado: `meta_insights_diarios` é por ANÚNCIO. Isto só
-- agrupa de dois jeitos a partir do que já existe.
CREATE OR REPLACE FUNCTION public.campanha_detalhe(
  p_tenant_id   uuid,
  p_campaign_id text,
  p_de          date DEFAULT NULL,
  p_ate         date DEFAULT NULL
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
  v_conjuntos jsonb;
  v_anuncios jsonb;
BEGIN
  IF p_tenant_id IS NULL OR COALESCE(p_campaign_id, '') = '' THEN RETURN NULL; END IF;

  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN NULL;
  END IF;

  -- Mesma regra do agregado de campanha: CTR, CPC e CPM recalculados dos
  -- totais, nunca a média dos diários.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'adset_id', adset_id,
           'adset_nome', nome,
           'gasto', round(gasto, 2),
           'impressoes', impressoes,
           'cliques', cliques,
           'leads_meta', leads_meta,
           'ctr', CASE WHEN impressoes > 0 THEN round(100.0 * cliques / impressoes, 2) END,
           'cpc', CASE WHEN cliques > 0 THEN round(gasto / cliques, 2) END,
           'custo_por_lead', CASE WHEN leads_meta > 0 THEN round(gasto / leads_meta, 2) END
         ) ORDER BY gasto DESC), '[]'::jsonb) INTO v_conjuntos
  FROM (
    SELECT adset_id, max(adset_nome) AS nome, sum(gasto) AS gasto,
           sum(impressoes) AS impressoes, sum(cliques) AS cliques,
           sum(leads_meta) AS leads_meta
      FROM meta_insights_diarios
     WHERE tenant_id = p_tenant_id AND campaign_id = p_campaign_id
       AND data >= v_de AND data <= v_ate
     GROUP BY adset_id
  ) c;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'ad_id', ad_id,
           'ad_nome', nome,
           'adset_id', adset_id,
           'gasto', round(gasto, 2),
           'impressoes', impressoes,
           'cliques', cliques,
           'leads_meta', leads_meta,
           'ctr', CASE WHEN impressoes > 0 THEN round(100.0 * cliques / impressoes, 2) END,
           'cpc', CASE WHEN cliques > 0 THEN round(gasto / cliques, 2) END,
           'custo_por_lead', CASE WHEN leads_meta > 0 THEN round(gasto / leads_meta, 2) END
         ) ORDER BY gasto DESC), '[]'::jsonb) INTO v_anuncios
  FROM (
    SELECT ad_id, max(ad_nome) AS nome, max(adset_id) AS adset_id,
           sum(gasto) AS gasto, sum(impressoes) AS impressoes,
           sum(cliques) AS cliques, sum(leads_meta) AS leads_meta
      FROM meta_insights_diarios
     WHERE tenant_id = p_tenant_id AND campaign_id = p_campaign_id
       AND data >= v_de AND data <= v_ate
     GROUP BY ad_id
  ) a;

  RETURN jsonb_build_object(
    'campaign_id', p_campaign_id,
    'de', v_de, 'ate', v_ate,
    'conjuntos', v_conjuntos,
    'anuncios', v_anuncios
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.campanha_detalhe(uuid, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campanha_detalhe(uuid, text, date, date) TO authenticated, service_role;
