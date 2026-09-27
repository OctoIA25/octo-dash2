-- ============================================================
-- O plantão passa a respeitar a equipe
--
-- Hoje `plantao_fila` checa só uma coisa: se quem chamou é da imobiliária.
-- Passando nisso, a pessoa vê AS PERGUNTAS DE TODO MUNDO. Um corretor da
-- Lotus enxerga as dúvidas dos 13 colegas, e um líder enxerga as das duas
-- equipes — inclusive a que não é dele.
--
-- A regra nova é a MESMA de `get_tenant_members`, que já resolveu esta
-- pergunta em 14/09. Não invento outra: duas regras de "quem é da minha
-- equipe" divergiriam no primeiro caso de borda.
--
--   owner / admin  -> tudo
--   team_leader    -> as suas e as de quem ele lidera
--   corretor       -> só as suas
--
-- "Quem ele lidera" tem DOIS caminhos, os dois já existentes:
--   `tenant_memberships.leader_user_id` — o líder direto
--   `teams.leader_user_ids`             — o time de vários gestores (25/08)
--
-- POR QUE O CORRETOR TAMBÉM ESTREITA, se o pedido falava do gestor: porque
-- sem isso o corretor veria MAIS que o próprio líder. Uma regra pela metade
-- aqui não é meia proteção, é uma contradição na tela.
--
-- O QUE MEDIMOS ANTES (Lotus, 27/09), e que decidiu o desenho:
--
--   pendentes    20 de 20 com dono identificável
--   respondidas   4 de 95
--
-- As 91 sem dono são histórico com `corretor_id` nulo ou com um nome no
-- lugar do id — a mesma confusão de identidade do P0.2, aqui de novo: a
-- Fernanda aparece como uuid, como o texto "Fernanda Emilia" e como nulo,
-- sempre com o mesmo telefone. O telefone não resolve em lugar nenhum da
-- Dash (conferido em tenant_brokers, user_profiles e whatsapp_phones).
--
-- Então elas ficam VISÍVEIS SÓ PARA QUEM VÊ TUDO, e a tela passa a dizer
-- quantas escondeu. Sumir com 91 linhas em silêncio faria o líder achar que
-- a casa nunca respondeu nada — que é o erro do "Ninguém esperando".
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
