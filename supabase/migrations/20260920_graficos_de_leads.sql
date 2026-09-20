-- ============================================================
-- Os quatro gráficos de leads (P1.10).
--
-- Total por dia · Por equipe · Perdidos pro bolsão por equipe · Tempo de
-- conversão. Os quatro saem de UMA chamada, com os mesmos filtros, porque o
-- plano define o item como pronto quando "os totais do gráfico batem com os
-- contadores" — e quatro consultas com quatro cópias do filtro divergem no
-- primeiro ajuste.
--
-- MEDIANA, E NÃO MÉDIA, decidido pelo chefe em 20/09/2026. O plano escreve
-- "tempo médio", mas com os dados reais a média dá 442 dias e a mediana 135:
-- a média inteira vem de UM lead de 2019 que assinou este mês. É a mesma
-- decisão já aprovada no P0.5 para o tempo de resposta, onde a média dava
-- 2.432 minutos e a mediana 1,4.
--
-- O TEMPO POR ETAPA NASCE OTIMISTA, e a tela avisa. O registro de mudança de
-- etapa só existe desde 10/09/2026, e só dá para medir quem JÁ SAIU da etapa
-- — em dez dias, quem saiu é justamente o rápido. Quem ainda está lá, e é
-- quem demora, não entra na conta. Melhora sozinho a cada semana.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.leads_graficos(
  p_tenant_id uuid,
  p_desde     timestamptz DEFAULT NULL,
  p_ate       timestamptz DEFAULT NULL,
  p_equipe    uuid DEFAULT NULL,
  p_corretor  text DEFAULT NULL,
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
  v_desde  timestamptz := COALESCE(p_desde, now() - interval '90 days');
  v_ate    timestamptz := COALESCE(p_ate, now());
  v_saida  jsonb;
BEGIN
  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN jsonb_build_object('total', 0);
  END IF;

  WITH equipe_do_membro AS (
    SELECT tm.user_id::text AS uid, tm.team_id, COALESCE(t.name, 'Sem equipe') AS equipe
    FROM tenant_memberships tm
    LEFT JOIN teams t ON t.id = tm.team_id
    WHERE tm.tenant_id = p_tenant_id
  ),
  base AS (
    SELECT
      l.id, l.created_at, l.status, l.source,
      l.assigned_agent_id, l.assigned_agent_name,
      COALESCE(e.equipe, 'Sem equipe') AS equipe,
      e.team_id
    FROM leads l
    LEFT JOIN equipe_do_membro e ON e.uid = l.assigned_agent_id::text
    WHERE l.tenant_id = p_tenant_id
      AND l.archived_at IS NULL
      AND l.created_at >= v_desde AND l.created_at <= v_ate
      AND (p_corretor IS NULL OR l.assigned_agent_id::text = p_corretor)
      AND (p_origem   IS NULL OR btrim(lower(l.source)) = btrim(lower(p_origem)))
      AND (p_equipe   IS NULL OR e.team_id = p_equipe)
  ),
  -- O sub-status do P1.5, para as barras empilhadas. A mesma ordem de
  -- perguntas: ter corretor vence tudo.
  com_sub_status AS (
    SELECT
      b.*,
      CASE
        WHEN b.assigned_agent_id IS NOT NULL
          OR (b.assigned_agent_name IS NOT NULL
              AND btrim(lower(b.assigned_agent_name)) NOT IN ('', 'não atribuído', 'nao atribuido'))
          THEN 'com_corretor'
        WHEN EXISTS (
          SELECT 1 FROM lead_events e WHERE e.tenant_id = p_tenant_id AND e.lead_id = b.id::text
            AND e.event_type IN ('lia.handoff_corretor', 'lia.lead_passado_corretor', 'lia.lead_distribuido')
        ) THEN 'aguardando_corretor'
        WHEN EXISTS (
          SELECT 1 FROM lead_events e WHERE e.tenant_id = p_tenant_id AND e.lead_id = b.id::text
            AND e.event_type LIKE 'lia.%'
        ) THEN 'com_lia'
        ELSE 'sem_ninguem'
      END AS sub_status
    FROM base b
  ),
  -- Quem foi para o bolsão, com a equipe de quem era o lead.
  bolsao_periodo AS (
    SELECT COALESCE(e.equipe, 'Sem equipe') AS equipe, count(*) AS total
    FROM bolsao bo
    JOIN base b ON b.id = bo.source_lead_id
    LEFT JOIN equipe_do_membro e ON e.uid = b.assigned_agent_id::text
    WHERE bo.tenant_id = p_tenant_id
    GROUP BY 1
  ),
  -- Da entrada até a assinatura. Só a proposta LIGADA ao lead entra: sem o
  -- vínculo não há entrada para contar a partir de quando.
  conversao AS (
    SELECT extract(epoch FROM (p.signed_at - b.created_at)) / 86400 AS dias
    FROM proposals p
    JOIN base b ON b.id = p.lead_id
    WHERE p.tenant_id = p_tenant_id AND p.signed_at IS NOT NULL AND p.signed_at > b.created_at
  ),
  -- Quanto tempo o lead ficou em cada etapa, para quem JÁ SAIU dela.
  passagens AS (
    SELECT
      e.lead_id,
      e.para AS etapa,
      e.created_at AS entrou,
      lead(e.created_at) OVER (PARTITION BY e.lead_id ORDER BY e.created_at) AS saiu
    FROM lead_events e
    JOIN base b ON b.id::text = e.lead_id
    WHERE e.tenant_id = p_tenant_id
      AND e.event_type = 'lead.stage_changed'
      AND e.para IS NOT NULL
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'por_dia', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dia', d, 'total', n) ORDER BY d)
      FROM (SELECT created_at::date AS d, count(*) AS n FROM base GROUP BY 1) x
    ), '[]'::jsonb),
    'por_equipe', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'equipe', equipe,
        'com_corretor', n_com,
        'aguardando_corretor', n_agu,
        'com_lia', n_lia,
        'sem_ninguem', n_sem,
        'total', n_com + n_agu + n_lia + n_sem
      ) ORDER BY (n_com + n_agu + n_lia + n_sem) DESC)
      FROM (
        SELECT equipe,
          count(*) FILTER (WHERE sub_status = 'com_corretor')        AS n_com,
          count(*) FILTER (WHERE sub_status = 'aguardando_corretor') AS n_agu,
          count(*) FILTER (WHERE sub_status = 'com_lia')             AS n_lia,
          count(*) FILTER (WHERE sub_status = 'sem_ninguem')         AS n_sem
        FROM com_sub_status GROUP BY 1
      ) y
    ), '[]'::jsonb),
    'bolsao_por_equipe', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('equipe', equipe, 'total', total) ORDER BY total DESC)
      FROM bolsao_periodo
    ), '[]'::jsonb),
    'conversao', jsonb_build_object(
      -- MEDIANA. A média aqui é 442 dias por causa de um lead de 2019.
      'mediana_dias', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY dias)) FROM conversao),
      'media_dias',   (SELECT round(avg(dias)) FROM conversao),
      'amostras',     (SELECT count(*) FROM conversao),
      -- Vendas que NÃO dá para medir, porque a proposta não aponta para lead
      -- nenhum. Omitir este número faria a amostra parecer a venda toda.
      'vendas_sem_lead', (
        SELECT count(*) FROM proposals p
        WHERE p.tenant_id = p_tenant_id AND p.signed_at IS NOT NULL AND p.lead_id IS NULL
      )
    ),
    'por_etapa', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'etapa', etapa, 'mediana_dias', mediana, 'observacoes', n
      ) ORDER BY mediana DESC)
      FROM (
        SELECT etapa,
               round(percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (saiu - entrou)) / 86400)) AS mediana,
               count(*) AS n
        FROM passagens
        -- Só quem JÁ SAIU: quem ainda está na etapa não tem duração, e
        -- contá-lo como "até agora" misturaria uma coisa com outra.
        WHERE saiu IS NOT NULL
        GROUP BY 1
      ) z
    ), '[]'::jsonb),
    -- O que a tela precisa para avisar que o tempo por etapa é parcial.
    'etapa_desde', (
      SELECT min(created_at) FROM lead_events
      WHERE tenant_id = p_tenant_id AND event_type = 'lead.stage_changed'
    )
  ) INTO v_saida;

  RETURN v_saida;
END;
$function$;

REVOKE ALL ON FUNCTION public.leads_graficos(uuid, timestamptz, timestamptz, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leads_graficos(uuid, timestamptz, timestamptz, uuid, text, text) TO authenticated, service_role;

COMMIT;
