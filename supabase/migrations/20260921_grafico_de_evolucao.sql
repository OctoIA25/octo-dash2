-- ============================================================
-- P3.3 · Gráfico de evolução
-- ============================================================
-- Vendas, VGV, ticket e % de comissão ao longo do tempo, com o período
-- anterior sobreposto, médias móveis, a linha da meta e as bandeirinhas de
-- evento. Respeita os filtros do P3.2 — é o mesmo recorte dos contadores e
-- dos oito rankings, porque lê da mesma `vendas_do_painel`.
--
-- O QUE A BASE PERMITE, medido em 21/09/2026 antes de escrever isto:
-- as 37 vendas da Lotus estão TODAS em setembro (dias 02 a 17). Agosto tem
-- zero. Então a comparação com o período anterior desenha uma reta no zero —
-- e a tela diz isso em letra, em vez de deixar o gestor achar que é erro.
-- Pelo mesmo motivo a janela de 30 dias da média móvel ainda não fecha: o
-- front só desenha o ponto quando a janela está cheia (ver `evolucao.ts`).

-- ------------------------------------------------------------
-- 1. Os eventos que viram bandeirinha no eixo
-- ------------------------------------------------------------
-- Cadastro simples, como o plano pede. NÃO é `agenda_eventos`: aquela é a
-- agenda do corretor, com lead, imóvel e horário — outra coisa, com outro
-- dono e outro ciclo de vida.
--
-- `lancamento_id` é opcional de propósito. "Feirão da cidade" é da casa e não
-- tem empreendimento; "Início campanha Serrah" tem. Com empreendimento, a
-- bandeirinha só aparece quando o gráfico está mostrando aquele
-- empreendimento — senão ela fica pendurada num gráfico que não é dela.
CREATE TABLE IF NOT EXISTS public.eventos_comerciais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  em date NOT NULL,
  titulo text NOT NULL,
  lancamento_id uuid REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eventos_comerciais_titulo_nao_vazio CHECK (btrim(titulo) <> '')
);

CREATE INDEX IF NOT EXISTS eventos_comerciais_periodo_idx
  ON public.eventos_comerciais (tenant_id, em);

-- O `pg_default_acl` desta base dá tudo ao anon em toda relação nova. Sem o
-- REVOKE abaixo, a agenda comercial da casa sairia pela API pública.
REVOKE ALL ON public.eventos_comerciais FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eventos_comerciais TO authenticated;
GRANT ALL ON public.eventos_comerciais TO service_role;

ALTER TABLE public.eventos_comerciais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eventos_comerciais_select ON public.eventos_comerciais;
CREATE POLICY eventos_comerciais_select ON public.eventos_comerciais
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- Marcar o mês da casa inteira é decisão de gestão: quem escreve é admin.
-- Um corretor que cadastrasse "Feirão" moveria a leitura do painel de todos.
DROP POLICY IF EXISTS eventos_comerciais_insert ON public.eventos_comerciais;
CREATE POLICY eventos_comerciais_insert ON public.eventos_comerciais
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id));

DROP POLICY IF EXISTS eventos_comerciais_update ON public.eventos_comerciais;
CREATE POLICY eventos_comerciais_update ON public.eventos_comerciais
  FOR UPDATE TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id))
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id));

DROP POLICY IF EXISTS eventos_comerciais_delete ON public.eventos_comerciais;
CREATE POLICY eventos_comerciais_delete ON public.eventos_comerciais
  FOR DELETE TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id));

-- ------------------------------------------------------------
-- 2. `vendas_do_painel` passa a devolver a data
-- ------------------------------------------------------------
-- A evolução precisa saber EM QUE DIA cada venda foi assinada, e essa é a
-- única fonte do recorte. Acrescentar a coluna aqui é o que mantém contadores,
-- rankings e gráfico olhando as mesmas vendas — uma segunda consulta com o
-- mesmo WHERE copiado divergiria na primeira correção.
--
-- Trocar o tipo de retorno exige DROP: `CREATE OR REPLACE` recusa. As funções
-- que a chamam nomeiam as colunas uma a uma (nenhuma faz `SELECT *`), então
-- acrescentar uma coluna no fim não quebra nenhuma.
DROP FUNCTION IF EXISTS public.vendas_do_painel(uuid, date, date, text, jsonb);

