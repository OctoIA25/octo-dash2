-- ============================================================
-- A tela de Formulários da Meta passa a conferir os dois lados (item 6)
--
-- O pedido do chefe, marcado como prioridade: *"todos os leads que vêm do Meta
-- têm que migrar para a Dash, e esta tela precisa mostrar isso, ou alertar em
-- caso de divergências"*.
--
-- Hoje a tela mostra **um lado só**: `leads_na_base` é contagem da Dash contra
-- nada. Não existe, em lugar nenhum dela, o número da Meta.
--
-- ============================================================
-- O NÚMERO DA META JÁ CHEGA — E É JOGADO FORA
-- ============================================================
--
-- `graphClient.fetchForms()` pede à Meta os campos
-- `id,name,status,leads_count`. A resposta vem com os quatro. E o upsert de
-- `formRoutes.js` grava três coisas: nome, page_id e a hora. `leads_count` e
-- `status` são descartados na própria linha em que chegam.
--
-- Então o conserto mais caro deste item não é buscar dado novo: é parar de
-- descartar o que já se paga para receber.
--
-- ============================================================
-- POR QUE ESTA CONTAGEM PODE SER COLUNA, SE A OUTRA NÃO PODE
-- ============================================================
--
-- O cabeçalho da migração original diz, com razão: *"`leads_na_base` NÃO vira
-- coluna: é contagem de `leads`, e coluna copiada de contagem envelhece
-- calada"*. A regra vale e continua valendo.
--
-- `leads_na_meta` é outra coisa: o dado mora fora, num sistema que só responde
-- quando alguém pergunta. Não dá para contar na hora — dá para guardar a
-- última resposta. E é por isso que vem junto `leads_na_meta_em`: sem a hora,
-- a tela mostraria um número velho com cara de número atual, que é exatamente
-- o envelhecimento calado que a regra quer evitar. Com a hora, a tela diz
-- "medido há três dias" e quem lê decide.
--
-- ============================================================
-- A ARMADILHA DA COMPARAÇÃO — E POR QUE ELA NÃO VIRA ALERTA
-- ============================================================
--
-- `leads_count` da Meta é o total **da vida inteira do formulário**. Os nossos
-- começam no dia em que a integração entrou no ar. Um formulário que rodou
-- seis meses antes disso mostra uma diferença enorme que **não é perda**: é
-- história anterior, e boa parte dela nem dá para buscar (a Meta guarda 90
-- dias).
--
-- Transformar essa diferença em alerta vermelho treinaria a equipe a ignorar
-- o vermelho em duas semanas. Então ela sai como **número, com a data ao
-- lado**, e quem alerta é outra coisa:
--
--   **os eventos parados na fila.** A Meta avisou, gravamos o aviso, e o lead
--   não chegou a existir. Esse é inequívoco: não tem explicação inocente, não
--   depende de quando a integração começou, e é exatamente "o lead não migrou
--   para a Dash". É o alerta.
--
-- ============================================================
-- E O QUE ESTA TELA NÃO ENXERGA, DITO NA PRÓPRIA TELA
-- ============================================================
--
-- Medido na conta da Lotus em 23/09, de 08/09 a 23/09: quatro campanhas
-- ativas, R$ 4.148,77. Só UMA gera formulário (146 leads, R$ 2.246). As
-- outras três são clique-para-WhatsApp: 154 conversas iniciadas por anúncio,
-- **R$ 1.902 — 46% do gasto** — que não passam por formulário nenhum e, por
-- isso, não aparecem nesta tela de jeito algum.
--
-- Uma conferência que olhasse só formulário diria "está tudo certo" e estaria
-- cega para a metade mais cara. Por isso o contador `campanhas_sem_formulario`
-- sai junto: a tela precisa dizer o que ela NÃO sabe.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. As colunas que faltavam
-- ------------------------------------------------------------
ALTER TABLE public.meta_formularios
  ADD COLUMN IF NOT EXISTS leads_na_meta    integer,
  ADD COLUMN IF NOT EXISTS leads_na_meta_em timestamptz,
  -- `status` também vinha e era descartado. Um formulário ARCHIVED na Meta
  -- que continua com a captação ligada aqui é uma pergunta que vale aparecer.
  ADD COLUMN IF NOT EXISTS status_na_meta   text;

COMMENT ON COLUMN public.meta_formularios.leads_na_meta IS
  'leads_count da Meta: total da VIDA INTEIRA do formulário, não do período. Comparar com leads_na_base sem lembrar disso acusa perda onde há só história anterior à integração.';
COMMENT ON COLUMN public.meta_formularios.leads_na_meta_em IS
  'Quando este número foi lido da Meta. Sem ele, um número de semanas atrás teria cara de número de agora.';

