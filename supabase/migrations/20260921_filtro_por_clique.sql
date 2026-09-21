-- Migration: Filtro clicando na linha (P3.2)
-- Data: 2026-09-21
--
-- As oito tabelas de ranking do plano, o filtro compartilhado por todos os
-- blocos, e as visões salvas.
--
-- O QUE FOI MEDIDO ANTES (21/09/2026, 37 vendas da Lotus):
--
--   corretor, empreendimento, origem, cliente ... 37 de 37. Diretas.
--   construtora, cidade, bairro ................ não existem na planilha; saem
--       do cadastro do lançamento, cobrindo 28 das 37 vendas (88% do VGV).
--   equipe ..................................... 1 de 37 preenchida.
--
-- O chefe pediu as OITO, e a de equipe entra como está: uma tabela quase vazia
-- diz, melhor que qualquer aviso, que o campo existe e ninguém preenche.
--
-- "CONVERSÃO" VIRA "PARTICIPAÇÃO NO VGV". O plano pede vendas, VGV e conversão
-- por linha. `commercial_sales` NÃO tem vínculo nenhum com lead — nenhuma
-- coluna liga a venda ao lead que a originou —, então não há de que converter.
-- Participação responde à mesma pergunta ("quem pesa mais") e é calculável.
-- Decidido pelo chefe em 21/09.

-- ------------------------------------------------------------
-- 1. O lançamento por trás da venda
-- ------------------------------------------------------------
-- Construtora, cidade e bairro só existem no cadastro do lançamento. A coluna
-- entra na tabela de alias que o P3.1 criou — ela já responde "que
-- empreendimento é este", e esta é a mesma pergunta levada adiante.
ALTER TABLE public.vendas_empreendimento_alias
  ADD COLUMN IF NOT EXISTS lancamento_id uuid REFERENCES public.lancamentos(id) ON DELETE SET NULL;

-- Liga o que casa por nome. "RESERVA MARAJOARA II" não casa com "RESERVA
-- MARAJOARA" e fica sem ligação de propósito: um "II" pode ser outra fase, com
-- outra construtora e outro endereço, e chutar poria a venda na cidade errada.
UPDATE public.vendas_empreendimento_alias a
   SET lancamento_id = l.id
  FROM public.lancamentos l
 WHERE a.lancamento_id IS NULL
   AND l.tenant_id = a.tenant_id
   AND upper(btrim(l.nome)) = a.nome_canonico;

-- ------------------------------------------------------------
-- 2. As visões salvas
-- ------------------------------------------------------------
-- No banco, e não no navegador: decidido pelo chefe em 21/09. A visão que o
-- gestor monta serve à equipe inteira — guardada no navegador, ela some ao
-- trocar de computador e não é de mais ninguém.
CREATE TABLE IF NOT EXISTS public.painel_visoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  -- Os filtros como a tela os monta: {"corretor": [...], "origem": [...]}.
  -- jsonb porque as dimensões mudam com o plano, e uma coluna por dimensão
  -- exigiria migration a cada corte novo.
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  tipo text,
  criada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criada_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS painel_visoes_nome_idx
  ON public.painel_visoes (tenant_id, lower(nome));

REVOKE ALL ON public.painel_visoes FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.painel_visoes TO authenticated;
GRANT ALL ON public.painel_visoes TO service_role;

ALTER TABLE public.painel_visoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS painel_visoes_select ON public.painel_visoes;
CREATE POLICY painel_visoes_select ON public.painel_visoes
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- Qualquer membro cria a sua; apagar é só de quem criou ou da gestão, para
-- ninguém perder a visão do colega sem querer.
DROP POLICY IF EXISTS painel_visoes_insert ON public.painel_visoes;
CREATE POLICY painel_visoes_insert ON public.painel_visoes
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS painel_visoes_delete ON public.painel_visoes;
CREATE POLICY painel_visoes_delete ON public.painel_visoes
  FOR DELETE TO authenticated
  USING (criada_por = auth.uid() OR public.is_tenant_admin_or_owner(tenant_id));

