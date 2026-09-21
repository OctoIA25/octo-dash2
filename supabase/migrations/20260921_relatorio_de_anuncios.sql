-- ============================================================
-- P3.6 · Relatório de anúncios interligado
-- ============================================================
-- MEDIDO EM PRODUÇÃO antes de escrever, em 21/09/2026:
--
--   5.303 leads. Com corretor: 1.718 (32%), em 34 nomes.
--   No funil: 4.190 em "Novos Leads", 1.039 em "Interação", 47 em
--   "Negociação", 13 em "Visita Agendada", 5 em "Proposta Enviada" e
--   4 em "Proposta Assinada".
--   Mesmo período, `commercial_sales`: 37 vendas.
--
-- DUAS COISAS QUE ISSO DEFINE:
--
-- 1. AS COLUNAS DE FUNIL SÃO QUASE VAZIAS. "% visita" sai 0,2%, "% proposta"
--    0,1% e "% venda" 0,08%. Elas entram assim mesmo, mas SEMPRE com o número
--    cru ao lado — decidido com o chefe em 21/09. "0,2% (13 de 5.303)" diz na
--    hora que a coluna não está medindo corretor: está medindo que o funil não
--    é atualizado. Só a porcentagem faria o gestor comparar gente por ruído.
--
-- 2. O FUNIL E A PLANILHA NÃO SE FALAM: 4 contra 37. A matriz mede o FUNIL,
--    que é o que o corretor movimenta, e a tela declara os dois números. Usar
--    a planilha por corretor não resolveria — dos 37 nomes de vendedor, só 3
--    batem com um membro cadastrado (medido no P3.1).
--
-- A CPA POR CONSTRUTORA ESCAPA DESSA PAREDE, e é por isso que ela existe aqui:
-- os dois lados cruzam por EMPREENDIMENTO, nunca por lead. Conferido em
-- produção: a campanha "[RESERVA CASTANHEIRA] ..." casa com o lançamento
-- RESERVA CASTANHEIRA, cuja construtora é Santa Ângela.

-- ------------------------------------------------------------
-- 1. O empreendimento de uma campanha
-- ------------------------------------------------------------
-- Lido do colchete no nome, como no P3.5: não existe campo na Meta que diga de
-- que empreendimento é a campanha, e a convenção "[NOME] ..." é da casa.
--
-- "[LEAD]" e "[RECRUTAMENTO]" são TIPO de campanha, não empreendimento.
-- Tratá-los como empreendimento juntaria campanhas de imóveis diferentes sob
-- um rótulo que não existe.
CREATE OR REPLACE FUNCTION public.empreendimento_da_campanha(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN dentro IS NULL OR dentro = '' THEN NULL
    WHEN dentro IN ('LEAD', 'LEADS', 'RECRUTAMENTO', 'BRANDING', 'REMARKETING') THEN NULL
    ELSE dentro
  END
  FROM (SELECT upper(btrim(substring(COALESCE(p_nome, '') FROM '^\s*\[([^\]]+)\]'))) AS dentro) t;
$function$;

-- ------------------------------------------------------------
-- 2. Verba planejada
-- ------------------------------------------------------------
-- Um mês, um alvo (empreendimento OU campanha) e um valor. Os dois alvos são
-- opcionais: "R$ 5.000 em outubro para a Santa Ângela" é uma linha válida, e
-- "R$ 2.000 para a campanha X" é outra.
CREATE TABLE IF NOT EXISTS public.verba_planejada (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Primeiro dia do mês. Guardar o mês como data evita o "2026-9" contra
  -- "2026-09" que sempre aparece quando o mês é texto.
  mes date NOT NULL,
  empreendimento text,
  campaign_id text,
  plataforma text NOT NULL DEFAULT 'meta' CHECK (plataforma IN ('meta', 'google', 'outra')),
  valor numeric NOT NULL CHECK (valor >= 0),
  criada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criada_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verba_mes_e_primeiro_dia CHECK (date_trunc('month', mes)::date = mes),
  -- Uma linha precisa dizer a que se refere. Sem alvo, ela viraria uma verba
  -- solta que não compara com gasto nenhum.
  CONSTRAINT verba_tem_alvo CHECK (empreendimento IS NOT NULL OR campaign_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS verba_planejada_chave
  ON public.verba_planejada (tenant_id, mes, plataforma,
    COALESCE(empreendimento, ''), COALESCE(campaign_id, ''));

REVOKE ALL ON public.verba_planejada FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.verba_planejada TO authenticated;
GRANT ALL ON public.verba_planejada TO service_role;
ALTER TABLE public.verba_planejada ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS verba_planejada_select ON public.verba_planejada;
CREATE POLICY verba_planejada_select ON public.verba_planejada
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

-- Verba é decisão de gestão: um corretor que a alterasse mudaria a leitura de
-- desempenho de toda a mídia paga da casa.
DROP POLICY IF EXISTS verba_planejada_escrita ON public.verba_planejada;
CREATE POLICY verba_planejada_escrita ON public.verba_planejada
  FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id))
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id));