-- ------------------------------------------------------------
-- 2. O painel passa a devolver os dois lados
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meta_formularios_painel(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_linhas jsonb;
  v_contadores jsonb;
  v_sem_form integer;
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

  -- Quantas campanhas dos últimos 30 dias entregam por CONVERSA e não por
  -- formulário. É o que esta tela não alcança, e o número existe para ela
  -- poder dizer isso em vez de dar a entender que cobre tudo.
  SELECT count(DISTINCT campaign_id) INTO v_sem_form
    FROM meta_insights_diarios
   WHERE tenant_id = p_tenant_id
     AND data >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 30
     AND resultado_indicador IS NOT NULL
     AND resultado_indicador NOT IN ('actions:lead', 'lead');

  WITH por_form AS (
    SELECT l.meta_form_id AS form_id,
           count(*) AS leads,
           count(*) FILTER (WHERE l.created_at >= now() - interval '24 hours') AS novos_24h,
           max(l.created_at) AS ultimo,
           count(*) FILTER (WHERE l.meta_campaign_id IS NULL) AS sem_campanha
      FROM leads l
     WHERE l.tenant_id = p_tenant_id AND l.meta_form_id IS NOT NULL
     GROUP BY 1
  ),
  -- A FILA. Um evento `failed`, ou `pending` de horas atrás, é a Meta tendo
  -- avisado e o lead não existindo — a única divergência sem explicação
  -- inocente, e por isso a que vira alerta.
  fila AS (
    SELECT e.form_id,
           count(*) FILTER (WHERE e.status = 'failed') AS travados,
           count(*) FILTER (WHERE e.status = 'pending'
                              AND e.created_at < now() - interval '1 hour') AS parados,
           max(e.last_error) FILTER (WHERE e.status = 'failed') AS ultimo_erro
      FROM meta_leadgen_events e
     -- `meta_leadgen_events.tenant_id` é TEXTO, não uuid — é uma das sete
     -- tabelas de integração que nasceram assim. Sem o cast, o Postgres
     -- recusa: "operator does not exist: text = uuid".
     --
     -- A comparação é como texto normalizado, e não `e.tenant_id::uuid`: o
     -- cast para uuid ESTOURA a consulta inteira se um dia entrar um valor
     -- malformado por ali, e derrubar o painel por causa de uma linha ruim é
     -- pior do que ignorá-la. Conferido em produção: 163 eventos, todos já
     -- em minúsculas e sem espaço.
     WHERE lower(btrim(e.tenant_id)) = p_tenant_id::text
       AND e.form_id IS NOT NULL
     GROUP BY 1
  ),
  linhas AS (
    SELECT
      f.form_id,
      f.nome,
      f.page_id,
      f.captacao_ativa,
      f.lia_atende,
      f.baixado_ate,
      f.sincronizado_em,
      COALESCE(p.leads, 0)     AS leads_na_base,
      COALESCE(p.novos_24h, 0) AS novos_24h,
      COALESCE(p.sem_campanha, 0) AS sem_campanha,
      p.ultimo                 AS ultimo_lead_em,
      la.codigo                AS empreendimento_codigo,
      CASE WHEN la.codigo IS NULL THEN 'pega_tudo' ELSE 'lancamento' END AS destino,

      -- Os dois lados, lado a lado.
      f.leads_na_meta,
      f.leads_na_meta_em,
      f.status_na_meta,
      -- A diferença SEM `max(0, …)`: o outro sentido (a Dash com mais que a
      -- Meta) também é sintoma — de duplicata, ou de importação manual — e
      -- esconder metade dos casos é como a conferência da aba Campanhas
      -- deixava de contar os que mais interessavam.
      CASE WHEN f.leads_na_meta IS NULL THEN NULL
           ELSE f.leads_na_meta - COALESCE(p.leads, 0) END AS diferenca,

      COALESCE(fl.travados, 0) AS eventos_travados,
      COALESCE(fl.parados, 0)  AS eventos_parados,
      fl.ultimo_erro
    FROM meta_formularios f
    LEFT JOIN por_form p ON p.form_id = f.form_id
    LEFT JOIN fila fl ON fl.form_id = f.form_id
    LEFT JOIN lancamento_anuncios la
           ON la.tenant_id = f.tenant_id AND la.origin_listing_id = f.form_id
    WHERE f.tenant_id = p_tenant_id
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(l) ORDER BY
      -- O que precisa de gente primeiro: fila travada, depois volume.
      (l.eventos_travados + l.eventos_parados) DESC, l.leads_na_base DESC, l.form_id
    ), '[]'::jsonb),
    jsonb_build_object(
      'formularios',    count(*),
      'captando',       count(*) FILTER (WHERE l.captacao_ativa),
      'lia_atende',     count(*) FILTER (WHERE l.lia_atende),
      'sem_direcionamento', count(*) FILTER (WHERE l.destino = 'pega_tudo'),
      'leads_na_base',  COALESCE(sum(l.leads_na_base), 0),
      'novos_24h',      COALESCE(sum(l.novos_24h), 0),
      'sem_campanha',   COALESCE(sum(l.sem_campanha), 0),
      'sincronizado_em', max(l.sincronizado_em),

      -- O lado da Meta, somando só os formulários já perguntados. Sem FILTER:
      -- `sum` do SQL já ignora nulo por definição, e um FILTER a mais aqui
      -- seria enfeite — escrevi um, sabotei o teste tirando-o, e nada mudou.
      -- Quem lê o número precisa é de `formularios_conferidos` ao lado, para
      -- saber sobre quantos ele fala.
      'leads_na_meta',  COALESCE(sum(l.leads_na_meta), 0),
      'formularios_conferidos', count(*) FILTER (WHERE l.leads_na_meta IS NOT NULL),
      'conferido_em',   max(l.leads_na_meta_em),

      -- O alerta.
      'eventos_travados', COALESCE(sum(l.eventos_travados), 0),
      'eventos_parados',  COALESCE(sum(l.eventos_parados), 0),

      -- O que esta tela não enxerga.
      'campanhas_sem_formulario', COALESCE(v_sem_form, 0)
    )
  INTO v_linhas, v_contadores
  FROM linhas l;

  RETURN jsonb_build_object('linhas', v_linhas, 'contadores', v_contadores);
END;
$function$;

REVOKE ALL ON FUNCTION public.meta_formularios_painel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meta_formularios_painel(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