-- ------------------------------------------------------------
-- 3. As vendas do período, já com tudo o que serve de corte
-- ------------------------------------------------------------
-- Uma função só monta a linha completa de cada venda — com o empreendimento
-- canônico, o tipo, e o que vem do lançamento. Os contadores e os oito
-- rankings leem daqui, e por isso não podem divergir entre si.
CREATE OR REPLACE FUNCTION public.vendas_do_painel(
  p_tenant_id uuid,
  p_de        date,
  p_ate       date,
  p_tipo      text DEFAULT 'todos',
  -- {"corretor": ["Fulano"], "origem": ["Santa"], ...}. Vazio = sem filtro.
  p_filtros   jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid, vgv numeric, vgc numeric, corretor text, equipe text,
  empreendimento text, construtora text, cidade text, bairro text,
  origem text, cliente text, tipo_emp text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT cs.id,
           COALESCE(cs.valor_vgv, 0) AS vgv,
           COALESCE(cs.valor_vgc, 0) AS vgc,
           NULLIF(btrim(cs.corretor_nome), '')     AS corretor,
           NULLIF(btrim(cs.team_leader_nome), '')  AS equipe,
           COALESCE(a.nome_canonico, upper(btrim(cs.empreendimento))) AS empreendimento,
           NULLIF(btrim(l.construtora), '')        AS construtora,
           NULLIF(btrim(l.cidade), '')             AS cidade,
           NULLIF(btrim(l.bairro), '')             AS bairro,
           -- A origem vem da planilha com caixa livre: "Santa" e "SANTA" são a
           -- mesma, e sem normalizar o ranking mostraria as duas.
           NULLIF(upper(btrim(cs.origem)), '')     AS origem,
           NULLIF(btrim(cs.cliente_nome), '')      AS cliente,
           a.tipo                                  AS tipo_emp
      FROM commercial_sales cs
      LEFT JOIN vendas_empreendimento_alias a
             ON a.tenant_id = cs.tenant_id AND a.nome_bruto = upper(btrim(cs.empreendimento))
      LEFT JOIN lancamentos l ON l.id = a.lancamento_id
     WHERE cs.tenant_id = p_tenant_id
       AND cs.is_active
       AND cs.data_assinatura >= p_de
       AND cs.data_assinatura <= p_ate
       AND (p_tipo = 'todos' OR a.tipo = p_tipo)
  )
  SELECT * FROM base b
   -- Cada dimensão filtra só se veio na lista. `?|` pergunta se o valor está
   -- entre os escolhidos; ausente ou vazio deixa passar tudo.
   WHERE (p_filtros->'corretor'      IS NULL OR jsonb_array_length(p_filtros->'corretor') = 0      OR to_jsonb(b.corretor)      <@ (p_filtros->'corretor'))
     AND (p_filtros->'equipe'        IS NULL OR jsonb_array_length(p_filtros->'equipe') = 0        OR to_jsonb(b.equipe)        <@ (p_filtros->'equipe'))
     AND (p_filtros->'empreendimento' IS NULL OR jsonb_array_length(p_filtros->'empreendimento') = 0 OR to_jsonb(b.empreendimento) <@ (p_filtros->'empreendimento'))
     AND (p_filtros->'construtora'   IS NULL OR jsonb_array_length(p_filtros->'construtora') = 0   OR to_jsonb(b.construtora)   <@ (p_filtros->'construtora'))
     AND (p_filtros->'cidade'        IS NULL OR jsonb_array_length(p_filtros->'cidade') = 0        OR to_jsonb(b.cidade)        <@ (p_filtros->'cidade'))
     AND (p_filtros->'bairro'        IS NULL OR jsonb_array_length(p_filtros->'bairro') = 0        OR to_jsonb(b.bairro)        <@ (p_filtros->'bairro'))
     AND (p_filtros->'origem'        IS NULL OR jsonb_array_length(p_filtros->'origem') = 0        OR to_jsonb(b.origem)        <@ (p_filtros->'origem'))
     AND (p_filtros->'cliente'       IS NULL OR jsonb_array_length(p_filtros->'cliente') = 0       OR to_jsonb(b.cliente)       <@ (p_filtros->'cliente'));
