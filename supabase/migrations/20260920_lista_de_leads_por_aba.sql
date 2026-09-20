-- ============================================================
-- A lista de leads com abas de ação (P1.8).
--
-- Abas aprovadas pelo chefe em 20/09/2026, com os números da Lotus na mesa:
--   Todos (1.684) · Novos (600) · Em atendimento · Atividade agendada (11)
--   · Parados (101) · Sem corretor (31)
--
-- O CONTADOR E A LISTA SAEM DA MESMA FUNÇÃO, e é por isso que ela devolve os
-- dois de uma vez. O plano define o item como pronto quando "os contadores
-- das abas batem com a lista"; com duas consultas separadas, cada uma com sua
-- cópia do filtro, elas divergem no primeiro ajuste — e a divergência só
-- aparece quando alguém conta na mão.
--
-- "PARADO" NÃO É REESCRITO AQUI. A regra de o que conta como movimento mora
-- em `leads_ultima_movimentacao` (P1.4), e esta função a CHAMA. Reescrever o
-- predicado daria duas verdades sobre a mesma palavra em duas telas.
--
-- E LEAD SEM MOVIMENTO REGISTRADO NÃO É LEAD PARADO. São 1.249 dos 1.684 da
-- Lotus, porque o registro de eventos só existe desde 10/09/2026. Decisão do
-- chefe: eles ficam em Todos, e o rodapé diz quantos são. Misturar "sei que
-- parou" com "não sei nada" tiraria da aba o poder de apontar.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.leads_lista_por_aba(
  p_tenant_id uuid,
  p_aba       text DEFAULT 'todos',
  p_busca     text DEFAULT NULL,
  -- `leads.assigned_agent_id` é TEXTO nesta base, não uuid.
  p_corretor  text DEFAULT NULL,
  p_origem    text DEFAULT NULL,
  p_desde     timestamptz DEFAULT NULL,
  p_ate       timestamptz DEFAULT NULL,
  p_limite    int DEFAULT 50,
  p_offset    int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_limite int := LEAST(GREATEST(COALESCE(p_limite, 50), 1), 200);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_busca  text := NULLIF(btrim(COALESCE(p_busca, '')), '');
  v_resultado jsonb;