-- ------------------------------------------------------------
-- 3. O alvo do semáforo
-- ------------------------------------------------------------
-- Uma linha por tenant, colunas explícitas — a convenção da casa para config.
CREATE TABLE IF NOT EXISTS public.tenant_anuncios_config (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Até este valor por lead qualificado, verde. Até o amarelo, amarelo.
  -- Acima, vermelho. Sem valor cadastrado, a tela não pinta nada em vez de
  -- inventar um alvo.
  custo_alvo_qualificado numeric CHECK (custo_alvo_qualificado IS NULL OR custo_alvo_qualificado > 0),
  custo_limite_qualificado numeric CHECK (custo_limite_qualificado IS NULL OR custo_limite_qualificado > 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anuncios_limite_acima_do_alvo CHECK (
    custo_alvo_qualificado IS NULL OR custo_limite_qualificado IS NULL
    OR custo_limite_qualificado >= custo_alvo_qualificado
  )
);

REVOKE ALL ON public.tenant_anuncios_config FROM anon, authenticated;
GRANT SELECT ON public.tenant_anuncios_config TO authenticated;
GRANT ALL ON public.tenant_anuncios_config TO service_role;
ALTER TABLE public.tenant_anuncios_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_anuncios_config_select ON public.tenant_anuncios_config;
CREATE POLICY tenant_anuncios_config_select ON public.tenant_anuncios_config
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_memberships WHERE user_id = auth.uid())
         OR public.is_platform_owner());

DROP POLICY IF EXISTS tenant_anuncios_config_escrita ON public.tenant_anuncios_config;
CREATE POLICY tenant_anuncios_config_escrita ON public.tenant_anuncios_config
  FOR ALL TO authenticated
  USING (public.is_tenant_admin_or_owner(tenant_id))
  WITH CHECK (public.is_tenant_admin_or_owner(tenant_id));