$function$;

-- ------------------------------------------------------------
-- 4. Os oito rankings
-- ------------------------------------------------------------
-- "Participação" é a fatia do VGV do período, não conversão: não há vínculo
-- entre venda e lead nesta base, e uma coluna chamada conversão que nunca
-- converte nada é pior do que uma coluna honesta com outro nome.
CREATE OR REPLACE FUNCTION public.painel_comercial_rankings(
  p_tenant_id uuid,
  p_de        date DEFAULT NULL,
  p_ate       date DEFAULT NULL,
  p_tipo      text DEFAULT 'todos',
  p_filtros   jsonb DEFAULT '{}'::jsonb,
  p_limite    int  DEFAULT 10
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
  v_limite int := LEAST(GREATEST(COALESCE(p_limite, 10), 1), 50);
  v_total numeric;
  v_out jsonb := '{}'::jsonb;
  v_dim text;
  v_filtros_dim jsonb;
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

  SELECT COALESCE(sum(vgv), 0) INTO v_total
    FROM vendas_do_painel(p_tenant_id, v_de, v_ate, p_tipo, p_filtros);

  -- As oito dimensões pelo mesmo caminho: uma cópia por dimensão divergiria na
  -- primeira correção, e são oito lugares para esquecer.
  FOREACH v_dim IN ARRAY ARRAY['corretor','equipe','empreendimento','construtora','cidade','bairro','origem','cliente']
  LOOP
    -- A TABELA DA DIMENSÃO FILTRADA NÃO FILTRA A SI MESMA.
    --
    -- Encontrado no navegador: ao clicar em "Reserva Castanheira", a tabela de
    -- empreendimentos passava a mostrar só ela — e o SHIFT + clique, que o
    -- plano pede para somar um segundo, ficava sem nada para clicar. Nunca
    -- dava para montar um recorte de dois itens.
    --
    -- É como todo filtro por facetas funciona: a faceta que você está usando
    -- continua inteira, para você poder acrescentar; as outras acompanham o
    -- recorte. Sem isto, o "adiciona mais itens" do plano é impossível.
    v_filtros_dim := p_filtros - v_dim;

    v_out := v_out || jsonb_build_object(v_dim, COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'vgv')::numeric DESC, (x->>'vendas')::int DESC)
        FROM (
          SELECT jsonb_build_object(
                   'valor', valor,
                   'vendas', count(*),
                   'vgv', COALESCE(sum(vgv), 0),
                   'vgc', COALESCE(sum(vgc), 0),
                   -- NULL quando não há VGV no período: 0% diria "não pesa
                   -- nada", e a verdade é que não há base para dividir.
                   'participacao', CASE WHEN v_total > 0
                                        THEN round(100.0 * COALESCE(sum(vgv), 0) / v_total, 1) END
                 ) x
            FROM (
              SELECT CASE v_dim
                       WHEN 'corretor' THEN corretor
                       WHEN 'equipe' THEN equipe
                       WHEN 'empreendimento' THEN empreendimento
                       WHEN 'construtora' THEN construtora
                       WHEN 'cidade' THEN cidade
                       WHEN 'bairro' THEN bairro
                       WHEN 'origem' THEN origem
                       ELSE cliente
                     END AS valor,
                     vgv, vgc
                FROM vendas_do_painel(p_tenant_id, v_de, v_ate, p_tipo, v_filtros_dim)
            ) d
           -- Linha sem valor não é ranking: "(vazio) — 36 vendas" só ocuparia
           -- espaço. Quantas ficaram de fora vai no contador abaixo.
           WHERE valor IS NOT NULL
           GROUP BY valor
           ORDER BY sum(vgv) DESC, count(*) DESC
           LIMIT v_limite
        ) s
    ), '[]'::jsonb));

    -- Quantas vendas do período não têm este corte preenchido. É o número que
    -- explica um ranking curto — como o de equipe, com 1 de 37.
    v_out := v_out || jsonb_build_object(v_dim || '_sem_valor', (
      SELECT count(*) FROM vendas_do_painel(p_tenant_id, v_de, v_ate, p_tipo, v_filtros_dim) v
       WHERE CASE v_dim
               WHEN 'corretor' THEN v.corretor
               WHEN 'equipe' THEN v.equipe
               WHEN 'empreendimento' THEN v.empreendimento
               WHEN 'construtora' THEN v.construtora
               WHEN 'cidade' THEN v.cidade
               WHEN 'bairro' THEN v.bairro
               WHEN 'origem' THEN v.origem
               ELSE v.cliente
             END IS NULL
    ));
  END LOOP;

  RETURN v_out || jsonb_build_object('vgv_do_periodo', v_total, 'de', v_de, 'ate', v_ate);