BEGIN
  IF v_caller IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NOT EXISTS (
       SELECT 1 FROM tenant_memberships tm
       WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
     )
  THEN
    RETURN jsonb_build_object('linhas', '[]'::jsonb, 'contadores', '{}'::jsonb,
                              'total_na_aba', 0, 'total_na_base', 0, 'sem_historico', 0);
  END IF;

  WITH base AS (
    SELECT
      l.id, l.name, l.phone, l.status, l.source, l.property_code,
      l.assigned_agent_id, l.assigned_agent_name, l.created_at
    FROM leads l
    WHERE l.tenant_id = p_tenant_id AND l.archived_at IS NULL
  ),
  -- A regra de "movimento" vem de `leads_ultima_movimentacao` (P1.4), não
  -- reescrita aqui. Lead ausente do retorno é lead SEM registro — diferente
  -- de lead parado.
  movimento AS (
    SELECT m.lead_id, m.ultima
    FROM leads_ultima_movimentacao(
      p_tenant_id,
      ARRAY(SELECT b.id::text FROM base b)
    ) m
  ),
  -- Compromisso futuro na agenda do lead.
  atividade AS (
    SELECT DISTINCT ag.lead_uuid AS id
    FROM agenda_eventos ag
    WHERE ag.tenant_id = p_tenant_id
      AND ag.lead_uuid IS NOT NULL
      AND ag.data >= current_date
  ),
  classificado AS (
    SELECT
      b.*,
      mv.ultima AS ultima_movimentacao,
      (b.status = 'Novos Leads') AS eh_novo,
      (b.status IS DISTINCT FROM 'Novos Leads') AS eh_atendimento,
      (at.id IS NOT NULL) AS tem_atividade,
      -- Parado exige movimento CONHECIDO. Sem linha em `movimento`, o lead
      -- não entra nesta aba — ele é "sem histórico", contado à parte.
      (mv.ultima IS NOT NULL AND mv.ultima < now() - interval '7 days') AS eh_parado,
      (mv.ultima IS NULL) AS sem_historico,
      -- O campo de corretor NUNCA chega vazio nesta base: quando não há
      -- corretor, vem o texto "Não atribuído". Testar só por preenchimento
      -- responde "sim" para todo mundo — foi assim que o card "Encaminhados"
      -- anunciou 2.553 leads numa imobiliária sem nenhum corretor.
      (b.assigned_agent_id IS NULL
       AND (b.assigned_agent_name IS NULL
            OR btrim(lower(b.assigned_agent_name)) IN ('', 'não atribuído', 'nao atribuido')))
        AS sem_corretor
    FROM base b
    LEFT JOIN movimento mv ON mv.lead_id = b.id::text
    LEFT JOIN atividade at ON at.id = b.id
  ),
  -- Os filtros valem para TODAS as abas e para os contadores. Aplicá-los só
  -- na lista faria o contador prometer linhas que a busca não mostra.
  filtrado AS (
    SELECT c.* FROM classificado c
    WHERE (p_corretor IS NULL OR c.assigned_agent_id::text = p_corretor)
      AND (p_origem IS NULL OR btrim(lower(c.source)) = btrim(lower(p_origem)))
      AND (p_desde IS NULL OR c.created_at >= p_desde)
      AND (p_ate IS NULL OR c.created_at <= p_ate)
      AND (
        v_busca IS NULL
        OR c.name ILIKE '%' || v_busca || '%'
        -- Só dígitos no telefone: quem busca "(11) 99999" não acha nada
        -- contra uma coluna que guarda "5511999998888".
        OR regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g')
             ILIKE '%' || regexp_replace(v_busca, '\D', '', 'g') || '%'
           AND regexp_replace(v_busca, '\D', '', 'g') <> ''
        OR c.property_code ILIKE '%' || v_busca || '%'
      )
  ),
  daaba AS (
    SELECT f.* FROM filtrado f
    WHERE CASE lower(COALESCE(p_aba, 'todos'))
      WHEN 'novos'      THEN f.eh_novo
      WHEN 'atendimento' THEN f.eh_atendimento
      WHEN 'atividade'  THEN f.tem_atividade
      WHEN 'parados'    THEN f.eh_parado
      WHEN 'sem-corretor' THEN f.sem_corretor
      ELSE true
    END
  )
  SELECT jsonb_build_object(
    'contadores', (
      SELECT jsonb_build_object(
        'todos',        count(*),
        'novos',        count(*) FILTER (WHERE f.eh_novo),
        'atendimento',  count(*) FILTER (WHERE f.eh_atendimento),
        'atividade',    count(*) FILTER (WHERE f.tem_atividade),
        'parados',      count(*) FILTER (WHERE f.eh_parado),
        'sem-corretor', count(*) FILTER (WHERE f.sem_corretor)
      ) FROM filtrado f
    ),
    'total_na_aba',   (SELECT count(*) FROM daaba),
    -- A base inteira, sem filtro nenhum: é o terceiro número do rodapé.
    'total_na_base',  (SELECT count(*) FROM base),
    'sem_historico',  (SELECT count(*) FROM filtrado f WHERE f.sem_historico),
    'linhas', COALESCE((
      SELECT jsonb_agg(linha ORDER BY ordem)
      FROM (
        SELECT
          row_number() OVER (ORDER BY d.created_at DESC) AS ordem,
          jsonb_build_object(
            'id', d.id,
            'nome', d.name,
            'telefone', d.phone,
            'etapa', d.status,
            'origem', d.source,
            'imovel', d.property_code,
            'corretor', CASE WHEN d.sem_corretor THEN NULL ELSE d.assigned_agent_name END,
            'corretor_id', d.assigned_agent_id,
            'criado_em', d.created_at,
            'ultima_movimentacao', d.ultima_movimentacao,
            'tem_atividade', d.tem_atividade
          ) AS linha
        FROM daaba d
        ORDER BY d.created_at DESC
        LIMIT v_limite OFFSET v_offset
      ) p
    ), '[]'::jsonb)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.leads_lista_por_aba(uuid, text, text, text, text, timestamptz, timestamptz, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leads_lista_por_aba(uuid, text, text, text, text, timestamptz, timestamptz, int, int) TO authenticated, service_role;

COMMIT;