-- ------------------------------------------------------------
-- 4. A matriz de eficiência
-- ------------------------------------------------------------
-- Por corretor ou por equipe, com os NÚMEROS CRUS junto de cada taxa. A tela
-- mostra "0,2% (13 de 5.303)", e não só "0,2%" — decidido com o chefe, porque
-- uma coluna de 0,08% sem contexto faz comparar gente por ruído.
--
-- "Venda" aqui é a ETAPA DO FUNIL, e não a planilha comercial. São duas
-- contagens da mesma coisa que não se falam (4 contra 37), e a função devolve
-- as duas para a tela poder dizer isso.
CREATE OR REPLACE FUNCTION public.matriz_de_eficiencia(
  p_tenant_id uuid,
  p_de        date DEFAULT NULL,
  p_ate       date DEFAULT NULL,
  -- 'corretor' ou 'equipe'.
  p_por       text DEFAULT 'corretor',
  -- Filtro por origem do lead. Vazio = todas.
  p_origem    text DEFAULT NULL
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
  v_por text := CASE WHEN p_por = 'equipe' THEN 'equipe' ELSE 'corretor' END;
  v_linhas jsonb;
  v_totais jsonb;
  v_equipes_vazias int := 0;
  v_vendas_planilha int;
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

  -- Quantas equipes cadastradas não têm nenhum membro. A tela diz o número em
  -- vez de mostrar uma linha zerada, que parece equipe que não vende.
  IF v_por = 'equipe' THEN
    SELECT count(*) INTO v_equipes_vazias
      FROM teams t
     WHERE t.tenant_id = p_tenant_id
       AND NOT EXISTS (SELECT 1 FROM tenant_memberships tm WHERE tm.team_id = t.id);
  END IF;

  SELECT count(*) INTO v_vendas_planilha
    FROM commercial_sales cs
   WHERE cs.tenant_id = p_tenant_id AND cs.is_active
     AND cs.data_assinatura >= v_de AND cs.data_assinatura <= v_ate;

  -- UMA consulta devolve as linhas E os totais. Duas consultas com o mesmo
  -- WHERE copiado divergiriam na primeira correção de recorte, e o total
  -- deixaria de fechar com a soma das linhas sem ninguém perceber.
  WITH base AS (
    SELECT l.id,
           l.status,
           NULLIF(btrim(l.assigned_agent_name), '') AS corretor,
           -- A equipe vem do vínculo do corretor, e não do lead: não há coluna
           -- de equipe no lead, e inventar uma criaria uma segunda verdade.
           NULLIF(btrim(t.name), '') AS equipe,
           pi.minutos_ate_primeiro_contato AS minutos
      FROM leads l
      -- `leads.assigned_agent_id` é TEXTO e `tenant_memberships.user_id` é
      -- uuid. A comparação é feita como texto de propósito: um `::uuid` no
      -- lado do lead estouraria a consulta inteira no dia em que aparecesse um
      -- valor torto, e derrubar a matriz por causa de uma linha suja é pior do
      -- que não casar essa linha.
      LEFT JOIN tenant_memberships tm
             ON tm.tenant_id = l.tenant_id AND tm.user_id::text = l.assigned_agent_id
      LEFT JOIN teams t ON t.id = tm.team_id
      -- A VIEW DO CORRETOR, e não a da LIA. `primeira_interacao` mede quando a
      -- LIA respondeu; ela responde em segundos, e usá-la aqui daria ~100% de
      -- "atendido em 1h" para todo mundo — um número lisonjeiro e falso sobre
      -- gente. O plano fala do CORRETOR atendendo (P1.1: mandou mensagem ou
      -- criou atividade), e isso mora em `primeira_interacao_corretor`.
      --
      -- Essa view é server-only (sem grant para authenticated). Esta função
      -- alcança-a por ser SECURITY DEFINER — que é o uso certo: devolve o
      -- agregado sem abrir as linhas.
      LEFT JOIN primeira_interacao_corretor pi
             ON pi.lead_id = l.id AND pi.tenant_id = l.tenant_id
     WHERE l.tenant_id = p_tenant_id
       AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= v_de
       AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= v_ate
       AND (p_origem IS NULL OR p_origem = '' OR upper(btrim(COALESCE(l.source, ''))) = upper(btrim(p_origem)))
  ),
  marcado AS (
    SELECT *,
           CASE WHEN v_por = 'equipe' THEN equipe ELSE corretor END AS quem,
           (minutos IS NOT NULL AND minutos <= 60) AS em_1h,
           (status = ANY (public.etapas_da_visita_em_diante())) AS chegou_visita,
           (status IN ('Proposta Criada', 'Proposta Enviada', 'Proposta Assinada')) AS chegou_proposta,
           (status = 'Proposta Assinada') AS chegou_venda
      FROM base
  ),
  agrupado AS (
    SELECT quem,
           count(*) AS recebidos,
           -- "Atendido em 1h" usa a MESMA view do P1.1. Recalcular o primeiro
           -- contato aqui daria uma segunda definição de atendimento.
           count(*) FILTER (WHERE em_1h) AS atendidos_1h,
           count(*) FILTER (WHERE minutos IS NOT NULL) AS com_tempo,
           round(avg(minutos) FILTER (WHERE minutos IS NOT NULL)) AS minutos_medio,
           count(*) FILTER (WHERE chegou_visita) AS visita,
           count(*) FILTER (WHERE chegou_proposta) AS proposta,
           count(*) FILTER (WHERE chegou_venda) AS venda
      FROM marcado
     WHERE quem IS NOT NULL
     GROUP BY quem
  )
  SELECT
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'quem', quem,
               'recebidos', recebidos,
               'atendidos_1h', atendidos_1h,
               'com_tempo', com_tempo,
               'minutos_medio', minutos_medio,
               'visita', visita,
               'proposta', proposta,
               'venda', venda
             ) ORDER BY recebidos DESC)
        FROM agrupado
    ), '[]'::jsonb),
    -- Os totais incluem quem NÃO tem corretor nem equipe: em produção são
    -- 3.560 leads parados em "Novos Leads" sem ninguém, e tirá-los do
    -- denominador faria as taxas parecerem muito melhores do que são.
    (
      SELECT jsonb_build_object(
        'leads', count(*),
        'sem_responsavel', count(*) FILTER (WHERE quem IS NULL),
        'atendidos_1h', count(*) FILTER (WHERE em_1h),
        'visita', count(*) FILTER (WHERE chegou_visita),
        'proposta', count(*) FILTER (WHERE chegou_proposta),
        'venda', count(*) FILTER (WHERE chegou_venda)
      ) FROM marcado
    )
  INTO v_linhas, v_totais;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate, 'por', v_por, 'origem', p_origem,
    'linhas', v_linhas,
    'totais', v_totais,
    'equipes_sem_membro', v_equipes_vazias,
    -- O desencontro declarado: a tela escreve os dois números em vez de deixar
    -- a matriz parecer quebrada.
    'vendas_na_planilha', v_vendas_planilha
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.matriz_de_eficiencia(uuid, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.matriz_de_eficiencia(uuid, date, date, text, text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5. CPA por construtora
-- ------------------------------------------------------------
-- A peça que ESCAPA da falta de vínculo entre venda e lead: os dois lados
-- cruzam por EMPREENDIMENTO. O gasto vem da campanha cujo colchete casa com um
-- lançamento da construtora; as vendas vêm da planilha comercial, que já sabe
-- a construtora pelo mesmo caminho (`vendas_do_painel`, do P3.2).
CREATE OR REPLACE FUNCTION public.cpa_por_construtora(
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
  v_linhas jsonb;
  v_gasto_sem_dono numeric;
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

  WITH gasto AS (
    SELECT public.empreendimento_da_campanha(max(campaign_nome)) AS empreendimento,
           campaign_id,
           sum(gasto) AS gasto
      FROM meta_insights_diarios
     WHERE tenant_id = p_tenant_id AND data >= v_de AND data <= v_ate
     GROUP BY campaign_id
  ),
  -- O empreendimento da campanha casa com o lançamento SEM ACENTO e sem caixa:
  -- "Santa Ângela" na campanha e "SANTA ANGELA" no cadastro são o mesmo.
  gasto_com_construtora AS (
    SELECT NULLIF(btrim(l.construtora), '') AS construtora,
           g.gasto
      FROM gasto g
      LEFT JOIN lancamentos l
             ON l.tenant_id = p_tenant_id
            AND upper(public.sem_acento(btrim(l.nome))) = upper(public.sem_acento(g.empreendimento))
  ),
  vendas AS (
    SELECT construtora, count(*) AS vendas, sum(vgc) AS vgc, sum(vgv) AS vgv
      FROM vendas_do_painel(p_tenant_id, v_de, v_ate, 'todos', '{}'::jsonb)
     WHERE construtora IS NOT NULL
     GROUP BY construtora
  ),
  juntas AS (
    SELECT COALESCE(g.construtora, v.construtora) AS construtora,
           COALESCE(sum(g.gasto), 0) AS gasto,
           COALESCE(max(v.vendas), 0) AS vendas,
           COALESCE(max(v.vgc), 0) AS vgc,
           COALESCE(max(v.vgv), 0) AS vgv
      FROM gasto_com_construtora g
      FULL OUTER JOIN vendas v ON v.construtora = g.construtora
     WHERE COALESCE(g.construtora, v.construtora) IS NOT NULL
     GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'construtora', construtora,
           'gasto', round(gasto, 2),
           'vendas', vendas,
           'vgc', round(vgc, 2),
           'vgv', round(vgv, 2),
           'cpa', CASE WHEN vendas > 0 AND gasto > 0 THEN round(gasto / vendas, 2) END,
           -- ROAS sobre COMISSÃO, e não sobre VGV: é o que entra na
           -- imobiliária. O VGV vai junto como informação secundária.
           'roas_vgc', CASE WHEN gasto > 0 AND vgc > 0 THEN round(vgc / gasto, 2) END,
           'roas_vgv', CASE WHEN gasto > 0 AND vgv > 0 THEN round(vgv / gasto, 2) END
         ) ORDER BY gasto DESC, vendas DESC), '[]'::jsonb) INTO v_linhas
    FROM juntas;

  -- Gasto de campanha que não casou com lançamento nenhum. É o número que
  -- explica uma CPA que não fecha com o total de mídia — sem ele, o gestor
  -- soma as linhas e não chega ao que pagou.
  SELECT COALESCE(sum(gasto), 0) INTO v_gasto_sem_dono
    FROM (
      SELECT sum(m.gasto) AS gasto
        FROM meta_insights_diarios m
       WHERE m.tenant_id = p_tenant_id AND m.data >= v_de AND m.data <= v_ate
       GROUP BY m.campaign_id
      HAVING NOT EXISTS (
        SELECT 1 FROM lancamentos l
         WHERE l.tenant_id = p_tenant_id
           AND upper(public.sem_acento(btrim(l.nome)))
             = upper(public.sem_acento(public.empreendimento_da_campanha(max(m.campaign_nome))))
      )
    ) s;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'linhas', v_linhas,
    'gasto_sem_construtora', round(v_gasto_sem_dono, 2)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cpa_por_construtora(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cpa_por_construtora(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.empreendimento_da_campanha(text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 6. Primeiro e último toque
-- ------------------------------------------------------------
-- Medido em produção em 21/09: 725 clientes entraram mais de uma vez, somando
-- 1.472 leads (28% da base), e 594 deles com ORIGEM DIFERENTE entre a primeira
-- e a última entrada. Sem esta leitura, a origem que trouxe o cliente e a que
-- o reencontrou recebem o mesmo crédito — e a primeira, que é a cara, parece
-- pior do que é.
--
-- O mesmo cliente é reconhecido pelos OITO ÚLTIMOS DÍGITOS do telefone —
-- decidido com o chefe em 21/09. É o que resolve o nono dígito, já conhecido
-- como causa da maioria das duplicatas da Lia, sem juntar pessoas distintas
-- como um e-mail de família juntaria.
--
-- CALCULADO, e não gravado no lead. O plano sugere colunas
-- `origem_primeiro_toque`/`origem_ultimo_toque`, mas elas precisariam de um
-- gatilho para reescrever o lead antigo toda vez que o cliente voltasse — e um
-- gatilho esquecido deixa o campo mentindo em silêncio. A conta é barata na
-- escala desta base.
CREATE OR REPLACE FUNCTION public.toques_por_origem(
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
  v_linhas jsonb;
  v_resumo jsonb;
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

  -- UMA consulta devolve as linhas E o resumo, pelo mesmo motivo da matriz:
  -- dois recortes copiados divergem na primeira correção.
  WITH no_periodo AS (
    SELECT l.id, l.created_at, NULLIF(btrim(l.source), '') AS origem,
           -- Sem telefone, o lead é grupo de si mesmo: primeiro e último toque
           -- coincidem. É honesto — não dá para saber que é a mesma pessoa.
           CASE
             WHEN length(regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g')) >= 10
               THEN right(regexp_replace(l.phone, '\D', '', 'g'), 8)
             ELSE 'id:' || l.id::text
           END AS cliente
      FROM leads l
     WHERE l.tenant_id = p_tenant_id
       AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= v_de
       AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= v_ate
  ),
  ordenados AS (
    SELECT cliente, origem,
           row_number() OVER (PARTITION BY cliente ORDER BY created_at ASC, id ASC) AS pos_ini,
           row_number() OVER (PARTITION BY cliente ORDER BY created_at DESC, id DESC) AS pos_fim,
           count(*) OVER (PARTITION BY cliente) AS entradas
      FROM no_periodo
  ),
  por_origem AS (
    SELECT COALESCE(origem, '(sem origem)') AS origem,
           count(*) FILTER (WHERE pos_ini = 1) AS primeiro_toque,
           count(*) FILTER (WHERE pos_fim = 1) AS ultimo_toque,
           count(*) AS leads
      FROM ordenados
     GROUP BY 1
  ),
  -- Os clientes cuja PRIMEIRA e ÚLTIMA origem diferem. É o número que diz se
  -- vale olhar esta tela: em produção são 594 de 725 que voltaram.
  trocaram AS (
    SELECT cliente
      FROM ordenados
     WHERE pos_ini = 1 OR pos_fim = 1
     GROUP BY cliente
    HAVING count(DISTINCT COALESCE(origem, '')) > 1
  )
  SELECT
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'origem', origem,
               'leads', leads,
               'primeiro_toque', primeiro_toque,
               'ultimo_toque', ultimo_toque,
               -- Positivo: a origem traz mais do que reencontra. Negativo: ela
               -- costuma ser a segunda porta, e o crédito por último toque a
               -- favorece indevidamente.
               'saldo', primeiro_toque - ultimo_toque
             ) ORDER BY leads DESC)
        FROM por_origem
    ), '[]'::jsonb),
    (
      SELECT jsonb_build_object(
        'clientes', count(DISTINCT cliente),
        'leads', count(*),
        'clientes_repetidos', count(DISTINCT cliente) FILTER (WHERE entradas > 1),
        'trocaram_de_origem', (SELECT count(*) FROM trocaram)
      ) FROM ordenados
    )
  INTO v_linhas, v_resumo;

  RETURN jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'linhas', v_linhas,
    'resumo', v_resumo
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.toques_por_origem(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toques_por_origem(uuid, date, date) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 7. Quem recebeu os leads de uma campanha
-- ------------------------------------------------------------
-- É o critério de pronto do item, por escrito no plano: "clicar numa campanha
-- mostra quais corretores receberam e quanto converteram".
--
-- Mesmas definições da matriz, de propósito: "atendido em 1h" é o corretor
-- (não a LIA) e "venda" é a etapa do funil. Duas definições para a mesma
-- palavra na mesma tela seria pior do que não ter a tela.
CREATE OR REPLACE FUNCTION public.corretores_da_campanha(
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
  v_linhas jsonb;
  v_sem_corretor int;
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

  WITH base AS (
    SELECT NULLIF(btrim(l.assigned_agent_name), '') AS corretor,
           l.status,
           pi.minutos_ate_primeiro_contato AS minutos
      FROM leads l
      LEFT JOIN primeira_interacao_corretor pi
             ON pi.lead_id = l.id AND pi.tenant_id = l.tenant_id
     WHERE l.tenant_id = p_tenant_id
       AND l.meta_campaign_id = p_campaign_id
       AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= v_de
       AND (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= v_ate
  )
  SELECT
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'quem', corretor,
               'recebidos', recebidos,
               'atendidos_1h', atendidos_1h,
               'minutos_medio', minutos_medio,
               'visita', visita,
               'proposta', proposta,
               'venda', venda
             ) ORDER BY recebidos DESC)
        FROM (
          SELECT corretor,
                 count(*) AS recebidos,
                 count(*) FILTER (WHERE minutos IS NOT NULL AND minutos <= 60) AS atendidos_1h,
                 round(avg(minutos) FILTER (WHERE minutos IS NOT NULL)) AS minutos_medio,
                 count(*) FILTER (WHERE status = ANY (public.etapas_da_visita_em_diante())) AS visita,
                 count(*) FILTER (WHERE status IN ('Proposta Criada', 'Proposta Enviada', 'Proposta Assinada')) AS proposta,
                 count(*) FILTER (WHERE status = 'Proposta Assinada') AS venda
            FROM base
           WHERE corretor IS NOT NULL
           GROUP BY corretor
        ) x
    ), '[]'::jsonb),
    -- Lead pago que não chegou a ninguém. É o número mais caro da tela, e por
    -- isso vem separado em vez de sumir do agrupamento.
    (SELECT count(*) FROM base WHERE corretor IS NULL)
  INTO v_linhas, v_sem_corretor;

  RETURN jsonb_build_object(
    'campaign_id', p_campaign_id,
    'de', v_de, 'ate', v_ate,
    'linhas', v_linhas,
    'sem_corretor', v_sem_corretor
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.corretores_da_campanha(uuid, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.corretores_da_campanha(uuid, text, date, date) TO authenticated, service_role;