END;
$function$;

REVOKE ALL ON FUNCTION public.painel_comercial_rankings(uuid, date, date, text, jsonb, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_comercial_rankings(uuid, date, date, text, jsonb, int) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.vendas_do_painel(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_do_painel(uuid, date, date, text, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5. Os contadores passam a obedecer ao mesmo filtro
-- ------------------------------------------------------------
-- "Clicar em um corretor filtra todos os contadores" é o critério do plano.
-- As duas funções passam a ler de `vendas_do_painel` — uma fonte, um recorte.
-- Antes, os contadores montavam a própria consulta: a primeira divergência
-- entre elas apareceria como ranking que soma diferente do contador acima.
CREATE OR REPLACE FUNCTION public.painel_comercial_periodo(
  p_tenant_id uuid,
  p_de        date,
  p_ate       date,
  p_tipo      text DEFAULT 'todos',
  p_filtros   jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'vendas', count(*),
    'vgv', COALESCE(sum(vgv), 0),
    'vgc', COALESCE(sum(vgc), 0),

    -- Só as vendas COM VGV entram no ticket e na % de comissão. Oito das 37
    -- têm comissão e nenhum VGV; incluí-las derruba o ticket em 28%.
    'vendas_com_vgv', count(*) FILTER (WHERE vgv > 0),
    'vendas_sem_vgv', count(*) FILTER (WHERE vgv = 0),
    'ticket_medio', CASE WHEN count(*) FILTER (WHERE vgv > 0) > 0
                         THEN round(sum(vgv) FILTER (WHERE vgv > 0) / count(*) FILTER (WHERE vgv > 0))
                    END,
    'pct_comissao', CASE WHEN COALESCE(sum(vgv) FILTER (WHERE vgv > 0), 0) > 0
                         THEN round(100.0 * sum(vgc) FILTER (WHERE vgv > 0)
                                    / sum(vgv) FILTER (WHERE vgv > 0), 2)
                    END,

    -- NOMES distintos, não pessoas: a planilha traz apelido, primeiro nome e
    -- até dois numa célula. Ver `produtividade` no front.
    'nomes_que_venderam', count(DISTINCT corretor) FILTER (WHERE corretor IS NOT NULL),
    'nomes_reconhecidos', count(DISTINCT corretor) FILTER (
      WHERE corretor IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM tenant_memberships tm
          JOIN auth.users u ON u.id = tm.user_id
          WHERE tm.tenant_id = p_tenant_id
            AND upper(public.sem_acento(btrim(COALESCE(u.raw_user_meta_data->>'name', u.email))))
              = upper(public.sem_acento(btrim(v.corretor)))
        )
    ),
    'sem_classificacao', count(*) FILTER (WHERE tipo_emp IS NULL)
  )
  FROM vendas_do_painel(p_tenant_id, p_de, p_ate, p_tipo, p_filtros) v;
$function$;

-- `painel_comercial` repassa o filtro às três janelas que compara.
CREATE OR REPLACE FUNCTION public.painel_comercial(
  p_tenant_id uuid,
  p_de        date DEFAULT NULL,
  p_ate       date DEFAULT NULL,
  p_tipo      text DEFAULT 'todos',
  p_filtros   jsonb DEFAULT '{}'::jsonb
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
  v_tipo text := COALESCE(NULLIF(btrim(p_tipo), ''), 'todos');
  v_f jsonb := COALESCE(p_filtros, '{}'::jsonb);
  v_atual jsonb; v_mes_ant jsonb; v_ano_ant jsonb;
  v_propostas int; v_ativos int; v_metas jsonb; v_projecao jsonb;
  v_uteis_ate int; v_uteis_mes int;
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

  v_atual   := painel_comercial_periodo(p_tenant_id, v_de, v_ate, v_tipo, v_f);
  -- Mesma largura de janela nas três: comparar meio mês com mês inteiro
  -- mostraria queda todo dia 5.
  v_mes_ant := painel_comercial_periodo(p_tenant_id,
                 (v_de - interval '1 month')::date, (v_ate - interval '1 month')::date, v_tipo, v_f);
  v_ano_ant := painel_comercial_periodo(p_tenant_id,
                 (v_de - interval '1 year')::date, (v_ate - interval '1 year')::date, v_tipo, v_f);

  SELECT count(*) INTO v_propostas
    FROM proposals p
   WHERE p.tenant_id = p_tenant_id
     AND p.created_at >= v_de AND p.created_at < (v_ate + 1);

  SELECT count(*) INTO v_ativos
    FROM tenant_memberships tm
    JOIN auth.users u ON u.id = tm.user_id
   WHERE tm.tenant_id = p_tenant_id
     AND lower(u.email) <> 'octo.inteligenciaimobiliaria@gmail.com';

  SELECT jsonb_build_object(
    'vendas', max(target_value) FILTER (WHERE lower(name) LIKE '%venda%'),
    'propostas', max(target_value) FILTER (WHERE lower(name) LIKE '%proposta%' OR lower(name) LIKE '%analise%'),
    'vgc', max(target_value) FILTER (WHERE lower(name) LIKE '%vgc%' OR lower(name) LIKE '%comiss%'),
    'cadastradas', count(*)
  ) INTO v_metas
  FROM goals g
  WHERE g.tenant_id = p_tenant_id AND g.status = 'active'
    AND g.start_date <= v_ate AND g.end_date >= v_de;

  IF v_de = date_trunc('month', v_hoje)::date AND v_ate >= v_hoje THEN
    v_uteis_ate := dias_uteis(v_de, v_hoje);
    v_uteis_mes := dias_uteis(v_de, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);
    v_projecao := jsonb_build_object(
      'dias_uteis_decorridos', v_uteis_ate,
      'dias_uteis_no_mes', v_uteis_mes,
      'vendas', CASE WHEN v_uteis_ate > 0
                     THEN round((v_atual->>'vendas')::numeric / v_uteis_ate * v_uteis_mes) END,
      'vgv', CASE WHEN v_uteis_ate > 0
                  THEN round((v_atual->>'vgv')::numeric / v_uteis_ate * v_uteis_mes) END
    );
  END IF;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'tipo', v_tipo, 'filtros', v_f,
    'atual', v_atual, 'mes_anterior', v_mes_ant, 'ano_anterior', v_ano_ant,
    'propostas', v_propostas, 'ativos', v_ativos, 'metas', v_metas, 'projecao', v_projecao
  );
END;
$function$;

-- A assinatura de 4 argumentos some: uma chamada sem filtro entraria por ela e
-- o painel devolveria tudo, ignorando o recorte em silêncio.
DROP FUNCTION IF EXISTS public.painel_comercial(uuid, date, date, text);
DROP FUNCTION IF EXISTS public.painel_comercial_periodo(uuid, date, date, text);

REVOKE ALL ON FUNCTION public.painel_comercial(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_comercial(uuid, date, date, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.painel_comercial_periodo(uuid, date, date, text, jsonb) TO authenticated, service_role;
