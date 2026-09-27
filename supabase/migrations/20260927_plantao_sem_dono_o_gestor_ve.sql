-- ============================================================
-- A pergunta sem dono não pode se perder
--
-- O recorte por equipe de hoje mais cedo escondia de TODO líder as perguntas
-- que não dá para atribuir — 91 das 95 respondidas da Lotus, por
-- `corretor_id` nulo ou com um nome no lugar do id.
--
-- O chefe decidiu (27/09): **sem dono, todos os gestores veem.** A razão é a
-- que importa: uma dúvida de cliente sem responsável é justamente a que some,
-- e esconder as 91 de quem poderia pegá-las inverte o objetivo da tela.
--
-- Fica de fora o corretor: ele continua vendo só as suas. Pergunta órfã é
-- trabalho de quem coordena, não de quem está em atendimento.
--
--   owner / admin  -> tudo
--   team_leader    -> as suas, as de quem lidera, E as sem dono
--   corretor       -> só as suas
--
-- `sem_dono_oculto` passa a contar só para o corretor: para o gestor não há
-- mais nada escondido, e o número tem de dizer a verdade de quem está olhando.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.plantao_fila(
  p_tenant_id uuid,
  p_aba text DEFAULT 'aguardando'::text,
  p_limite integer DEFAULT 200,
  p_dias integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_limite int := LEAST(GREATEST(COALESCE(p_limite, 200), 1), 500);
  v_desde timestamptz := now() - (LEAST(GREATEST(COALESCE(p_dias, 90), 1), 730) || ' days')::interval;
  v_aba text := COALESCE(NULLIF(btrim(p_aba), ''), 'aguardando');
  v_cfg record;
  v_ve_tudo boolean;
  v_lider boolean;
  v_contadores jsonb;
  v_linhas jsonb;
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

  -- `v_caller` nulo é service_role/postgres: anon não tem EXECUTE aqui.
  v_ve_tudo := v_caller IS NULL
    OR public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM tenant_memberships tm
      WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
        AND tm.role IN ('owner', 'admin')
    );

  v_lider := NOT v_ve_tudo AND EXISTS (
    SELECT 1 FROM tenant_memberships tm
    WHERE tm.user_id = v_caller AND tm.tenant_id = p_tenant_id
      AND tm.role = 'team_leader'
  );

  SELECT espera_maxima_minutos, destino, plantonista_id
    INTO v_cfg
    FROM tenant_plantao_config WHERE tenant_id = p_tenant_id;

  -- Os contadores usam O MESMO recorte da lista. Sem isso a aba diria "20
  -- aguardando" e mostraria 12 — o defeito que esta casa já corrigiu em
  -- nove telas de visita.
  WITH visivel AS (
    SELECT p.*, (dono.user_id IS NULL) AS sem_dono
      FROM lia_perguntas_corretor p
      LEFT JOIN user_profiles upx ON upx.id::text = lower(btrim(p.corretor_id))
      LEFT JOIN tenant_memberships dono
             ON dono.user_id = upx.id AND dono.tenant_id = p.tenant_id
      LEFT JOIN teams dt ON dt.id = dono.team_id
     WHERE p.tenant_id = p_tenant_id
       AND p.criado_em >= v_desde
       AND (
         v_ve_tudo
         OR upx.id = v_caller
         -- Sem dono identificável: o gestor VÊ, para a pergunta não se perder.
         OR (v_lider AND upx.id IS NULL)
         OR (v_lider AND upx.id IS NOT NULL
             AND (dono.leader_user_id = v_caller
                  OR dt.leader_user_ids @> ARRAY[v_caller]))
       )
  ),
  ocultas AS (
    SELECT count(*) AS n
      FROM lia_perguntas_corretor p
      LEFT JOIN user_profiles upx ON upx.id::text = lower(btrim(p.corretor_id))
     WHERE p.tenant_id = p_tenant_id
       AND p.criado_em >= v_desde
       AND NOT v_ve_tudo
       AND NOT v_lider
       AND upx.id IS NULL
  )
  SELECT jsonb_build_object(
           'aguardando',  count(*) FILTER (WHERE v.status = 'pendente'),
           'respondidas', count(*) FILTER (WHERE v.status = 'respondida'),
           'expiradas',   count(*) FILTER (WHERE v.status = 'expirada'),
           'na_janela',   count(*),
           'por_aprender', count(*) FILTER (
             WHERE v.status = 'respondida' AND v.kb_documento_id IS NULL
           ),
           'sem_empreendimento', count(*) FILTER (WHERE v.empreendimento_id IS NULL),
           -- Quantas ficaram de fora por não dar para dizer de quem são.
           -- Zero para quem vê tudo: nada lhe foi escondido.
           'sem_dono_oculto', (SELECT n FROM ocultas)
         )
    INTO v_contadores
    FROM visivel v;

  SELECT COALESCE(jsonb_agg(linha ORDER BY ordem), '[]'::jsonb)
    INTO v_linhas
    FROM (
      SELECT
        CASE WHEN v_aba = 'aguardando' THEN p.criado_em ELSE COALESCE(p.respondida_em, p.criado_em) END AS ordem,
        jsonb_build_object(
          'id', p.id,
          'pergunta', p.pergunta,
          'contexto', p.contexto,
          'status', p.status,
          'criado_em', p.criado_em,
          'respondida_em', p.respondida_em,
          'resposta', p.resposta_corretor,
          'nudges', p.nudge_count,
          'lead_id', p.lead_id,
          'lead_nome', l.name,
          'corretor_id', p.corretor_id,
          'corretor_nome', COALESCE(up.full_name, NULLIF(btrim(p.corretor_id), '')),
          'corretor_cadastrado', up.id IS NOT NULL,
          'corretor_email', up.email,
          'empreendimento_id', p.empreendimento_id,
          'empreendimento_nome', lan.nome,
          'kb_documento_id', p.kb_documento_id,
          'aprovada_para_base', p.aprovada_para_base,
          'aprovada_em', p.aprovada_em,
          'fora_do_canal', p.resposta_corretor LIKE '[resolvida fora do canal]%',
          -- "Respondida" na Dash NAO quer dizer entregue ao lead: a LIA
          -- devolve sempre 200 e diz o desfecho no corpo.
          --   null / na_fila / entregue / ja_resolvida / nao_achou / falhou
          'entrega', CASE
            WHEN w.id IS NULL                 THEN NULL
            WHEN w.status = 'pending'         THEN 'na_fila'
            WHEN w.status <> 'delivered'      THEN 'falhou'
            WHEN w.response_body ILIKE '%ja-resolvida%' THEN 'ja_resolvida'
            WHEN w.response_body ILIKE '%desconhecida%' THEN 'nao_achou'
            ELSE 'entregue'
          END,
          'entrega_detalhe', w.last_error
        ) AS linha
      FROM lia_perguntas_corretor p
      LEFT JOIN leads l ON l.id = p.lead_id
      LEFT JOIN user_profiles up ON up.id::text = lower(btrim(p.corretor_id))
      LEFT JOIN lancamentos lan ON lan.id = p.empreendimento_id
      -- O dono da pergunta, para o recorte por equipe.
      LEFT JOIN tenant_memberships dono
             ON dono.user_id = up.id AND dono.tenant_id = p.tenant_id
      LEFT JOIN teams dt ON dt.id = dono.team_id
      -- Só existe quando a resposta saiu DAQUI: a do WhatsApp não passa pelo
      -- nosso emissor, e por isso `entrega` fica nula nela.
      LEFT JOIN webhook_events w
        ON w.event_type = 'plantao.respondida'
       AND w.source_table = 'lia_perguntas_corretor'
       AND w.source_id = p.id
      WHERE p.tenant_id = p_tenant_id
        AND p.criado_em >= v_desde
        AND (
          v_ve_tudo
          OR up.id = v_caller
          OR (v_lider AND up.id IS NULL)
          OR (v_lider AND up.id IS NOT NULL
              AND (dono.leader_user_id = v_caller
                   OR dt.leader_user_ids @> ARRAY[v_caller]))
        )
        AND CASE v_aba
              WHEN 'aguardando'  THEN p.status IN ('pendente', 'expirada')
              WHEN 'respondidas' THEN p.status = 'respondida'
              ELSE true
            END
      ORDER BY 1 DESC
      LIMIT v_limite
    ) s;

  RETURN jsonb_build_object(
    'aba', v_aba,
    'espera_maxima_minutos', COALESCE(v_cfg.espera_maxima_minutos, 30),
    'destino', COALESCE(v_cfg.destino, 'corretor_do_lead'),
    'plantonista_id', v_cfg.plantonista_id,
    'configurado', v_cfg.espera_maxima_minutos IS NOT NULL,
    'dias', LEAST(GREATEST(COALESCE(p_dias, 90), 1), 730),
    'limite', v_limite,
    -- A tela precisa saber POR QUE a lista é curta.
    've_tudo', v_ve_tudo,
    'recorte', CASE WHEN v_ve_tudo THEN 'imobiliaria'
                    WHEN v_lider   THEN 'equipe'
                    ELSE 'proprias' END,
    'contadores', v_contadores,
    'linhas', v_linhas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.plantao_fila(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plantao_fila(uuid, text, integer, integer) TO authenticated, service_role;

COMMIT;