CREATE FUNCTION public.vendas_do_painel(
  p_tenant_id uuid,
  p_de        date,
  p_ate       date,
  p_tipo      text DEFAULT 'todos',
  p_filtros   jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid, vgv numeric, vgc numeric, corretor text, equipe text,
  empreendimento text, construtora text, cidade text, bairro text,
  origem text, cliente text, tipo_emp text, assinada_em date
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
           a.tipo                                  AS tipo_emp,
           cs.data_assinatura                      AS assinada_em
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
   -- Cada dimensão filtra só se veio na lista. `<@` pergunta se o valor está
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

REVOKE ALL ON FUNCTION public.vendas_do_painel(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendas_do_painel(uuid, date, date, text, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Uma série, de um período
-- ------------------------------------------------------------
-- Separada porque o período atual e o anterior pedem exatamente a mesma
-- conta. Duas cópias divergiriam, e a comparação tracejada mediria uma coisa
-- diferente da linha cheia sem ninguém perceber.
--
-- Os baldes vêm de `generate_series`, não das vendas: um dia sem venda tem de
-- valer ZERO e não sumir. Se sumisse, a linha pularia o buraco e a média
-- móvel de 7 dias passaria a ser a média dos últimos 7 dias COM venda, que é
-- outro número com o mesmo nome.
CREATE OR REPLACE FUNCTION public.painel_evolucao_serie(
  p_tenant_id uuid,
  p_de        date,
  p_ate       date,
  p_tipo      text,
  p_filtros   jsonb,
  p_gran      text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH v AS (
    SELECT * FROM vendas_do_painel(p_tenant_id, p_de, p_ate, p_tipo, p_filtros)
  ),
  baldes AS (
    SELECT g::date AS em
      FROM generate_series(
             CASE WHEN p_gran = 'dia' THEN p_de  ELSE date_trunc('month', p_de)::date  END,
             CASE WHEN p_gran = 'dia' THEN p_ate ELSE date_trunc('month', p_ate)::date END,
             CASE WHEN p_gran = 'dia' THEN interval '1 day' ELSE interval '1 month' END
           ) g
  ),
  agrupado AS (
    SELECT b.em,
           count(v.id) AS vendas,
           COALESCE(sum(v.vgv), 0) AS vgv,
           COALESCE(sum(v.vgc), 0) AS vgc,
           -- Ticket e % de comissão contam SÓ as vendas com VGV, igual ao
           -- contador do P3.1. Oito das 37 têm comissão e nenhum VGV: incluí-las
           -- no divisor baixaria o ticket 28% parecendo exato.
           count(v.id) FILTER (WHERE v.vgv > 0) AS com_vgv,
           COALESCE(sum(v.vgv) FILTER (WHERE v.vgv > 0), 0) AS vgv_com,
           COALESCE(sum(v.vgc) FILTER (WHERE v.vgv > 0), 0) AS vgc_com
      FROM baldes b
      LEFT JOIN v
             ON (CASE WHEN p_gran = 'dia' THEN v.assinada_em
                      ELSE date_trunc('month', v.assinada_em)::date END) = b.em
     GROUP BY b.em
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'em', em,
           'vendas', vendas,
           'vgv', vgv,
           'vgc', vgc,
           'vendas_com_vgv', com_vgv,
           'ticket', CASE WHEN com_vgv > 0 THEN round(vgv_com / com_vgv) END,
           'pct_comissao', CASE WHEN vgv_com > 0 THEN round(100.0 * vgc_com / vgv_com, 2) END
         ) ORDER BY em), '[]'::jsonb)
    FROM agrupado;
$function$;

REVOKE ALL ON FUNCTION public.painel_evolucao_serie(uuid, date, date, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_evolucao_serie(uuid, date, date, text, jsonb, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4. A evolução inteira
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.painel_evolucao(
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
  v_gran text;
  v_ant_de date;
  v_ant_ate date;
  v_meses int;
  v_serie jsonb;
  v_ant jsonb;
  v_ant_vendas int;
  v_eventos jsonb;
  v_metas jsonb;
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

  IF v_ate < v_de THEN RETURN NULL; END IF;

  -- "Até 2 meses: pontos por dia. Acima: por mês." 62 dias é o maior par de
  -- meses cheios do calendário (julho + agosto), então é onde a régua vira.
  --
  -- O `+ 1` conta DIAS, não a diferença entre as datas. Sem ele, 01/07 a 01/09
  -- — 63 dias, dois meses e um dia — ainda cairia como "por dia", e a régua
  -- viraria num lugar que ninguém consegue prever olhando a tela.
  v_gran := CASE WHEN (v_ate - v_de + 1) <= 62 THEN 'dia' ELSE 'mes' END;

  -- O período anterior tem de render o MESMO número de baldes, senão a
  -- tracejada não alinha com a linha cheia e a comparação compara dia 1 com
  -- dia 2. Em dias, é a janela deslocada pelo tamanho dela. Em meses, é
  -- deslocada pela quantidade de meses — descontar dias daria 30 ou 31 baldes
  -- conforme o mês, e um a mais ou a menos.
  IF v_gran = 'dia' THEN
    v_ant_de  := v_de  - (v_ate - v_de + 1);
    v_ant_ate := v_ate - (v_ate - v_de + 1);
  ELSE
    v_meses := (EXTRACT(YEAR FROM v_ate)::int * 12 + EXTRACT(MONTH FROM v_ate)::int)
             - (EXTRACT(YEAR FROM v_de)::int  * 12 + EXTRACT(MONTH FROM v_de)::int) + 1;
    v_ant_de  := (v_de  - (v_meses || ' months')::interval)::date;
    v_ant_ate := (v_ate - (v_meses || ' months')::interval)::date;
  END IF;

  v_serie := painel_evolucao_serie(p_tenant_id, v_de, v_ate, p_tipo, p_filtros, v_gran);
  v_ant   := painel_evolucao_serie(p_tenant_id, v_ant_de, v_ant_ate, p_tipo, p_filtros, v_gran);

  SELECT COALESCE(sum((e->>'vendas')::int), 0) INTO v_ant_vendas
    FROM jsonb_array_elements(v_ant) e;

  -- As bandeirinhas. O nome do empreendimento vem canônico, o mesmo que os
  -- filtros do P3.2 usam — é por ele que o front decide se a bandeirinha
  -- pertence ao recorte que está na tela.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', ev.id,
           'em', CASE WHEN v_gran = 'dia' THEN ev.em
                      ELSE date_trunc('month', ev.em)::date END,
           'dia', ev.em,
           'titulo', ev.titulo,
           'empreendimento', NULLIF(upper(btrim(l.nome)), '')
         ) ORDER BY ev.em), '[]'::jsonb) INTO v_eventos
    FROM eventos_comerciais ev
    LEFT JOIN lancamentos l ON l.id = ev.lancamento_id
   WHERE ev.tenant_id = p_tenant_id
     AND ev.em >= v_de AND ev.em <= v_ate;

  -- A meta do período, da tela Metas — a MESMA leitura do P3.1, para o
  -- gráfico e o contador nunca discordarem. A tabela está vazia na plataforma
  -- inteira: por isso vem null, e não zero. Zero desenharia uma linha de meta
  -- rasteira que qualquer venda "supera".
  SELECT jsonb_build_object(
    'vendas', max(target_value) FILTER (WHERE lower(name) LIKE '%venda%'),
    'vgc', max(target_value) FILTER (WHERE lower(name) LIKE '%vgc%' OR lower(name) LIKE '%comiss%'),
    'cadastradas', count(*)
  ) INTO v_metas
  FROM goals g
  WHERE g.tenant_id = p_tenant_id AND g.status = 'active'
    AND g.start_date <= v_ate AND g.end_date >= v_de;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'tipo', p_tipo,
    'granularidade', v_gran,
    'hoje', v_hoje,
    'serie', v_serie,
    'anterior', jsonb_build_object(
      'de', v_ant_de,
      'ate', v_ant_ate,
      -- O que faz a tela escrever "agosto não tem venda registrada" em vez de
      -- deixar o gestor olhar uma reta no zero achando que quebrou.
      'vazio', v_ant_vendas = 0,
      'vendas', v_ant_vendas,
      'serie', v_ant
    ),
    'eventos', v_eventos,
    'metas', v_metas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.painel_evolucao(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_evolucao(uuid, date, date, text, jsonb) TO authenticated, service_role;
